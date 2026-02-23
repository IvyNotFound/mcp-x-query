import { describe, it, expect, vi } from "vitest";
import type { GrokClient } from "../lib/grok-client.js";
import { getTweet } from "../tools/get-tweet.js";
import { getThread } from "../tools/get-thread.js";
import { searchTweets } from "../tools/search-tweets.js";
import { getUserTweets } from "../tools/get-user-tweets.js";
import { getTweetReplies } from "../tools/get-tweet-replies.js";
import { getUserProfile } from "../tools/get-user-profile.js";
import { getTrending } from "../tools/get-trending.js";
import { analyzeSentiment } from "../tools/analyze-sentiment.js";
import { analyzeThread } from "../tools/analyze-thread.js";
import { extractLinks } from "../tools/extract-links.js";

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

// ─── analyzeSentiment ─────────────────────────────────────────────────────────

const MOCK_SENTIMENT = {
  query: "James Webb telescope",
  total_tweets_analyzed: 30,
  overall_sentiment: "positive",
  sentiment_score: 0.72,
  sentiment_breakdown: { positive_pct: 75, negative_pct: 10, neutral_pct: 15 },
  dominant_topics: ["exoplanets", "deep field", "NASA funding"],
  dominant_emotions: ["wonder", "excitement", "pride"],
  summary: "The discourse around James Webb is overwhelmingly enthusiastic.",
  notable_tweets: [
    {
      id: "111",
      url: "https://x.com/nasa/status/111",
      text: "New JWST image released!",
      author: "nasa",
      sentiment: "positive",
      reason: "Most liked tweet in corpus",
    },
  ],
};

describe("analyzeSentiment", () => {
  it("returns structured analysis", async () => {
    const client = mockClient(MOCK_SENTIMENT);
    const result = await analyzeSentiment(client, { query: "James Webb telescope" });
    expect(result.overall_sentiment).toBe("positive");
    expect(result.sentiment_score).toBe(0.72);
    expect(result.dominant_topics).toContain("exoplanets");
    expect(result.notable_tweets).toHaveLength(1);
  });

  it("uses schema name 'sentiment_analysis'", async () => {
    const client = mockClient(MOCK_SENTIMENT);
    await analyzeSentiment(client, { query: "test" });
    const schemaName = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(schemaName).toBe("sentiment_analysis");
  });

  it("passes date params to x_search", async () => {
    const client = mockClient(MOCK_SENTIMENT);
    await analyzeSentiment(client, {
      query: "ESA launch",
      from_date: "2025-01-01",
      to_date: "2025-06-30",
    });
    const xSearchParams = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(xSearchParams.from_date).toBe("2025-01-01");
    expect(xSearchParams.to_date).toBe("2025-06-30");
  });

  it("includes language filter in prompt when provided", async () => {
    const client = mockClient(MOCK_SENTIMENT);
    await analyzeSentiment(client, { query: "astro", language: "fr" });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("lang:fr");
  });

  it("defaults to 30 tweets when max_tweets is omitted", async () => {
    const client = mockClient(MOCK_SENTIMENT);
    await analyzeSentiment(client, { query: "moon" });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("30 recent tweets");
  });

  it("respects custom max_tweets", async () => {
    const client = mockClient(MOCK_SENTIMENT);
    await analyzeSentiment(client, { query: "moon", max_tweets: 50 });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("50 recent tweets");
  });
});

