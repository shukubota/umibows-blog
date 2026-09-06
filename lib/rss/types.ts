export interface FeedItem {
  /** guid / atom:id / link のいずれか。無ければ index ベースの合成 ID */
  id: string;
  title: string;
  link?: string;
  /** ISO 8601 に正規化した公開日時。パースできなければ undefined */
  publishedAt?: string;
  author?: string;
  /** タグを除去したプレーンテキスト（最大 400 文字） */
  summary?: string;
}

export interface Feed {
  title: string;
  siteUrl?: string;
  description?: string;
  format: "rss" | "atom";
  items: FeedItem[];
}

export type FeedErrorCode =
  | "invalid_url" // URL 形式でない / http(s) 以外
  | "blocked_host" // プライベート IP / localhost など
  | "fetch_failed" // DNS 失敗・接続失敗
  | "upstream_error" // 上流が 4xx/5xx
  | "timeout" // 取得がタイムアウト
  | "too_large" // 本文が上限超過
  | "not_feed"; // XML だがフィードとして解釈できない

export type FetchFeedResult =
  { ok: true; feed: Feed } | { ok: false; error: FeedErrorCode; message: string };

/** フィード取得・パースの制約値（仕様: docs/rss-viewer/specification.md） */
export const FEED_LIMITS = {
  timeoutMs: 8_000,
  maxBytes: 5 * 1024 * 1024,
  maxRedirects: 3,
  maxItems: 200,
  summaryLength: 400,
} as const;
