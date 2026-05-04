# 囲碁 CPU AI 改善ロードマップ

## 現状の問題点

`hooks/useGoGame.ts` の `computeCpuMove` / `scoreMove` は **1手先のみを見るgreedy heuristic**。

```
現在の評価軸:
  取れる石数 × 15
  アタリ脱出 × 8
  連を伸ばす × 2
  相手をアタリにする × 5
  中央寄り補正 +0〜4
```

- 先読みゼロ・地の評価なし・死活判断なし・定石知識なし

---

## ロードマップ

```
Step 1: MCTS + RAVE              → 3〜5段相当
Step 2: 事前学習済みNN + MCTS   → 5〜7段相当
```

どちらも **Next.js + Vercel 構成で完結**（ブラウザで実行するため Vercel のサーバーリソースに依存しない）。

---

## Step 1: MCTS + RAVE

### MCTSとは

毎回の着手決定時に、現在の盤面から何千回もシミュレートして「この手は何%勝てたか」を統計として集め、最も勝率が高い手を選ぶ探索アルゴリズム。学習ではなくゲームのたびにゼロから探索する。

```
1サイクル（シミュレーション）:

  [Selection]    UCT式に従って木を降りる
  [Expansion]    未訪問の子ノードを追加
  [Rollout]      そこからゲーム終局までランダムに着手
  [Backprop]     勝敗を辿ってきた全ノードに伝播

→ N回繰り返して最多訪問ノードの手を採用
```

### UCT式（ノード選択）

```
UCT(v') = W(v') / N(v') + C × √(ln N(v) / N(v'))

W(v') : 子ノードの累計勝利数
N(v') : 子ノードの訪問回数
N(v)  : 親ノードの訪問回数
C     : 探索係数（√2 ≈ 1.41）
```

### RAVEとは（MCTSの強化拡張）

純粋MCTSの弱点は「ある手を盤面の別の場所で打った経験が共有されない」こと。

RAVEはその経験を共有する。ある手 `m` をロールアウト中に打った結果（どこで打っても）を、選択フェーズの評価に使い回す。

```
RAVE-UCT スコア:

  score = (1 - β) × UCT(v') + β × AMAF(m)

  AMAF(m) : ロールアウト全体でその手が打たれたときの勝率
  β       : UCTとAMAFのブレンド係数（探索が進むにつれ0に近づく）

  β の典型的な計算式:
    β = √(k / (3N(v') + k))  ← k は定数（例: 500）
```

囲碁では「どの場所でもアタリを取る手は強い」のような共通パターンがあるため、RAVEが特に有効に機能する。

### 実装スケッチ（TypeScript）

```typescript
interface MctsNode {
  point: Point | null; // null = パス
  color: StoneColor;
  grid: Grid;
  previousGrid: Grid | null;
  wins: number;
  visits: number;
  amafWins: Map<string, number>; // RAVE: 手ごとの勝利数
  amafVisits: Map<string, number>; // RAVE: 手ごとの試行数
  children: MctsNode[];
  untriedMoves: (Point | null)[];
  parent: MctsNode | null;
}

const C = Math.SQRT2;
const RAVE_K = 500;

function raveScore(node: MctsNode, move: string, parentVisits: number): number {
  const w = node.wins;
  const n = node.visits;
  const aw = node.parent?.amafWins.get(move) ?? 0;
  const an = node.parent?.amafVisits.get(move) ?? 0;

  const uct = n === 0 ? Infinity : w / n + C * Math.sqrt(Math.log(parentVisits) / n);
  const amaf = an === 0 ? 0 : aw / an;
  const beta = Math.sqrt(RAVE_K / (3 * n + RAVE_K));

  return (1 - beta) * uct + beta * amaf;
}

function rollout(node: MctsNode, cpuColor: StoneColor): { winner: StoneColor; played: string[] } {
  let grid = node.grid;
  let prev = node.previousGrid;
  let color = opponent(node.color);
  const played: string[] = [];
  let passes = 0;

  for (let step = 0; step < BOARD_SIZE * BOARD_SIZE * 3; step++) {
    const move = heuristicPlayoutMove(grid, color, prev);
    if (!move) {
      if (++passes >= 2) break;
      color = opponent(color);
      continue;
    }
    passes = 0;
    played.push(`${color}:${move.row},${move.col}`);
    const { nextGrid } = applyMove(grid, move, color);
    prev = grid;
    grid = nextGrid;
    color = opponent(color);
  }

  return { winner: evaluateWinner(grid), played };
}

function backpropagate(node: MctsNode | null, winner: StoneColor, played: string[]) {
  while (node !== null) {
    node.visits++;
    if (node.color === winner) node.wins++;

    // RAVE: ロールアウト中に打たれた手の統計を更新
    for (const entry of played) {
      const [c, pos] = entry.split(":");
      if (c === node.color) {
        node.amafWins.set(pos, (node.amafWins.get(pos) ?? 0) + (node.color === winner ? 1 : 0));
        node.amafVisits.set(pos, (node.amafVisits.get(pos) ?? 0) + 1);
      }
    }

    node = node.parent;
  }
}
```

### プレイアウト（ヒューリスティック付き）

