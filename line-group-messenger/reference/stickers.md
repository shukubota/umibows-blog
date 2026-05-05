# よく使うLINE標準スタンプ

`packageId` と `stickerId` のペアで指定する。
公式の全リストは [Sticker list](https://developers.line.biz/ja/docs/messaging-api/sticker-list/) を参照。

## ベーシックパッケージ（packageId: 446）

| stickerId | 内容 |
|-----------|------|
| 1988 | OK |
| 1989 | Thank you |
| 1990 | I'm sorry |
| 2000 | Cute smile |
| 2001 | Surprised |
| 2003 | Tearful |
| 2010 | Sleeping |

## CONY パッケージ（packageId: 11537）

| stickerId | 内容 |
|-----------|------|
| 52002734 | Happy |
| 52002735 | Cheers / 乾杯 |
| 52002736 | Wave |
| 52002738 | Smile |
| 52002745 | Cry |
| 52002752 | Surprised |

## BROWN パッケージ（packageId: 11538）

| stickerId | 内容 |
|-----------|------|
| 51626494 | Hello |
| 51626501 | Sad |
| 51626502 | OK |
| 51626503 | Angry |
| 51626508 | Love |

## 使用例

```json
{
  "type": "sticker",
  "packageId": "11537",
  "stickerId": "52002735"
}
```

## メモ

- `packageId` と `stickerId` は文字列として指定する（数値ではない）
- 自社で作成したスタンプは送信できない（公式が許可するセットのみ）
- 送信不可なIDを指定すると 400 が返る
