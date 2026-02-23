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

const MOCK_TWEET_WITH_IMAGE = {
  ...MOCK_TWEET,
  media: [{ type: "image" as const, url: "https://pbs.twimg.com/media/test.jpg" }],
};

const MOCK_TWEET_WITH_VIDEO = {
  ...MOCK_TWEET,
  media: [{
    type: "video" as const,
    url: "https://video.twimg.com/vid.mp4",
    thumbnail_url: "https://pbs.twimg.com/thumb.jpg",
  }],
};

const MOCK_TWEET_WITH_VIDEO_NO_THUMB = {
  ...MOCK_TWEET,
  media: [{ type: "video" as const, url: "https://video.twimg.com/vid.mp4" }],
};

function mockClient(response: unknown, mediaAnalysis = ""): GrokClient {
  // structuredClone prevents test-to-test mutation: getTweet reassigns result.media
  // on the returned object, which would corrupt shared fixture references otherwise.
  return {
    query: vi.fn().mockResolvedValue(structuredClone(response)),
    analyzeMedia: vi.fn().mockResolvedValue(mediaAnalysis),
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

  it("does not call analyzeMedia when tweet has no media", async () => {
    const client = mockClient(MOCK_TWEET);
    await getTweet(client, { tweet_id_or_url: "1234567890" });
    expect(client.analyzeMedia).not.toHaveBeenCalled();
  });
});

// ─── getTweet — media enrichment ──────────────────────────────────────────────
describe("getTweet — media enrichment", () => {
  it("enriches image media with analyzeMedia summary", async () => {
    const client = mockClient(MOCK_TWEET_WITH_IMAGE, "Une photo de coucher de soleil");
    const result = await getTweet(client, { tweet_id_or_url: "1234567890" });
    expect(result.media![0].media_summary).toBe("Une photo de coucher de soleil");
    expect(client.analyzeMedia).toHaveBeenCalledWith(
      "https://pbs.twimg.com/media/test.jpg",
      "image",
      MOCK_TWEET.text
    );
  });

  it("uses thumbnail_url for video analysis", async () => {
    const client = mockClient(MOCK_TWEET_WITH_VIDEO, "Une vignette de vidéo");
    await getTweet(client, { tweet_id_or_url: "1234567890" });
    expect(client.analyzeMedia).toHaveBeenCalledWith(
      "https://pbs.twimg.com/thumb.jpg",
      "video",
      MOCK_TWEET.text
    );
  });

  it("falls back to video url when thumbnail_url is absent", async () => {
    const client = mockClient(MOCK_TWEET_WITH_VIDEO_NO_THUMB, "Contenu vidéo");
    await getTweet(client, { tweet_id_or_url: "1234567890" });
    expect(client.analyzeMedia).toHaveBeenCalledWith(
      "https://video.twimg.com/vid.mp4",
      "video",
      MOCK_TWEET.text
    );
  });

  it("omits media_summary when analyzeMedia returns empty string", async () => {
    const client = mockClient(MOCK_TWEET_WITH_IMAGE, "");
    const result = await getTweet(client, { tweet_id_or_url: "1234567890" });
    expect(result.media![0].media_summary).toBeUndefined();
  });

  it("enriches multiple media items independently", async () => {
    const tweetWithMultiMedia = {
      ...MOCK_TWEET,
      media: [
        { type: "image" as const, url: "https://pbs.twimg.com/media/a.jpg" },
        { type: "image" as const, url: "https://pbs.twimg.com/media/b.jpg" },
      ],
    };
    const client = mockClient(tweetWithMultiMedia, "Description");
    const result = await getTweet(client, { tweet_id_or_url: "1234567890" });
    expect(client.analyzeMedia).toHaveBeenCalledTimes(2);
    expect(result.media).toHaveLength(2);
    expect(result.media![0].media_summary).toBe("Description");
    expect(result.media![1].media_summary).toBe("Description");
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
