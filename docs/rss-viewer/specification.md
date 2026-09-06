# RSS Viewer 仕様書

## 概要

XML (RSS 2.0 / Atom) のフィード URL を入力欄に貼り付けると、その場でフィードをパースして
記事一覧を描画するビューア。ブログ一覧 (`/`) に "RSS Viewer" として追加する。

購読管理やサーバ側の永続化は行わず、「URL を入れて中身を見る」ことに機能を絞る。

## 目的・ユースケース

- 気になったブログの RSS URL を貼って、最新記事のタイトル・日付・概要をざっと眺める
- 自分のサイトの `feed.xml` が正しく生成できているかを目視確認する（デバッグ用途）
- 複数フィードを切り替えながら、更新の有無を確認する

## 非目的

- 購読リストのサーバ側管理（ユーザー登録 / DB は持たない。履歴は localStorage のみ）
- 既読/未読管理、スター、タグ付けなどのリーダー機能
- 定期ポーリングによる新着通知
- OPML のインポート/エクスポート（将来拡張として後述）
- 記事本文の全文取得（フィードに含まれる範囲のみ表示する）

## 全体構成

ブラウザから外部フィードを直接 `fetch` すると CORS で失敗するため、
**同一オリジンの API Route を薄いプロキシ + パーサとして置く**。

```
┌────────────────────────┐  POST /api/rss   ┌────────────────────────┐
│ /rss-viewer (RssViewer)│ ───────────────► │ app/api/rss/route.ts   │
│  - URL 入力            │ ◄─────────────── │  - URL 検証 (SSRF 対策) │
│  - 記事一覧描画        │   Feed (JSON)    │  - fetch (timeout/上限) │
└────────────────────────┘                  │  - XML → Feed へ正規化  │
                                            └───────────┬────────────┘
                                                        │ HTTPS GET
                                                        ▼
                                             ┌────────────────────┐
                                             │ 外部フィード       │
                                             │ (RSS 2.0 / Atom)   │
                                             └────────────────────┘
```

- パースは **サーバ側** で行い、クライアントには正規化済み JSON だけを返す
  （RSS 2.0 と Atom の差異を UI に持ち込まない / XML 文字列を DOM に流さない）
- Route Handler は `runtime = "nodejs"`（既定）・キャッシュ無効 (`dynamic = "force-dynamic"`)
- 型・制約値は `lib/rss/types.ts` に置き、API とクライアントで共有する
  （`FEED_LIMITS` にタイムアウト・サイズ上限・件数上限をまとめる）

## ディレクトリ構成

```
/app/rss-viewer/
├── page.tsx                  # メタデータ + 見出し (Server Component)
└── components/
    ├── RssViewer.tsx         # 状態管理 (idle / loading / success / error)
    ├── FeedUrlInput.tsx      # URL 入力フォーム + 読み込みボタン
    ├── RecentFeeds.tsx       # 最近見た URL (localStorage)
    ├── FeedHeader.tsx        # フィードのタイトル / サイトリンク / 件数
    ├── FeedItemList.tsx      # 記事一覧
    └── FeedItemCard.tsx      # 記事 1 件

/app/api/rss/
└── route.ts                  # 入力検証 + ロギング（取得本体は lib/rss へ委譲）

/lib/rss/
├── types.ts                  # Feed / FeedItem / エラーコード / 制約値
├── url-guard.ts              # 取得先 URL の検証（SSRF 対策）
├── fetch.ts                  # 取得（timeout / サイズ上限 / リダイレクト追跡）
└── parse.ts                  # XML → Feed の正規化（RSS 2.0 / RDF / Atom）

/tests/rss/
├── url-guard.test.ts         # プライベート IP / スキーム / ポートの拒否
├── fetch.test.ts             # リダイレクト再検証 / サイズ上限 / タイムアウト
└── parse.test.ts             # RSS 2.0 / RDF / Atom / フィードでない入力
```

## 画面仕様

### レイアウト

```
┌────────────────────────────────────────────────┐
│ RSS Viewer                          ← Blog List│
├────────────────────────────────────────────────┤
│ Feed URL                                       │
│ [https://example.com/feed.xml        ] [読込]  │
│ 最近: [example.com/feed.xml] [zenn.dev/feed]   │
├────────────────────────────────────────────────┤
│ Example Blog                        18 件      │
│ https://example.com                            │
├────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────┐ │
│ │ 記事タイトル (リンク)                      │ │
│ │ 2026-09-01 · author                        │ │
│ │ 概要テキスト（3 行でクランプ）…             │ │
│ └────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────┐ │
│ │ …                                          │ │
└────────────────────────────────────────────────┘
```

