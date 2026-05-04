# 囲碁アプリ アーキテクチャ設計書

## 現状の課題

既存実装（`app/igo/igo.tsx`）には以下の問題がある:

- コウルールが未実装
- パスが未実装 → 終局できない
- 地の計算アルゴリズムにバグがある（隣接する石の色チェックが不完全）
- 自殺手判定にバグがある（ダメの計算が不正確）
- コミが未実装
- 終局後の死石マーキングUIが未実装
- ゲームロジックとUIが1ファイルに混在している

## 設計方針

1. **ゲームエンジンとUIを分離**: エンジン関数は `useGoGame.ts` 内のモジュールレベル関数（非公開）として実装
2. **状態管理をカスタムフックに集約**: `hooks/useGoGame.ts` 1ファイルに完結させる
3. **ゲームフェーズを明示的に管理**: playing → scoring → finished
4. **コンポーネントは表示とイベント通知のみ責務を持つ**
5. **9路盤のみ対応**（`BOARD_SIZE = 9` を定数として持つ）

---

## ファイル構成

```
app/igo/
  page.tsx                  # Next.js ページ（thin wrapper）
  igo.tsx                   # ルートコンポーネント
  components/
    Board.tsx               # 盤面描画
    Stone.tsx               # 石の描画
    Marker.tsx              # マーカー描画（死石・最終手）
    GameControls.tsx        # パス・リセットボタン
    ScoreBoard.tsx          # スコア・アゲハマ表示
    GameResult.tsx          # 終局結果モーダル

hooks/
  useGoGame.ts              # 型定義 + エンジン関数（private） + 状態管理フック
```

---

## `hooks/useGoGame.ts` の構造

1ファイルを3ブロックで構成する。

```
useGoGame.ts
  ├─ [1] 型定義（export）
  ├─ [2] エンジン関数（モジュールレベル、非公開）
  └─ [3] useGoGame フック（export）
```

コンポーネントは `useGoGame.ts` から型をインポートする。

---

## [1] 型定義

```typescript
export type StoneColor = "black" | "white";
export type CellState = StoneColor | "empty";
export type GamePhase = "playing" | "scoring" | "finished";
export type TerritoryCell = StoneColor | "neutral";

export type Grid = CellState[][]; // [row][col], 0-indexed, 9×9

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
  previousGrid: Grid | null; // コウ判定用（1手前の盤面）
  currentTurn: StoneColor;
  prisoners: Prisoners;
  passCount: number;
  gamePhase: GamePhase;
  markedDead: Set<string>; // `${row},${col}` 形式
  komi: number;
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
```

---

## [2] エンジン関数（非公開）

全て**純粋関数**。フック外のモジュールレベルで定義し、`export` しない。

### 定数

```typescript
const BOARD_SIZE = 9;
const KOMI = 6.5;

// 9路盤の星（0-indexed）
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
```

### グループ・ダメ

```typescript
// 同色の連を BFS で探索して返す
function findGroup(grid: Grid, start: Point): Point[];

// 連に隣接する空点（ダメ）の数を返す
function countLiberties(grid: Grid, group: Point[]): number;
```

### 合法手判定

```typescript
// 着手が合法かどうかを判定する
// 判定順序: 空点 → 仮置き → 相手石捕獲 → 自殺手チェック → コウチェック
function isLegalMove(
  grid: Grid,
  point: Point,
  color: StoneColor,
  previousGrid: Grid | null
): boolean;

// 着手後に取れる相手グループを全て返す
function getCapturedGroups(grid: Grid, point: Point, color: StoneColor): Point[][];

// 自殺手判定（相手石を取らず自連のダメ=0）
function isSuicide(grid: Grid, point: Point, color: StoneColor): boolean;

// コウ判定（着手後の盤面 === 1手前の盤面）
function isKoViolation(nextGrid: Grid, previousGrid: Grid | null): boolean;
```

### 着手の適用

```typescript
// 石を置いて捕獲処理を行い、新しい盤面と取り石数を返す
// 処理順序: 置く → 相手グループのダメ確認 → 0なら除去 → 取り石数を返す
function applyMove(
  grid: Grid,
  point: Point,
  color: StoneColor
): { nextGrid: Grid; captured: number };
```

### 地計算

```typescript
// 全空領域を BFS で探索し、帰属色を判定する
// 片方の色のみに接する → その色の地 / 両色に接する → neutral
function identifyTerritory(grid: Grid): {
  territoryGrid: TerritoryCell[][];
  score: { black: number; white: number };
};

// 終局スコアを計算する
// 計算式（日本式）:
//   白の死石数 = markedDead のうち white の石の数
//   黒の死石数 = markedDead のうち black の石の数
//   blackTotal = 黒の地 + prisoners.black（対局中に取った白石）+ 白の死石数
//   whiteTotal = 白の地 + prisoners.white（対局中に取った黒石）+ 黒の死石数 + komi
//   winner     = blackTotal > whiteTotal ? "black" : "white"
// ※ scoringGrid は markedDead を除去済みの盤面。
//   死石除去後の空点は identifyTerritory で自動的に相手の地に加算される。
// ※ komi = 6.5 のため引き分けは発生しない。
function calcFinalScore(
  grid: Grid,
  prisoners: Prisoners,
  markedDead: Set<string>,
  komi: number
): FinalScore;
```

