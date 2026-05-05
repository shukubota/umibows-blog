---
name: line-group-messenger
description: 環境変数で指定された単一のLINEグループに、Messaging APIのpush messageでテキスト・スタンプ・画像を送信する。Use when：LINEに送る、LINEで通知、LINEに投稿、LINEグループに投稿、LINEで連絡、グループにLINE、飲み会の連絡をLINEで、リマインドをLINEで、など。送信先は固定（環境変数）なので「どこに送る？」とは聞かない。
---

# LINE Group Broadcast

このskillは、環境変数で指定された単一のLINEグループに、LINE Messaging APIのpush messageを送るためのもの。テキスト・スタンプ・画像に対応。

## 必要な環境変数

- `LINE_CHANNEL_ACCESS_TOKEN`: Messaging APIチャネルの長期アクセストークン
- `LINE_TARGET_GROUP_ID`: 送信先グループID（`C`で始まる文字列）

どちらも未設定の場合はskillはエラー終了する。ユーザーに設定を依頼すること。

## 動作フロー

1. **送信内容をユーザーに確認**する。テキスト・スタンプ・画像のいずれか、または組み合わせ。
2. **メッセージペイロードを構築**する。1リクエストで最大5件まで。形式は下記参照。
3. **送信前に必ずユーザーに最終確認**を取る。送信本文（プレビュー）を提示し、「この内容で送信していいですか？」と尋ねる。承諾を得るまで送らない。
4. `scripts/send.py` を実行する。標準入力に `{"messages": [...]}` をJSONで渡す。
5. **結果をユーザーに報告**する。成功なら「送信完了」、失敗ならエラー内容と推測される原因を伝える。

## メッセージペイロード仕様

各messageオブジェクトはLINE Messaging APIに準拠：

```json
// テキスト
{"type": "text", "text": "本文…"}

// スタンプ
{"type": "sticker", "packageId": "446", "stickerId": "1988"}

// 画像
{
  "type": "image",
  "originalContentUrl": "https://example.com/full.jpg",
  "previewImageUrl": "https://example.com/preview.jpg"
}
```

詳細は `reference/api_limits.md` と `reference/stickers.md` を参照。

## 実行例

```bash
echo '{"messages":[{"type":"text","text":"今週末の飲み会：5/13(水) 19:30〜"}]}' \
  | python3 scripts/send.py
```

複数メッセージの場合：

```bash
cat <<'EOF' | python3 scripts/send.py
{
  "messages": [
    {"type": "text", "text": "今週末の飲み会候補です"},
    {"type": "sticker", "packageId": "446", "stickerId": "1988"}
  ]
}
EOF
```

## エラー時の対応

- HTTP 400: ペイロードのスキーマ違反。messages配列の中身を見直して再構築。
- HTTP 401: アクセストークンが無効。`LINE_CHANNEL_ACCESS_TOKEN` の再発行をユーザーに依頼。
- HTTP 403: チャネルの権限設定不足。LINE Developers Consoleでの設定確認を依頼。
- HTTP 429: レート制限。少し時間をおいて再送。
- 5xx: LINE側の一時的エラー。再送で解決することが多い。

## 注意事項

- 送信前のユーザー確認は **必ず** 行う（誤爆防止）。
- 画像はHTTPSのみ。HTTP URLは拒否される。
- スタンプはLINE標準スタンプのみ使用可（packageId/stickerIdの組み合わせ）。
- メッセージ本文に機密情報を含む場合は、扱いをユーザーに再確認すること。
