export type StoneColor = "black" | "white";
export type CellState = StoneColor | "empty";
export type GamePhase = "playing" | "scoring" | "finished";
export type TerritoryCell = StoneColor | "neutral";
export type Grid = CellState[][];

export interface Point {
  row: number;
  col: number;
}

export interface Prisoners {
  black: number;
  white: number;
}

export interface GameState {
  grid: Grid;
  previousGrid: Grid | null;
  currentTurn: StoneColor;
  prisoners: Prisoners;
  passCount: number;
  gamePhase: GamePhase;
  markedDead: Set<string>;
  komi: number;
  lastMove: Point | null;
  isCpuThinking: boolean;
}

export interface FinalScore {
  blackTerritory: number;
  whiteTerritory: number;
  blackPrisoners: number;
  whitePrisoners: number;
  komi: number;
  blackTotal: number;
  whiteTotal: number;
  winner: StoneColor;
}

export interface UseGoGameReturn {
  state: GameState;
  finalScore: FinalScore | null;
  placeStone: (point: Point) => void;
  pass: () => void;
  toggleDeadStone: (point: Point) => void;
  confirmScore: () => void;
  resetGame: () => void;
  isLegal: (point: Point) => boolean;
}

export const BOARD_SIZE = 9;
export const KOMI = 6.5;

export const STAR_POINTS: Point[] = [
  { row: 2, col: 2 },
  { row: 2, col: 6 },
  { row: 4, col: 4 },
  { row: 6, col: 2 },
  { row: 6, col: 6 },
];

const DIRS: Point[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

export function gridsEqual(a: Grid, b: Grid): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

export function pointKey(p: Point): string {
  return `${p.row},${p.col}`;
}

export function opponent(color: StoneColor): StoneColor {
  return color === "black" ? "white" : "black";
}

export function getNeighbors(p: Point): Point[] {
  return DIRS.map((d) => ({ row: p.row + d.row, col: p.col + d.col })).filter(
    (n) => n.row >= 0 && n.row < BOARD_SIZE && n.col >= 0 && n.col < BOARD_SIZE
  );
}

export function findGroup(grid: Grid, start: Point): Point[] {
  const color = grid[start.row][start.col];
  if (color === "empty") return [];
  const visited = new Set<string>();
  const group: Point[] = [];
  const queue: Point[] = [start];
  visited.add(pointKey(start));
  while (queue.length > 0) {
    const p = queue.shift()!;
    group.push(p);
    for (const n of getNeighbors(p)) {
      const key = pointKey(n);
      if (!visited.has(key) && grid[n.row][n.col] === color) {
        visited.add(key);
        queue.push(n);
      }
    }
  }
  return group;
}

export function countLiberties(grid: Grid, group: Point[]): number {
  const liberties = new Set<string>();
  for (const p of group) {
    for (const n of getNeighbors(p)) {
      if (grid[n.row][n.col] === "empty") {
        liberties.add(pointKey(n));
      }
    }
  }
  return liberties.size;
}

export function getCapturedGroups(grid: Grid, point: Point, color: StoneColor): Point[][] {
  const opp = opponent(color);
  const captured: Point[][] = [];
  const checked = new Set<string>();
  for (const n of getNeighbors(point)) {
    const key = pointKey(n);
    if (!checked.has(key) && grid[n.row][n.col] === opp) {
      const group = findGroup(grid, n);
      group.forEach((p) => checked.add(pointKey(p)));
      if (countLiberties(grid, group) === 0) {
        captured.push(group);
      }
    }
  }
  return captured;
}

export function applyMove(
  grid: Grid,
  point: Point,
  color: StoneColor
): { nextGrid: Grid; captured: number } {
  const nextGrid = cloneGrid(grid);
  nextGrid[point.row][point.col] = color;
  const capturedGroups = getCapturedGroups(nextGrid, point, color);
  let captured = 0;
  for (const group of capturedGroups) {
    captured += group.length;
    for (const p of group) {
      nextGrid[p.row][p.col] = "empty";
    }
  }
  return { nextGrid, captured };
}

export function isSuicide(grid: Grid, point: Point, color: StoneColor): boolean {
  const { nextGrid, captured } = applyMove(grid, point, color);
  if (captured > 0) return false;
  const group = findGroup(nextGrid, point);
  return countLiberties(nextGrid, group) === 0;
}

export function isKoViolation(nextGrid: Grid, previousGrid: Grid | null): boolean {
  if (!previousGrid) return false;
  return gridsEqual(nextGrid, previousGrid);
}

export function isLegalMove(
  grid: Grid,
  point: Point,
  color: StoneColor,
  previousGrid: Grid | null
): boolean {
  if (grid[point.row][point.col] !== "empty") return false;
  if (isSuicide(grid, point, color)) return false;
  const { nextGrid } = applyMove(grid, point, color);
  if (isKoViolation(nextGrid, previousGrid)) return false;
  return true;
}

export function getAllLegalMoves(
  grid: Grid,
  color: StoneColor,
  previousGrid: Grid | null
): Point[] {
  const moves: Point[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = { row: r, col: c };
      if (isLegalMove(grid, p, color, previousGrid)) moves.push(p);
    }
  }
  return moves;
}

