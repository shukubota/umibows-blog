# 囲碁 CPU AI — ニューラルネット方式 実装方針

## なぜNN方式か

|            | MCTS（ランダムロールアウト）        | NN方式                          |
| ---------- | ----------------------------------- | ------------------------------- |
| 速度       | 1〜5秒/手                           | 数十〜数百ms/手                 |
| 強さの上限 | 10kyu程度（ロールアウトの質に依存） | モデル次第で段位クラス          |
| 理解       | 地の概念・死活を理解しない          | 事前学習で戦略を内包            |
| 学習       | しない（毎回ゼロから探索）          | オフラインで学習済み → 推論のみ |

---

## アーキテクチャ概要

```
ブラウザ（React）
    ↓ Server Action 呼び出し（盤面状態を送信）
Next.js Server Action（Node.js）
    ↓ onnxruntime-node でネイティブ推論
    ↓ policy output（82次元 = 81交点 + パス）
    ↓ 合法手フィルタ + argmax
    ↑ Point | null を返す
ブラウザ
    ↓ 盤面に着手を反映
```

ロールアウトなし。推論1回で着手を決める **Pure Policy Network** 構成。  
すでに `app/tex/actions.ts` でAnthropicのAPIを叩いているのと同じ構造で実装できる。

---

## 技術スタック

### ランタイム: `onnxruntime-node`

```bash
npm install onnxruntime-node
```

| 選択肢                          | 判断                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| **onnxruntime-node** ✅         | Node.jsネイティブ実行。ブラウザWASMより高速。Server Actionで動く        |
| onnxruntime-web（ブラウザWASM） | 遅い・Web Worker実装が複雑・30〜100MBをブラウザに配信する必要あり。却下 |
| TensorFlow.js                   | KataGo変換モデルが古く未メンテ。却下                                    |
| KataGo バイナリ直接実行         | Vercelでは subprocess 不可。却下                                        |

### モデル形式: ONNX

KataGoのONNX変換済みモデルが Hugging Face で公開されている（`kaya-go/kaya`）。  
`onnxruntime-node` はONNXをそのまま読み込める。

---

## モデル調達の選択肢

### Option A: 既存KataGoモデル（推奨）

- **入手先**: `kaya-go/kaya`（Hugging Face）または `katago-onnx` で変換
- **強さ**: 数段〜プロ級（モデルサイズ次第）
- **サイズ**: 最小クラスで30〜100MB
- **入力特徴量**: 9×9×N チャンネル（KataGo標準）
- **ホスティング**: Hugging Face から実行時にダウンロード → `/tmp` にキャッシュ

### Option B: 自前の小型ポリシーネット（長期・強さを調整したい場合）

- **流れ**: PyTorchで学習 → ONNXエクスポート → Server Actionで推論
- **モデルサイズ**: 1〜5MB（`public/` に直接配置できる）
- **強さ**: 5〜15kyu程度（KGS棋譜データで学習した場合）
- **難しさ**: 学習インフラ（Python/GPU環境）が別途必要

---

## 入力特徴量の設計

KataGo標準の主要プレーン（最小構成）:

| プレーン | 内容                                       |
| -------- | ------------------------------------------ |
| 0        | 自分の石がある交点（1/0）                  |
| 1        | 相手の石がある交点（1/0）                  |
| 2        | コウが発生している交点                     |
| 3〜7     | 自分の連のダメ数（1〜5以上を各プレーンに） |
| 8〜12    | 相手の連のダメ数                           |
| 13       | 手番（全1=黒番 / 全0=白番）                |

実装時は `katago-onnx` のPythonコードを参考にTypeScriptへ移植する。  
モデルの実際の入力仕様は Netron で確認すること。

---

## 実装コード骨格

### Server Action

