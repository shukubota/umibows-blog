# stock-mcp

Yahoo Finance ベースの株価データを Claude (Code / Desktop) から呼べる MCP サーバ。米国株中心。

仕様: `../../docs/stock-mcp/specification.md`

## セットアップ

```bash
cd mcp-servers/stock-mcp
npm install
npm run build
```

## Claude Code 設定

`~/.claude.json` または `claude mcp add` で登録:

```bash
claude mcp add stock node /Users/shu.kubota/projects/umibows-blog/mcp-servers/stock-mcp/dist/index.js
```

もしくは設定ファイルに直接:

```json
{
  "mcpServers": {
    "stock": {
      "command": "node",
      "args": ["/Users/shu.kubota/projects/umibows-blog/mcp-servers/stock-mcp/dist/index.js"]
    }
  }
}
```

## 提供ツール

| ツール | 用途 |
|--------|------|
| `get_quote` | 単一銘柄のリアルタイム見積もり |
| `get_quotes` | 複数銘柄を一括取得（最大20） |
| `get_historical` | 日/週/月足 OHLC。`summaryOnly` で統計値のみ返せる |
| `get_indicators` | MA5/25/200, RSI14, シグナル分類 |
| `get_market_overview` | 主要指数・VIX・USD/JPY・米国債利回りのスナップショット |
| `get_sector_performance` | S&P500 セクター ETF（11個）の騰落率 |
| `get_earnings_calendar` | 指定銘柄の今後の決算予定 |
| `get_market_condition` | 強気/守り/警戒モード判定 |
| `search_symbol` | 会社名 → ティッカー検索 |

## 開発

```bash
npm run dev        # tsx watch
npm run typecheck
```

## 制約

- Yahoo Finance は非公式 API。仕様変更で壊れる可能性あり
- 最大 15 分遅延
- 個人利用前提（商用利用は Yahoo TOS 的にグレー）
