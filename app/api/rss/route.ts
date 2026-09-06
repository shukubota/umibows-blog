import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fetchFeed } from "@/lib/rss/fetch";
import { childLogger } from "@/lib/agent/logger";
import type { FeedErrorCode } from "@/lib/rss/types";

// ユーザー入力の URL を都度取得するため、キャッシュせず常に実行する
export const dynamic = "force-dynamic";

const log = childLogger({ feature: "rss-viewer" });

const RequestBody = z.object({ url: z.string().min(1).max(2048) });

const STATUS_BY_ERROR: Record<FeedErrorCode, number> = {
  invalid_url: 400,
  blocked_host: 400,
  not_feed: 415,
  too_large: 413,
  upstream_error: 502,
  fetch_failed: 502,
  timeout: 504,
};

/** ログにはホスト名だけを残す（URL 全体はパスにトークンを含むことがある） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(invalid)";
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_url", message: "リクエストの形式が正しくありません" },
      { status: 400 }
    );
  }

  const parsed = RequestBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_url", message: "フィードの URL を指定してください" },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  const result = await fetchFeed(parsed.data.url);
  const elapsedMs = Date.now() - startedAt;
  const host = hostOf(parsed.data.url);

  if (!result.ok) {
    log.warn({ host, elapsedMs, error: result.error }, "rss fetch failed");
    return NextResponse.json(result, { status: STATUS_BY_ERROR[result.error] });
  }

  log.info(
    { host, elapsedMs, format: result.feed.format, items: result.feed.items.length },
    "rss fetch ok"
  );
  return NextResponse.json(result);
}