```typescript
// app/igo/actions.ts
"use server";

import * as ort from "onnxruntime-node";
import { Grid, Point, StoneColor, getAllLegalMoves } from "@/hooks/go/engine";
import { boardToTensor } from "@/hooks/go/board-features";

// モジュールスコープでキャッシュ（Vercel インスタンスが温かい間は再利用）
let session: ort.InferenceSession | null = null;

async function getSession(): Promise<ort.InferenceSession> {
  if (session) return session;

  // Hugging Face から初回ダウンロード → /tmp にキャッシュ
  const modelPath = "/tmp/go-policy.onnx";
  const fs = await import("fs");

  if (!fs.existsSync(modelPath)) {
    const res = await fetch("https://huggingface.co/kaya-go/kaya/resolve/main/go-policy.onnx");
    const buf = await res.arrayBuffer();
    fs.writeFileSync(modelPath, Buffer.from(buf));
  }

  session = await ort.InferenceSession.create(modelPath);
  return session;
}

export async function computeCpuMoveNN(
  grid: Grid,
  color: StoneColor,
  previousGrid: Grid | null
): Promise<Point | null> {
  const sess = await getSession();
  const legalMoves = getAllLegalMoves(grid, color, previousGrid);
  if (legalMoves.length === 0) return null;

  const inputTensor = boardToTensor(grid, color);
  const output = await sess.run({ input: inputTensor });
  const policy = output["policy"].data as Float32Array; // 82要素

  // 合法手の中で最大確率の手を返す
  let bestMove: Point | null = null;
  let bestProb = -Infinity;
  for (const move of legalMoves) {
    const prob = policy[move.row * 9 + move.col];
    if (prob > bestProb) {
      bestProb = prob;
      bestMove = move;
    }
  }
  return bestMove;
}
```

### 特徴量生成

```typescript
// hooks/go/board-features.ts
import * as ort from "onnxruntime-node";
import {
  Grid,
  StoneColor,
  Point,
  getNeighbors,
  findGroup,
  countLiberties,
  opponent,
} from "./engine";

const BOARD_SIZE = 9;
const NUM_PLANES = 14;

export function boardToTensor(grid: Grid, color: StoneColor): ort.Tensor {
  const data = new Float32Array(1 * NUM_PLANES * BOARD_SIZE * BOARD_SIZE);
  const opp = opponent(color);

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const i = r * BOARD_SIZE + c;
      const base = BOARD_SIZE * BOARD_SIZE;

      // Plane 0: 自石
      data[0 * base + i] = grid[r][c] === color ? 1 : 0;
      // Plane 1: 相手石
      data[1 * base + i] = grid[r][c] === opp ? 1 : 0;
      // Plane 2: 空点
      data[2 * base + i] = grid[r][c] === "empty" ? 1 : 0;
      // Plane 3: 手番（CPUが白なら全1、黒なら全0）
      data[3 * base + i] = color === "white" ? 1 : 0;

      // Plane 4〜8: 自連のダメ数（1〜5以上）
      if (grid[r][c] === color) {
        const libs = Math.min(countLiberties(grid, findGroup(grid, { row: r, col: c })), 5);
        data[(3 + libs) * base + i] = 1;
      }
      // Plane 9〜13: 相手連のダメ数（1〜5以上）
      if (grid[r][c] === opp) {
        const libs = Math.min(countLiberties(grid, findGroup(grid, { row: r, col: c })), 5);
        data[(8 + libs) * base + i] = 1;
      }
    }
  }

  return new ort.Tensor("float32", data, [1, NUM_PLANES, BOARD_SIZE, BOARD_SIZE]);
}
```

### useGoGame.ts の変更点

MCTSのWeb Workerを廃止し、Server Actionを呼ぶように変更する。

```typescript
// hooks/useGoGame.ts（CPU手番ロジック部分のみ抜粋）
import { computeCpuMoveNN } from "@/app/igo/actions";

// useEffect の CPU 処理
useEffect(() => {
  if (state.gamePhase !== "playing" || state.currentTurn !== CPU_COLOR) return;
  if (cpuScheduledRef.current) return;
  cpuScheduledRef.current = true;

  setState((prev) => ({ ...prev, isCpuThinking: true }));

  computeCpuMoveNN(state.grid, CPU_COLOR, state.previousGrid)
    .then((cpuMove) => {
      cpuScheduledRef.current = false;
      setState((prev) => {
        if (prev.gamePhase !== "playing" || prev.currentTurn !== CPU_COLOR) return prev;
        if (!cpuMove) {
          // パス処理（既存ロジックと同じ）
          const newPassCount = prev.passCount + 1;
          if (newPassCount >= 2)
            return {
              ...prev,
              passCount: newPassCount,
              gamePhase: "scoring",
              currentTurn: PLAYER_COLOR,
              isCpuThinking: false,
            };
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
}, [state.gamePhase, state.currentTurn]);
```

---

## ファイル構成

