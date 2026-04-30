"use client";

import { useState, useCallback, useEffect, useRef } from "react";

// ============================================================
// [1] 型定義
// ============================================================

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
  black: number; // 黒が取った石の数（＝白の石）
  white: number; // 白が取った石の数（＝黒の石）
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

// ============================================================
// [2] エンジン関数（非公開・純粋関数）
// ============================================================

const BOARD_SIZE = 9;
const KOMI = 6.5;

const STAR_POINTS: Point[] = [
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

export { BOARD_SIZE, KOMI, STAR_POINTS };

function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

function gridsEqual(a: Grid, b: Grid): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

function pointKey(p: Point): string {
  return `${p.row},${p.col}`;
}

function opponent(color: StoneColor): StoneColor {
  return color === "black" ? "white" : "black";
}

function getNeighbors(p: Point): Point[] {
  return DIRS.map((d) => ({ row: p.row + d.row, col: p.col + d.col })).filter(
    (n) => n.row >= 0 && n.row < BOARD_SIZE && n.col >= 0 && n.col < BOARD_SIZE
  );
}

function findGroup(grid: Grid, start: Point): Point[] {
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

function countLiberties(grid: Grid, group: Point[]): number {
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

function getCapturedGroups(grid: Grid, point: Point, color: StoneColor): Point[][] {
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

function applyMove(
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

function isSuicide(grid: Grid, point: Point, color: StoneColor): boolean {
  const { nextGrid, captured } = applyMove(grid, point, color);
  if (captured > 0) return false;
  const group = findGroup(nextGrid, point);
  return countLiberties(nextGrid, group) === 0;
}

function isKoViolation(nextGrid: Grid, previousGrid: Grid | null): boolean {
  if (!previousGrid) return false;
  return gridsEqual(nextGrid, previousGrid);
}

function isLegalMove(
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

function identifyTerritory(grid: Grid): {
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

      // BFS で空領域を探索
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

function calcFinalScore(
  grid: Grid,
  prisoners: Prisoners,
  markedDead: Set<string>,
  komi: number
): FinalScore {
  // 死石除去後の盤面を作成
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

  // 日本式計算
  // blackTotal = 黒の地 + prisoners.black（対局中に取った白石）+ 白の死石数
  // whiteTotal = 白の地 + prisoners.white（対局中に取った黒石）+ 黒の死石数 + komi
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

// ============================================================
// CPU AI
// ============================================================

function getAllLegalMoves(grid: Grid, color: StoneColor, previousGrid: Grid | null): Point[] {
  const moves: Point[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = { row: r, col: c };
      if (isLegalMove(grid, p, color, previousGrid)) {
        moves.push(p);
      }
    }
  }
  return moves;
}

function scoreMove(grid: Grid, point: Point, color: StoneColor): number {
  let score = 0;
  const { nextGrid, captured } = applyMove(grid, point, color);

  // 相手石を取れるほど高スコア
  score += captured * 15;

  // 自分の石がアタリ（1ダメ）の連を救う手
  const opp = opponent(color);
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (grid[r][c] === color) {
        const group = findGroup(grid, { row: r, col: c });
        if (countLiberties(grid, group) === 1) {
          const groupInNext = findGroup(nextGrid, { row: r, col: c });
          if (countLiberties(nextGrid, groupInNext) > 1) {
            score += group.length * 8;
          }
        }
      }
    }
  }

  // 既存の自分石の隣に打つ（連を伸ばす）
  for (const n of getNeighbors(point)) {
    if (grid[n.row][n.col] === color) {
      score += 2;
      break;
    }
  }

  // 相手石のアタリを作る
  for (const n of getNeighbors(point)) {
    if (nextGrid[n.row][n.col] === opp) {
      const group = findGroup(nextGrid, n);
      if (countLiberties(nextGrid, group) === 1) {
        score += 5;
      }
    }
  }

  // 中央寄りを優先（端は弱いため）
  const centerDist = Math.abs(point.row - 4) + Math.abs(point.col - 4);
  score += Math.max(0, 4 - centerDist);

  return score;
}

function computeCpuMove(grid: Grid, color: StoneColor, previousGrid: Grid | null): Point | null {
  const legalMoves = getAllLegalMoves(grid, color, previousGrid);
  if (legalMoves.length === 0) return null;

  let bestScore = -Infinity;
  let bestMoves: Point[] = [];

  for (const move of legalMoves) {
    const s = scoreMove(grid, move, color);
    if (s > bestScore) {
      bestScore = s;
      bestMoves = [move];
    } else if (s === bestScore) {
      bestMoves.push(move);
    }
  }

  // 同スコアはランダムに選択
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// ============================================================
// [3] useGoGame フック
// ============================================================

const CPU_COLOR: StoneColor = "white";
const PLAYER_COLOR: StoneColor = "black";

function makeInitialState(): GameState {
  return {
    grid: Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill("empty")),
    previousGrid: null,
    currentTurn: "black",
    prisoners: { black: 0, white: 0 },
    passCount: 0,
    gamePhase: "playing",
    markedDead: new Set<string>(),
    komi: KOMI,
    lastMove: null,
    isCpuThinking: false,
  };
}

export function useGoGame(): UseGoGameReturn {
  const [state, setState] = useState<GameState>(makeInitialState);
  const [finalScore, setFinalScore] = useState<FinalScore | null>(null);
  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ref で「スケジュール済み」を管理し isCpuThinking の state 変化でエフェクトが再発火しないようにする
  const cpuScheduledRef = useRef(false);

  // CPU の手番になったら自動で着手
  useEffect(() => {
    if (state.gamePhase !== "playing" || state.currentTurn !== CPU_COLOR) {
      cpuScheduledRef.current = false;
      return;
    }
    if (cpuScheduledRef.current) return;

    cpuScheduledRef.current = true;
    setState((prev) => ({ ...prev, isCpuThinking: true }));

    const timer = setTimeout(() => {
      cpuScheduledRef.current = false;
      setState((prev) => {
        if (prev.gamePhase !== "playing" || prev.currentTurn !== CPU_COLOR) return prev;

        const cpuMove = computeCpuMove(prev.grid, CPU_COLOR, prev.previousGrid);

        if (!cpuMove) {
          // CPU がパス
          const newPassCount = prev.passCount + 1;
          if (newPassCount >= 2) {
            return {
              ...prev,
              passCount: newPassCount,
              gamePhase: "scoring",
              currentTurn: PLAYER_COLOR,
              isCpuThinking: false,
            };
          }
          return {
            ...prev,
            passCount: newPassCount,
            currentTurn: PLAYER_COLOR,
            lastMove: null,
            isCpuThinking: false,
          };
        }

        const { nextGrid, captured } = applyMove(prev.grid, cpuMove, CPU_COLOR);
        const newPrisoners = {
          ...prev.prisoners,
          white: prev.prisoners.white + captured,
        };

        return {
          ...prev,
          previousGrid: prev.grid,
          grid: nextGrid,
          prisoners: newPrisoners,
          passCount: 0,
          currentTurn: PLAYER_COLOR,
          lastMove: cpuMove,
          isCpuThinking: false,
        };
      });
    }, 500);

    cpuTimerRef.current = timer;

    return () => {
      clearTimeout(timer);
      cpuScheduledRef.current = false;
    };
    // isCpuThinking を依存配列に含めないことでタイマー再スケジュールを防ぐ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.gamePhase, state.currentTurn]);

  const placeStone = useCallback((point: Point) => {
    setState((prev) => {
      if (prev.gamePhase !== "playing") return prev;
      if (prev.currentTurn !== PLAYER_COLOR) return prev; // CPU の番は無視
      if (!isLegalMove(prev.grid, point, prev.currentTurn, prev.previousGrid)) return prev;

      const { nextGrid, captured } = applyMove(prev.grid, point, prev.currentTurn);
      const opp = opponent(prev.currentTurn);
      const newPrisoners = {
        ...prev.prisoners,
        [prev.currentTurn]: prev.prisoners[prev.currentTurn as keyof Prisoners] + captured,
      };

      return {
        ...prev,
        previousGrid: prev.grid,
        grid: nextGrid,
        prisoners: newPrisoners,
        passCount: 0,
        currentTurn: opp,
        lastMove: point,
        isCpuThinking: false,
      };
    });
  }, []);

  const pass = useCallback(() => {
    setState((prev) => {
      if (prev.gamePhase !== "playing") return prev;
      if (prev.currentTurn !== PLAYER_COLOR) return prev;

      const newPassCount = prev.passCount + 1;
      if (newPassCount >= 2) {
        return {
          ...prev,
          passCount: newPassCount,
          gamePhase: "scoring",
          lastMove: null,
        };
      }
      return {
        ...prev,
        passCount: newPassCount,
        currentTurn: CPU_COLOR,
        lastMove: null,
        isCpuThinking: false,
      };
    });
  }, []);

  const toggleDeadStone = useCallback((point: Point) => {
    setState((prev) => {
      if (prev.gamePhase !== "scoring") return prev;
      if (prev.grid[point.row][point.col] === "empty") return prev;

      const newMarked = new Set(prev.markedDead);

      // 同じ連全体をトグル
      const group = findGroup(prev.grid, point);
      const allMarked = group.every((p) => newMarked.has(pointKey(p)));

      if (allMarked) {
        group.forEach((p) => newMarked.delete(pointKey(p)));
      } else {
        group.forEach((p) => newMarked.add(pointKey(p)));
      }

      return { ...prev, markedDead: newMarked };
    });
  }, []);

  const confirmScore = useCallback(() => {
    setState((prev) => {
      if (prev.gamePhase !== "scoring") return prev;
      const score = calcFinalScore(prev.grid, prev.prisoners, prev.markedDead, prev.komi);
      setFinalScore(score);
      return { ...prev, gamePhase: "finished" };
    });
  }, []);

  const resetGame = useCallback(() => {
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    setFinalScore(null);
    setState(makeInitialState());
  }, []);

  const isLegal = useCallback(
    (point: Point) => {
      return isLegalMove(state.grid, point, state.currentTurn, state.previousGrid);
    },
    [state.grid, state.currentTurn, state.previousGrid]
  );

  return { state, finalScore, placeStone, pass, toggleDeadStone, confirmScore, resetGame, isLegal };
}
