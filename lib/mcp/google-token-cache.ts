/**
 * Google OAuth tokeninfo のキャッシュ
 *
 * tokeninfo はリクエストごとに叩くと Google 側のレート制限に触れ、
 * かつレイテンシが上がる。アクセストークンをキーに
 * TTL = min(exp - now, 300秒) の in-memory キャッシュで緩和する。
 *
 * Vercel Fluid Compute はインスタンスを再利用するため実効性がある。
 * インスタンス間では共有されないが、その場合は最悪 tokeninfo を再度叩くだけなので許容。
 */

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/** エントリ上限 — unbounded growth 防止 */
const MAX_CACHE_SIZE = 500;
/** tokeninfo 結果の最大キャッシュ時間（秒）*/
const MAX_TTL_SEC = 300;

interface CacheEntry {
  authInfo: AuthInfo;
  /** Date.now() ベースの有効期限 (ms) */
  expiresAtMs: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedToken(token: string): AuthInfo | undefined {
  const entry = cache.get(token);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAtMs) {
    cache.delete(token);
    return undefined;
  }
  return entry.authInfo;
}

export function setCachedToken(token: string, authInfo: AuthInfo): void {
  // サイズ超過時は最古エントリを 1 つ削除（Map は挿入順）
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }

  const nowSec = Date.now() / 1000;
  const ttlSec = authInfo.expiresAt
    ? Math.min(authInfo.expiresAt - nowSec, MAX_TTL_SEC)
    : MAX_TTL_SEC;

  cache.set(token, {
    authInfo,
    expiresAtMs: Date.now() + Math.max(ttlSec, 0) * 1000,
  });
}
