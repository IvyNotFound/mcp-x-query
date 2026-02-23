import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { TtlCache, PersistentTtlCache } from "../lib/cache.js";

describe("TtlCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for a missing key", () => {
    const cache = new TtlCache<string, number>(1000);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("returns the stored value before TTL expires", () => {
    const cache = new TtlCache<string, string>(5000);
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
  });

  it("returns undefined after TTL expires", () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string, string>(1000);
    cache.set("key", "value");

    vi.advanceTimersByTime(1001);

    expect(cache.get("key")).toBeUndefined();
  });

  it("does not expire before TTL", () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string, string>(1000);
    cache.set("key", "value");

    vi.advanceTimersByTime(999);

    expect(cache.get("key")).toBe("value");
  });

  it("clear() removes all entries", () => {
    const cache = new TtlCache<string, number>(5000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("overwriting a key resets its TTL", () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string, string>(1000);
    cache.set("key", "first");
    vi.advanceTimersByTime(800);
    cache.set("key", "second"); // reset TTL
    vi.advanceTimersByTime(800); // total 1600 ms from first set, but only 800 from second
    expect(cache.get("key")).toBe("second");
  });

  it("supports different key types", () => {
    const cache = new TtlCache<number, string>(5000);
    cache.set(42, "answer");
    expect(cache.get(42)).toBe("answer");
    expect(cache.get(0)).toBeUndefined();
  });
});

// ─── PersistentTtlCache ───────────────────────────────────────────────────────
describe("PersistentTtlCache", () => {
  let testFile: string;

  beforeEach(() => {
    testFile = join(tmpdir(), `mcp-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  });

  afterEach(() => {
    vi.useRealTimers();
    try { rmSync(testFile); } catch { /* file may not exist */ }
  });

  it("hydrates from an existing file on construction", () => {
    const cache1 = new PersistentTtlCache<string>(5000, testFile);
    cache1.set("key", "value");

    const cache2 = new PersistentTtlCache<string>(5000, testFile);
    expect(cache2.get("key")).toBe("value");
  });

  it("persists to disk after set()", () => {
    const cache = new PersistentTtlCache<number>(5000, testFile);
    cache.set("answer", 42);

    expect(existsSync(testFile)).toBe(true);
    const data = JSON.parse(readFileSync(testFile, "utf-8")) as Record<string, { value: number }>;
    expect(data["answer"].value).toBe(42);
  });

  it("clear() removes the file", () => {
    const cache = new PersistentTtlCache<string>(5000, testFile);
    cache.set("key", "value");
    expect(existsSync(testFile)).toBe(true);

    cache.clear();
    expect(existsSync(testFile)).toBe(false);
  });

  it("fails silently when directory is inaccessible (degrades to in-memory)", () => {
    // Use a file as a "directory" parent so mkdirSync fails with ENOTDIR
    const blockingFile = join(tmpdir(), `mcp-blocking-${Date.now()}.json`);
    writeFileSync(blockingFile, "{}");
    const inaccessiblePath = join(blockingFile, "subdir", "cache.json");

    const cache = new PersistentTtlCache<string>(5000, inaccessiblePath);
    expect(() => cache.set("key", "value")).not.toThrow();
    expect(cache.get("key")).toBe("value"); // in-memory still works

    try { rmSync(blockingFile); } catch { /* cleanup */ }
  });

  it("respects original TTL after rehydration (does not reset expiry)", () => {
    vi.useFakeTimers();
    const cache1 = new PersistentTtlCache<string>(1000, testFile);
    cache1.set("key", "value"); // expiresAt = now + 1000

    vi.advanceTimersByTime(500); // t = +500ms — still valid
    const cache2 = new PersistentTtlCache<string>(1000, testFile);
    expect(cache2.get("key")).toBe("value");

    vi.advanceTimersByTime(501); // t = +1001ms — past original TTL
    expect(cache2.get("key")).toBeUndefined();
  });

  it("degrades to in-memory when file contains invalid JSON", () => {
    writeFileSync(testFile, "NOT VALID JSON {{{{");

    const cache = new PersistentTtlCache<string>(5000, testFile);
    expect(cache.get("key")).toBeUndefined(); // starts empty without throwing

    cache.set("key", "value");
    expect(cache.get("key")).toBe("value"); // in-memory works
  });
});
