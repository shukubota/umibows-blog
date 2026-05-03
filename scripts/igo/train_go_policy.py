"""
9x9 Go Policy Network Training Script
- Parses KGS SGF game records
- Trains a small CNN (~1.5MB ONNX)
- Exports to public/models/go-policy.onnx

Usage:
  pip install torch numpy
  python scripts/igo/train_go_policy.py --data /path/to/kgs-sgf/ --epochs 10
"""

import argparse
import os
import re
import struct
import glob
import numpy as np
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

# ── Constants ──────────────────────────────────────────────────────────────

BOARD = 9
N_PLANES = 4  # own, opp, empty, color-to-move

# ── SGF Parser ─────────────────────────────────────────────────────────────

SGF_MOVE = re.compile(r';([BW])\[([a-z]{0,2})\]')
SGF_SIZE = re.compile(r'SZ\[(\d+)\]')


def sgf_to_moves(text: str):
    """Return list of (color, row, col) or (color, None) for pass."""
    m = SGF_SIZE.search(text)
    if m and int(m.group(1)) != BOARD:
        return None
    moves = []
    for color, coord in SGF_MOVE.findall(text):
        if coord == '' or coord == 'tt':
            moves.append((color, None))
        else:
            col = ord(coord[0]) - ord('a')
            row = ord(coord[1]) - ord('a')
            if 0 <= row < BOARD and 0 <= col < BOARD:
                moves.append((color, (row, col)))
    return moves


# ── Board Simulation ───────────────────────────────────────────────────────

def empty_board():
    return np.zeros((BOARD, BOARD), dtype=np.int8)  # 0=empty, 1=black, -1=white


def neighbors(r, c):
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nr, nc = r + dr, c + dc
        if 0 <= nr < BOARD and 0 <= nc < BOARD:
            yield nr, nc


def find_group(board, r, c):
    color = board[r][c]
    visited = set()
    stack = [(r, c)]
    while stack:
        cur = stack.pop()
        if cur in visited:
            continue
        visited.add(cur)
        for nr, nc in neighbors(*cur):
            if board[nr][nc] == color and (nr, nc) not in visited:
                stack.append((nr, nc))
    return visited


def liberties(board, group):
    libs = set()
    for r, c in group:
        for nr, nc in neighbors(r, c):
            if board[nr][nc] == 0:
                libs.add((nr, nc))
    return libs


def place_stone(board, r, c, color):
    """Place stone and remove captures. Returns new board or None if illegal."""
    if board[r][c] != 0:
        return None
    new = board.copy()
    new[r][c] = color
    opp = -color
    # Remove opponent captures
    for nr, nc in list(neighbors(r, c)):
        if new[nr][nc] == opp:
            grp = find_group(new, nr, nc)
            if not liberties(new, grp):
                for gr, gc in grp:
                    new[gr][gc] = 0
    # Check suicide
    grp = find_group(new, r, c)
    if not liberties(new, grp):
        return None
    return new


# ── Feature Extraction ─────────────────────────────────────────────────────

def board_to_features(board: np.ndarray, color: int) -> np.ndarray:
    """board: BOARD×BOARD int8 (1=black,-1=white). color: 1=black,-1=white.
    Returns float32 [N_PLANES, BOARD, BOARD].
    """
    feat = np.zeros((N_PLANES, BOARD, BOARD), dtype=np.float32)
    feat[0] = (board == color).astype(np.float32)       # own stones
    feat[1] = (board == -color).astype(np.float32)      # opponent stones
    feat[2] = (board == 0).astype(np.float32)           # empty
    feat[3] = (1.0 if color == 1 else 0.0)              # black-to-move flag
    return feat


# ── Dataset ────────────────────────────────────────────────────────────────

class GoDataset(Dataset):
    def __init__(self, sgf_files: list[str], max_games: int = 50000):
        self.samples: list[tuple[np.ndarray, int]] = []
        games = 0
        for path in sgf_files:
            if games >= max_games:
                break
            try:
                text = Path(path).read_text(errors='ignore')
                moves = sgf_to_moves(text)
                if not moves:
                    continue
                board = empty_board()
                color_map = {'B': 1, 'W': -1}
                for color_str, coord in moves:
                    color = color_map[color_str]
                    feat = board_to_features(board, color)
                    if coord is not None:
                        row, col = coord
                        label = row * BOARD + col
                        self.samples.append((feat, label))
                        new_board = place_stone(board, row, col, color)
                        if new_board is not None:
                            board = new_board
                games += 1
            except Exception:
                continue
        print(f"Loaded {len(self.samples)} positions from {games} games")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        feat, label = self.samples[idx]
        return torch.from_numpy(feat), label


# ── Model ──────────────────────────────────────────────────────────────────

class ResBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x):
        h = F.relu(self.bn1(self.conv1(x)))
        h = self.bn2(self.conv2(h))
        return F.relu(h + x)


class GoPolicyNet(nn.Module):
    def __init__(self, channels: int = 64, blocks: int = 5):
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(N_PLANES, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(),
        )
        self.res = nn.Sequential(*[ResBlock(channels) for _ in range(blocks)])
        self.policy_head = nn.Sequential(
            nn.Conv2d(channels, 2, 1, bias=False),
            nn.BatchNorm2d(2),
            nn.ReLU(),
            nn.Flatten(),
            nn.Linear(2 * BOARD * BOARD, BOARD * BOARD),  # 81 moves (no pass for simplicity)
        )

    def forward(self, x):
        h = self.res(self.stem(x))
        return self.policy_head(h)


# ── Training ───────────────────────────────────────────────────────────────

def train(args):
    device = (
        torch.device("mps") if torch.backends.mps.is_available()
        else torch.device("cuda") if torch.cuda.is_available()
        else torch.device("cpu")
    )
    print(f"Device: {device}")

    sgf_files = sorted(glob.glob(os.path.join(args.data, "**/*.sgf"), recursive=True))
    if not sgf_files:
        sgf_files = sorted(glob.glob(os.path.join(args.data, "*.sgf")))
    print(f"Found {len(sgf_files)} SGF files")

    dataset = GoDataset(sgf_files, max_games=args.max_games)
    loader = DataLoader(dataset, batch_size=256, shuffle=True, num_workers=0, pin_memory=False)

    model = GoPolicyNet(channels=64, blocks=5).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"Parameters: {n_params:,}")

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        correct = 0
        total = 0
        for feat, label in loader:
            feat, label = feat.to(device), label.to(device)
            logits = model(feat)
            loss = F.cross_entropy(logits, label)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * len(label)
            correct += (logits.argmax(1) == label).sum().item()
            total += len(label)
        scheduler.step()
        acc = correct / total * 100
        print(f"Epoch {epoch}/{args.epochs}  loss={total_loss/total:.4f}  acc={acc:.1f}%")

    # ── ONNX Export ──────────────────────────────────────────────────────
    model.eval()
    out_path = args.output
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    dummy = torch.zeros(1, N_PLANES, BOARD, BOARD, device=device)
    torch.onnx.export(
        model,
        dummy,
        out_path,
        input_names=["input"],
        output_names=["policy"],
        dynamic_axes={"input": {0: "batch"}, "policy": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"Exported: {out_path}  ({size_mb:.2f} MB)")


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="Directory containing SGF files")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--max-games", type=int, default=50000)
    parser.add_argument("--output", default="public/models/go-policy.onnx")
    args = parser.parse_args()
    train(args)