export function identifyTerritory(grid: Grid): {
  territoryGrid: TerritoryCell[][];
  score: { black: number; white: number };
} {
  const territoryGrid: TerritoryCell[][] = grid.map((row) =>
    row.map((cell) => (cell === "black" ? "black" : cell === "white" ? "white" : "neutral"))
  );
  const visited = new Set<string>();
  let blackScore = 0;
  let whiteScore = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const key = `${r},${c}`;
      if (grid[r][c] !== "empty" || visited.has(key)) continue;

      const region: Point[] = [];
      const queue: Point[] = [{ row: r, col: c }];
      visited.add(key);
      const borderingColors = new Set<StoneColor>();

      while (queue.length > 0) {
        const p = queue.shift()!;
        region.push(p);
        for (const n of getNeighbors(p)) {
          const nKey = pointKey(n);
          if (grid[n.row][n.col] === "empty") {
            if (!visited.has(nKey)) {
              visited.add(nKey);
              queue.push(n);
            }
          } else {
            borderingColors.add(grid[n.row][n.col] as StoneColor);
          }
        }
      }

      let owner: TerritoryCell = "neutral";
      if (borderingColors.size === 1) {
        owner = borderingColors.values().next().value as StoneColor;
        if (owner === "black") blackScore += region.length;
        else whiteScore += region.length;
      }
      for (const p of region) {
        territoryGrid[p.row][p.col] = owner;
      }
    }
  }

  return { territoryGrid, score: { black: blackScore, white: whiteScore } };
}

// ロールアウト終局後の勝者判定（日本式簡易版）
export function evaluateWinner(grid: Grid): StoneColor {
  let blackStones = 0;
  let whiteStones = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (grid[r][c] === "black") blackStones++;
      else if (grid[r][c] === "white") whiteStones++;
    }
  }
  const { score } = identifyTerritory(grid);
  const blackTotal = blackStones + score.black;
  const whiteTotal = whiteStones + score.white + KOMI;
  return blackTotal > whiteTotal ? "black" : "white";
}

export function calcFinalScore(
  grid: Grid,
  prisoners: Prisoners,
  markedDead: Set<string>,
  komi: number
): FinalScore {
  const scoringGrid = cloneGrid(grid);
  let whiteDead = 0;
  let blackDead = 0;
  for (const key of Array.from(markedDead)) {
    const [r, c] = key.split(",").map(Number);
    const color = scoringGrid[r][c];
    if (color === "white") whiteDead++;
    else if (color === "black") blackDead++;
    scoringGrid[r][c] = "empty";
  }

  const { score } = identifyTerritory(scoringGrid);
  const blackTotal = score.black + prisoners.black + whiteDead;
  const whiteTotal = score.white + prisoners.white + blackDead + komi;
  const winner: StoneColor = blackTotal > whiteTotal ? "black" : "white";

  return {
    blackTerritory: score.black,
    whiteTerritory: score.white,
    blackPrisoners: prisoners.black,
    whitePrisoners: prisoners.white,
    komi,
    blackTotal,
    whiteTotal,
    winner,
  };
}
