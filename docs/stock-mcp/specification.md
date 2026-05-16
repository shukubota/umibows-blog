# Stock MCP Server 仕様書

## 概要

`app/stock-dashboard` で使っている `yahoo-finance2` ベースの株価取得ロジックを **MCP (Model Context Protocol) サーバ** として独立させ、Claude Code / Claude Desktop から自然言語で米国株データを参照できるようにする。

対象は **米国株中心**（S&P500 銘柄・主要 ETF・指数）。Yahoo Finance のシンボル体系を踏襲するため、必要なら日本株 (`9204.T` など) もそのまま渡せば動くが、本仕様の中心はあくまで米国株。

## 目的・ユースケース

Claude にチャットしながら以下のような操作が完結する状態を目指す：

- 「NVDA の現在値と RSI 教えて」
- 「半導体セクター ETF の今日の騰落率まとめて」
- 「ウォッチリスト全銘柄を 200日MA との位置関係でソートして」
- 「来週決算ある米国大型株ある？」
- 「S&P500 が 200日MA 割ってる？市況モードは？」

ダッシュボード UI を開かずに、対話のなかで判断材料を取得することがゴール。

## 非目的

- 売買発注（証券会社 API 連携はしない）
- リアルタイム ストリーミング（Yahoo Finance は最大15分遅延データ。それで十分）
- ポートフォリオ管理 / 損益計算
- ニュース取得（必要なら別 MCP に分離）

## 全体構成

```
┌────────────────────┐     stdio (JSON-RPC)     ┌─────────────────────┐
│ Claude Code /      │ ◄──────────────────────► │  stock-mcp server   │
│ Claude Desktop     │                          │  (Node.js / TS)     │
└────────────────────┘                          └──────────┬──────────┘
                                                           │
                                                           ▼
                                                ┌─────────────────────┐
                                                │  yahoo-finance2     │
                                                │  (npm パッケージ)    │
                                                └─────────────────────┘
```

- **トランスポート**: stdio（Claude Code / Claude Desktop の標準）。SSE / HTTP は当面不要。
- **言語**: TypeScript (Node.js 20+)
- **SDK**: `@modelcontextprotocol/sdk`
- **データソース**: `yahoo-finance2`（既存依存をそのまま流用）
- **配置**: monorepo 内に独立パッケージとして `mcp-servers/stock-mcp/` を新設

## ディレクトリ構成

```
mcp-servers/
└── stock-mcp/
    ├── package.json           # 独立した package.json（@umibows/stock-mcp）
    ├── tsconfig.json
    ├── README.md              # 起動方法・Claude 設定例
    └── src/
        ├── index.ts           # エントリーポイント（MCP サーバ起動）
        ├── server.ts          # ツール登録・ディスパッチ
        ├── tools/
        │   ├── quote.ts
        │   ├── historical.ts
        │   ├── indicators.ts
        │   ├── market.ts
        │   ├── sectors.ts
        │   ├── earnings.ts
        │   ├── condition.ts
        │   └── search.ts
        ├── lib/
        │   ├── client.ts      # yahoo-finance2 ラッパ（リトライ・キャッシュ）
        │   ├── indicators.ts  # SMA / RSI 計算（app/stock-dashboard から移植）
        │   ├── condition.ts   # シグナル判定（同上）
        │   └── cache.ts       # 短時間メモリキャッシュ（30秒〜5分）
        └── types.ts
```

既存の `app/stock-dashboard/lib/{indicators,condition}.ts` のロジックは MCP 側に移植する（重複を許容してもいいが、共通化したい場合は `packages/stock-core/` を切る案もある — 後述）。

## 提供するツール

すべて MCP の "tool" として公開。LLM が引数を組み立てて呼ぶ。
Zod (もしくは MCP SDK が要求するスキーマ) で入力検証する。

### 1. `get_quote`

単一銘柄のリアルタイム見積もり。

| 入力 | 型 | 必須 | 説明 |
|------|----|------|------|
| `symbol` | string | ✓ | ティッカー (例: `AAPL`, `NVDA`, `^VIX`, `USDJPY=X`) |

