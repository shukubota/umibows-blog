"""
AlphaZero-style self-play training for 9×9 Go.

Algorithm:
  Loop:
    1. Self-play  : PUCT-MCTS + value network → (state, π, z) tuples
                   All games run in parallel with batched NN leaf evaluation.
                   Board logic is JIT-compiled with Numba for ~10-30x speedup.
    2. Train      : policy cross-entropy + value MSE
    3. Export     : ONNX (policy + value outputs)

Usage:
  python scripts/igo/self_play.py                          # default (20 iter)
  python scripts/igo/self_play.py --iterations 2 --games 5 --sims 50  # smoke-test
  python scripts/igo/self_play.py --checkpoint scripts/igo/checkpoints/iter_010.pt
"""

import argparse
import math
import random
import time
from collections import deque
from pathlib import Path

import numba as nb
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset

BOARD = 9
N_PLANES = 4
KOMI = 6.5
C_PUCT = 1.5

# ── Board simulation (Numba JIT) ─────────────────────────────────────────────

@nb.njit(cache=True)
def _find_group_nb(board, r, c):
    color = board[r, c]
    mask = np.zeros((BOARD, BOARD), dtype=np.bool_)
    stack_r = np.empty(BOARD * BOARD, dtype=np.int32)
    stack_c = np.empty(BOARD * BOARD, dtype=np.int32)
    stack_r[0] = r; stack_c[0] = c; top = 1
    while top > 0:
        top -= 1
        cr = stack_r[top]; cc = stack_c[top]
        if mask[cr, cc]:
            continue
        mask[cr, cc] = True
        if cr > 0 and board[cr-1, cc] == color and not mask[cr-1, cc]:
            stack_r[top] = cr-1; stack_c[top] = cc; top += 1
        if cr < BOARD-1 and board[cr+1, cc] == color and not mask[cr+1, cc]:
            stack_r[top] = cr+1; stack_c[top] = cc; top += 1
        if cc > 0 and board[cr, cc-1] == color and not mask[cr, cc-1]:
            stack_r[top] = cr; stack_c[top] = cc-1; top += 1
        if cc < BOARD-1 and board[cr, cc+1] == color and not mask[cr, cc+1]:
            stack_r[top] = cr; stack_c[top] = cc+1; top += 1
    return mask


@nb.njit(cache=True)
def _has_liberty_nb(board, mask):
    for r in range(BOARD):
        for c in range(BOARD):
            if mask[r, c]:
                if r > 0 and board[r-1, c] == 0: return True
                if r < BOARD-1 and board[r+1, c] == 0: return True
                if c > 0 and board[r, c-1] == 0: return True
                if c < BOARD-1 and board[r, c+1] == 0: return True
    return False


@nb.njit(cache=True)
def _place_stone_nb(board, r, c, color):
    """Try placing color at (r, c). Returns (board, is_legal); board is a copy when legal."""
    if board[r, c] != 0:
        return board, False
    new = board.copy()
    new[r, c] = color
    opp = -color
    if r > 0 and new[r-1, c] == opp:
        grp = _find_group_nb(new, r-1, c)
        if not _has_liberty_nb(new, grp):
            for gr in range(BOARD):
                for gc in range(BOARD):
                    if grp[gr, gc]: new[gr, gc] = 0
    if r < BOARD-1 and new[r+1, c] == opp:
        grp = _find_group_nb(new, r+1, c)
        if not _has_liberty_nb(new, grp):
            for gr in range(BOARD):
                for gc in range(BOARD):
                    if grp[gr, gc]: new[gr, gc] = 0
    if c > 0 and new[r, c-1] == opp:
        grp = _find_group_nb(new, r, c-1)
        if not _has_liberty_nb(new, grp):
            for gr in range(BOARD):
                for gc in range(BOARD):
                    if grp[gr, gc]: new[gr, gc] = 0
    if c < BOARD-1 and new[r, c+1] == opp:
        grp = _find_group_nb(new, r, c+1)
        if not _has_liberty_nb(new, grp):
            for gr in range(BOARD):
                for gc in range(BOARD):
                    if grp[gr, gc]: new[gr, gc] = 0
    grp = _find_group_nb(new, r, c)
    if not _has_liberty_nb(new, grp):
        return board, False
    return new, True


@nb.njit(cache=True)
def _boards_equal_nb(a, b):
    for r in range(BOARD):
        for c in range(BOARD):
            if a[r, c] != b[r, c]:
                return False
    return True


