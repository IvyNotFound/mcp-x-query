/**
 * MCP integration tests — spawn the real server via stdio and call tools.
 * Requires XAI_API_KEY in env. Skipped automatically if key is absent.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "../../dist/index.js");
const HAS_API_KEY = Boolean(process.env.XAI_API_KEY);

// ─── Well-known stable tweets ─────────────────────────────────────────────────
//
// "the bird is freed" — @elonmusk, Oct 27 2022
// First tweet after Twitter acquisition. Extremely documented, very unlikely to be deleted.
const BIRD_FREED_ID = "1585841080431321088";

// Tesla "funding secured" — @elonmusk, Aug 7 2018
// Famous/controversial tweet. Known to have been deleted after SEC settlement.
// Used to test graceful handling of deleted tweets.
const FUNDING_SECURED_ID = "1026872652290379776";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

function getText(result: ToolResult): string {
  return (result.content as { type: string; text: string }[])[0].text;
}

function parseResult<T>(result: ToolResult): T {
  return JSON.parse(getText(result)) as T;
}

/**
 * Asserts that a tweet either:
 *   (a) exists with the expected author and year, OR
 *   (b) is legitimately deleted/unavailable (isError + "not found")
 *
 * This prevents false negatives if a tweet gets deleted in the future.
 */
