# umibows-blog-mcp（MCP Apps の最小例）

ブログの海スポットを **地図UI付き** でAIに返す MCPサーバー。
「テキストだけでなく `ui://` でUIを返せる」という MCP Apps の感覚をつかむためのサンプル。
`mcp-servers/stock-mcp` と同じ構成です。

## 構成

```
umibows-blog-mcp/
├── src/
│   ├── index.ts           # MCPサーバー本体（ツール + UIリソース登録）
│   ├── ui/spot-map.html   # ① ui:// で配信する地図UI（Leaflet）
│   └── data/spots.json    # スポットのダミーデータ
├── smoke.jsonl            # 起動確認用の JSON-RPC 入力
├── package.json
└── tsconfig.json
```

## 動かす（ビルド不要）

依存（`@modelcontextprotocol/sdk` / `zod` / `tsx`）はリポジトリ直下の
node_modules で解決されるので、このフォルダで `npm install` しなくても動きます。

```bash
# リポジトリルートから
npx tsx mcp-servers/umibows-blog-mcp/src/index.ts   # stdioで起動

# 起動確認（resources/tools/call を一括テスト）
npx tsx mcp-servers/umibows-blog-mcp/src/index.ts < mcp-servers/umibows-blog-mcp/smoke.jsonl
```

このフォルダ単体で完結させたい場合は `npm install` 後に `npm run dev` / `npm run smoke:dev`。

## 仕組み（3ステップ）

1. `index.ts` が地図HTMLを `ui://umibows/spot-map` というリソースとして登録。
2. `show_spot` ツールが、エリア名 → スポット座標を返す。返り値に
   `_meta: { "openai/outputTemplate": "ui://umibows/spot-map" }` を付け、
   「この出力はこのUIで描画して」とクライアントに伝える。
3. クライアント(Claude Desktop 等)が、ツールの `structuredContent`(座標) を
   sandbox 化した iframe(=登録したHTML) に渡し、チャット内に地図を描画する。

## Claude Desktop に登録する例

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "umibows-blog": {
      "command": "npx",
      "args": ["tsx", "/Users/shu.kubota/projects/umibows-blog/mcp-servers/umibows-blog-mcp/src/index.ts"]
    }
  }
}
```

登録後、チャットで「鎌倉の海スポットを地図で見せて」と頼むと `show_spot` が呼ばれます。
（ビルド版を使うなら `npm run build` 後に `"command": "node", "args": [".../dist/index.js"]`）

## 注意

- UIとツールの紐づけメタキーは MCP Apps 仕様が策定途上のため、クライアントにより
  `openai/outputTemplate` 以外のキーを見る場合があります。HTML側は
  postMessage / window.openai の両対応にしてあります。
- 地図タイルは OpenStreetMap を利用。商用は各サービスの規約に従ってください。
