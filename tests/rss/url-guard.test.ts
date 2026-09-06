import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const lookup = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({ lookup }));

import { checkFeedUrl, isBlockedAddress } from "@/lib/rss/url-guard";

/** 名前解決はテスト対象外なので、公開 IP を返すスタブに差し替える */
function resolvesTo(address: string, family = 4) {
  lookup.mockResolvedValue([{ address, family }]);
}

describe("isBlockedAddress", () => {
  it.each([
    ["127.0.0.1", 4],
    ["10.1.2.3", 4],
    ["172.16.0.1", 4],
    ["172.31.255.255", 4],
    ["192.168.1.1", 4],
    ["169.254.169.254", 4],
    ["100.64.0.1", 4],
    ["0.0.0.0", 4],
    ["192.0.0.1", 4],
    ["198.18.0.1", 4],
    ["224.0.0.1", 4],
    ["255.255.255.255", 4],
    ["::1", 6],
    ["::", 6],
    ["fc00::1", 6],
    ["fd12:3456::1", 6],
    ["fe80::1", 6],
    ["ff02::1", 6],
    ["::ffff:127.0.0.1", 6],
    ["fe80::1%eth0", 6],
  ])("%s は拒否する", (address, family) => {
    expect(isBlockedAddress(address, family)).toBe(true);
  });

  it.each([
    ["93.184.216.34", 4],
    ["8.8.8.8", 4],
    ["172.32.0.1", 4],
    ["100.63.255.255", 4],
    ["2606:2800:220:1:248:1893:25c8:1946", 6],
  ])("%s は許可する", (address, family) => {
    expect(isBlockedAddress(address, family)).toBe(false);
  });
});

describe("checkFeedUrl", () => {
  beforeEach(() => {
    resolvesTo("93.184.216.34");
  });

  afterEach(() => {
    lookup.mockReset();
  });

  it("公開ホストの https URL は通す", async () => {
    const result = await checkFeedUrl("  https://example.com/feed.xml  ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url.toString()).toBe("https://example.com/feed.xml");
  });

  it.each([
    ["空文字", "   "],
    ["URL でない", "not a url"],
    ["file スキーム", "file:///etc/passwd"],
    ["data スキーム", "data:text/xml,<rss/>"],
    ["gopher スキーム", "gopher://example.com/"],
  ])("%s は invalid_url", async (_label, input) => {
    const result = await checkFeedUrl(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_url");
  });

  it.each([
    ["localhost", "http://localhost/feed.xml"],
    [".local", "http://nas.local/feed.xml"],
    [".internal", "http://metadata.google.internal/feed.xml"],
  ])("%s は名前解決せずに blocked_host", async (_label, input) => {
    const result = await checkFeedUrl(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("blocked_host");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("許可していないポートは blocked_host", async () => {
    const result = await checkFeedUrl("http://example.com:22/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("blocked_host");
  });

  it.each(["80", "443", "8080", "8443"])("ポート %s は許可する", async (port) => {
    const result = await checkFeedUrl(`http://example.com:${port}/feed.xml`);

    expect(result.ok).toBe(true);
  });

  it("内部 IP を返す DNS レコードは blocked_host", async () => {
    resolvesTo("127.0.0.1");
    const result = await checkFeedUrl("http://evil.example.com/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("blocked_host");
  });

  it("数値表記の IP も名前解決結果で拒否する", async () => {
    // getaddrinfo は 2130706433 を 127.0.0.1 として解決する
    resolvesTo("127.0.0.1");
    const result = await checkFeedUrl("http://2130706433/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("blocked_host");
  });

  it("公開 IP と内部 IP が混在したら拒否する", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.0.10", family: 4 },
    ]);
    const result = await checkFeedUrl("http://mixed.example.com/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("blocked_host");
  });

  it("名前解決に失敗したら fetch_failed", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    const result = await checkFeedUrl("https://missing.example.com/feed.xml");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("fetch_failed");
  });
});
