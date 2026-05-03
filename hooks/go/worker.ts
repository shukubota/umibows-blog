/// <reference lib="webworker" />

import { mcts } from "./mcts";
import { Grid, Point, StoneColor } from "./engine";

interface WorkerRequest {
  grid: Grid;
  color: StoneColor;
  previousGrid: Grid | null;
  iterations: number;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { grid, color, previousGrid, iterations } = e.data;
  const move: Point | null = mcts(grid, color, previousGrid, iterations);
  self.postMessage(move);
};