function assertTweetOrDeleted(
  result: ToolResult,
  opts: { expectedAuthor: string; expectedYear: number; tweetId: string }
) {
  if (result.isError) {
    // Deleted or unavailable — acceptable outcome, must still be a proper error
    const text = getText(result);
    expect(text, "Deleted tweet must return a 'not found' error, not a generic crash").toMatch(
      /not found|deleted|unavailable|private/i
    );
    console.info(
      `[graceful] Tweet ${opts.tweetId} no longer available — test passed as deleted.`
    );
    return;
  }

  // Tweet still exists — verify it's the right one
  const tweet = parseResult<{
    id: string;
    author: { username: string };
    created_at: string;
    text: string;
  }>(result);

  expect(tweet.id).toBe(opts.tweetId);
  expect(tweet.author.username.toLowerCase()).toBe(opts.expectedAuthor.toLowerCase());
  expect(new Date(tweet.created_at).getFullYear()).toBe(opts.expectedYear);
  expect(tweet.text.length).toBeGreaterThan(0);
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe.skipIf(!HAS_API_KEY)(
  "MCP server integration (requires XAI_API_KEY)",
  () => {
    let client: Client;
    let transport: StdioClientTransport;

    beforeAll(async () => {
      transport = new StdioClientTransport({
        command: "node",
        args: [SERVER_PATH],
        env: { ...process.env, XAI_API_KEY: process.env.XAI_API_KEY! },
      });
      client = new Client({ name: "test-client", version: "1.0.0" });
      await client.connect(transport);
    });

    afterAll(async () => {
      await client.close();
    });

    // ── Tool discovery ────────────────────────────────────────────────────────
    it("exposes exactly 11 tools", async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "get_tweet",
          "get_tweet_replies",
          "get_user_tweets",
          "get_user_profile",
          "search_tweets",
          "get_thread",
          "get_trending",
          "analyze_sentiment",
          "analyze_thread",
          "extract_links",
          "get_user_mentions",
        ])
      );
      expect(tools).toHaveLength(11);
    });

    // ── Error cases ───────────────────────────────────────────────────────────
    it("get_tweet returns isError for non-existent tweet", async () => {
      const result = await client.callTool({
        name: "get_tweet",
        arguments: { tweet_id_or_url: "9999999999999999999" },
      });
      expect(result.isError).toBe(true);
      expect(getText(result)).toMatch(/not found/i);
    });

    it("get_thread returns isError for non-existent tweet", async () => {
      const result = await client.callTool({
        name: "get_thread",
        arguments: { tweet_id_or_url: "9999999999999999999" },
      });
      expect(result.isError).toBe(true);
      expect(getText(result)).toMatch(/not found/i);
    });

    // ── Stable tweet: "the bird is freed" (@elonmusk, Oct 2022) ──────────────
    // One of the most documented tweets in history. Strict assertions.
    it("get_tweet fetches the 'bird is freed' tweet correctly", async () => {
      const result = await client.callTool({
        name: "get_tweet",
        arguments: { tweet_id_or_url: BIRD_FREED_ID },
      });

      expect(result.isError).toBeFalsy();
      const tweet = parseResult<{
        id: string;
        author: { username: string };
        created_at: string;
        text: string;
        metrics: { likes: number; retweets: number };
      }>(result);

      expect(tweet.id).toBe(BIRD_FREED_ID);
      expect(tweet.author.username.toLowerCase()).toBe("elonmusk");
      expect(new Date(tweet.created_at).getFullYear()).toBe(2022);
      // The tweet contains "bird" — stable content check
      expect(tweet.text.toLowerCase()).toMatch(/bird/i);
      // Viral tweet — should have significant engagement
      expect(tweet.metrics.likes).toBeGreaterThan(100_000);
    });

    // ── Potentially deleted tweet: "funding secured" (@elonmusk, Aug 2018) ───
    // This tweet was deleted after SEC settlement. Graceful handling test.
    it("get_tweet handles deleted 'funding secured' tweet gracefully", async () => {
      const result = await client.callTool({
        name: "get_tweet",
        arguments: { tweet_id_or_url: FUNDING_SECURED_ID },
      });
      assertTweetOrDeleted(result, {
        tweetId: FUNDING_SECURED_ID,
        expectedAuthor: "elonmusk",
        expectedYear: 2018,
      });
    });

    // ── get_user_tweets — stable date range ───────────────────────────────────
    // Tweets from Elon in Oct 2022 (Twitter acquisition period) — extremely documented.
    it("get_user_tweets returns @elonmusk tweets from Oct 2022", async () => {
      const result = await client.callTool({
        name: "get_user_tweets",
        arguments: {
          username: "elonmusk",
          max_results: 5,
          from_date: "2022-10-25",
          to_date: "2022-10-30",
        },
      });

      expect(result.isError).toBeFalsy();
      const data = parseResult<{ tweets: { author: { username: string }; created_at: string }[] }>(result);
      expect(data.tweets.length).toBeGreaterThan(0);
      // All returned tweets must be from elonmusk
      for (const tweet of data.tweets) {
        expect(tweet.author.username.toLowerCase()).toBe("elonmusk");
      }
      // All must be in the expected time window
      for (const tweet of data.tweets) {
        const year = new Date(tweet.created_at).getFullYear();
        expect(year).toBe(2022);
      }
    });

    // ── get_user_profile ──────────────────────────────────────────────────────
    it("get_user_profile returns correct @elonmusk profile", async () => {
      const result = await client.callTool({
        name: "get_user_profile",
        arguments: { username: "elonmusk" },
      });

      expect(result.isError).toBeFalsy();
      const profile = parseResult<{
        username: string;
        followers_count: number;
        tweet_count: number;
        verified: boolean;
      }>(result);

      expect(profile.username.toLowerCase()).toBe("elonmusk");
      // As of 2024, @elonmusk has 100M+ followers
      expect(profile.followers_count).toBeGreaterThan(10_000_000);
      // tweet_count omitted: Grok doesn't always return it reliably
    });

    // ── search_tweets — real query ────────────────────────────────────────────
    it("search_tweets returns results for a broad query", async () => {
      const result = await client.callTool({
        name: "search_tweets",
        arguments: { query: "AI", max_results: 3 },
      });

      expect(result.isError).toBeFalsy();
      const data = parseResult<{ tweets: unknown[] }>(result);
      expect(Array.isArray(data.tweets)).toBe(true);
    });
  }
);
