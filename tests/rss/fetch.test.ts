import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const lookup = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({ lookup }));

import { fetchFeed } from "@/lib/rss/fetch";

const FEED_XML = `<?xml version="1.0"?><rss version="2.0"><channel>
<title>Example</title><link>https://example.com</link>
<item><title>記事</title><link>https://example.com/1</link></item>
</channel></rss>`;

function xmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/rss+xml" },
    ...init,
  });
}

function redirectTo(location: string, status = 302): Response {
  // Response.redirect は body を持てないため手動で組む
  return new Response(null, { status, headers: { location } });
}

const fetchMock = vi.fn();

describe("fetchFeed", () => {
  beforeEach(() => {
    // 既定は「公開 IP に解決するホスト」。内部 IP を返したいテストで上書きする
    lookup.mockImplementation(async (hostname: string) =>
      hostname === "internal.example.com"
        ? [{ address: "127.0.0.1", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }]
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    lookup.mockReset();
    vi.unstubAllGlobals();
  });

  it("フィードを取得してパースする", async () => {
    fetchMock.mockResolvedValue(xmlResponse(FEED_XML));

    const result = await fetchFeed("https://example.com/feed.xml");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.items[0].title).toBe("記事");

    const [, init] = fetchMock.mock.calls[0];
    // リダイレクトは自前で追う / 認証情報は転送しない
    expect(init.redirect).toBe("manual");
    expect(Object.keys(init.headers)).toEqual(["accept", "user-agent"]);
  });

  it("URL 検証で弾かれたら fetch せずに返す", async () => {
    const result = await fetchFeed("file:///etc/passwd");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_url");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("リダイレクトを追い、相対 Location も解決する", async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo("/feed/v2.xml", 301))
      .mockResolvedValueOnce(xmlResponse(FEED_XML));

    const result = await fetchFeed("https://example.com/feed.xml");

    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[1][0].toString()).toBe("https://example.com/feed/v2.xml");
  });

  it("内部 IP へのリダイレクトは blocked_host で止める", async () => {
    fetchMock.mockResolvedValueOnce(redirectTo("http://internal.example.com/feed.xml"));

    const result = await fetchFeed("https://example.com/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("blocked_host");
    // リダイレクト先は取得しない
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("リダイレクトが多すぎたら打ち切る", async () => {
    fetchMock.mockResolvedValue(redirectTo("https://example.com/loop.xml"));

    const result = await fetchFeed("https://example.com/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("upstream_error");
    expect(fetchMock).toHaveBeenCalledTimes(4); // 初回 + 最大 3 ホップ
  });

  it("Location の無いリダイレクトは upstream_error", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302 }));

    const result = await fetchFeed("https://example.com/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("upstream_error");
  });

  it("上流が 4xx/5xx なら upstream_error", async () => {
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));

    const result = await fetchFeed("https://example.com/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("upstream_error");
    expect(result.message).toContain("404");
  });

  it("Content-Length が上限超過なら too_large", async () => {
    fetchMock.mockResolvedValue(
      xmlResponse(FEED_XML, { headers: { "content-length": String(6 * 1024 * 1024) } })
    );

    const result = await fetchFeed("https://example.com/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("too_large");
  });

  it("Content-Length が無くても本文が上限を超えたら too_large", async () => {
    const huge = `<?xml version="1.0"?><rss><channel><title>${"あ".repeat(2 * 1024 * 1024)}</title></channel></rss>`;
    fetchMock.mockResolvedValue(new Response(huge, { status: 200 }));

    const result = await fetchFeed("https://example.com/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("too_large");
  });

  it("フィードでない本文は not_feed", async () => {
    fetchMock.mockResolvedValue(new Response("<html><body>hi</body></html>", { status: 200 }));

    const result = await fetchFeed("https://example.com/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("not_feed");
  });

  it("8 秒を過ぎたら timeout", async () => {
    // signal の abort を待つだけの fetch を置き、タイマーを進めてタイムアウトさせる
    fetchMock.mockImplementation(
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError"))
          );
        })
    );
    vi.useFakeTimers();

    try {
      const pending = fetchFeed("https://example.com/feed.xml");
      await vi.advanceTimersByTimeAsync(8_000);
      const result = await pending;

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });
});
