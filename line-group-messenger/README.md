# line-group-messenger

固定の単一LINEグループに、Messaging APIのpush messageでテキスト・スタンプ・画像を送るためのClaude skill。

## できること

ClaudeにLINE送信を依頼すると、

1. 送信内容（テキスト/スタンプ/画像）をユーザーに確認
2. 送信前に最終承認を取る
3. 環境変数で指定したLINEグループにPush送信
4. 結果を報告

までを自動で実行する。

## セットアップ

### 1. LINE Messaging APIチャネル

[LINE Developers Console](https://developers.line.biz/console/) でMessaging APIチャネルを作成し、

- 長期チャネルアクセストークンを発行
- 公式アカウントを送信先グループに招待
- 該当グループの `groupId`（`C` で始まる）を取得（webhookで取得する手順は `SKILL.md` 参照）

を済ませておく。

### 2. 環境変数を設定

```bash
export LINE_CHANNEL_ACCESS_TOKEN="<長期トークン>"
export LINE_TARGET_GROUP_ID="C..."
```

### 3. skillをClaudeに認識させる

このフォルダをClaudeのskillsディレクトリに配置する（例：`~/.claude/skills/line-group-messenger/`）。

## 使い方

Claudeに自然文で頼むだけ：

- 「LINEに『お疲れ様です』って送って」
- 「来週の飲み会の予定をLINEに通知して」

Claudeがメッセージを組み立てて確認を取り、承認後に送信する。

## ファイル構成

```
line-group-messenger/
├── SKILL.md              # トリガー定義 + Claudeへの動作指示
├── scripts/
│   └── send.py           # Push Message API呼び出し本体
└── reference/
    ├── api_limits.md     # API制限・エラーコード
    └── stickers.md       # よく使うスタンプID
```

## CLIから直接テスト

```bash
echo '{"messages":[{"type":"text","text":"テスト送信"}]}' \
  | python3 scripts/send.py
```

成功すると `OK (200): {}` と表示される。

## 注意

- 環境変数（特に `LINE_CHANNEL_ACCESS_TOKEN`）は **絶対にコミットしない**。`.gitignore` で `.env` 系は除外済み。
- 送信は不可逆。skill内でユーザー承認を取るが、自動化（cron / scheduled task）に組み込む場合は文面プレビューの仕組みも検討すること。
