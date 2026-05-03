import {
  Grid,
  Point,
  StoneColor,
  getAllLegalMoves,
  applyMove,
  findGroup,
  countLiberties,
  getNeighbors,
  opponent,
} from "./engine";

// 隣接する自分の連がアタリ（ダメ1）かどうかチェックし、この手で救えるか判定
export function savesOwnAtari(grid: Grid, move: Point, color: StoneColor): boolean {
  for (const n of getNeighbors(move)) {
    if (grid[n.row][n.col] !== color) continue;
    const group = findGroup(grid, n);
    if (countLiberties(grid, group) === 1) return true;
  }
  return false;
}

// この手を打つと相手の連をアタリにできるか
export function createsAtari(grid: Grid, move: Point, color: StoneColor): boolean {
  const { nextGrid } = applyMove(grid, move, color);
  const opp = opponent(color);
  for (const n of getNeighbors(move)) {
    if (nextGrid[n.row][n.col] !== opp) continue;
    const group = findGroup(nextGrid, n);
    if (countLiberties(nextGrid, group) === 1) return true;
  }
  return false;
}

// ロールアウト用：ヒューリスティックで次の手を選ぶ
export function heuristicPlayoutMove(
  grid: Grid,
  color: StoneColor,
  prev: Grid | null
): Point | null {
  const legal = getAllLegalMoves(grid, color, prev);
  if (legal.length === 0) return null;

  // 優先度1: 相手石を取れる手
  for (const m of legal) {
    if (applyMove(grid, m, color).captured > 0) return m;
  }

  // 優先度2: 自分のアタリを救う手
  for (const m of legal) {
    if (savesOwnAtari(grid, m, color)) return m;
  }

  // 優先度3: 相手をアタリにする手
  for (const m of legal) {
    if (createsAtari(grid, m, color)) return m;
  }

  return legal[Math.floor(Math.random() * legal.length)];
}