完全ランダムより優先順位をつけるだけで強さが上がる:

```typescript
function heuristicPlayoutMove(grid: Grid, color: StoneColor, prev: Grid | null): Point | null {
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
```

### Web Worker への分離

3000イテレーションをメインスレッドで動かすとUIがフリーズする。Next.js 14では以下の書き方でWorkerをバンドルできる:

```typescript
// hooks/useGoGame.ts
const workerRef = useRef<Worker | null>(null);

useEffect(() => {
  workerRef.current = new Worker(new URL("../go/worker.ts", import.meta.url));
  workerRef.current.onmessage = (e) => {
    const move: Point | null = e.data;
    // CPU の着手を盤面に反映
  };
  return () => workerRef.current?.terminate();
}, []);
```

```typescript
// hooks/go/worker.ts
self.onmessage = (e: MessageEvent) => {
  const { grid, color, previousGrid } = e.data;
  const move = mcts(grid, color, previousGrid, 3000);
  self.postMessage(move);
};
```

### Step 1 のパラメータ目安

| 項目          | 推奨値             |
| ------------- | ------------------ |
| iterations    | 2000〜5000         |
| C（探索係数） | √2（調整は実戦で） |
| RAVE_K        | 500                |
| rollout上限   | `BOARD_SIZE² × 3`  |

---

## Step 2: 事前学習済みNN + MCTS

### 仕組み

MCTSのロールアウトを「ランダム＋ヒューリスティック」から「NNの予測」に置き換える。

```
盤面の状態
    ↓
ポリシーネットワーク（事前学習済み）
    ↓
各手の確率分布（例: 天元 18%, 小目 12%, ...）
    ↓
MCTSがその確率に従って探索を絞る
    → ランダム探索より圧倒的に効率よく強い手を見つける
```

NNは**学習しない**。オフラインで学習した重みファイルをブラウザにロードして推論だけを行う。

### TensorFlow.js でブラウザ推論

```bash
npm install @tensorflow/tfjs
```

```typescript
import * as tf from "@tensorflow/tfjs";

// publicディレクトリに重みファイルを配置
const model = await tf.loadGraphModel("/models/go-policy/model.json");

function getPolicyDistribution(grid: Grid, color: StoneColor): Float32Array {
  const input = tf.tensor4d([boardToFeatures(grid, color)]); // [1, 9, 9, channels]
  const output = model.predict(input) as tf.Tensor;
  const probs = output.dataSync() as Float32Array; // 長さ82（81交点 + パス）
  input.dispose();
  output.dispose();
  return probs;
}
```

MCTSのExpansionフェーズでこの確率を使ってノード初期化すれば、UCT選択が最初から賢くなる:

```typescript
function expand(node: MctsNode, policy: Float32Array): MctsNode {
  // ...
  // 子ノードの初期wins/visitsをNNのpriorで初期化（PUCT）
  child.wins = policy[moveIndex] * VIRTUAL_LOSS;
  child.visits = VIRTUAL_LOSS;
  // ...
}
```

### モデルの選択肢

| 選択肢                         | 強さ目安 | 入手方法                                             |
| ------------------------------ | -------- | ---------------------------------------------------- |
| web-katrain の軽量KataGoモデル | 5〜7段   | GitHub (Sir-Teo/web-katrain) からTF.js変換済みを取得 |
| 既存の小型Goポリシーネット     | 2〜4段   | オープンソースのTF.js対応モデルを探す                |
| 自前学習                       | 自由     | GPU + 棋譜データが必要（このPJの範囲外）             |

### 懸念点と対策

| 懸念                             | 対策                                                                        |
| -------------------------------- | --------------------------------------------------------------------------- |
| 重みファイルが大きい（10〜50MB） | Vercelの `public/` に置いてCDNキャッシュ / 初回ロード中はStep 1のMCTSで代替 |
| 推論が遅い                       | WebGPUバックエンドを使う（Chrome対応済み、Safariは限定的）                  |
| モデル変換が必要                 | web-katrain がTF.js形式の変換済みモデルを公開している                       |

---

## ファイル構成

```
hooks/
  useGoGame.ts          # Reactフック（Worker呼び出しに変更）
  go/
    engine.ts           # 盤面操作の純粋関数（useGoGame.tsから切り出し）
    mcts.ts             # MCTS + RAVE
    heuristics.ts       # プレイアウト用ヒューリスティック
    policy.ts           # NN推論ラッパー（Step 2）
    worker.ts           # Web Workerエントリーポイント

public/
  models/
    go-policy/
      model.json        # TF.js モデル定義
      weights.bin       # 重みファイル（Step 2）
```

---

## 参考リンク

- [Monte Carlo Tree Search (Jeff Bradberry)](https://jeffbradberry.com/posts/2015/09/intro-to-monte-carlo-tree-search/)
- [RAVE / AMAF の解説 (Sensei's Library)](https://senseis.xmp.net/?RAVE)
- [web-katrain（TF.js + WebGPU でKataGoを動かす実装例）](https://github.com/Sir-Teo/web-katrain)
- [TensorFlow.js ドキュメント](https://www.tensorflow.org/js)
- [KataGo GitHub](https://github.com/lightvector/KataGo)
