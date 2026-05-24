# LINE Messaging API 制限事項

## メッセージ仕様

| 項目                            | 制限                                        |
| ------------------------------- | ------------------------------------------- |
| 1リクエストあたりのメッセージ数 | 最大5件                                     |
| textメッセージの本文            | 最大5,000文字                               |
| 画像 originalContentUrl         | HTTPS必須 / JPEG または PNG / 10MB以下      |
| 画像 previewImageUrl            | HTTPS必須 / JPEG または PNG / 1MB以下       |
| スタンプ                        | LINE提供のもののみ（packageId + stickerId） |

## レート制限とプラン（2025年時点）

| プラン             | 月間フリーメッセージ | 追加メッセージ |
| ------------------ | -------------------- | -------------- |
| コミュニケーション | 200通                | 不可           |
| ライト             | 5,000通              | 不可           |
| スタンダード       | 30,000通             | 従量課金       |

公式: https://developers.line.biz/ja/docs/messaging-api/overview/#rate-limits

## HTTPステータスコード

| コード | 意味              | よくある原因                                         | 対応             |
| ------ | ----------------- | ---------------------------------------------------- | ---------------- |
| 200    | OK                | -                                                    | 成功             |
| 400    | Bad Request       | messagesのスキーマ不正、文字数オーバー、画像形式不正 | ペイロードを修正 |
| 401    | Unauthorized      | アクセストークンが無効・期限切れ                     | トークン再発行   |
| 403    | Forbidden         | プランの上限超過、チャネルの権限不足                 | プラン/設定確認  |
| 429    | Too Many Requests | レート超過                                           | 時間をおいて再送 |
| 500系  | Server Error      | LINE側の障害                                         | 再送             |

## 参考リンク

- [Messaging API リファレンス](https://developers.line.biz/ja/reference/messaging-api/)
- [Push messageのエラー詳細](https://developers.line.biz/ja/reference/messaging-api/#send-push-message)