// ─── getTweetReplies ──────────────────────────────────────────────────────────
describe("getTweetReplies", () => {
  it("returns tweets array", async () => {
    const client = mockClient({ tweets: [MOCK_TWEET, MOCK_TWEET] });
    const result = await getTweetReplies(client, { tweet_id_or_url: "1234567890" });
    expect(result.tweets).toHaveLength(2);
  });

  it("returns empty array without throwing", async () => {
    const client = mockClient({ tweets: [] });
    const result = await getTweetReplies(client, { tweet_id_or_url: "1234567890" });
    expect(result.tweets).toHaveLength(0);
  });

  it("accepts x.com URL and extracts tweet ID", async () => {
    const client = mockClient({ tweets: [MOCK_TWEET] });
    await getTweetReplies(client, {
      tweet_id_or_url: "https://x.com/testuser/status/1234567890",
    });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("1234567890");
  });

  it("uses max_results default of 10 when not specified", async () => {
    const client = mockClient({ tweets: [] });
    await getTweetReplies(client, { tweet_id_or_url: "1234567890" });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("10");
  });

  it("passes custom max_results to prompt", async () => {
    const client = mockClient({ tweets: [] });
    await getTweetReplies(client, { tweet_id_or_url: "1234567890", max_results: 25 });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("25");
  });
});

// ─── getUserProfile ───────────────────────────────────────────────────────────
const MOCK_PROFILE = {
  username: "testuser",
  display_name: "Test User",
  bio: "A test bio",
  verified: false,
  followers_count: 100,
  following_count: 50,
  tweet_count: 200,
};

describe("getUserProfile", () => {
  it("returns user profile", async () => {
    const client = mockClient(MOCK_PROFILE);
    const result = await getUserProfile(client, { username: "testuser" });
    expect(result.username).toBe("testuser");
    expect(result.followers_count).toBe(100);
  });

  it("strips @ from username", async () => {
    const client = mockClient(MOCK_PROFILE);
    await getUserProfile(client, { username: "@testuser" });
    // Verify the x_search filter uses the sanitized handle
    const xSearchParams = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(xSearchParams.allowed_x_handles).toContain("testuser");
  });

  it("uses allowed_x_handles filter for the target user", async () => {
    const client = mockClient(MOCK_PROFILE);
    await getUserProfile(client, { username: "someone" });
    const xSearchParams = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(xSearchParams.allowed_x_handles).toEqual(["someone"]);
  });
});

// ─── getTrending ──────────────────────────────────────────────────────────────
const MOCK_TRENDING = {
  topics: [
    { name: "#AI", tweet_count: 50000, category: "technology", description: "AI discussions" },
    { name: "#WorldCup", tweet_count: 100000, category: "sports", description: "Football event" },
  ],
};

describe("getTrending", () => {
  it("returns trending topics array", async () => {
    const client = mockClient(MOCK_TRENDING);
    const result = await getTrending(client, {});
    expect(result.topics).toHaveLength(2);
    expect(result.topics[0].name).toBe("#AI");
  });

  it("includes category filter in prompt when provided", async () => {
    const client = mockClient(MOCK_TRENDING);
    await getTrending(client, { category: "technology" });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("technology");
  });

  it("omits category clause when category is not provided", async () => {
    const client = mockClient(MOCK_TRENDING);
    await getTrending(client, {});
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    // No category filter in the prompt
    expect(prompt).not.toContain('in the "');
  });
});

// ─── analyzeThread ────────────────────────────────────────────────────────────

const MOCK_THREAD_ANALYSIS = {
  thread_author: "nasa",
  root_tweet_id: "1234567890",
  root_tweet_url: "https://x.com/nasa/status/1234567890",
  total_tweets: 12,
  overall_sentiment: "positive",
  sentiment_score: 0.85,
  sentiment_breakdown: { positive_pct: 85, negative_pct: 5, neutral_pct: 10 },
  main_topics: ["JWST images", "exoplanet atmosphere", "science communication"],
  key_arguments: ["Best space telescope ever built", "Funding science pays off"],
  summary: "A deeply positive thread celebrating the latest JWST findings.",
  notable_tweets: [
    {
      id: "1234567890",
      url: "https://x.com/nasa/status/1234567890",
      text: "New JWST data just dropped!",
      author: "nasa",
      sentiment: "positive",
      reason: "Root tweet with highest engagement",
    },
  ],
};

