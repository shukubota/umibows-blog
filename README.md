This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## ローカル依存サービス (MySQL / SQS)

`compose.yaml` で MySQL と SQS 互換サーバ ([ElasticMQ](https://github.com/softwaremill/elasticmq)) を起動できます。SQS は localstack ではなく ElasticMQ を使っているため、AWS SDK からそのまま SQS API として利用できます。

### 起動

```bash
docker compose up -d
```

### 停止

```bash
docker compose down            # コンテナのみ削除
docker compose down -v         # MySQL のデータも削除
```

### 接続情報

#### MySQL

| 項目   | 値                                               |
| ------ | ------------------------------------------------ |
| ホスト | `127.0.0.1`                                      |
| ポート | `3306`                                           |
| DB     | `umibows`                                        |
| ユーザ | `umibows` / パスワード `umibows`                 |
| root   | パスワード `root`                                |
| URL 例 | `mysql://umibows:umibows@127.0.0.1:3306/umibows` |

接続確認:

```bash
docker compose exec mysql mysql -uumibows -pumibows umibows -e 'SELECT 1;'
```

#### SQS (ElasticMQ)

| 項目           | 値                              |
| -------------- | ------------------------------- |
| エンドポイント | `http://127.0.0.1:9324`         |
| 管理 UI / 統計 | `http://127.0.0.1:9325`         |
| リージョン     | `us-east-1` (ダミー)            |
| アクセスキー   | `x` / シークレット `x` (ダミー) |

AWS CLI からの利用例:

```bash
# キュー作成
aws --endpoint-url http://127.0.0.1:9324 \
    --region us-east-1 \
    sqs create-queue --queue-name my-queue

# メッセージ送信
aws --endpoint-url http://127.0.0.1:9324 \
    --region us-east-1 \
    sqs send-message \
    --queue-url http://127.0.0.1:9324/000000000000/my-queue \
    --message-body 'hello'

# 受信
aws --endpoint-url http://127.0.0.1:9324 \
    --region us-east-1 \
    sqs receive-message \
    --queue-url http://127.0.0.1:9324/000000000000/my-queue
```

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
