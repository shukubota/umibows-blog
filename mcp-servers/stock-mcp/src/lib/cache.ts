type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }
  const value = await loader();
  store.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
  return value;
}

export function invalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
