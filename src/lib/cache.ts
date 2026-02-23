import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

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
  protected readonly store = new Map<K, { value: V; expiresAt: number }>();

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

/**
 * TTL cache backed by a JSON file so entries survive process restarts.
 *
 * The file is loaded lazily on first construction and written synchronously
 * after every `set()` call.  File I/O failures are silently ignored so that a
 * read-only filesystem or missing directory never crashes the server — the
 * cache simply degrades to in-memory only.
 *
 * Only string keys are supported (JSON object key constraint).
 *
 * Usage:
 *   const cache = new PersistentTtlCache<MyType>(5 * 60_000, "/tmp/my-cache.json");
 */
export class PersistentTtlCache<V> extends TtlCache<string, V> {
  constructor(ttlMs: number, private readonly filePath: string) {
    super(ttlMs);
    this.loadFromFile();
  }

  /** Hydrate in-memory store from the JSON file, skipping expired entries. */
  private loadFromFile(): void {
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const stored = JSON.parse(raw) as Record<string, { value: V; expiresAt: number }>;
      const now = Date.now();
      for (const [key, entry] of Object.entries(stored)) {
        if (entry.expiresAt > now) {
          // Hydrate with the original expiresAt so TTL is not reset.
          this.store.set(key, entry);
        }
      }
    } catch {
      // File absent or corrupted — start with an empty in-memory store.
    }
  }

  /** Persist the current in-memory store to disk. Silently ignores I/O errors. */
  private saveToFile(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const obj: Record<string, { value: V; expiresAt: number }> = {};
      for (const [key, entry] of this.store.entries()) {
        obj[key] = entry;
      }
      writeFileSync(this.filePath, JSON.stringify(obj), "utf-8");
    } catch {
      // Non-fatal — in-memory cache is still functional.
    }
  }

  override set(key: string, value: V): void {
    super.set(key, value);
    this.saveToFile();
  }

  override clear(): void {
    super.clear();
    try {
      unlinkSync(this.filePath);
    } catch {
      // File may not exist yet — ignore.
    }
  }
}