出力:
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "price": 189.45,
  "change": 1.23,
  "changePercent": 0.65,
  "volume": 52341000,
  "marketCap": 2950000000000,
  "currency": "USD",
  "marketState": "REGULAR"
}
```

### 2. `get_quotes`

複数銘柄を一括取得（並列実行）。10〜20銘柄まで。

| 入力 | 型 | 必須 | 説明 |
|------|----|------|------|
| `symbols` | string[] | ✓ | ティッカー配列 (max 20) |

出力: `get_quote` の結果配列。取得失敗銘柄は `error` フィールド付きで返す。

### 3. `get_historical`

ヒストリカル株価（日足）。

| 入力 | 型 | 必須 | 説明 |
|------|----|------|------|
| `symbol` | string | ✓ | ティッカー |
| `days` | number | – | 過去日数 (default: 250, max: 3650) |
| `interval` | enum | – | `1d` / `1wk` / `1mo` (default: `1d`) |

出力:
```json
{
  "symbol": "NVDA",
  "interval": "1d",
  "candles": [
    { "date": "2025-12-01", "open": 470.1, "high": 482.5, "low": 468.0, "close": 480.2, "volume": 32100000 }
  ]
}
```

LLM の context を浪費しないよう、`days > 60` のときは "サンプリングして要約" するか、または `summary_only: true` オプションで OHLC 配列を省略し統計値のみ返すモードを設ける。

### 4. `get_indicators`

テクニカル指標とシグナル判定。

| 入力 | 型 | 必須 | 説明 |
|------|----|------|------|
| `symbol` | string | ✓ | ティッカー |

内部処理:
1. 過去 365 日の終値を取得
2. SMA(5/25/200), RSI(14) を計算
3. `getStockSignal()` でシグナル分類

出力:
```json
{
  "symbol": "NVDA",
  "price": 480.2,
  "ma5": 478.1,
  "ma25": 465.3,
  "ma200": 420.5,
  "rsi": 58.2,
  "aboveMA200": true,
  "ma5AboveMA25": true,
  "signal": "strong",
  "signalLabel": "強気候補"
}
```

### 5. `get_market_overview`

主要指数・通貨・金利のスナップショット。引数なし or `symbols` で上書き可能。

デフォルトで取得するシンボル:
- `SPY` (S&P500 ETF), `QQQ` (NASDAQ ETF), `DIA` (Dow ETF)
- `^VIX` (恐怖指数)
- `USDJPY=X` (ドル円)
- `^TNX` (米10年債利回り), `^IRX` (米2年債利回り)

出力: 各銘柄の `get_quote` 結果をキー付きで返す。
```json
{
  "sp500": { ... },
  "nasdaq": { ... },
  "vix": { "price": 14.2, ... },
  "usdJpy": { "price": 154.3, ... },
  "treasury10y": { "price": 4.21, ... }
}
```

### 6. `get_sector_performance`

S&P500 セクター ETF（XLK/XLF/XLV/XLE/XLI/XLY/XLP/XLB/XLU/XLRE/XLC）の騰落率一覧。

| 入力 | 型 | 必須 | 説明 |
|------|----|------|------|
| `tickers` | string[] | – | 省略時は11セクターETF全部 |

出力: `QuoteData[]`（`changePercent` 降順）

### 7. `get_earnings_calendar`

指定銘柄の今後の決算予定。

| 入力 | 型 | 必須 | 説明 |
|------|----|------|------|
| `symbols` | string[] | ✓ | ティッカー配列 |
| `withinDays` | number | – | 何日先まで含めるか (default: 30) |

出力:
```json
{
  "events": [
    { "symbol": "NVDA", "date": "2026-02-25", "epsEstimate": 4.21 }
  ]
}
```

### 8. `get_market_condition`

「強気 / 守り / 警戒」の市況モード判定。

入力なし。内部で SPY (200日MA 比較) と `^VIX` を取得し、`getMarketMode()` で判定。

出力:
```json
{
  "mode": "bullish",
  "label": "強気モード",
  "description": "通常運用 — すべてのシグナルが有効",
  "context": {
    "sp500Price": 595.2,
    "sp500MA200": 540.1,
    "sp500AboveMA200": true,
    "vix": 14.2,
    "treasury10y": 4.21,
    "treasury2y": 4.45,
    "yieldCurveInverted": true
  }
}
```

### 9. `search_symbol`

会社名・キーワード → ティッカー検索。

| 入力 | 型 | 必須 | 説明 |
|------|----|------|------|
| `query` | string | ✓ | 検索文字列 (例: `nvidia`, `半導体`) |
| `limit` | number | – | 最大件数 (default: 5) |

出力:
```json
{
  "results": [
    { "symbol": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ", "quoteType": "EQUITY" }
  ]
}
```

`yahoo-finance2` の `yahooFinance.search()` を使う。

## エラーハンドリング

- ネットワーク / Yahoo 側エラー: `isError: true` + `content[0].text` にメッセージを返す（MCP 仕様準拠）
- 無効ティッカー: 400相当のエラー文を返す
- レート制限警告: `suppressNotices: ["yahooSurvey"]` を維持し、警告は無視
- リトライ: 単発失敗は 1 回まで指数バックオフ（500ms → 1.5s）。複数銘柄並列取得時の一部失敗は配列内 `error` で返し、ツール全体は成功扱い。

## キャッシュ戦略

`yahoo-finance2` を呼びすぎると warning や一時 BAN の恐れがあるため、軽いメモリキャッシュを挟む。

| ツール | TTL |
|--------|-----|
| `get_quote` / `get_quotes` | 60 秒 |
| `get_market_overview` | 60 秒 |
| `get_sector_performance` | 60 秒 |
| `get_historical` | 30 分（過去データはほぼ不変） |
| `get_indicators` | 5 分 |
| `get_earnings_calendar` | 1 時間 |
| `search_symbol` | 24 時間 |

実装は `Map<key, { value, expiresAt }>` で十分。永続化なし。

## 認証・設定

- 認証不要（Yahoo Finance に API キー不要）
- 環境変数:
  - `STOCK_MCP_LOG_LEVEL`: `debug` / `info` / `warn` / `error` (default: `info`)
  - `STOCK_MCP_CACHE_TTL_SECONDS`: 上記 TTL のデフォルト上書き（任意）

## 起動方法

```bash
cd mcp-servers/stock-mcp
npm install
npm run build       # tsc で dist/ にコンパイル
npm start           # node dist/index.js
```

開発時:
```bash
npm run dev         # tsx watch
```

## Claude Code 設定例

`~/.config/claude-code/mcp.json` （または該当の設定ファイル）に以下を追記:

```json
{
  "mcpServers": {
    "stock": {
      "command": "node",
      "args": ["/Users/shu.kubota/projects/umibows-blog/mcp-servers/stock-mcp/dist/index.js"],
      "env": {
        "STOCK_MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

Claude Desktop の場合も同形式（パスは合わせる）。

## 既存コードとの関係

| 既存 | MCP サーバ |
|------|-----------|
| `app/stock-dashboard/lib/fetcher.ts` | ロジックを `mcp-servers/stock-mcp/src/lib/client.ts` に移植・拡張 |
| `app/stock-dashboard/lib/indicators.ts` | 移植（コピー）。将来 `packages/stock-core/` で共通化する余地あり |
| `app/stock-dashboard/lib/condition.ts` | 同上 |
| `app/stock-dashboard/config.ts` | MCP のデフォルト値（市場シンボル・セクター ETF）として再利用 |

**当面はコピーで OK**。Web UI と MCP は更新タイミングが揃わなくても問題にならない。共通化が必要になったら `packages/stock-core` 化する。

## 段階的実装プラン

1. **Phase 1 — 最小限**
   - パッケージ初期化、`@modelcontextprotocol/sdk` 導入
   - `get_quote`, `get_quotes`, `get_indicators` の3つだけ実装
   - Claude Code から呼べることを確認

2. **Phase 2 — マーケット系**
   - `get_market_overview`, `get_sector_performance`, `get_market_condition`
   - キャッシュ層追加

3. **Phase 3 — 周辺機能**
   - `get_historical`, `get_earnings_calendar`, `search_symbol`
   - エラーハンドリング・リトライの仕上げ
   - README 整備

4. **Phase 4 — 任意**
   - `packages/stock-core/` でロジック共通化
   - Web UI 側も MCP 経由で叩く実験（必要性は薄い）

## 注意事項・既知の制約

- Yahoo Finance は非公式 API。仕様変更で壊れる可能性あり（既存ダッシュボードと同じ条件）
- 商用利用は Yahoo TOS 的にグレー。**個人の情報収集用途のみ** で使う
- 株価は最大 15 分遅延
- 日本株 (`.T` サフィックス) も技術的には動くが、本サーバの想定対象外

## 未確定事項（実装着手時に決める）

- パッケージ名: `@umibows/stock-mcp` か `stock-mcp` 単独か
- ログ出力先: stderr (stdio MCP の慣習) で問題ないか
- ウォッチリスト概念を MCP 側にも持たせるか（`get_watchlist` ツール）、それともクライアント側責務にするか
- 検索ツールの結果フォーマット（`yahoo-finance2` のレスポンスをどこまで削るか）
