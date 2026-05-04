import { Grid, StoneColor, opponent } from "./engine";

const BOARD_SIZE = 9;
export const N_PLANES = 4; // own, opp, empty, color-to-move

/**
 * Converts board state to a flat Float32Array matching the Python training
 * feature layout: [1, N_PLANES, BOARD_SIZE, BOARD_SIZE] in NCHW order.
 */
export function boardToFeatures(grid: Grid, color: StoneColor): Float32Array {
  const opp = opponent(color);
  const cells = BOARD_SIZE * BOARD_SIZE;
  const data = new Float32Array(N_PLANES * cells);

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const i = r * BOARD_SIZE + c;
      const cell = grid[r][c];
      data[0 * cells + i] = cell === color ? 1 : 0; // own
      data[1 * cells + i] = cell === opp ? 1 : 0; // opponent
      data[2 * cells + i] = cell === "empty" ? 1 : 0; // empty
      data[3 * cells + i] = color === "black" ? 1 : 0; // black-to-move
    }
  }

  return data;
}