### ユーティリティ

```typescript
function cloneGrid(grid: Grid): Grid;
function gridsEqual(a: Grid, b: Grid): boolean;
function pointKey(p: Point): string; // "${row},${col}"
function opponent(color: StoneColor): StoneColor;
function getNeighbors(p: Point): Point[]; // BOARD_SIZE で盤外を除く
```

---

## [3] useGoGame フック（公開）

```typescript
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

export function useGoGame(): UseGoGameReturn;
```

### フェーズ遷移

```
playing
  ├─ placeStone()     → playing（手番交代、passCount リセット）
  ├─ pass()           → playing（passCount +1）
  └─ pass() × 2      → scoring（両者連続パスで終局）

scoring
  ├─ toggleDeadStone() → scoring（死石マーキングのトグル）
  └─ confirmScore()    → finished（スコア確定）

finished
  └─ resetGame()      → playing（初期状態）
```

---

## コンポーネント設計

### `igo.tsx`（ルート）

`useGoGame` を呼び出してすべての状態を保持し、子コンポーネントへ props を渡す。

```typescript
const Igo = () => {
  const { state, finalScore, placeStone, pass, toggleDeadStone, confirmScore, resetGame, isLegal } =
    useGoGame();
  // phase に応じて onPointClick を切り替える
  const handlePointClick = (point: Point) => {
    if (state.gamePhase === "playing") placeStone(point);
    if (state.gamePhase === "scoring") toggleDeadStone(point);
  };
  // ...
};
```

### `Board.tsx`

盤面の描画専任。盤線・星・石・マーカーを内部で配置する。

```typescript
interface BoardProps {
  grid: Grid;
  markedDead: Set<string>;
  lastMove: Point | null;
  onPointClick: (point: Point) => void;
  phase: GamePhase;
}
```

- `playing`: クリックで着手
- `scoring`: クリックで死石トグル（死石は半透明＋×印）
- `finished`: クリック無効

### `Stone.tsx`

```typescript
interface StoneProps {
  color: StoneColor;
  row: number;
  col: number;
  dimmed?: boolean; // 死石マーキング時に半透明
}
```

### `Marker.tsx`

```typescript
interface MarkerProps {
  type: "lastMove" | "deadStone";
  row: number;
  col: number;
}
```

### `GameControls.tsx`

```typescript
interface GameControlsProps {
  phase: GamePhase;
  currentTurn: StoneColor;
  onPass: () => void;
  onConfirmScore: () => void;
  onReset: () => void;
}
```

| フェーズ | 表示                                  |
| -------- | ------------------------------------- |
| playing  | パスボタン + リセットボタン           |
| scoring  | 「スコア確定」ボタン + リセットボタン |
| finished | リセットボタンのみ                    |

### `ScoreBoard.tsx`

```typescript
interface ScoreBoardProps {
  prisoners: Prisoners;
  komi: number;
  phase: GamePhase;
  finalScore: FinalScore | null;
}
```

- `playing/scoring`: アゲハマ数・コミを表示
- `finished`: `FinalScore` の内訳と勝者を表示

### `GameResult.tsx`

終局時に結果を表示するオーバーレイ（`finished` フェーズのみ表示）。

```typescript
interface GameResultProps {
  finalScore: FinalScore;
  onReset: () => void;
}
```

---

## データフロー

```
useGoGame（状態 + エンジン関数）
    │
    ▼
Igo.tsx（ルート・props を配布）
    ├─ Board          ← grid, markedDead, phase, onPointClick
    │   ├─ Stone      ← color, row, col, dimmed
    │   └─ Marker     ← type, row, col
    ├─ GameControls   ← phase, currentTurn, onPass, onConfirmScore, onReset
    └─ ScoreBoard     ← prisoners, komi, phase, finalScore
         └─ GameResult（finished フェーズのみ）
```

---

## 着手処理の詳細フロー

```
placeStone(point)
  ├─ gamePhase !== "playing" → return
  ├─ isLegalMove(...) === false → スナックバーで禁手表示
  └─ true
      ├─ applyMove(grid, point, currentTurn) → { nextGrid, captured }
      ├─ prisoners[opponent] += captured
      ├─ previousGrid = grid
      ├─ grid = nextGrid
      ├─ passCount = 0
      └─ currentTurn を交代

pass()
  ├─ gamePhase !== "playing" → return
  ├─ passCount + 1 < 2 → passCount++、currentTurn を交代
  └─ passCount + 1 >= 2 → gamePhase = "scoring"
```

---

## スコアリングフェーズの詳細フロー

```
confirmScore()
  ├─ markedDead の石を除去した scoringGrid を作成
  ├─ calcFinalScore(scoringGrid, prisoners, markedDead, komi)
  ├─ finalScore を保存
  └─ gamePhase = "finished"
```

---

## 実装順序

| ステップ | 内容                                                          |
| -------- | ------------------------------------------------------------- |
| 1        | `hooks/useGoGame.ts` を作成（型定義 → エンジン関数 → フック） |
| 2        | `Board.tsx` を刷新（盤線・星・ラベルを Board 内部に移動）     |
| 3        | `GameControls.tsx`, `ScoreBoard.tsx` を実装                   |
| 4        | `igo.tsx` を刷新（useGoGame + 新コンポーネントに切り替え）    |
| 5        | `GameResult.tsx` を実装                                       |
