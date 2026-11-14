# mahjong-nanikiru-worker

何切る MCP（`show_mahjong_hand`）の Cloudflare Workers 版。
Worker 自身が OAuth 2.1 の認可サーバー（`@cloudflare/workers-oauth-provider`）になり、
ログインだけ Google に委譲する。許可リストのメールアドレスにだけ MCP 用トークンを発行する。

設計: [docs/mahjong-nanikiru/remote-mcp-cloudflare-workers.md](../../docs/mahjong-nanikiru/remote-mcp-cloudflare-workers.md)

## 構成

```
src/
├── index.ts           # OAuthProvider（/mcp を保護、/token・/register・/.well-known/* は自動）
├── google-handler.ts  # /authorize（同意画面）と /callback（Google ログイン・許可リスト判定）
├── mcp.ts             # 何切るツール＋牌UI（ステートレス Streamable HTTP）
├── env.ts             # バインディングと props の型
└── html.d.ts          # .html を文字列 import する型宣言
```

- シャンテン計算は `../mahjong-nanikiru/nanikiru-core.ts`、牌UIは `app/api/mcp/mahjong-nanikiru/hand.html` を直接 import する（stdio 版・Vercel 版と単一ソース）。牌UIを変えたらリポジトリ直下で `npm run mcp:sync-view` → 再デプロイ。
- MCP SDK は v2（`@modelcontextprotocol/server`）。`agents` と `@modelcontextprotocol/ext-apps` 2.x が v2 前提のため。

## 開発

```bash
npm install
cp .dev.vars.example .dev.vars   # 値は自分で入れる（コミットしない）
npm run dev                      # http://localhost:8788
npm run typecheck
npx wrangler deploy --dry-run    # バンドル確認
```

動作確認は MCP Inspector で `http://localhost:8788/mcp` に接続し、OAuth → `show_mahjong_hand` 呼び出しまで通す。

```bash
npx @modelcontextprotocol/inspector
```

## デプロイ

初回の手順（Cloudflare 登録、Google OAuth クライアント作成、KV 作成、Secrets 登録）は設計書の「ユーザー作業の手順」を参照。

```bash
npx wrangler deploy
```

Secrets: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `COOKIE_ENCRYPTION_KEY`（32文字以上）/ `ALLOWED_EMAILS`（カンマ区切り）。
