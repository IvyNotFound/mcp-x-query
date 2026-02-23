import { describe, it, expect } from "vitest";
import { extractTweetId, sanitizeUsername } from "../lib/utils.js";

describe("extractTweetId", () => {
  it("returns raw ID unchanged", () => {
    expect(extractTweetId("1234567890")).toBe("1234567890");
  });

  it("extracts ID from x.com URL", () => {
    expect(extractTweetId("https://x.com/user/status/1234567890")).toBe("1234567890");
  });

  it("extracts ID from twitter.com URL", () => {
    expect(extractTweetId("https://twitter.com/user/status/9876543210")).toBe("9876543210");
  });

  it("extracts ID from URL with query string", () => {
    expect(extractTweetId("https://x.com/stellart89/status/2025888046235725872?s=20")).toBe(
      "2025888046235725872"
    );
  });

  it("trims whitespace from raw ID", () => {
    expect(extractTweetId("  1234567890  ")).toBe("1234567890");
  });
});

describe("sanitizeUsername", () => {
  it("removes leading @", () => {
    expect(sanitizeUsername("@elonmusk")).toBe("elonmusk");
  });

  it("returns username unchanged if no @", () => {
    expect(sanitizeUsername("elonmusk")).toBe("elonmusk");
  });

  it("trims whitespace", () => {
    expect(sanitizeUsername("  @covertlight  ")).toBe("covertlight");
  });

  it("only removes the first @", () => {
    expect(sanitizeUsername("@user@name")).toBe("user@name");
  });
});
