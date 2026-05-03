import {
  Grid,
  Point,
  StoneColor,
  getAllLegalMoves,
  applyMove,
  isLegalMove,
  findGroup,
  countLiberties,
  getNeighbors,
  opponent,
  pointKey,
  evaluateWinner,
  BOARD_SIZE,
} from "./engine";

const C = Math.SQRT2;
const RAVE_K = 500;

interface MctsNode {
  point: Point | null;
  moveKey: string | null;
  color: StoneColor;
  grid: Grid;
  previousGrid: Grid | null;
  wins: number;
  visits: number;
  amafWins: Map<string, number>;
  amafVisits: Map<string, number>;
  children: MctsNode[];
  untriedMoves: Point[];
  parent: MctsNode | null;
}

function makeNode(
  point: Point | null,
  color: StoneColor,
  grid: Grid,
  previousGrid: Grid | null,
  parent: MctsNode | null
): MctsNode {
  const nextColor = opponent(color);
  return {
    point,
    moveKey: point ? pointKey(point) : null,
    color,
    grid,
    previousGrid,
    wins: 0,
    visits: 0,
    amafWins: new Map(),
    amafVisits: new Map(),
    children: [],
    untriedMoves: getAllLegalMoves(grid, nextColor, previousGrid),
    parent,
  };
}

function raveUctScore(node: MctsNode, parentVisits: number): number {
  if (node.visits === 0) return Infinity;

  const q = node.wins / node.visits;
  const u = C * Math.sqrt(Math.log(parentVisits) / node.visits);
  const uct = q + u;

  const key = node.moveKey;
  if (!key || !node.parent) return uct;

  const aw = node.parent.amafWins.get(key) ?? 0;
  const an = node.parent.amafVisits.get(key) ?? 0;
  if (an === 0) return uct;

  const amaf = aw / an;
  const beta = Math.sqrt(RAVE_K / (3 * node.visits + RAVE_K));
  return (1 - beta) * uct + beta * amaf;
}

function selectNode(root: MctsNode): MctsNode {
  let node = root;
  while (node.untriedMoves.length === 0 && node.children.length > 0) {
    node = node.children.reduce((best, child) =>
      raveUctScore(child, node.visits) > raveUctScore(best, node.visits) ? child : best
    );
  }
  return node;
}

function expand(node: MctsNode): MctsNode {
  if (node.untriedMoves.length === 0) return node;

  const idx = Math.floor(Math.random() * node.untriedMoves.length);
  const move = node.untriedMoves.splice(idx, 1)[0];
  const nextColor = opponent(node.color);
  const { nextGrid } = applyMove(node.grid, move, nextColor);
  const child = makeNode(move, nextColor, nextGrid, node.grid, node);
  node.children.push(child);
  return child;
}

// ロールアウト内で自分の眼（全隣接が自石）への着手を避ける
function isOwnEye(grid: Grid, p: Point, color: StoneColor): boolean {
  const neighbors = getNeighbors(p);
  return neighbors.length > 0 && neighbors.every((n) => grid[n.row][n.col] === color);
}

// 直前手の周辺でアタリへの応答手を探す（取る or 逃げる）
function atariResponseMove(
  grid: Grid,
  color: StoneColor,
  prev: Grid | null,
  lastMove: Point
): Point | null {
  const opp = opponent(color);
  const checked = new Set<string>();

  for (const n of getNeighbors(lastMove)) {
    const key = pointKey(n);
    if (checked.has(key)) continue;
    checked.add(key);

    if (grid[n.row][n.col] === opp) {
      // 相手連がアタリなら取りに行く
      const group = findGroup(grid, n);
      group.forEach((g) => checked.add(pointKey(g)));
      if (countLiberties(grid, group) === 1) {
        for (const g of group) {
          for (const lib of getNeighbors(g)) {
            if (grid[lib.row][lib.col] === "empty" && isLegalMove(grid, lib, color, prev)) {
              return lib;
            }
          }
        }
      }
    } else if (grid[n.row][n.col] === color) {
      // 自分の連がアタリなら逃げる
      const group = findGroup(grid, n);
      group.forEach((g) => checked.add(pointKey(g)));
      if (countLiberties(grid, group) === 1) {
        for (const g of group) {
          for (const lib of getNeighbors(g)) {
            if (grid[lib.row][lib.col] === "empty" && isLegalMove(grid, lib, color, prev)) {
              return lib;
            }
          }
        }
      }
    }
  }
  return null;
}

// ランダムに走査して最初の合法手を返す（眼埋め回避付き）
function randomLegalMove(grid: Grid, color: StoneColor, prev: Grid | null): Point | null {
  const total = BOARD_SIZE * BOARD_SIZE;
  const start = Math.floor(Math.random() * total);

  // 眼埋めを避けながらランダム合法手を探す
  for (let i = 0; i < total; i++) {
    const idx = (start + i) % total;
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    const p = { row, col };
    if (grid[row][col] !== "empty") continue;
    if (isOwnEye(grid, p, color)) continue;
    if (isLegalMove(grid, p, color, prev)) return p;
  }

  // フォールバック: 眼でも合法手なら返す
  const start2 = Math.floor(Math.random() * total);
  for (let i = 0; i < total; i++) {
    const idx = (start2 + i) % total;
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    if (grid[row][col] === "empty" && isLegalMove(grid, { row, col }, color, prev)) {
      return { row, col };
    }
  }

  return null;
}

function rollout(node: MctsNode): { winner: StoneColor; playedKeys: Set<string> } {
  let grid = node.grid;
  let prev = node.previousGrid;
  let color = opponent(node.color);
  let lastMove: Point | null = node.point;
  const playedKeys = new Set<string>();
  let passes = 0;
  const MAX_MOVES = BOARD_SIZE * BOARD_SIZE * 2;

  for (let step = 0; step < MAX_MOVES; step++) {
    // 優先: 直前手周辺のアタリに応答
    const atari = lastMove ? atariResponseMove(grid, color, prev, lastMove) : null;
    const move = atari ?? randomLegalMove(grid, color, prev);

    if (!move) {
      if (++passes >= 2) break;
      color = opponent(color);
      continue;
    }
    passes = 0;
    lastMove = move;
    playedKeys.add(pointKey(move));
    const { nextGrid } = applyMove(grid, move, color);
    prev = grid;
    grid = nextGrid;
    color = opponent(color);
  }

  return { winner: evaluateWinner(grid), playedKeys };
}

function backpropagate(
  node: MctsNode | null,
  winner: StoneColor,
  playedKeys: Set<string>
): void {
  while (node !== null) {
    node.visits++;
    if (node.color === winner) node.wins++;

    for (const key of Array.from(playedKeys)) {
      node.amafVisits.set(key, (node.amafVisits.get(key) ?? 0) + 1);
      if (node.color === winner) {
        node.amafWins.set(key, (node.amafWins.get(key) ?? 0) + 1);
      }
    }

    node = node.parent;
  }
}

export function mcts(
  grid: Grid,
  color: StoneColor,
  previousGrid: Grid | null,
  iterations = 2000
): Point | null {
  const root = makeNode(null, opponent(color), grid, previousGrid, null);

  for (let i = 0; i < iterations; i++) {
    let node = selectNode(root);
    if (node.untriedMoves.length > 0) {
      node = expand(node);
    }
    const { winner, playedKeys } = rollout(node);
    backpropagate(node, winner, playedKeys);
  }

  if (root.children.length === 0) return null;

  return root.children.reduce((best, c) => (c.visits > best.visits ? c : best)).point;
}
