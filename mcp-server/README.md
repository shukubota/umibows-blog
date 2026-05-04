# MCP Server

umibows-blog プロジェクト向けの MCP (Model Context Protocol) サーバー。
goose からファイル操作・git 操作ツールを利用できる。

## 起動

```bash
npm install
npm run dev
```

ポート `8000` で起動する。

## 提供ツール

| ツール       | 説明                               |
| ------------ | ---------------------------------- |
| `read_file`  | プロジェクト内のファイルを読む     |
| `write_file` | プロジェクト内のファイルを書き込む |
| `list_files` | ディレクトリの一覧を返す           |
| `git_status` | git status を返す                  |
| `git_log`    | コミット履歴を返す                 |
| `git_diff`   | 未ステージの差分を返す             |

## goose との連携

`~/.config/goose/config.yaml` に以下を追加することで goose から利用できる。

```yaml
extensions:
  my-tools:
    type: streamable_http
    name: my-tools
    description: ブログプロジェクトのファイル操作・git操作ツール
    uri: http://localhost:8000/mcp
    enabled: true
    timeout: 30
```

## 動作確認

サーバー起動後、以下のコマンドで接続を確認できる。

```bash
curl -s -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
```

`"result"` を含むレスポンスが返れば正常。

```
event: message
data: {"result":{"protocolVersion":"2024-11-05","capabilities":...}}
```
