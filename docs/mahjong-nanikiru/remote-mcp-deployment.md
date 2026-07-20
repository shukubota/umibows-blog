# mahjong-nanikiru — Remote MCP (Vercel) 設計・デプロイ手順

麻雀「何切る」MCP サーバー（`show_mahjong_hand`）を、Claude cowork などの
**remote connector** から使えるように Vercel 上で **Streamable HTTP** の
remote MCP として公開するための設計と手順。

stdio 版（`node dist/index.js`）はそのまま残し、**計算ロジックを単一ソース化して
両方から共有**する構成。

- エンドポイント: `https://<host>/api/mcp/mahjong-nanikiru/mcp`
- ツール: `show_mahjong_hand`（牌コード配列 → シャンテン/受け入れ/推奨打牌 + `ui://` の牌UI）

---

## 1. アーキテクチャ

```
                         ┌───────────────────────────────────────────┐
                         │  mcp-servers/mahjong-nanikiru/             │
                         │    nanikiru-core.ts  ← 純粋ロジック(単一ソース) │
                         │      analyzeHand() / shanten() / ukeire()   │
                         │      NAMES / codeToIndex / TOOL_* 定数       │
                         └──────────────┬──────────────┬─────────────┘
                                        │import         │import
                    ┌───────────────────┘               └───────────────────┐
                    ▼                                                         ▼
   ┌────────────────────────────────┐              ┌──────────────────────────────────────────┐
   │ stdio 版                        │              │ remote 版 (Vercel / Next.js route)          │
   │ index.ts + server.ts           │              │ app/api/mcp/mahjong-nanikiru/[transport]/  │
   │  StdioServerTransport          │              │   route.ts                                 │
   │  dist/hand.html を fs 読み       │              │  mcp-handler → Streamable HTTP             │
   │  → Claude Desktop / Claude Code │              │  hand.html(追跡コピー)を fs 読み             │
   └────────────────────────────────┘              │  ?key= / Bearer の共有トークン認証           │
                                                    │  → Claude cowork / remote connector        │
                                                    └──────────────────────────────────────────┘
```

**設計原則**: シャンテン/受け入れ計算アルゴリズムは `nanikiru-core.ts` の1箇所だけに置き、
stdio 版・remote 版はそれを import する。MCP SDK / ext-apps / fs は core に持ち込まず、
純粋関数のみにすることで **SDK インスタンス重複を避けつつドリフトを防ぐ**。

---

## 2. ファイル構成

| ファイル                                            | 役割                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `mcp-servers/mahjong-nanikiru/nanikiru-core.ts`     | **純粋ロジック（外部依存ゼロ）**。`analyzeHand()`・シャンテン/受け入れ計算・牌コード変換・ツール定義定数。stdio/remote 共有 |
| `mcp-servers/mahjong-nanikiru/server.ts`            | stdio 版。core を使って `registerAppTool`/`registerAppResource`、`dist/hand.html` を fs 読み                                |
| `mcp-servers/mahjong-nanikiru/index.ts`             | stdio エントリ（`StdioServerTransport`）                                                                                    |
| `app/api/mcp/mahjong-nanikiru/[transport]/route.ts` | **remote MCP 本体**。`mcp-handler` で Streamable HTTP 化 + 共有トークン認証                                                 |
| `app/api/mcp/mahjong-nanikiru/hand.html`            | View HTML の**追跡コピー**（後述）                                                                                          |
| `next.config.mjs`                                   | `outputFileTracingIncludes` で HTML を関数バンドルへ同梱                                                                    |
| `package.json`                                      | `mcp-handler` / `@modelcontextprotocol/ext-apps` 依存、`mcp:sync-view` スクリプト                                           |

エンドポイントのパス対応:

- ルートファイル `app/api/mcp/mahjong-nanikiru/[transport]/route.ts`
- `createMcpHandler(..., { basePath: "/api/mcp/mahjong-nanikiru" })`
- `[transport]` に `mcp` が入り、実際の URL は `/api/mcp/mahjong-nanikiru/mcp`

---

## 3. 主要な設計判断

### 3.1 Streamable HTTP のみ（Redis 不要）

`createMcpHandler` の config で `disableSse: true` を指定し、SSE を無効化。
mcp-handler の Redis 依存は **SSE の resumability 用**なので、Streamable HTTP のみなら
**Redis / KV は不要**。ステートレスに毎リクエストで server インスタンスを生成する。

### 3.2 依存の peer conflict（sdk バージョン）

`mcp-handler@1.1.0` は peer で `@modelcontextprotocol/sdk@1.26.0` を**固定**指定しているが、
リポジトリは `1.29.0`（API 互換）。

- **Vercel は `yarn.lock` を検出して yarn でインストール**する。yarn v1 は peer 不一致を
  **警告扱い**にして通すため、追加設定は不要。
- npm で入れる場合のみ ERESOLVE で失敗する。その場合は `npm i --legacy-peer-deps`。
  （リポジトリの正は yarn なので `.npmrc` は置いていない。）

> 依存追加は必ず **yarn** で行うこと（`yarn add ...`）。npm install は `yarn.lock` を
> 壊し `package-lock.json` を生成してしまう。

### 3.3 View HTML の同梱（ここが最大の勘所）