@nb.njit(cache=True)
def _get_legal_moves_nb(board, color, prev_board, has_prev):
    """Returns (legal_r, legal_c, count). Only first `count` entries are valid."""
    legal_r = np.empty(BOARD * BOARD, dtype=np.int32)
    legal_c = np.empty(BOARD * BOARD, dtype=np.int32)
    count = 0
    for r in range(BOARD):
        for c in range(BOARD):
            if board[r, c] != 0:
                continue
            new, ok = _place_stone_nb(board, r, c, color)
            if not ok:
                continue
            if has_prev and _boards_equal_nb(new, prev_board):
                continue
            legal_r[count] = r
            legal_c[count] = c
            count += 1
    return legal_r, legal_c, count


@nb.njit(cache=True)
def _score_board_nb(board):
    """Territory scoring. Returns 1 (black wins) or -1 (white wins)."""
    black = 0.0
    white = KOMI
    for r in range(BOARD):
        for c in range(BOARD):
            v = board[r, c]
            if v == 1: black += 1.0
            elif v == -1: white += 1.0
    visited = np.zeros((BOARD, BOARD), dtype=np.bool_)
    stack_r = np.empty(BOARD * BOARD, dtype=np.int32)
    stack_c = np.empty(BOARD * BOARD, dtype=np.int32)
    for sr in range(BOARD):
        for sc in range(BOARD):
            if board[sr, sc] != 0 or visited[sr, sc]:
                continue
            top = 0; reg_count = 0
            stack_r[0] = sr; stack_c[0] = sc; top = 1
            border_black = False; border_white = False
            while top > 0:
                top -= 1
                cr = stack_r[top]; cc = stack_c[top]
                if visited[cr, cc]:
                    continue
                visited[cr, cc] = True
                reg_count += 1
                if cr > 0:
                    v = board[cr-1, cc]
                    if v == 1: border_black = True
                    elif v == -1: border_white = True
                    elif not visited[cr-1, cc]: stack_r[top] = cr-1; stack_c[top] = cc; top += 1
                if cr < BOARD-1:
                    v = board[cr+1, cc]
                    if v == 1: border_black = True
                    elif v == -1: border_white = True
                    elif not visited[cr+1, cc]: stack_r[top] = cr+1; stack_c[top] = cc; top += 1
                if cc > 0:
                    v = board[cr, cc-1]
                    if v == 1: border_black = True
                    elif v == -1: border_white = True
                    elif not visited[cr, cc-1]: stack_r[top] = cr; stack_c[top] = cc-1; top += 1
                if cc < BOARD-1:
                    v = board[cr, cc+1]
                    if v == 1: border_black = True
                    elif v == -1: border_white = True
                    elif not visited[cr, cc+1]: stack_r[top] = cr; stack_c[top] = cc+1; top += 1
            if border_black and not border_white:
                black += reg_count
            elif border_white and not border_black:
                white += reg_count
    return 1 if black > white else -1


# ── Python wrappers (same interface as before) ───────────────────────────────

def place_stone(board, r, c, color):
    new, ok = _place_stone_nb(board, r, c, color)
    return new if ok else None

def get_legal_moves(board, color, prev_board=None):
    dummy = board if prev_board is None else prev_board
    lr, lc, count = _get_legal_moves_nb(board, color, dummy, prev_board is not None)
    return [(int(lr[i]), int(lc[i])) for i in range(count)]

def score_board(board):
    return int(_score_board_nb(board))


def _warmup_numba():
    """Pre-compile all Numba JIT functions (first call triggers compilation)."""
    print("  Warming up Numba JIT...", end=" ", flush=True)
    t = time.time()
    dummy = np.zeros((BOARD, BOARD), dtype=np.int8)
    dummy[4, 4] = 1
    place_stone(dummy, 3, 4, -1)
    get_legal_moves(dummy, 1)
    get_legal_moves(dummy, -1, dummy.copy())
    score_board(dummy)
    print(f"done ({time.time()-t:.1f}s)")


# ── Features & augmentation ─────────────────────────────────────────────────

def board_to_features(board, color):
    feat = np.zeros((N_PLANES, BOARD, BOARD), dtype=np.float32)
    feat[0] = (board == color)
    feat[1] = (board == -color)
    feat[2] = (board == 0)
    feat[3] = 1.0 if color == 1 else 0.0
    return feat

def augment(feat, pi_board):
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


