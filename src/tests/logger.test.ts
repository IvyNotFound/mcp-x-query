import { describe, it, expect, vi, afterEach } from "vitest";
import { log } from "../lib/logger.js";

describe("log()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON to stderr", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log("info", "hello");
    expect(spy).toHaveBeenCalledOnce();
    const written = spy.mock.calls[0][0] as string;
    expect(() => JSON.parse(written)).not.toThrow();
  });

  it("entry contains level, msg and ts fields", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log("warn", "test message");
    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.level).toBe("warn");
    expect(entry.msg).toBe("test message");
    expect(typeof entry.ts).toBe("number");
  });

  it("merges extra fields into the entry", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log("error", "oops", { tool: "get_tweet", code: 500 });
    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.tool).toBe("get_tweet");
    expect(entry.code).toBe(500);
  });

  it("works without extra fields", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log("debug", "no extras");
    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(Object.keys(entry)).toEqual(["level", "msg", "ts"]);
  });

  it("output ends with a newline", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log("fatal", "crash");
    const written = spy.mock.calls[0][0] as string;
    expect(written.endsWith("\n")).toBe(true);
  });
});