- View の実体は vite が単一ファイル化した `dist/hand.html`（約900KB, 牌SVGインライン）。
- `dist/` は **gitignore** されており、Vercel のビルドは `next build` だけで **vite build は走らない**。
  → そのままでは本番に `hand.html` が存在しない。
- 対策: `dist/hand.html` を **追跡ファイル** `app/api/mcp/mahjong-nanikiru/hand.html` にコピーして
  コミットし、`next.config.mjs` の `outputFileTracingIncludes` で関数バンドルへ含める。
  route 側は `fs.readFile(process.cwd() + "app/api/mcp/mahjong-nanikiru/hand.html")` で読む
  （初回のみ読んでモジュールスコープにキャッシュ）。

```js
// next.config.mjs
experimental: {
  outputFileTracingIncludes: {
    "/api/mcp/mahjong-nanikiru/[transport]": ["./app/api/mcp/mahjong-nanikiru/hand.html"],
  },
},
```

### 3.4 認証（共有トークン）

環境変数 `MAHJONG_MCP_TOKEN` を設定すると認証必須になる。

- cowork / connector は **URL しか指定できない**ため、`?key=<token>` を主に使う。
- ヘッダを送れるクライアント向けに `Authorization: Bearer <token>` も許容。
- **`MAHJONG_MCP_TOKEN` 未設定なら素通し**（ローカル開発用）。本番では必ず設定すること。

---

## 4. デプロイ手順

### 4.1 環境変数を登録（本番で認証を有効化）

```bash
# 任意のランダムなトークンを用意して登録
vercel env add MAHJONG_MCP_TOKEN production
# preview 環境でも試すなら
vercel env add MAHJONG_MCP_TOKEN preview
```

（Vercel ダッシュボード → Project → Settings → Environment Variables でも可）

### 4.2 デプロイ

このリポジトリは push で自動デプロイされる想定:

```bash
git add -A
git commit -m "feat: mahjong-nanikiru を remote MCP (Vercel) として公開"
git push
```

CLI で直接上げるなら `vercel --prod`。

### 4.3 接続 URL

```
https://<あなたのVercelドメイン>/api/mcp/mahjong-nanikiru/mcp?key=<MAHJONG_MCP_TOKEN>
```

Claude cowork / Claude Desktop の「カスタムコネクタ（remote MCP）」にこの URL を登録する。

---

## 5. ローカルで試す

dev サーバー起動（`MAHJONG_MCP_TOKEN` 未設定なら認証なし）:

```bash
npm run dev
# エンドポイント: http://localhost:3000/api/mcp/mahjong-nanikiru/mcp
```

### 5.1 curl（クライアント不要・最速）

```bash
BASE="http://localhost:3000/api/mcp/mahjong-nanikiru/mcp"
H='-H content-type:application/json -H accept:application/json,text/event-stream'

# initialize
curl -s $H -X POST "$BASE" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'

# tools/call（14枚 → 何切る）
curl -s $H -X POST "$BASE" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"show_mahjong_hand","arguments":{"tiles":["3m","4m","5m","1p","2p","3p","7p","8p","9p","5s","hatsu","hatsu","chun","chun"]}}}'
```

認証を有効にして試すなら起動時に `MAHJONG_MCP_TOKEN=xxx npm run dev` とし、URL に `?key=xxx` を付ける
（未指定なら 401）。

### 5.2 MCP Inspector（GUI）

```bash
npx @modelcontextprotocol/inspector
```

Transport = `Streamable HTTP`、URL に上記エンドポイントを入れて Connect。

### 5.3 Claude Desktop

Settings → Connectors → カスタムコネクタ追加で URL を登録。
`claude_desktop_config.json` の `command`/`args` は **stdio 専用**で HTTP URL は書けない。
どうしても config 経由なら `mcp-remote` ブリッジ:

```json
"mahjong-nanikiru-remote": {
  "command": "npx",
  "args": ["-y", "mcp-remote", "http://localhost:3000/api/mcp/mahjong-nanikiru/mcp"]
}
```

---

## 6. 運用: View を更新したら

`view/*` を編集したら、追跡コピーを再生成してコミットする:

```bash
npm run mcp:sync-view
#  = cd mcp-servers/mahjong-nanikiru && npm run build:view
#    && cp dist/hand.html ../../app/api/mcp/mahjong-nanikiru/hand.html
git add app/api/mcp/mahjong-nanikiru/hand.html && git commit -m "chore: 何切る View を更新"
```

---

## 7. 既知の制約

- **MCP Apps の UI 表示**: `tools/list` で `_meta.ui`(`ui://mahjong-nanikiru/hand.html`) を返し、
  `resources/read` で `text/html;profile=mcp-app` の HTML を配信するが、
  インタラクティブな牌描画（iframe）を実際にレンダリングするかは **クライアント側の MCP Apps 対応次第**。
  未対応でも `content`(テキスト) + `structuredContent`（tiles/shanten/mode/recommend）は必ず返る。
- Claude Desktop には MCP Apps の iframe が描画されない既知バグの報告がある（テキスト応答はフォールバック）。
- HTML はモジュールスコープにキャッシュするので、更新反映には再デプロイ（コールドスタート）が必要。

```

```
