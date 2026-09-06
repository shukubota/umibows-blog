import { lookup } from "node:dns/promises";
import type { FeedErrorCode } from "./types";

export type UrlGuardResult =
  | { ok: true; url: URL }
  | {
      ok: false;
      error: Extract<FeedErrorCode, "invalid_url" | "blocked_host" | "fetch_failed">;
      message: string;
    };

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_PORTS = new Set(["80", "443", "8080", "8443"]);

/** ホスト名だけで弾けるもの。数値表記の IP は名前解決結果で判定する */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function defaultPort(protocol: string): string {
  return protocol === "https:" ? "443" : "80";
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    // IPv4 として読めない値は安全側に倒して拒否する
    return true;
  }
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, メタデータ含む)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0 && octets[2] === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmarking)
  if (a >= 224) return true; // 224.0.0.0/4 以上（multicast / reserved / broadcast）
  return false;
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]; // zone index を落とす

  // IPv4-mapped (::ffff:127.0.0.1) / IPv4-compatible は IPv4 として再判定する
  const mapped = normalized.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  if (normalized === "::" || normalized === "::1") return true; // unspecified / loopback

  const head = normalized.split(":")[0];
  const group = parseInt(head, 16);
  if (!Number.isNaN(group)) {
    if ((group & 0xfe00) === 0xfc00) return true; // fc00::/7 (unique local)
    if ((group & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
    if ((group & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  }
  return false;
}

export function isBlockedAddress(address: string, family: number): boolean {
  return family === 6 ? isBlockedIpv6(address) : isBlockedIpv4(address);
}

/**
 * ユーザー入力の URL をサーバから取得してよいか検証する。
 *
 * 任意 URL を取得する機能は SSRF の入口になるため、スキーム / ポート / ホスト名に加えて
 * **名前解決した全アドレス**を検査する（`http://2130706433/` のような数値表記や、
 * 内部 IP を返す DNS レコードを弾くため）。リダイレクト先も毎ホップこの関数を通す。
 */
export async function checkFeedUrl(input: string): Promise<UrlGuardResult> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "invalid_url", message: "フィードの URL を入力してください" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "invalid_url", message: "URL の形式が正しくありません" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return {
      ok: false,
      error: "invalid_url",
      message: "http:// または https:// で始まる URL を指定してください",
    };
  }

  const port = url.port || defaultPort(url.protocol);
  if (!ALLOWED_PORTS.has(port)) {
    return { ok: false, error: "blocked_host", message: `このポートは指定できません: ${port}` };
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (!hostname) {
    return { ok: false, error: "invalid_url", message: "ホスト名が指定されていません" };
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return {
      ok: false,
      error: "blocked_host",
      message: "外部に公開されたフィード URL を指定してください",
    };
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, error: "fetch_failed", message: "ホスト名を解決できませんでした" };
  }
  if (addresses.length === 0) {
    return { ok: false, error: "fetch_failed", message: "ホスト名を解決できませんでした" };
  }
  if (addresses.some((a) => isBlockedAddress(a.address, a.family))) {
    return {
      ok: false,
      error: "blocked_host",
      message: "外部に公開されたフィード URL を指定してください",
    };
  }

  return { ok: true, url };
}
