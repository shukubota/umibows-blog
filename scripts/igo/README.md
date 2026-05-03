# 囲碁ポリシーネット 学習手順

## 前提

- Mac (Apple Silicon 推奨) でそのまま実行できる。Docker 不要。
- anyenv + pyenv でセットアップ済み（以下は初回のみ）

```bash
# pyenv のインストール（anyenv-install 定義が無い場合は先に clone）
git clone https://github.com/anyenv/anyenv-install ~/.config/anyenv/anyenv-install
anyenv install pyenv
exec $SHELL -l

# Python 3.11 をインストール
pyenv install 3.11.9

# プロジェクトルートで Python バージョンを固定
cd /path/to/umibows-blog
pyenv local 3.11.9

# 依存パッケージをインストール
pip install -r scripts/igo/requirements.txt
```

PyTorch は Apple Silicon の MPS バックエンドを自動検出して使用する。

---

## 1. KGS 棋譜ダウンロード

`scripts/igo/download_kgs_9x9.py` を使って自動ダウンロード・フィルタリングを行う。

```bash
python3 scripts/igo/download_kgs_9x9.py \
  --output ~/kgs-sgf/ \
  --months 24 \
  --workers 12
```

| オプション | 説明 | デフォルト |
|---|---|---|
| `--output` | 保存先ディレクトリ | `~/kgs-sgf/` |
| `--months` | 何ヶ月分遡って取得するか | 24 |
| `--workers` | 並列ダウンロード数 | 8 |

**仕組み**: `gokgs.com/servlet/archives/` からユーザー別月次 zip を取得し、  
`SZ[9]` を含む 9x9 棋譜だけを抽出して保存する。  
対象ユーザーはスクリプト内の `USERS` リストで管理。

> **注意**: KGS では強いプレイヤー（5d+）が 9x9 を打つことは稀。  
> 中上級者（1k〜3d 相当）の棋譜が中心となるが、学習には十分。  
> SGF ファイルがサブディレクトリにあっても再帰的に読み込む。

---

## 2. 学習

```bash
cd /path/to/umibows-blog

python3 scripts/igo/train_go_policy.py \
  --data ~/kgs-sgf/ \
  --epochs 10 \
  --max-games 30000 \
  --output public/models/go-policy.onnx
```

> **注意**: macOS のシステム Python（3.12+）は PEP 668 によりパッケージインストールが制限される。  
> `python3` が pyenv の 3.11.9 を指していない場合は  
> `~/.pyenv/versions/3.11.9/bin/python3` で直接実行する。

| オプション | 説明 | デフォルト |
|---|---|---|
| `--data` | SGF ファイルのルートディレクトリ | 必須 |
| `--epochs` | 学習エポック数 | 10 |
| `--max-games` | 読み込む最大局数 | 50000 |
| `--output` | ONNX 出力先 | `public/models/go-policy.onnx` |

**目安の所要時間（M1/M2 Mac）:** 3 万局 × 10 エポックで 20〜40 分程度。  
KGS から収集できる 9x9 棋譜は数百局規模が現実的。その場合でも数分で学習が完了し、1〜2 MB の ONNX モデルが出力される。

---

## 3. 出力の確認

```bash
ls -lh public/models/go-policy.onnx
# 期待値: 1〜2 MB
```

---

## 4. Vercel へのデプロイ

`public/models/go-policy.onnx` は `public/` 以下に置くことで Vercel のビルドに自動的に含まれる。  
Server Action（`app/igo/actions.ts`）が `process.cwd() + '/public/models/go-policy.onnx'` を直接読み込む。  
`/tmp` へのキャッシュは不要。モデルがインスタンスのファイルシステムに常駐しているため、ウォームアップ後は数十 ms で推論できる。

---

---

## 5. 自己対戦学習（AlphaZero方式）

`scripts/igo/self_play.py` が AlphaZero スタイルの自己対戦パイプラインを提供する。  
KGS 棋譜不要。M1 Mac のみで完結する。

### アーキテクチャの変更点

`GoNet`（policy + value head）を新たに導入。

- **policy head**: 合法手の事前確率 [81]
- **value head**: 現局面での勝率予測 ∈ [-1, 1]（tanh）

ONNX モデルは `"policy"` と `"value"` の 2 出力になる。  
`actions.ts` は `"policy"` のみ読むので後方互換性あり。

### 実行方法

```bash
# フレッシュスタート（M1 Mac で約 2〜4 時間 / 20 イテレーション）
python scripts/igo/self_play.py

# 速度優先（動作確認用）
python scripts/igo/self_play.py --iterations 2 --games 5 --sims 50

# 品質優先（強さ重視、時間がかかる）
python scripts/igo/self_play.py --iterations 30 --games 50 --sims 400

# 再開
python scripts/igo/self_play.py --checkpoint scripts/igo/checkpoints/iter_010.pt
```

| オプション | 説明 | デフォルト |
|---|---|---|
| `--iterations` | 自己対戦→学習のループ回数 | 20 |
| `--games` | 1 イテレーション当たりの対局数 | 25 |
| `--sims` | 1 手当たりの MCTS シミュレーション数 | 200 |
| `--buffer-size` | リプレイバッファ容量（局面数） | 100000 |
| `--checkpoint` | 再開するチェックポイント `.pt` | なし |
| `--output` | ONNX 出力先 | `public/models/go-policy.onnx` |

### M1 Mac での目安

| sims/手 | 1対局 | 25対局 | 学習 | 1イテレーション |
|---|---|---|---|---|
| 50  | ~10s | ~4min  | ~1min | ~5min |
| 200 | ~40s | ~17min | ~2min | ~20min |
| 400 | ~80s | ~33min | ~2min | ~35min |

チェックポイントは `scripts/igo/checkpoints/iter_NNN.pt` に保存される。  
`--checkpoint` で途中から再開できる。

### アルゴリズム概要

```
各イテレーション:
  1. 自己対戦  : PUCT-MCTS（NNで事前確率、value head で局面評価）
                → (局面, MCTSポリシー分布π, 勝敗z) を収集
                → 8 方向対称性でデータ拡張（8×）
  2. 学習      : policy loss（クロスエントロピー）+ value loss（MSE）
  3. ONNX 出力 : public/models/go-policy.onnx を上書き更新
```

---

## 6. モデルが無い場合の動作

`public/models/go-policy.onnx` が存在しない場合、CPU は自動的に MCTS（Web Worker）にフォールバックする。  
開発中はモデルなしでも動作確認できる。
