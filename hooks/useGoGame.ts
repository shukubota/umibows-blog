"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  applyMove,
  calcFinalScore,
  findGroup,
  getAllLegalMoves,
  isLegalMove,
  opponent,
  pointKey,
} from "./go/engine";
import { computeCpuMoveNN, warmupModel } from "@/app/igo/actions";

// コンポーネント側の既存 import を壊さないよう全て再エクスポート
export type {
  StoneColor,
  CellState,
  GamePhase,
  TerritoryCell,
  Grid,
  Point,
  Prisoners,
  GameState,
  FinalScore,
  UseGoGameReturn,
} from "./go/engine";
export { BOARD_SIZE, KOMI, STAR_POINTS } from "./go/engine";

import type {
  StoneColor,
  Grid,
  Point,
  Prisoners,
  GameState,
  FinalScore,
  UseGoGameReturn,
} from "./go/engine";

// ============================================================
// 定数
// ============================================================

const BOARD_SIZE = 9;
const KOMI = 6.5;
const CPU_COLOR: StoneColor = "white";
const PLAYER_COLOR: StoneColor = "black";

// ============================================================
// 初期状態
// ============================================================

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

// ============================================================
// MCTS fallback (web worker)
// ============================================================

function makeMctsFallback(
  grid: Grid,
  color: StoneColor,
  previousGrid: Grid | null
): Promise<Point | null> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./go/worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<Point | null>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(null);
    };
    worker.postMessage({ grid, color, previousGrid, iterations: 2000 });
  });
}

// ============================================================
// useGoGame フック
// ============================================================

export function useGoGame(): UseGoGameReturn {
  const [state, setState] = useState<GameState>(makeInitialState);
  const [finalScore, setFinalScore] = useState<FinalScore | null>(null);

  const cpuScheduledRef = useRef(false);

  // モデルをウォームアップ（マウント時）
  useEffect(() => {
    warmupModel().catch(() => {
      // モデル未配置でも MCTS フォールバックで動くので無視
    });
  }, []);

  // CPU の手番になったら NN Server Action を呼ぶ（失敗時 MCTS）
  useEffect(() => {
    if (state.gamePhase !== "playing" || state.currentTurn !== CPU_COLOR) {
      cpuScheduledRef.current = false;
      return;
    }
    if (cpuScheduledRef.current) return;
    cpuScheduledRef.current = true;

    setState((prev) => ({ ...prev, isCpuThinking: true }));

    const grid = state.grid;
    const previousGrid = state.previousGrid;

    computeCpuMoveNN(grid, CPU_COLOR, previousGrid)
      .catch((e) => {
        console.warn("[igo] NN failed, falling back to MCTS:", e);
        return makeMctsFallback(grid, CPU_COLOR, previousGrid);
      })
      .then((cpuMove) => {
        cpuScheduledRef.current = false;
        setState((prev) => {
          if (prev.gamePhase !== "playing" || prev.currentTurn !== CPU_COLOR) return prev;

          if (!cpuMove) {
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
          return {
            ...prev,
            previousGrid: prev.grid,
            grid: nextGrid,
            prisoners: { ...prev.prisoners, white: prev.prisoners.white + captured },
            passCount: 0,
            currentTurn: PLAYER_COLOR,
            lastMove: cpuMove,
            isCpuThinking: false,
          };
        });
      })
      .catch(() => {
        cpuScheduledRef.current = false;
        setState((prev) => ({ ...prev, isCpuThinking: false }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.gamePhase, state.currentTurn]);

  // ============================================================
  // プレイヤー操作
  // ============================================================

  const placeStone = useCallback((point: Point) => {
    setState((prev) => {
      if (prev.gamePhase !== "playing" || prev.currentTurn !== PLAYER_COLOR) return prev;
      if (!isLegalMove(prev.grid, point, prev.currentTurn, prev.previousGrid)) return prev;

      const { nextGrid, captured } = applyMove(prev.grid, point, prev.currentTurn);
      const opp = opponent(prev.currentTurn);
      const newPrisoners: Prisoners = {
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
      if (prev.gamePhase !== "playing" || prev.currentTurn !== PLAYER_COLOR) return prev;

      const newPassCount = prev.passCount + 1;
      if (newPassCount >= 2) {
        return { ...prev, passCount: newPassCount, gamePhase: "scoring", lastMove: null };
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
    cpuScheduledRef.current = false;
    setFinalScore(null);
    setState(makeInitialState());
  }, []);

  const isLegal = useCallback(
    (point: Point) => isLegalMove(state.grid, point, state.currentTurn, state.previousGrid),
    [state.grid, state.currentTurn, state.previousGrid]
  );

  return { state, finalScore, placeStone, pass, toggleDeadStone, confirmScore, resetGame, isLegal };
}
