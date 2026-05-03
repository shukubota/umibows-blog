"""
AlphaZero-style self-play training for 9×9 Go.

Algorithm:
  Loop:
    1. Self-play  : PUCT-MCTS + value network → (state, π, z) tuples
    2. Train      : policy cross-entropy + value MSE
    3. Export     : ONNX (policy + value outputs)

Usage:
  # Fresh start
  python scripts/igo/self_play.py

  # Resume
  python scripts/igo/self_play.py --checkpoint scripts/igo/checkpoints/iter_005.pt

  # Quick smoke-test (fast, weak)
  python scripts/igo/self_play.py --iterations 2 --games 5 --sims 50
"""

import argparse
import math
import os
import random
import time
from collections import deque
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset

BOARD = 9
N_PLANES = 4
KOMI = 6.5
C_PUCT = 1.5

# ── Board simulation ────────────────────────────────────────────────────────

def _neighbors(r, c):
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nr, nc = r + dr, c + dc
        if 0 <= nr < BOARD and 0 <= nc < BOARD:
            yield nr, nc

def _find_group(board, r, c):
    color, visited, stack = board[r][c], set(), [(r, c)]
    while stack:
        cur = stack.pop()
        if cur in visited:
            continue
        visited.add(cur)
        for n in _neighbors(*cur):
            if board[n[0]][n[1]] == color and n not in visited:
                stack.append(n)
    return visited

def _liberties(board, group):
    return {(nr, nc) for r, c in group for nr, nc in _neighbors(r, c) if board[nr][nc] == 0}

def place_stone(board, r, c, color):
    """Returns new board or None if illegal (suicide / occupied)."""
    if board[r][c] != 0:
        return None
    new = board.copy()
    new[r][c] = color
    opp = -color
    for nr, nc in list(_neighbors(r, c)):
        if new[nr][nc] == opp:
            grp = _find_group(new, nr, nc)
            if not _liberties(new, grp):
                for gr, gc in grp:
                    new[gr][gc] = 0
    if not _liberties(new, _find_group(new, r, c)):
        return None
    return new

def get_legal_moves(board, color, prev_board=None):
    moves = []
    for r in range(BOARD):
        for c in range(BOARD):
            if board[r][c] != 0:
                continue
            new = place_stone(board, r, c, color)
            if new is None:
                continue
            if prev_board is not None and np.array_equal(new, prev_board):
                continue  # simple ko
            moves.append((r, c))
    return moves

def score_board(board):
    """Territory scoring. Returns 1 (black wins) or -1 (white wins)."""
    black = float(np.sum(board == 1))
    white = float(np.sum(board == -1)) + KOMI
    visited = np.zeros((BOARD, BOARD), bool)
    for r in range(BOARD):
        for c in range(BOARD):
            if board[r][c] != 0 or visited[r][c]:
                continue
            region, borders, queue = [], set(), [(r, c)]
            while queue:
                cr, cc = queue.pop()
                if visited[cr][cc]:
                    continue
                visited[cr][cc] = True
                region.append((cr, cc))
                for nr, nc in _neighbors(cr, cc):
                    if board[nr][nc] != 0:
                        borders.add(board[nr][nc])
                    elif not visited[nr][nc]:
                        queue.append((nr, nc))
            if len(borders) == 1:
                owner = next(iter(borders))
                if owner == 1:
                    black += len(region)
                else:
                    white += len(region)
    return 1 if black > white else -1


# ── Features & augmentation ─────────────────────────────────────────────────

def board_to_features(board, color):
    """board: int8 BOARD×BOARD (1=black,-1=white). color: 1=black,-1=white."""
    feat = np.zeros((N_PLANES, BOARD, BOARD), dtype=np.float32)
    feat[0] = (board == color)
    feat[1] = (board == -color)
    feat[2] = (board == 0)
    feat[3] = 1.0 if color == 1 else 0.0
    return feat