```
app/
  igo/
    actions.ts          # NEW: Server Action（onnxruntime-node で推論）
    page.tsx            # 既存
    igo.tsx             # 既存

hooks/
  go/
    engine.ts           # 既存: 盤面操作純粋関数
    board-features.ts   # NEW: 入力特徴量生成（server/client 共用）
    heuristics.ts       # 既存（MCTSフォールバック用に残す）
    mcts.ts             # 既存（フォールバック用に残す）
    worker.ts           # 既存（フォールバック用に残す）
  useGoGame.ts          # 変更: Worker → Server Action 呼び出しに切り替え
```

---

## Vercel での動作

| 項目             | 詳細                                                                |
| ---------------- | ------------------------------------------------------------------- |
| モデルキャッシュ | `/tmp`（512MB）に初回ダウンロード後キャッシュ                       |
| コールドスタート | 初回 or インスタンス再起動後のみ遅延（30〜100MBのDL）               |
| 実行時間上限     | Hobby: 10秒 / Pro: 60秒（初回DL込みで Pro 推奨）                    |
| バンドルサイズ   | `onnxruntime-node` 自体は小さい。モデルは `/tmp` に置くので問題なし |
| ブラウザへの配信 | モデルファイルを送らないのでページロードは速い                      |

### コールドスタート対策

```typescript
// app/igo/actions.ts に追加
// ページ読み込み時に事前にモデルをウォームアップ
export async function warmupModel(): Promise<void> {
  await getSession();
}
```

```typescript
// app/igo/igo.tsx に追加
useEffect(() => {
  warmupModel(); // バックグラウンドでセッション初期化
}, []);
```

---

## 実装ステップ

### Step 1: モデル調達・入出力確認（最重要）

- [ ] `kaya-go/kaya`（Hugging Face）から最小モデルをダウンロード
- [ ] [Netron](https://netron.app) でモデルの入出力テンソル形式を確認
  - 入力名・形状（例: `[1, N, 9, 9]`）
  - 出力名・形状（例: `policy: [1, 82]`, `value: [1, 1]`）
- [ ] Node.jsスクリプトで `onnxruntime-node` を使って推論できることを確認

### Step 2: 特徴量生成の実装

- [ ] `hooks/go/board-features.ts` を実装
- [ ] Netronで確認した入力形状に合わせてプレーン数を調整
- [ ] `katago-onnx` のPythonコードを参考に特徴量を合わせる

### Step 3: Server Action の実装

- [ ] `app/igo/actions.ts` に `computeCpuMoveNN` を実装
- [ ] `npm install onnxruntime-node`
- [ ] ローカルでモデルを `/tmp` に手動配置してテスト

### Step 4: useGoGame.ts の切り替え

- [ ] Web WorkerロジックをServer Action呼び出しに置き換え
- [ ] ウォームアップ処理を追加
- [ ] エラー時のフォールバック（MCTSに戻す or パスする）を実装

### Step 5: デプロイ確認

- [ ] Vercel にデプロイ
- [ ] 初回レスポンス時間計測（Hugging Face DL 込み）
- [ ] ウォームアップ後のレスポンス時間計測（目標: 500ms以内）

---

## リスクと対策

| リスク                                                  | 対策                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Vercel Hobby プランで初回タイムアウト                   | Pro プランへ移行 or モデルを小さくする                                               |
| KataGoの入力特徴量実装が難しい                          | Netron でモデルの入力を確認してから実装。まず3プレーン（自石/相手石/空点）だけで試す |
| Hugging Face からのDLが遅い                             | モデルを小さくする or Vercel Blob Storage に移行                                     |
| モデルの強さが期待以下                                  | より大きいモデルに差し替え（コードは変えない）                                       |
| `onnxruntime-node` の native binding がVercelで動かない | `onnxruntime-web` の Node.js モード（WASM）にフォールバック                          |

---

## 参考リンク

- [onnxruntime-node（npm）](https://www.npmjs.com/package/onnxruntime-node)
- [kaya-go/kaya — KataGo ONNX モデル（Hugging Face）](https://huggingface.co/kaya-go/kaya)
- [katago-onnx — KataGo → ONNX 変換ツール](https://github.com/kaya-go/katago-onnx)
- [Netron — ONNXモデルの可視化ツール](https://netron.app)
- [ONNX Runtime Node.js ドキュメント](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)
