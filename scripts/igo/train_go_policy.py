"""
KGS supervised pre-training for 9×9 Go.

Trains GoNet (policy head + value head) on human games so that
self_play.py can start from a reasonable baseline instead of random weights.

  Policy head : cross-entropy on the move played
  Value head  : MSE on game outcome (+1 mover won, -1 mover lost)

The saved checkpoint is drop-in compatible with self_play.py --checkpoint.

Usage:
  python scripts/igo/train_go_policy.py --data ~/kgs-sgf/ --epochs 10
  python scripts/igo/self_play.py --checkpoint scripts/igo/checkpoints/kgs_pretrain.pt
"""

import argparse
import glob
import json
import os
import re
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

BOARD = 9
N_PLANES = 4

# ── SGF parsing ──────────────────────────────────────────────────────────────

SGF_MOVE   = re.compile(r';([BW])\[([a-z]{0,2})\]')
SGF_SIZE   = re.compile(r'SZ\[(\d+)\]')
SGF_RESULT = re.compile(r'RE\[([BW])\+')


def _parse_result(text):
    """Returns 1 (black wins), -1 (white wins), or 0 (unknown/draw)."""
    m = SGF_RESULT.search(text)
    if not m:
        return 0
    return 1 if m.group(1) == 'B' else -1


def sgf_to_samples(text):
    """
    Parse one SGF and return list of (board, color, move_idx, value_label).
    Returns None if not 9×9.
    """
    m = SGF_SIZE.search(text)
    if m and int(m.group(1)) != BOARD:
        return None
    game_result = _parse_result(text)
    color_map = {'B': 1, 'W': -1}
    board = np.zeros((BOARD, BOARD), dtype=np.int8)
    samples = []
    for color_str, coord in SGF_MOVE.findall(text):
        color = color_map[color_str]
        value_label = float(game_result * color)  # +1 if mover won
        if coord and coord != 'tt':
            col = ord(coord[0]) - ord('a')
            row = ord(coord[1]) - ord('a')
            if 0 <= row < BOARD and 0 <= col < BOARD:
                samples.append((board.copy(), color, row * BOARD + col, value_label))
                new = _place_stone(board, row, col, color)
                if new is not None:
                    board = new
    return samples


# ── Board simulation (pure Python — fast enough for data loading) ─────────────

def _neighbors(r, c):
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nr, nc = r + dr, c + dc
        if 0 <= nr < BOARD and 0 <= nc < BOARD:
            yield nr, nc

def _find_group(board, r, c):
    color, visited, stack = board[r][c], set(), [(r, c)]
    while stack:
        cur = stack.pop()
        if cur in visited: continue
        visited.add(cur)
        for n in _neighbors(*cur):
            if board[n[0]][n[1]] == color and n not in visited:
                stack.append(n)
    return visited

def _liberties(board, group):
    return {(nr, nc) for r, c in group for nr, nc in _neighbors(r, c) if board[nr][nc] == 0}

def _place_stone(board, r, c, color):
    if board[r][c] != 0:
        return None
    new = board.copy()
    new[r][c] = color
    for nr, nc in list(_neighbors(r, c)):
        if new[nr][nc] == -color:
            grp = _find_group(new, nr, nc)
            if not _liberties(new, grp):
                for gr, gc in grp:
                    new[gr][gc] = 0
    if not _liberties(new, _find_group(new, r, c)):
        return None
    return new


# ── Feature encoding ─────────────────────────────────────────────────────────

def board_to_features(board, color):
    feat = np.zeros((N_PLANES, BOARD, BOARD), dtype=np.float32)
    feat[0] = (board == color)
    feat[1] = (board == -color)
    feat[2] = (board == 0)
    feat[3] = 1.0 if color == 1 else 0.0
    return feat


# ── Dataset ──────────────────────────────────────────────────────────────────

def _ogs_to_samples(game):
    """
    Parse one OGS game dict (from download_ogs_9x9.py output).
    Returns list of (board, color, move_idx, value_label) or None.
    Move format: [x, y] where x=col, y=row (0-indexed).
    """
    black_id = game["black_id"]
    white_id = game["white_id"]
    winner   = game["winner"]
    if winner == black_id:
        game_result = 1    # black wins
    elif winner == white_id:
        game_result = -1   # white wins
    else:
        return None

    board = np.zeros((BOARD, BOARD), dtype=np.int8)
    color = 1  # black moves first
    samples = []
    for x, y in game["moves"]:
        if x < 0 or x >= BOARD or y < 0 or y >= BOARD:
            color = -color  # pass
            continue
        move_idx = y * BOARD + x
        value_label = float(game_result * color)
        samples.append((board.copy(), color, move_idx, value_label))
        new = _place_stone(board, y, x, color)
        if new is not None:
            board = new
        color = -color
    return samples


class KgsDataset(Dataset):
    def __init__(self, sgf_files, max_games=50000, ogs_jsonl=None):
        self.feats, self.policies, self.values = [], [], []
        games = 0

        # ── OGS JSONL ────────────────────────────────────────────────────────
        if ogs_jsonl:
            with open(ogs_jsonl) as f:
                for line in f:
                    if games >= max_games:
                        break
                    try:
                        g = json.loads(line)
                        samples = _ogs_to_samples(g)
                        if not samples:
                            continue
                        for board, color, move_idx, value_label in samples:
                            self.feats.append(board_to_features(board, color))
                            self.policies.append(move_idx)
                            self.values.append(value_label)
                        games += 1
                    except Exception:
                        continue
            print(f"Loaded {len(self.feats):,} positions from {games:,} OGS games")
            return

        # ── SGF ──────────────────────────────────────────────────────────────
        for path in sgf_files:
            if games >= max_games:
                break
            try:
                text = Path(path).read_text(errors='ignore')
                samples = sgf_to_samples(text)
                if not samples:
                    continue
                for board, color, move_idx, value_label in samples:
                    self.feats.append(board_to_features(board, color))
                    self.policies.append(move_idx)
                    self.values.append(value_label)
                games += 1
            except Exception:
                continue
        print(f"Loaded {len(self.feats):,} positions from {games:,} SGF games")

    def __len__(self):
        return len(self.feats)

    def __getitem__(self, idx):
        return (
            torch.from_numpy(self.feats[idx]),
            self.policies[idx],
            torch.tensor(self.values[idx], dtype=torch.float32),
        )