### 状態遷移

| 状態      | 表示                                                           |
| --------- | -------------------------------------------------------------- |
| `idle`    | 入力欄のみ。使い方の一文 + サンプル URL ボタン                 |
| `loading` | 読込ボタンを disabled にし、スケルトンカードを 3 枚表示        |
| `success` | フィードヘッダ + 記事一覧                                      |
| `error`   | 赤系のエラーバナー（原因別メッセージ）。直前の結果は保持しない |

### インタラクション

1. URL を入力して「読込」または Enter で取得開始
2. 取得中は AbortController で連打をキャンセル（最後の入力が勝つ）
3. 記事タイトルは `target="_blank" rel="noopener noreferrer"` で別タブ
4. 成功した URL は localStorage (`rss-viewer:recent`, 最大 5 件) に保存し、
   チップとして再読込できる
5. ダークテーマ前提（既存アプリと同じ Tailwind の `dark:` クラス運用）

## データ型定義

```typescript
// app/rss-viewer/lib/types.ts
export interface FeedItem {
  id: string; // guid / atom:id / link のいずれか。無ければ index ベース
  title: string;
  link?: string;
  publishedAt?: string; // ISO 8601 に正規化。パース不能なら undefined
  author?: string;
  summary?: string; // タグを除去したプレーンテキスト（最大 400 文字）
}

export interface Feed {
  title: string;
  siteUrl?: string;
  description?: string;
  format: "rss" | "atom";
  items: FeedItem[];
}

export type FetchFeedResult =
  { ok: true; feed: Feed } | { ok: false; error: FeedErrorCode; message: string };

export type FeedErrorCode =
  | "invalid_url" // URL 形式でない / http(s) 以外
  | "blocked_host" // プライベート IP / localhost など
  | "fetch_failed" // DNS 失敗・接続失敗
  | "upstream_error" // 上流が 4xx/5xx
  | "timeout" // 8 秒超過
  | "too_large" // 5MB 超過
  | "not_feed"; // XML だがフィードとして解釈できない
```

## API 仕様

### `POST /api/rss`

GET のクエリ文字列だとフィード URL のエスケープが煩雑になるため POST を採用。
副作用は無く、キャッシュもしない。

リクエスト:

```json
{ "url": "https://example.com/feed.xml" }
```

レスポンス (200):

```json
{
  "ok": true,
  "feed": {
    "title": "Example Blog",
    "siteUrl": "https://example.com",
    "description": "...",
    "format": "rss",
    "items": [
      {
        "id": "https://example.com/posts/1",
        "title": "はじめての記事",
        "link": "https://example.com/posts/1",
        "publishedAt": "2026-09-01T00:00:00.000Z",
        "author": "umibows",
        "summary": "..."
      }
    ]
  }
}
```

レスポンス (エラー):

| HTTP | `error`                           | 契機                       |
| ---- | --------------------------------- | -------------------------- |
| 400  | `invalid_url` / `blocked_host`    | 入力検証で拒否             |
| 415  | `not_feed`                        | フィードとして解釈できない |
| 502  | `upstream_error` / `fetch_failed` | 上流が異常                 |
| 504  | `timeout`                         | 8 秒でタイムアウト         |
| 413  | `too_large`                       | 本文が 5MB 超              |

```json
{ "ok": false, "error": "timeout", "message": "フィードの取得がタイムアウトしました" }
```

### 取得時の制約

- メソッド: `GET` のみ。`Accept: application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8`
- `User-Agent: umibows-blog RSS Viewer`
- タイムアウト: 8 秒（`AbortController`）
- 本文サイズ上限: 5MB。`Content-Length` で事前判定し、無い場合はストリームを読みながら打ち切る
- リダイレクト: `redirect: "manual"` とし、`Location` を再検証したうえで**最大 3 回**まで自前で追う
  （リダイレクト先がプライベート IP になる SSRF を防ぐため）
- `Content-Type` は検証に使うが厳格には見ない（`text/html` を返すサーバも多いため、
  中身が XML としてパースできれば受け入れる）

## パース仕様

`/lib/rss/parse.ts` で XML 文字列を `Feed` に正規化する。

### 対応フォーマット