# ── MCTS node ────────────────────────────────────────────────────────────────

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
        sqrt_N = math.sqrt(max(self.visit_count, 1))
        best_score, best_move, best_child = -float("inf"), None, None
        for move, child in self.children.items():
            vc = child.visit_count
            q = child.value_sum / vc if vc > 0 else 0.0
            score = q + C_PUCT * child.prior * sqrt_N / (1 + vc)
            if score > best_score:
                best_score, best_move, best_child = score, move, child
        return best_move, best_child


# ── Parallel self-play ───────────────────────────────────────────────────────

class _GameState:
    """State for one game in the parallel self-play pool."""
    __slots__ = ["board", "color", "prev_board", "history",
                 "passes", "done", "winner", "move_num", "root"]

    def __init__(self):
        self.board = np.zeros((BOARD, BOARD), dtype=np.int8)
        self.color = 1
        self.prev_board = None
        self.history = []
        self.passes = 0
        self.done = False
        self.winner = None
        self.move_num = 0
        self.root = _Node()


def parallel_self_play(model, device, n_games, n_sims,
                       temp_moves=20, dirichlet_alpha=0.03, dirichlet_eps=0.25):
    """
    Run n_games games simultaneously with batched NN leaf evaluation.

    Each MCTS round (1 of n_sims):
      1. Selection  : traverse each game's tree to a leaf (board logic via Numba)
      2. Batch eval : stack all unexpanded non-terminal leaves → ONE forward pass
      3. Expansion  : expand each leaf with the returned policy
      4. Backprop   : update visit counts and value sums

    NN call count:
      before : n_games × n_moves × n_sims  (batch=1 each)
      after  : n_moves × n_sims            (batch=n_active_games each)
    """
    games = [_GameState() for _ in range(n_games)]

    while True:
        active = [g for g in games if not g.done]
        if not active:
            break

        for _ in range(n_sims):

            # ── Selection: one path per active game ──────────────────────────
            leaves = []
            for g in active:
                node = g.root
                sb, sc, sp = g.board.copy(), g.color, g.prev_board
                path = [node]
                while node.is_expanded and node.children:
                    move, child = node.select_child()
                    if move is None:
                        break
                    new = place_stone(sb, *move, sc)
                    if new is None:
                        break
                    sp, sb, sc = sb, new, -sc
                    node = child
                    path.append(node)
                legal = get_legal_moves(sb, sc, sp)
                leaves.append((g, node, path, sb, sc, sp, legal))

            # ── Batch NN eval for unexpanded non-terminal leaves ─────────────
            nn_items = [(i, lf) for i, lf in enumerate(leaves)
                        if not lf[1].is_expanded and lf[6]]
            pols_b = vals_b = None
            if nn_items:
                feats = torch.stack([
                    torch.from_numpy(board_to_features(lf[3], lf[4]))
                    for _, lf in nn_items
                ]).to(device)
                with torch.no_grad():
                    logits_b, v_b = model(feats)
                pols_b = F.softmax(logits_b, dim=1).cpu().numpy()
                vals_b = v_b.cpu().numpy().flatten()

            # ── Expansion + backprop ─────────────────────────────────────────
            nn_i = 0
            for g, node, path, sb, sc, sp, legal in leaves:
                if not node.is_expanded:
                    if not legal:
                        v = float(score_board(sb)) * sc
                    else:
                        policy, v = pols_b[nn_i], float(vals_b[nn_i])
                        nn_i += 1
                        if node is g.root:
                            noise = np.random.dirichlet([dirichlet_alpha] * len(legal))
                            probs = [(1 - dirichlet_eps) * policy[r * BOARD + c]
                                     + dirichlet_eps * noise[j]
                                     for j, (r, c) in enumerate(legal)]
                        else:
                            probs = [policy[r * BOARD + c] for r, c in legal]
                        tot = sum(probs) or 1.0
                        for j, (r, c) in enumerate(legal):
                            node.children[(r, c)] = _Node(prior=probs[j] / tot)
                    node.is_expanded = True
                else:
                    v = node.q()

                sign = -1
                for nd in reversed(path[1:]):
                    nd.visit_count += 1
                    nd.value_sum += sign * v
                    sign = -sign
                g.root.visit_count += 1

        # ── Pick moves for all active games ───────────────────────────────────
        for g in active:
            legal = get_legal_moves(g.board, g.color, g.prev_board)
            if not legal:
                g.passes += 1
                if g.passes >= 2:
                    g.done = True
                    g.winner = score_board(g.board)
                else:
                    g.color = -g.color
                    g.root = _Node()
                continue
            g.passes = 0

            pi = np.zeros(BOARD * BOARD, dtype=np.float32)
            for (r, c), child in g.root.children.items():
                pi[r * BOARD + c] = child.visit_count
            if pi.sum() > 0:
                pi /= pi.sum()
            g.history.append((board_to_features(g.board, g.color), pi, g.color))

            if g.move_num < temp_moves:
                lidx = [r * BOARD + c for r, c in legal]
                lpi = pi[lidx]
                s = lpi.sum()
                probs = lpi / s if s > 0 else np.ones(len(lidx)) / len(lidx)
                move_idx = np.random.choice(lidx, p=probs)
                move = (move_idx // BOARD, move_idx % BOARD)
            else:
                move = max(g.root.children, key=lambda m: g.root.children[m].visit_count)

            new_board = place_stone(g.board, *move, g.color)
            if new_board is None:
                g.done = True
                g.winner = score_board(g.board)
                continue

            g.prev_board = g.board
            g.board = new_board
            g.color = -g.color
            g.move_num += 1
            g.root = _Node()

            if g.move_num >= BOARD * BOARD * 3:
                g.done = True
                g.winner = score_board(g.board)

    samples, winners = [], []
    for g in games:
        w = g.winner if g.winner is not None else score_board(g.board)
        winners.append(w)
        for feat, pi, mc in g.history:
            z = np.float32(w * mc)
            af, ap = augment(feat, pi.reshape(BOARD, BOARD))
            samples.append((af, ap.flatten(), z))
    return samples, winners


# ── Training ────────────────────────────────────────────────────────────────

def train_on_buffer(model, optimizer, buffer, device, batch_size=256, n_batches=200):
    if len(buffer) < batch_size:
        return None, None

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
    )
    size_mb = Path(out_path).stat().st_size / 1024 / 1024
    print(f"  ONNX exported → {out_path}  ({size_mb:.2f} MB)")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AlphaZero self-play for 9×9 Go")
    parser.add_argument("--iterations",  type=int, default=20)
    parser.add_argument("--games",       type=int, default=25,
                        help="Games per iteration — all run in parallel (default: 25)")
    parser.add_argument("--sims",        type=int, default=200,
                        help="MCTS simulations per move (default: 200)")
    parser.add_argument("--buffer-size", type=int, default=100_000)
    parser.add_argument("--batch-size",  type=int, default=256)
    parser.add_argument("--n-batches",   type=int, default=200)
    parser.add_argument("--checkpoint",  default=None)
    parser.add_argument("--output",      default="public/models/go-policy.onnx")
    parser.add_argument("--ckpt-dir",    default="scripts/igo/checkpoints")
    args = parser.parse_args()

    device = (
        torch.device("mps")  if torch.backends.mps.is_available() else
        torch.device("cuda") if torch.cuda.is_available()          else
        torch.device("cpu")
    )
    print(f"Device : {device}")
    print(f"Sims/move: {args.sims}  Games/iter: {args.games} (parallel)  Iterations: {args.iterations}")

    _warmup_numba()

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

        # ── Self-play ────────────────────────────────────────────────────────
        model.eval()
        t0 = time.time()
        print(f"  Running {args.games} games in parallel...", flush=True)
        samples, winners = parallel_self_play(model, device, args.games, args.sims)
        buffer.extend(
            (torch.from_numpy(f), torch.from_numpy(p), torch.tensor(z))
            for f, p, z in samples
        )
        black_wins = sum(w == 1 for w in winners)
        play_time = time.time() - t0
        print(f"  Self-play done: {play_time:.0f}s  "
              f"black_win_rate={black_wins/args.games:.0%}  "
              f"positions={len(samples)//8}  buffer={len(buffer)}")

        # ── Train ────────────────────────────────────────────────────────────
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

        # ── Checkpoint + ONNX ────────────────────────────────────────────────
        ckpt_path = ckpt_dir / f"iter_{it+1:03d}.pt"
        torch.save({"model": model.state_dict(),
                    "optimizer": optimizer.state_dict(),
                    "iteration": it}, ckpt_path)
        print(f"  Checkpoint → {ckpt_path}")
        export_onnx(model, device, args.output)

    print("\nDone.")


if __name__ == "__main__":
    main()
