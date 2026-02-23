import { describe, it, expect, vi, afterEach } from "vitest";
import { TtlCache } from "../lib/cache.js";

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