| フォーマット | 判定                 | フィード要素 | 記事要素 |
| ------------ | -------------------- | ------------ | -------- |
| RSS 2.0      | ルートに `<rss>`     | `channel`    | `item`   |
| RDF (RSS1.0) | ルートに `<rdf:RDF>` | `channel`    | `item`   |
| Atom         | ルートに `<feed>`    | `feed`       | `entry`  |

### フィールドマッピング

| `Feed`/`FeedItem` | RSS 2.0 / RDF                          | Atom                                             |
| ----------------- | -------------------------------------- | ------------------------------------------------ |
| `title`           | `channel/title`, `item/title`          | `feed/title`, `entry/title`                      |
| `siteUrl`         | `channel/link`                         | `feed/link[rel=alternate]@href`                  |
| `description`     | `channel/description`                  | `feed/subtitle`                                  |
| `link`            | `item/link`                            | `entry/link[rel=alternate]@href`（無ければ先頭） |
| `publishedAt`     | `item/pubDate` → `dc:date`             | `entry/published` → `entry/updated`              |
| `author`          | `item/author` → `dc:creator`           | `entry/author/name`                              |
| `summary`         | `item/description` → `content:encoded` | `entry/summary` → `entry/content`                |
| `id`              | `item/guid` → `link`                   | `entry/id` → `link`                              |

### 正規化ルール

- CDATA は展開する
- `summary` は **HTML タグを除去**してプレーンテキスト化し、空白を畳んで 400 文字で切る
  （HTML をそのまま描画しない = サニタイズ実装を持たずに XSS を回避する）
- `publishedAt` は `Date` でパースして ISO 8601 に統一。失敗したら `undefined`
- `link` は取得元 URL を base にした絶対 URL へ解決し、`http(s)` 以外なら破棄
- 記事は元の順序を保つ（フィードの並び順を尊重し、日付でのソートはしない）
- 記事数の上限は 200 件。超過分は切り捨てる
- 記事が 0 件でもフィードとしては成功扱い（「記事がありません」を表示）

### XML パーサ

`fast-xml-parser`（依存 0・軽量）を採用する。

- `ignoreAttributes: false` / `attributeNamePrefix: "@_"`（Atom の `link@href` を読むため）
- `processEntities: true`（`&amp;` などの実体参照を展開）
- 名前空間プレフィックスは付いたまま扱う（`dc:creator`, `content:encoded` をキーとして参照）
- **DTD / 外部エンティティは解釈しない**（XXE 対策。`fast-xml-parser` は既定で解釈しない）
- `stopNodes` に指定した要素（`description` / `content:encoded` / `summary` / `content`）は
  中身をパースせず生文字列として受け取る。エスケープ漏れの HTML でフィード全体の
  パースが失敗するのを避けるため。この中身は XML の実体参照が未展開なので、
  「XML 層を展開 → タグ除去 → HTML 層を展開」の 2 段で素のテキストへ落とす
- パースは**寛容**にする。閉じタグが欠けたフィードは読める範囲で復帰させ、
  `not_feed` は「ルートに `rss` / `rdf:RDF` / `feed` が無い」場合に限る
  （現実のフィードは細かく壊れていることが多いため、厳密な検証はしない）

> 代替案: 依存を増やさず正規表現で `<item>` を切り出す実装も可能だが、
> 名前空間・属性・実体参照の扱いで壊れやすく、XML パースを自作する価値は薄いと判断した。

## セキュリティ

任意の URL をサーバから取得する = **SSRF の入口**になるため、`/lib/rss/url-guard.ts` で防ぐ。

| 観点               | 対策                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| スキーム           | `http:` / `https:` のみ許可（`file:`, `gopher:`, `data:` などを拒否）                                                                                                                                                                                         |
| 宛先ホスト         | `localhost` / `*.localhost` / `*.local` / `*.internal` / `*.home.arpa` は名前解決前に拒否。それ以外は数値・短縮表記の IP を含めて名前解決し、プライベート・ループバック・リンクローカル・CGNAT・予約レンジを拒否（複数レコードのうち 1 つでも該当したら拒否） |
| クラウドメタデータ | `metadata.google.internal` / `metadata.goog` / `instance-data` を明示拒否（`169.254.0.0/16` は IP レンジ側でも拒否）                                                                                                                                          |
| ポート             | 80 / 443 / 8080 / 8443 のみ許可                                                                                                                                                                                                                               |
| リダイレクト       | 自前で追い、各ホップで上記検証を再実行（最大 3 ホップ）                                                                                                                                                                                                       |
| 認証情報の転送     | リクエストヘッダは自前で組み立て、Cookie / Authorization は一切転送しない                                                                                                                                                                                     |
| レスポンス         | XML を DOM へ流さず、タグ除去済みテキストのみ返す                                                                                                                                                                                                             |
| リソース枯渇       | 8 秒タイムアウト・5MB 上限・記事 200 件上限                                                                                                                                                                                                                   |

