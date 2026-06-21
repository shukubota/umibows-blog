# mcp-ui-sample（MCP Apps 公式SDK準拠・何切る）

麻雀の手牌を **`ui://` の牌UI** で描画する MCP Apps サンプルサーバー。
`show_mahjong_hand` ツールに手牌(牌コード配列)を渡すと、シャンテン数・受け入れ・
推奨打牌を計算し、ホストの sandbox iframe に牌画像で表示する。
公式 `@modelcontextprotocol/ext-apps` を使用。牌SVGは FluffyStuff /
riichi-mahjong-tiles (CC0) をインラインで同梱（外部リソース読み込みなし）。

## 構成

```
mcp-ui-sample/
├── index.ts          # stdio エントリ
├── server.ts         # show_mahjong_hand ツール + シャンテン/受け入れ計算
├── view/
│   ├── hand.html     # View の入口
│   ├── hand.ts       # App SDK でホスト接続 → ontoolresult で牌SVG描画
│   └── tiles.ts      # 牌SVG(34種) + 牌名（riichi-mahjong-tiles, CC0）
├── vite.config.ts    # singlefile バンドル設定
└── dist/hand.html    # ← vite build 出力（ui:// で配信する1枚HTML, gitignore）
```

## 牌コード

`show_mahjong_hand` の `tiles` は牌コードの配列。13枚か14枚。

- 萬子: `1m`〜`9m` / 筒子: `1p`〜`9p` / 索子: `1s`〜`9s`
- 字牌: `ton` `nan` `sha` `pei`（東南西北）、`haku` `hatsu` `chun`（白發中）

あいまいな口頭表現（イーピン=1p、リャンピン=2p、チュン=中、ハツ=發、3万=3m 等）は
呼び出すLLM側でこのコード配列に変換してから渡す想定。14枚なら「何切る（推奨打牌）」、
13枚なら受け入れ牌を返す。

## 動かす

```bash
cd mcp-servers/mcp-ui-sample
npm install
npm run build        # View(dist/hand.html) + サーバー(dist/index.js) を生成
npm start            # node dist/index.js で stdio 起動
```

起動は `node dist/index.js`。実行時依存(ext-apps/sdk/zod)はピュアJSなので、
ビルド済みなら別マシンでも `npm install` なしで `node` だけで動く。
ソースを編集して即試すなら `npm run dev`（tsx）。

### プロトコル確認

```bash
npm run smoke
```

`show_mahjong_hand` に14枚を渡すと `structuredContent` に
`{ tiles, names, shanten, mode, recommend, ... }` が返り、`content` にテキスト要約が入る。

## どこが MCP Apps 仕様なのか

1. ツールが `_meta.ui.resourceUri` で `ui://` リソースを宣言（`registerAppTool`）
2. リソースは `text/html;profile=mcp-app` のバンドル済みHTML（`registerAppResource`）
3. ホストがツール呼び出し後にHTMLを sandbox iframe で描画
4. View は `new App()` → `app.connect()` で postMessage 上の JSON-RPC ハンドシェイク。
   ツール結果は `app.ontoolresult` に通知で届き、牌を描画する

## Claude Desktop / Claude Code に登録

`.mcp.json`（Claude Code 用）には登録済み（ビルド済みJSを node 起動）:

```json
"mcp-ui-sample": { "command": "node", "args": ["mcp-servers/mcp-ui-sample/dist/index.js"] }
```

Claude Desktop 本体は `claude_desktop_config.json` に絶対パスで同様に。事前に `npm run build` が必要。

## クレジット / 注意

- 牌画像: FluffyStuff / riichi-mahjong-tiles (CC0)。
- Claude Desktop には MCP Apps の iframe が描画されない既知バグの報告がある。
  描画されない場合もツールのテキスト/データ応答はフォールバックとして機能する。
- `node_modules` はOS依存。別マシンでは `npm install` をやり直すこと。
