# LIFF Dev Playground

LINE Front-end Framework (LIFF) の動作確認用ページ。
LIFF SDKの初期化、プロフィール取得、各種クライアントAPIをブラウザ／LINEアプリの両方から検証できる。

## ファイル構成

- `app/liff/page.tsx` — Playground本体（Client Component）
- `.env.local` の `NEXT_PUBLIC_LIFF_ID` — 使用するLIFF ID

## LIFF ID 一覧

実IDは [LINE Developers コンソール](https://developers.line.biz/console/) を参照（プロバイダー > 該当チャネル > 「ウェブアプリ設定」タブ）。

| 環境 | 用途 | 公開可否 |
|---|---|---|
| 開発用 | ローカル/ngrok/preview deploy で動作確認 | 非公開（テスター登録された開発者のみアクセス可） |
| 審査用 | LINE Mini App 審査時に使用 | 非公開 |
| 本番用 | ユーザー向け公開 | 公開可 |

LINE Developers コンソールの各LIFFアプリの「エンドポイントURL」に、後述の公開URLを設定する。

## ローカルでの確認方法

### 1. ブラウザでそのまま開く（最速）

```bash
npm run dev
# http://localhost:3000/liff を開く
```

- `liff.init()`、`liff.login()`（LINEログイン画面に飛んで戻ってくる）、`getProfile()`、`getIDToken()` は動く
- `isInClient()` は `false` を返す
- `sendMessages()` / `scanCodeV2()` / `closeWindow()` 等の**LINEクライアント専用API**は動かない（Playground上でも「利用不可」と表示）

### 2. LINEアプリ内で開きたい場合

LIFF URL（`https://miniapp.line.me/...`）は、LINE Developers に登録した**公開エンドポイントURL**を読み込むので、ローカルを公開する必要がある。
`localhost` はLINEサーバーから到達できないため、そのままでは404になる。

## LINEアプリ内検証のための公開方法

### A. ngrok でローカルをHTTPS公開（開発中のイテレーション向け）

```bash
# 別ターミナルで
npm run dev                                # http://localhost:3000
ngrok http 3000                            # https://<random>.ngrok-free.app を発行
```

1. ngrokが発行した `https://xxxx.ngrok-free.app/liff` をコピー
2. [LINE Developers コンソール](https://developers.line.biz/console/) → **開発用LIFFアプリ** → **エンドポイントURL** に貼り付けて保存
3. スマホのLINEで `https://miniapp.line.me/<開発用LIFF ID>` をトークに送信 → タップして開く

メリット: コード保存でHMRが効く。LINE内でリロードすれば即反映。
デメリット: ngrokを起動し直すたびにURLが変わる（無料プラン）→ 都度コンソール更新が必要。
固定したい場合は ngrok 有料プラン or `cloudflared tunnel` を検討。

### B. Vercel preview deploy（PR/コミット単位の確認向け）

```bash
git push                                   # 自動でpreview deploy
# または
vercel deploy
```

1. 発行されたpreview URL（例 `https://umibows-blog-git-feat-liff-shukubotas-projects.vercel.app/liff`）をコピー
2. 同じく LINE Developers コンソール → **開発用LIFFエンドポイントURL** に設定
3. LIFF URL をスマホLINEで開く

メリット: URLが安定（ブランチ単位で固定）、HMR不要なときの正規確認に向く。
デメリット: コード変更のたびにdeploy待ち。
本リポは既にBASIC認証がmiddlewareで掛かっているため、LIFF用パスは認証除外設定が必要になる可能性あり（`middleware.ts` を確認）。

## .env.local

```bash
# 開発用LIFF IDをセット（実IDはLINE Developersコンソールから取得）
NEXT_PUBLIC_LIFF_ID="<開発用LIFF ID>"
```

`NEXT_PUBLIC_` プレフィックスでクライアント側に露出する。LIFF IDは公開情報なので問題なし。

## デバッグTips

- **`liff.init failed: INVALID_ARGUMENT`** — LIFF IDが間違っている、または該当LIFFアプリのエンドポイントURLがHTTPSになっていない
- **LINEで開いたが真っ白** — LINE Developers側のエンドポイントURLが古いキャッシュを指している。LINE Developersの設定保存後、LINEアプリのキャッシュをクリアするか、別端末で開く
- **`liff.login()` 後ループする** — エンドポイントURLとリダイレクト先のオリジンが一致していない。preview deployの場合、URLが変わるたびに更新が必要
- **`isApiAvailable("xxx")` が false** — LIFFアプリのスコープ設定（profile/openid等）またはLINE Loginチャネルの権限を確認