拒否レンジ（IPv4 / IPv6）:

```
10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16,
100.64.0.0/10, 0.0.0.0/8, 192.0.0.0/24, 198.18.0.0/15, 224.0.0.0/4,
::1/128, fc00::/7, fe80::/10, ::ffff:0:0/96 (IPv4-mapped は展開して再判定)
```

なお本サイトは `BASIC_AUTH_ENABLED` により Basic 認証で保護され得るが、
認証の有無に依らず上記検証は必ず通す。

## エラーハンドリング

- API は例外を漏らさず、必ず `{ ok: false, error, message }` を返す
- `message` は日本語のユーザー向け文言。スタックトレースや上流のレスポンス本文は返さない
- サーバ側では `lib/agent/logger.ts` (pino) と同じ流儀で、URL のホスト名のみをログに出す
- クライアントはエラーコードごとに次の行動を示す
  - `blocked_host`: 「外部に公開されたフィード URL を指定してください」
  - `not_feed`: 「RSS / Atom フィードの XML ではないようです」
  - `timeout` / `upstream_error`: 「時間をおいて再試行してください」

## ブログ一覧への追加

`app/page.tsx` の `blogs` 配列末尾に追加する。

```typescript
{ id: "rss-viewer", title: "RSS Viewer", path: "/rss-viewer" },
```

## テスト

`vitest` で以下を検証する（`npm run test`）。

- `tests/rss/parse.test.ts`
  - RSS 2.0 の最小フィードをパースし、`title` / `items[0].link` / `publishedAt` が取れる
  - RDF (RSS 1.0) の `rdf:RDF` 直下の `item` と `dc:date` / `dc:creator` を読む
  - Atom の `link[rel=alternate]@href` 優先、`published` → `updated` のフォールバック
  - `description` の HTML タグが除去され、CDATA / エスケープ済み HTML が展開される
  - `<item>` が 0 件でも `ok` になる / `javascript:` リンクは破棄される
  - 記事 300 件のフィードが 200 件に切られ、順序が保たれる
  - 概要が 400 文字で切られる / フィードでない XML は `not_feed`
- `tests/rss/url-guard.test.ts`
  - `isBlockedAddress` の境界（`172.16.0.1` 拒否 / `172.32.0.1` 許可 など）
  - `file:` / `data:` / `gopher:` を `invalid_url`、`localhost` / `*.local` を `blocked_host`
  - 許可ポート 80/443/8080/8443 と、それ以外（`:22`）の拒否
  - DNS が内部 IP を返すホスト（DNS rebinding 相当）を `blocked_host`
- `tests/rss/fetch.test.ts`
  - Cookie / Authorization を送らず `redirect: "manual"` で取得している
  - 相対 `Location` を解決してリダイレクトを追い、内部 IP へのリダイレクトは止める
  - リダイレクト上限 3 / 上流 404 / `Content-Length` 超過 / 本文サイズ超過
  - 8 秒でのタイムアウト（フェイクタイマー）

## 実装ステップ

1. `fast-xml-parser` を追加（`yarn add fast-xml-parser`）
2. `lib/rss/types.ts`（型 + `FEED_LIMITS`）
3. `lib/rss/url-guard.ts` + テスト
4. `lib/rss/parse.ts` + テスト
5. `lib/rss/fetch.ts`（取得 → リダイレクト再検証 → パース）+ テスト
6. `app/api/rss/route.ts`（入力検証 → `fetchFeed` → ステータス割り当て → ロギング）
7. `app/rss-viewer/` の UI（入力 → 一覧描画 → エラー/ローディング）
8. `app/page.tsx` の一覧に RSS Viewer を追加
9. `npm run lint` / `npm run format` / `npm run test`

## 将来拡張

- 複数フィードの束ね表示（日付でマージしたタイムライン）
- OPML インポートによる一括読み込み
- サムネイル表示（`media:thumbnail` / `enclosure` / og:image）
- サーバ側の短時間キャッシュ（Vercel Runtime Cache で 5 分程度）
- 全文検索（取得済みフィードに対するクライアントサイド絞り込み）
