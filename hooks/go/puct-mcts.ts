import {
  Grid,
  Point,
  StoneColor,
  getAllLegalMoves,
  applyMove,
  isLegalMove,
  getNeighbors,
  opponent,
  pointKey,
  evaluateWinner,
  BOARD_SIZE,
} from "./engine";

const C_PUCT = 1.5;

interface PuctNode {
  point: Point | null;
  color: StoneColor;
  grid: Grid;
  previousGrid: Grid | null;
  wins: number;
  visits: number;
  prior: number;
  children: PuctNode[];
  untriedMoves: Array<{ point: Point; prior: number }>;
  parent: PuctNode | null;
}

function makeNode(
  point: Point | null,
  prior: number,
  color: StoneColor,
  grid: Grid,
  previousGrid: Grid | null,
  parent: PuctNode | null,
  movePriors?: Map<string, number>
): PuctNode {
  const nextColor = opponent(color);
  const legal = getAllLegalMoves(grid, nextColor, previousGrid);
  const uniform = 1 / Math.max(legal.length, 1);
  const untried = legal
    .map((p) => ({ point: p, prior: movePriors?.get(pointKey(p)) ?? uniform }))
    .sort((a, b) => b.prior - a.prior);
  return {
    point,
    color,
    grid,
    previousGrid,
    wins: 0,
    visits: 0,
    prior,
    children: [],
    untriedMoves: untried,
    parent,
  };
}

function puctScore(child: PuctNode, parentVisits: number): number {
  const u = (C_PUCT * child.prior * Math.sqrt(parentVisits)) / (1 + child.visits);
  if (child.visits === 0) return u;
  return child.wins / child.visits + u;
}

function select(root: PuctNode): PuctNode {
  let node = root;
  while (node.untriedMoves.length === 0 && node.children.length > 0) {
    node = node.children.reduce((best, c) =>
      puctScore(c, node.visits) > puctScore(best, node.visits) ? c : best
    );
  }
  return node;
}

function expand(node: PuctNode): PuctNode {
  if (node.untriedMoves.length === 0) return node;
  const { point, prior } = node.untriedMoves.shift()!;
  const nextColor = opponent(node.color);
  const { nextGrid } = applyMove(node.grid, point, nextColor);
  const child = makeNode(point, prior, nextColor, nextGrid, node.grid, node);
  node.children.push(child);
  return child;
}

function isOwnEye(grid: Grid, p: Point, color: StoneColor): boolean {
  const ns = getNeighbors(p);
  return ns.length > 0 && ns.every((n) => grid[n.row][n.col] === color);
}

function randomLegalMove(grid: Grid, color: StoneColor, prev: Grid | null): Point | null {
  const total = BOARD_SIZE * BOARD_SIZE;
  const start = Math.floor(Math.random() * total);
  for (let i = 0; i < total; i++) {
    const idx = (start + i) % total;
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    const p = { row, col };
    if (grid[row][col] !== "empty") continue;
    if (isOwnEye(grid, p, color)) continue;
    if (isLegalMove(grid, p, color, prev)) return p;
  }
  // fallback without eye check
  for (let i = 0; i < total; i++) {
    const idx = (start + i) % total;
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    if (grid[row][col] === "empty" && isLegalMove(grid, { row, col }, color, prev))
      return { row, col };
  }
  return null;
}

function rollout(node: PuctNode): StoneColor {
  let grid = node.grid;
  let prev = node.previousGrid;
  let color = opponent(node.color);
  let passes = 0;
  const MAX = BOARD_SIZE * BOARD_SIZE * 2;
  for (let i = 0; i < MAX; i++) {
    const move = randomLegalMove(grid, color, prev);
    if (!move) {
      if (++passes >= 2) break;
      color = opponent(color);
      continue;
    }
    passes = 0;
    const { nextGrid } = applyMove(grid, move, color);
    prev = grid;
    grid = nextGrid;
    color = opponent(color);
  }
  return evaluateWinner(grid);
}

function backpropagate(node: PuctNode | null, winner: StoneColor): void {
  while (node) {
    node.visits++;
    if (node.color === winner) node.wins++;
    node = node.parent;
  }
}

export function puctMcts(
  grid: Grid,
  color: StoneColor,
  previousGrid: Grid | null,
  priors: Map<string, number>,
  iterations = 800
): Point | null {
  const root = makeNode(null, 1, opponent(color), grid, previousGrid, null, priors);
  for (let i = 0; i < iterations; i++) {
    let node = select(root);
    if (node.untriedMoves.length > 0) node = expand(node);
    const winner = rollout(node);
    backpropagate(node, winner);
  }
  if (root.children.length === 0) return null;
  return root.children.reduce((best, c) => (c.visits > best.visits ? c : best)).point;
}
