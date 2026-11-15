# mahjong-nanikiru — Cloudflare Workers 版 セットアップ・デプロイ手順

何切る MCP の Cloudflare Workers 版（`mcp-servers/mahjong-nanikiru-worker/`）を、
初回セットアップから claude.ai での接続まで進めるための手順書。

- 設計: [remote-mcp-cloudflare-workers.md](./remote-mcp-cloudflare-workers.md)
- コード: [mcp-servers/mahjong-nanikiru-worker/](../../mcp-servers/mahjong-nanikiru-worker/)

## 進捗

| #   | 手順                           | 状態   | メモ                                                                            |
| --- | ------------------------------ | ------ | ------------------------------------------------------------------------------- |
| 1   | Cloudflare アカウント作成      | 完了   |                                                                                 |
| 2   | `wrangler login`               | 完了   | ローカル PC で実施                                                              |
| 3   | KV namespace 作成              | 完了   | `OAUTH_KV` id `8fe5a65cebe14773985c4acd53e53aca`（`wrangler.jsonc` に記入済み） |
| 4   | workers.dev サブドメイン確認   | 作業中 | 初回デプロイで `kubotashu0421` が割り当てられたため `umibows` に変更する        |
| 5   | Google OAuth クライアント作成  | 未     |                                                                                 |
| 6   | ローカル確認（`wrangler dev`） | 未     |                                                                                 |
| 7   | Secrets 登録とデプロイ         | 未     |                                                                                 |
| 8   | claude.ai から接続             | 未     |                                                                                 |

## 前提

- 作業は自分の PC で行う。Claude Code のクラウド環境からは `api.cloudflare.com` に接続できず、`wrangler login` のブラウザ認証も戻ってこられない。
- 秘密情報（Google のクライアントシークレット、Cookie 署名鍵、API トークン）は自分のターミナルで入力する。チャットやリポジトリには置かない。
- Node は `.node-version`（22.x）でよい。Worker の本番は Cloudflare 上で動くので、手元の Node は `wrangler` を動かすためだけに使う。

## 1. Cloudflare アカウント作成

1. https://dash.cloudflare.com/sign-up でメールとパスワードを登録し、メール認証する（Free プランでよい。クレジットカード不要）
2. 会社メールと個人メールのどちらで作るかは社内ルールに従う

## 2. wrangler login

`wrangler login` の認証情報は PC 全体（ホームディレクトリの設定）に保存されるので、どのディレクトリで実行してもよい。ブランチを切り替える必要もない。

```bash
npx wrangler@4 login
```

```bash
npx wrangler@4 whoami
```

## 3. KV namespace 作成

OAuth のクライアント・付与情報・トークン（ハッシュ）・認可途中の状態を保存する入れ物。id は秘密情報ではないのでコミットしてよい。

```bash
npx wrangler@4 kv namespace create OAUTH_KV
```

出力された `id` を `mcp-servers/mahjong-nanikiru-worker/wrangler.jsonc` の `kv_namespaces[0].id` に書く。

## 4. workers.dev サブドメイン確認

初回の `npx wrangler deploy` で、サブドメインが未登録なら登録を求められ、最後に URL が表示される。ダッシュボードで「Create application」から作る必要はない。

サブドメインはあとから変えられる（ダッシュボードの Workers の設定 → Subdomain → Change）。変えると古い URL は使えなくなる。このプロジェクトでは `umibows.workers.dev` を使う。

`wrangler.jsonc` の `vars.MCP_RESOURCE` を次の形にする。

```
https://mahjong-nanikiru.umibows.workers.dev/mcp
```

## 5. Google OAuth クライアント作成

Google Cloud Console で作る。今の Vercel 版と同じ GCP プロジェクトでよい。

1. 「API とサービス → 認証情報 → 認証情報を作成 → OAuth クライアント ID」
2. 種類: ウェブアプリケーション、名前: `mahjong-nanikiru-worker`
3. 承認済みのリダイレクト URI に次の2つを登録する
   - `http://localhost:8788/callback`
   - `https://mahjong-nanikiru.umibows.workers.dev/callback`
4. OAuth 同意画面が「外部・テスト中」なら、自分のメールアドレスをテストユーザーに追加する
5. クライアント ID とクライアントシークレットを 1Password に保存する

## 6. ローカル確認

コードを手元に用意する。今のブランチを切り替えたくない場合は、PR を main にマージしてから `git pull` するか、git worktree で別フォルダに取り出す。

```bash
git -C ~/projects/umibows-blog fetch origin <作業ブランチ> && git -C ~/projects/umibows-blog worktree add ~/projects/umibows-blog-cf <作業ブランチ>
```

```bash
cd mcp-servers/mahjong-nanikiru-worker && npm install
```

`.dev.vars.example` を `.dev.vars` にコピーし、値を自分で入れる（`.dev.vars` は gitignore 済み）。`MCP_RESOURCE` は `http://localhost:8788/mcp` のままにする。

```bash
cp .dev.vars.example .dev.vars
```

```bash
npm run dev
```

別のターミナルで MCP Inspector を起動し、`http://localhost:8788/mcp` に接続する。OAuth（同意画面 → Google ログイン）→ `show_mahjong_hand` 呼び出し → 牌UI表示まで通れば OK。

```bash
npx @modelcontextprotocol/inspector
```

## 7. Secrets 登録とデプロイ

`mcp-servers/mahjong-nanikiru-worker` で実行する。値はプロンプトに自分で入力する。

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
```

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

```bash
npx wrangler secret put ALLOWED_EMAILS
```

```bash
openssl rand -hex 32 | npx wrangler secret put COOKIE_ENCRYPTION_KEY
```

```bash
npx wrangler deploy
```

確認（トークンなしなので 401 と `WWW-Authenticate` が返れば正常）:

```bash
curl -i -X POST https://mahjong-nanikiru.umibows.workers.dev/mcp
```

## 8. claude.ai から接続

1. 設定 → コネクタ → カスタムコネクタを追加
2. URL に `https://mahjong-nanikiru.umibows.workers.dev/mcp`
3. 同意画面で「許可して Google でログイン」→ 許可リストのアカウントでログイン
4. 「1m2m3m4p5p6p7s8s9s東東白白中 何切る？」などと聞いて、牌UIが出れば完了

組織の Claude でカスタムコネクタの追加が制限されている場合は、管理者への申請が必要。

## 運用

| やりたいこと        | 手順                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| 牌UIを更新          | リポジトリ直下で `npm run mcp:sync-view` → `npx wrangler deploy`               |
| 許可メールを変更    | `npx wrangler secret put ALLOWED_EMAILS`                                       |
| ログを見る          | `npx wrangler tail` またはダッシュボードの Observability                       |
| 全トークンを無効化  | KV `OAUTH_KV` の中身を削除（全クライアントが再認可になる）                     |
| Cookie 署名鍵を更新 | `COOKIE_ENCRYPTION_KEY` を再登録（記憶済みの同意が消え、次回は同意画面が出る） |

## トラブルシュート

| 症状                                                   | 確認すること                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Google で `redirect_uri_mismatch`                      | 手順5のリダイレクト URI と、実際の URL（http/https、サブドメイン）が完全一致しているか       |
| `/callback` で `access_denied`                         | ログインしたメールアドレスが `ALLOWED_EMAILS` に入っているか（大文字小文字は区別しない）     |
| 「This authorization was not started in this browser」 | 同意画面を開いたのと同じブラウザで最後まで進めたか。10分以上かかると期限切れになる           |
| claude.ai で接続できない                               | `/.well-known/oauth-protected-resource/mcp` の `resource` が `MCP_RESOURCE` と一致しているか |