describe("analyzeThread", () => {
  it("returns structured thread analysis", async () => {
    const client = mockClient(MOCK_THREAD_ANALYSIS);
    const result = await analyzeThread(client, { tweet_id_or_url: "1234567890" });
    expect(result.thread_author).toBe("nasa");
    expect(result.overall_sentiment).toBe("positive");
    expect(result.main_topics).toHaveLength(3);
  });

  it("uses schema name 'thread_analysis'", async () => {
    const client = mockClient(MOCK_THREAD_ANALYSIS);
    await analyzeThread(client, { tweet_id_or_url: "1234567890" });
    const schemaName = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(schemaName).toBe("thread_analysis");
  });

  it("accepts x.com URL and extracts tweet ID for the prompt", async () => {
    const client = mockClient(MOCK_THREAD_ANALYSIS);
    await analyzeThread(client, { tweet_id_or_url: "https://x.com/nasa/status/1234567890" });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("1234567890");
  });

  it("defaults to 20 tweets when max_tweets is omitted", async () => {
    const client = mockClient(MOCK_THREAD_ANALYSIS);
    await analyzeThread(client, { tweet_id_or_url: "1234567890" });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("20 tweets");
  });

  it("respects custom max_tweets", async () => {
    const client = mockClient(MOCK_THREAD_ANALYSIS);
    await analyzeThread(client, { tweet_id_or_url: "1234567890", max_tweets: 35 });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("35 tweets");
  });

  it("does not pass x_search params (no date filter for threads)", async () => {
    const client = mockClient(MOCK_THREAD_ANALYSIS);
    await analyzeThread(client, { tweet_id_or_url: "1234567890" });
    const xSearchParams = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(xSearchParams).toBeUndefined();
  });
});

// ─── extractLinks ─────────────────────────────────────────────────────────────

const MOCK_LINK_EXTRACT = {
  username: "ESA",
  total_links: 2,
  links: [
    {
      url: "https://arxiv.org/abs/2401.12345",
      domain: "arxiv.org",
      title: "Detection of CO2 on exoplanet K2-18b",
      summary: "New paper reporting the detection of CO2 in the atmosphere of K2-18b via JWST.",
      shared_at: "2025-01-15T10:00:00Z",
      tweet_id: "9876543210",
    },
    {
      url: "https://esa.int/Science_Exploration/news",
      domain: "esa.int",
      summary: "ESA news article about the upcoming Ariel mission timeline.",
      shared_at: "2025-01-16T14:30:00Z",
      tweet_id: "9876543211",
    },
  ],
};

describe("extractLinks", () => {
  it("returns structured link list", async () => {
    const client = mockClient(MOCK_LINK_EXTRACT);
    const result = await extractLinks(client, { username: "ESA" });
    expect(result.username).toBe("ESA");
    expect(result.total_links).toBe(2);
    expect(result.links).toHaveLength(2);
  });

  it("uses schema name 'link_extract'", async () => {
    const client = mockClient(MOCK_LINK_EXTRACT);
    await extractLinks(client, { username: "ESA" });
    const schemaName = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(schemaName).toBe("link_extract");
  });

  it("strips @ and passes sanitized handle to allowed_x_handles", async () => {
    const client = mockClient(MOCK_LINK_EXTRACT);
    await extractLinks(client, { username: "@ESA" });
    const xSearchParams = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(xSearchParams.allowed_x_handles).toEqual(["ESA"]);
  });

  it("passes date params to x_search", async () => {
    const client = mockClient(MOCK_LINK_EXTRACT);
    await extractLinks(client, {
      username: "ESA",
      from_date: "2025-01-01",
      to_date: "2025-03-31",
    });
    const xSearchParams = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(xSearchParams.from_date).toBe("2025-01-01");
    expect(xSearchParams.to_date).toBe("2025-03-31");
  });

  it("defaults to 50 tweets when max_tweets is omitted", async () => {
    const client = mockClient(MOCK_LINK_EXTRACT);
    await extractLinks(client, { username: "ESA" });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("50");
  });

  it("includes username in prompt", async () => {
    const client = mockClient(MOCK_LINK_EXTRACT);
    await extractLinks(client, { username: "ESA" });
    const prompt = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("@ESA");
  });
});