def augment(feat, pi_board):
    """Apply a random one of 8 board symmetries."""
    k = random.randint(0, 7)
    rot, flip = k % 4, k // 4
    feat = np.rot90(feat, rot, axes=(1, 2)).copy()
    pi_board = np.rot90(pi_board, rot).copy()
    if flip:
        feat = np.flip(feat, axis=2).copy()
        pi_board = np.flip(pi_board, axis=1).copy()
    return feat, pi_board


# ── Model ───────────────────────────────────────────────────────────────────

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
    """Policy + value network for 9×9 Go."""
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


# ── MCTS ────────────────────────────────────────────────────────────────────

class _Node:
    __slots__ = ["visit_count", "value_sum", "children", "prior", "is_expanded"]

    def __init__(self, prior=0.0):
        self.visit_count = 0
        self.value_sum = 0.0
        self.children: dict[tuple, "_Node"] = {}
        self.prior = prior
        self.is_expanded = False

    def q(self):
        return self.value_sum / self.visit_count if self.visit_count > 0 else 0.0

    def select_child(self):
        N = max(self.visit_count, 1)
        best_score, best_move, best_child = -float("inf"), None, None
        for move, child in self.children.items():
            score = child.q() + C_PUCT * child.prior * math.sqrt(N) / (1 + child.visit_count)
            if score > best_score:
                best_score, best_move, best_child = score, move, child
        return best_move, best_child


@torch.no_grad()
def _nn_eval(model, device, board, color):
    feat = torch.from_numpy(board_to_features(board, color)).unsqueeze(0).to(device)
    logits, value = model(feat)
    policy = F.softmax(logits, dim=1).cpu().numpy()[0]
    return policy, value.item()


def mcts_search(model, device, board, color, prev_board, n_sims,
                dirichlet_alpha=0.03, dirichlet_eps=0.25):
    """
    Run PUCT-MCTS from (board, color).
    Returns (pi [81], best_move or None).

    Value convention: node.value_sum stores from the perspective of the player
    who MADE THE MOVE to reach that node (the parent's player).
    Selection: maximize child.q() + U  (q is from parent's perspective) ✓
    Backprop: sign starts at -1 (leaf mover = -sim_color), alternates up the path.
    """
    root = _Node()

    for _ in range(n_sims):
        node = root
        sim_board = board.copy()
        sim_color = color
        sim_prev = prev_board
        path = [node]

        # ── Selection ──
        while node.is_expanded and node.children:
            move, child = node.select_child()
            if move is None:
                break
            new_board = place_stone(sim_board, *move, sim_color)
            if new_board is None:
                break
            sim_prev = sim_board
            sim_board = new_board
            sim_color = -sim_color
            node = child
            path.append(node)

        # ── Expansion + evaluation ──
        if not node.is_expanded:
            legal = get_legal_moves(sim_board, sim_color, sim_prev)
            if not legal:
                # Game over at this node: convert absolute winner to sim_color's perspective
                v = float(score_board(sim_board)) * sim_color
            else:
                policy, v = _nn_eval(model, device, sim_board, sim_color)

                # Dirichlet noise at root for exploration
                if node is root:
                    noise = np.random.dirichlet([dirichlet_alpha] * len(legal))
                    probs = [(1 - dirichlet_eps) * policy[r * BOARD + c] + dirichlet_eps * noise[i]
                             for i, (r, c) in enumerate(legal)]
                else:
                    probs = [policy[r * BOARD + c] for r, c in legal]

                total = sum(probs) or 1.0
                for i, (r, c) in enumerate(legal):
                    node.children[(r, c)] = _Node(prior=probs[i] / total)

            node.is_expanded = True
        else:
            v = node.q()

        # ── Backprop ──
        # v is from sim_color's perspective.
        # Leaf's mover = -sim_color → its value from mover's perspective = -v.
        # Sign alternates going up: -1, +1, -1, ...
        sign = -1
        for n in reversed(path[1:]):   # skip root in value update
            n.visit_count += 1
            n.value_sum += sign * v
            sign = -sign
        root.visit_count += 1

    # Build π from visit counts
    pi = np.zeros(BOARD * BOARD, dtype=np.float32)
    for (r, c), child in root.children.items():
        pi[r * BOARD + c] = child.visit_count
    if pi.sum() > 0:
        pi /= pi.sum()

    best_move = (max(root.children, key=lambda m: root.children[m].visit_count)
                 if root.children else None)
    return pi, best_move


