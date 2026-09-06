import { checkFeedUrl } from "./url-guard";
import { parseFeed } from "./parse";
import { FEED_LIMITS, type FetchFeedResult } from "./types";

const ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8";
const USER_AGENT = "umibows-blog RSS Viewer";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isRedirect(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

/** Content-Length を見つつ、無い場合もストリームを読みながら上限で打ち切る */
async function readBodyWithLimit(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > FEED_LIMITS.maxBytes) return null;

  if (!res.body) return "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const chunks: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > FEED_LIMITS.maxBytes) return null;
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
  chunks.push(decoder.decode());
  return chunks.join("");
}

/**
 * フィードを取得して `Feed` に正規化する。
 *
 * リダイレクトは `redirect: "manual"` で自前に追い、各ホップで `checkFeedUrl` を
 * 再実行する（最初の URL だけ検証しても、リダイレクト先を内部 IP にすれば
 * SSRF が成立してしまうため）。Cookie / Authorization は一切転送しない。
 */
export async function fetchFeed(input: string): Promise<FetchFeedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_LIMITS.timeoutMs);

  try {
    let target = input;

    for (let hop = 0; hop <= FEED_LIMITS.maxRedirects; hop++) {
      const guard = await checkFeedUrl(target);
      if (!guard.ok) return { ok: false, error: guard.error, message: guard.message };

      let res: Response;
      try {
        res = await fetch(guard.url, {
          method: "GET",
          headers: { accept: ACCEPT, "user-agent": USER_AGENT },
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          return { ok: false, error: "timeout", message: "フィードの取得がタイムアウトしました" };
        }
        return {
          ok: false,
          error: "fetch_failed",
          message: `フィードに接続できませんでした: ${err instanceof Error ? err.message : "unknown error"}`,
        };
      }

      if (isRedirect(res.status)) {
        const location = res.headers.get("location");
        if (!location) {
          return {
            ok: false,
            error: "upstream_error",
            message: `リダイレクト先が不明です (HTTP ${res.status})`,
          };
        }
        // 相対 Location にも対応するため、現在の URL を基準に解決する
        target = new URL(location, guard.url).toString();
        continue;
      }

      if (!res.ok) {
        return {
          ok: false,
          error: "upstream_error",
          message: `フィードの取得に失敗しました (HTTP ${res.status})`,
        };
      }

      const body = await readBodyWithLimit(res);
      if (body === null) {
        return {
          ok: false,
          error: "too_large",
          message: "フィードのサイズが大きすぎます (5MB 超)",
        };
      }

      const parsed = parseFeed(body, guard.url.toString());
      if (!parsed.ok) return parsed;
      return { ok: true, feed: parsed.feed };
    }

    return {
      ok: false,
      error: "upstream_error",
      message: "リダイレクトが多すぎます",
    };
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, error: "timeout", message: "フィードの取得がタイムアウトしました" };
    }
    return {
      ok: false,
      error: "fetch_failed",
      message: `フィードを取得できませんでした: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