# ── Model (same architecture as self_play.py GoNet) ──────────────────────────

class _ResBlock(nn.Module):
    def __init__(self, ch):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(ch, ch, 3, padding=1, bias=False), nn.BatchNorm2d(ch), nn.ReLU(inplace=True),
            nn.Conv2d(ch, ch, 3, padding=1, bias=False), nn.BatchNorm2d(ch),
        )
    def forward(self, x):
        return F.relu(x + self.net(x))


class GoNet(nn.Module):
    def __init__(self, channels=64, blocks=5):
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(N_PLANES, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels), nn.ReLU(inplace=True),
        )
        self.res = nn.Sequential(*[_ResBlock(channels) for _ in range(blocks)])
        self.policy_head = nn.Sequential(
            nn.Conv2d(channels, 2, 1, bias=False), nn.BatchNorm2d(2), nn.ReLU(inplace=True),
            nn.Flatten(), nn.Linear(2 * BOARD * BOARD, BOARD * BOARD),
        )
        self.value_head = nn.Sequential(
            nn.Conv2d(channels, 1, 1, bias=False), nn.BatchNorm2d(1), nn.ReLU(inplace=True),
            nn.Flatten(), nn.Linear(BOARD * BOARD, 64), nn.ReLU(inplace=True),
            nn.Linear(64, 1), nn.Tanh(),
        )

    def forward(self, x):
        h = self.res(self.stem(x))
        return self.policy_head(h), self.value_head(h)


# ── Training ─────────────────────────────────────────────────────────────────

def train(args):
    device = (
        torch.device("mps")  if torch.backends.mps.is_available() else
        torch.device("cuda") if torch.cuda.is_available()          else
        torch.device("cpu")
    )
    print(f"Device: {device}")

    ogs_jsonl = args.ogs if args.ogs else None
    sgf_files = []
    if args.data:
        sgf_files = sorted(glob.glob(os.path.join(args.data, "**/*.sgf"), recursive=True))
        if not sgf_files:
            sgf_files = sorted(glob.glob(os.path.join(args.data, "*.sgf")))
        print(f"Found {len(sgf_files)} SGF files")

    if not ogs_jsonl and not sgf_files:
        print("No data source. Use --ogs <file> or --data <dir>.")
        return

    dataset = KgsDataset(sgf_files, max_games=args.max_games, ogs_jsonl=ogs_jsonl)
    if len(dataset) == 0:
        print("No valid positions loaded.")
        return
    loader = DataLoader(dataset, batch_size=256, shuffle=True, num_workers=0)

    model = GoNet(channels=64, blocks=5).to(device)
    print(f"Parameters: {sum(p.numel() for p in model.parameters()):,}")

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    for epoch in range(1, args.epochs + 1):
        model.train()
        total_lp = total_lv = correct = total = 0
        for feat, policy_label, value_label in loader:
            feat = feat.to(device)
            policy_label = policy_label.to(device)
            value_label = value_label.to(device)

            logits, value = model(feat)
            loss_p = F.cross_entropy(logits, policy_label)
            loss_v = F.mse_loss(value.squeeze(1), value_label)
            loss = loss_p + loss_v

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_lp += loss_p.item() * len(policy_label)
            total_lv += loss_v.item() * len(policy_label)
            correct += (logits.argmax(1) == policy_label).sum().item()
            total += len(policy_label)

        scheduler.step()
        acc = correct / total * 100
        print(f"Epoch {epoch}/{args.epochs}  "
              f"policy_loss={total_lp/total:.4f}  "
              f"value_loss={total_lv/total:.4f}  "
              f"policy_acc={acc:.1f}%")

    # ── Save checkpoint compatible with self_play.py ─────────────────────────
    ckpt_dir = Path(args.ckpt_dir)
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = ckpt_dir / "kgs_pretrain.pt"
    torch.save({
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
        "iteration": -1,
    }, ckpt_path)
    print(f"Checkpoint saved → {ckpt_path}")

    # ── ONNX export (policy + value, same format as self_play.py) ────────────
    model.eval()
    out_path = args.output
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros(1, N_PLANES, BOARD, BOARD, device=device)
    torch.onnx.export(
        model, dummy, out_path,
        input_names=["input"],
        output_names=["policy", "value"],
        dynamic_axes={"input": {0: "batch"}, "policy": {0: "batch"}, "value": {0: "batch"}},
        opset_version=17,
    )
    size_mb = Path(out_path).stat().st_size / 1024 / 1024
    print(f"ONNX exported → {out_path}  ({size_mb:.2f} MB)")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data",      default="",    help="Directory containing SGF files")
    parser.add_argument("--ogs",       default="",    help="OGS JSONL file from download_ogs_9x9.py")
    parser.add_argument("--epochs",    type=int, default=10)
    parser.add_argument("--max-games", type=int, default=50000)
    parser.add_argument("--output",    default="public/models/go-policy.onnx")
    parser.add_argument("--ckpt-dir",  default="scripts/igo/checkpoints")
    args = parser.parse_args()
    train(args)