# ── Self-play ────────────────────────────────────────────────────────────────

def self_play_game(model, device, n_sims, temp_moves=20):
    """
    Play one game. Returns (samples, winner).
    samples: list of (features [4,9,9], pi [81], z scalar)  – with 8× augmentation
    winner: 1 (black) or -1 (white)
    """
    board = np.zeros((BOARD, BOARD), dtype=np.int8)
    color = 1       # black moves first
    prev_board = None
    history = []    # (features, pi, color_at_move)
    passes = 0

    for move_num in range(BOARD * BOARD * 3):
        legal = get_legal_moves(board, color, prev_board)

        if not legal:
            passes += 1
            if passes >= 2:
                break
            color = -color
            continue
        passes = 0

        pi, best_move = mcts_search(model, device, board, color, prev_board, n_sims)
        history.append((board_to_features(board, color), pi, color))

        # Temperature: sample from distribution early, greedy later
        if move_num < temp_moves:
            legal_idx = [r * BOARD + c for r, c in legal]
            legal_pi = pi[legal_idx]
            s = legal_pi.sum()
            if s > 0:
                move_idx = np.random.choice(legal_idx, p=legal_pi / s)
            else:
                move_idx = random.choice(legal_idx)
            move = (move_idx // BOARD, move_idx % BOARD)
        else:
            move = best_move

        if move is None:
            break

        new_board = place_stone(board, *move, color)
        if new_board is None:
            break
        prev_board = board
        board = new_board
        color = -color

    winner = score_board(board)

    # Build training samples with 8-fold symmetry augmentation
    samples = []
    for feat, pi, move_color in history:
        z = np.float32(winner * move_color)  # +1 if mover won, -1 if mover lost
        aug_feat, aug_pi = augment(feat, pi.reshape(BOARD, BOARD))
        samples.append((aug_feat, aug_pi.flatten(), z))

    return samples, winner


# ── Training ────────────────────────────────────────────────────────────────

def train_on_buffer(model, optimizer, buffer, device, batch_size=256, n_batches=200):
    if len(buffer) < batch_size:
        return None, None

    # Sample from replay buffer
    sample_size = min(len(buffer), batch_size * n_batches)
    indices = random.sample(range(len(buffer)), sample_size)
    feats = torch.stack([buffer[i][0] for i in indices]).to(device)
    pis   = torch.stack([buffer[i][1] for i in indices]).to(device)
    zs    = torch.stack([buffer[i][2] for i in indices]).to(device)

    dataset = TensorDataset(feats, pis, zs)
    loader  = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    model.train()
    total_lp = total_lv = 0.0
    for feat, pi, z in loader:
        logits, value = model(feat)
        loss_p = -(pi * F.log_softmax(logits, dim=1)).sum(dim=1).mean()
        loss_v = F.mse_loss(value.squeeze(1), z)
        loss   = loss_p + loss_v
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        total_lp += loss_p.item()
        total_lv += loss_v.item()

    n = len(loader)
    return total_lp / n, total_lv / n


# ── ONNX export ──────────────────────────────────────────────────────────────

def export_onnx(model, device, out_path):
    model.eval()
    dummy = torch.zeros(1, N_PLANES, BOARD, BOARD, device=device)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model, dummy, out_path,
        input_names=["input"],
        output_names=["policy", "value"],
        dynamic_axes={"input": {0: "batch"}, "policy": {0: "batch"}, "value": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
    size_mb = Path(out_path).stat().st_size / 1024 / 1024
    print(f"  ONNX exported → {out_path}  ({size_mb:.2f} MB)")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AlphaZero self-play for 9×9 Go")
    parser.add_argument("--iterations",  type=int,   default=20,
                        help="Number of self-play→train iterations (default: 20)")
    parser.add_argument("--games",       type=int,   default=25,
                        help="Self-play games per iteration (default: 25)")
    parser.add_argument("--sims",        type=int,   default=200,
                        help="MCTS simulations per move (default: 200)")
    parser.add_argument("--buffer-size", type=int,   default=100_000,
                        help="Replay buffer capacity in positions (default: 100000)")
    parser.add_argument("--batch-size",  type=int,   default=256,
                        help="Training batch size (default: 256)")
    parser.add_argument("--n-batches",   type=int,   default=200,
                        help="Training batches per iteration (default: 200)")
    parser.add_argument("--checkpoint",  default=None,
                        help="Resume from .pt checkpoint")
    parser.add_argument("--output",      default="public/models/go-policy.onnx",
                        help="ONNX output path")
    parser.add_argument("--ckpt-dir",    default="scripts/igo/checkpoints")
    args = parser.parse_args()

    device = (
        torch.device("mps")  if torch.backends.mps.is_available() else
        torch.device("cuda") if torch.cuda.is_available()          else
        torch.device("cpu")
    )
    print(f"Device : {device}")
    print(f"Sims/move: {args.sims}  Games/iter: {args.games}  Iterations: {args.iterations}")

    model = GoNet(channels=64, blocks=5).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    buffer: deque[tuple] = deque(maxlen=args.buffer_size)
    start_iter = 0

    if args.checkpoint:
        ckpt = torch.load(args.checkpoint, map_location=device)
        model.load_state_dict(ckpt["model"])
        optimizer.load_state_dict(ckpt["optimizer"])
        start_iter = ckpt.get("iteration", 0) + 1
        print(f"Resumed: {args.checkpoint}  (next iter = {start_iter + 1})")

    ckpt_dir = Path(args.ckpt_dir)
    ckpt_dir.mkdir(parents=True, exist_ok=True)

    for it in range(start_iter, start_iter + args.iterations):
        print(f"\n{'='*60}")
        print(f"  Iteration {it + 1}  |  buffer={len(buffer)}")
        print(f"{'='*60}")

        # ── Self-play ────────────────────────────────────────────
        model.eval()
        t0 = time.time()
        black_wins = 0
        for g in range(args.games):
            samples, winner = self_play_game(model, device, args.sims)
            buffer.extend(
                (torch.from_numpy(f), torch.from_numpy(p), torch.tensor(z))
                for f, p, z in samples
            )
            black_wins += (winner == 1)
            elapsed = time.time() - t0
            print(
                f"  game {g+1:3d}/{args.games}  "
                f"{'B' if winner==1 else 'W'} wins  "
                f"positions={len(samples)//8}  "   # /8 because 8× augment
                f"buffer={len(buffer)}  "
                f"elapsed={elapsed:.0f}s",
                end="\r",
            )
        print()
        play_time = time.time() - t0
        print(f"  Self-play done: {play_time:.0f}s  "
              f"black_win_rate={black_wins/args.games:.0%}")

        # ── Train ────────────────────────────────────────────────
        t1 = time.time()
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=args.n_batches
        )
        lp, lv = train_on_buffer(model, optimizer, buffer, device,
                                 args.batch_size, args.n_batches)
        scheduler.step()
        train_time = time.time() - t1
        if lp is not None:
            print(f"  Train done:  {train_time:.0f}s  "
                  f"policy_loss={lp:.4f}  value_loss={lv:.4f}")
        else:
            print("  Train skipped (buffer too small)")

        # ── Checkpoint + ONNX ────────────────────────────────────
        ckpt_path = ckpt_dir / f"iter_{it+1:03d}.pt"
        torch.save({"model": model.state_dict(),
                    "optimizer": optimizer.state_dict(),
                    "iteration": it}, ckpt_path)
        print(f"  Checkpoint → {ckpt_path}")
        export_onnx(model, device, args.output)

    print("\nDone.")


if __name__ == "__main__":
    main()
