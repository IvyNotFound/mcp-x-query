import { describe, it, expect, vi } from "vitest";
import type { GrokClient } from "../lib/grok-client.js";
import { getTweet } from "../tools/get-tweet.js";
import { getThread } from "../tools/get-thread.js";
import { searchTweets } from "../tools/search-tweets.js";
import { getUserTweets } from "../tools/get-user-tweets.js";

// Minimal tweet fixture
const MOCK_TWEET = {
  id: "1234567890",
  url: "https://x.com/testuser/status/1234567890",
  author: { username: "testuser", display_name: "Test User", verified: false },
  text: "Hello world",
  created_at: "2025-01-01T00:00:00Z",
  metrics: { likes: 10, retweets: 2, replies: 1 },
  is_retweet: false,
};

function mockClient(response: unknown): GrokClient {
  return {
    query: vi.fn().mockResolvedValue(response),
  } as unknown as GrokClient;
}

// ─── get_tweet ────────────────────────────────────────────────────────────────
describe("getTweet", () => {
  it("returns tweet when found", async () => {
    const client = mockClient(MOCK_TWEET);
    const result = await getTweet(client, { tweet_id_or_url: "1234567890" });
    expect(result.id).toBe("1234567890");
    expect(result.text).toBe("Hello world");
  });

  it("throws when id is empty (not found)", async () => {
    const client = mockClient({ ...MOCK_TWEET, id: "" });
    await expect(getTweet(client, { tweet_id_or_url: "1234567890" })).rejects.toThrow(
      "Tweet not found"
    );
  });

  it("throws when returned id does not match requested id", async () => {
    const client = mockClient({ ...MOCK_TWEET, id: "9999999999" });
    await expect(getTweet(client, { tweet_id_or_url: "1234567890" })).rejects.toThrow(
      "Tweet not found"
    );
  });

  it("accepts x.com URL and extracts ID", async () => {
    const client = mockClient(MOCK_TWEET);
    const result = await getTweet(client, {
      tweet_id_or_url: "https://x.com/testuser/status/1234567890",
    });
    expect(result.id).toBe("1234567890");
  });
});

// ─── getThread ────────────────────────────────────────────────────────────────
describe("getThread", () => {
  it("returns tweets when thread found", async () => {
    const client = mockClient({ tweets: [MOCK_TWEET] });
    const result = await getThread(client, { tweet_id_or_url: "1234567890" });
    expect(result.tweets).toHaveLength(1);
  });

  it("throws when tweets array is empty (not found)", async () => {
    const client = mockClient({ tweets: [] });
    await expect(getThread(client, { tweet_id_or_url: "9999999999" })).rejects.toThrow(
      "Tweet not found"
    );
  });

  it("uses lean schema by default (verbose: false)", async () => {
    const client = mockClient({ tweets: [MOCK_TWEET] });
    await getThread(client, { tweet_id_or_url: "1234567890" });
    const callArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    // schemaName should be "thread" in lean mode
    expect(callArgs[2]).toBe("thread");
  });

  it("uses full schema when verbose: true", async () => {
    const client = mockClient({ tweets: [MOCK_TWEET] });
    await getThread(client, { tweet_id_or_url: "1234567890", verbose: true });
    const callArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    // schemaName should be "tweet_array" in verbose mode
    expect(callArgs[2]).toBe("tweet_array");
  });

  it("defaults to max 20 tweets in normal mode", async () => {
    const client = mockClient({ tweets: [MOCK_TWEET] });
    await getThread(client, { tweet_id_or_url: "1234567890" });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("20 tweets");
  });

  it("defaults to max 10 tweets in verbose mode", async () => {
    const client = mockClient({ tweets: [MOCK_TWEET] });
    await getThread(client, { tweet_id_or_url: "1234567890", verbose: true });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("10 tweets");
  });
});

// ─── searchTweets ─────────────────────────────────────────────────────────────
describe("searchTweets", () => {
  it("returns tweets array", async () => {
    const client = mockClient({ tweets: [MOCK_TWEET, MOCK_TWEET] });
    const result = await searchTweets(client, { query: "hello world" });
    expect(result.tweets).toHaveLength(2);
  });

  it("passes date params to client", async () => {
    const client = mockClient({ tweets: [MOCK_TWEET] });
    await searchTweets(client, {
      query: "test",
      from_date: "2025-01-01",
      to_date: "2025-01-31",
    });
    const xSearchParams = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(xSearchParams.from_date).toBe("2025-01-01");
    expect(xSearchParams.to_date).toBe("2025-01-31");
  });
});

// ─── getUserTweets ────────────────────────────────────────────────────────────
describe("getUserTweets", () => {
  it("strips @ from username", async () => {
    const client = mockClient({ tweets: [MOCK_TWEET] });
    await getUserTweets(client, { username: "@elonmusk" });
    const xSearchParams = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(xSearchParams.allowed_x_handles).toContain("elonmusk");
  });

  it("returns empty array without throwing (valid case)", async () => {
    const client = mockClient({ tweets: [] });
    const result = await getUserTweets(client, { username: "newaccount" });
    expect(result.tweets).toHaveLength(0);
  });
});
