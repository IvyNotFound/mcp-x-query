/**
 * Simple in-memory TTL cache.
 *
 * Designed for tool-level caching of stable, read-heavy data such as
 * trending topics and user profiles.  Entries expire lazily on the next
 * read after ttlMs milliseconds — no background sweep is required.
 *
 * Usage:
 *   const cache = new TtlCache<string, MyType>(5 * 60_000); // 5 min TTL
 *   const hit = cache.get(key);
 *   if (!hit) { const value = await fetch(); cache.set(key, value); }
 */
export class TtlCache<K, V> {
  private readonly store = new Map<K, { value: V; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Remove all entries. Useful in tests to prevent cross-test cache hits. */
  clear(): void {
    this.store.clear();
  }
}
