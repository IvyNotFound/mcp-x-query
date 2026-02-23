/**
 * Tool: search_tweets
 *
 * Full-text search across Twitter/X using Grok's real-time x_search capability.
 * Supports Twitter's native search operators (from:, to:, #hashtag, lang:, etc.)
 * and an optional date range.
 *
 * Returns a TweetArraySchema: { tweets: Tweet[] }, sorted by relevance and engagement.
 *
 * Input:
 *   query       — search string, supports Twitter operators (e.g. "AI from:OpenAI -is:retweet")
 *   max_results — number of tweets to return (1–100, default 10)
 *   from_date   — start of date range (YYYY-MM-DD, optional)
 *   to_date     — end of date range (YYYY-MM-DD, optional)
 *
 * Implementation note:
 *   Date filters are forwarded to x_search at the API level for more precise
 *   filtering than prompt-only instructions.
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { TweetArraySchema } from "../schemas/tweet.js";
import { escapeForPrompt, computeNextCursor } from "../lib/utils.js";

/** MCP input schema for the search_tweets tool. */
export const SearchTweetsInput = z.object({
  query: z.string().max(500).describe("Search query (supports Twitter search operators)"),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .optional()
    .describe("Maximum number of tweets to return (default: 10)"),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date in YYYY-MM-DD format"),
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date in YYYY-MM-DD format"),
  enrich_media: z
    .boolean()
    .optional()
    .describe(
      "When true, each tweet's media items are analysed with Grok Vision and a media_summary field is added. Increases latency."
    ),
  cursor: z
    .string()
    .regex(/^\d+$/, "Cursor must be a numeric tweet ID")
    .optional()
    .describe(
      "Pagination cursor: tweet ID returned as next_cursor in the previous response. Pass it to fetch the next (older) page."
    ),
});

/**
 * Search Twitter/X for tweets matching a query via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching SearchTweetsInput.
 * @returns       Object with a `tweets` array sorted by relevance/engagement.
 */
export async function searchTweets(
  client: GrokClient,
  input: z.infer<typeof SearchTweetsInput>
) {
  const maxResults = input.max_results ?? 10;

  // Build a human-readable date range description for the prompt (optional).
  const dateRange =
    input.from_date || input.to_date
      ? ` between ${input.from_date ?? "the beginning"} and ${input.to_date ?? "now"}`
      : "";

  const cursorInstruction = input.cursor
    ? ` Only return tweets with a numeric ID strictly less than ${input.cursor} (pagination: older tweets only).`
    : "";

  const prompt = `Search Twitter/X for tweets matching the query below${dateRange}.${cursorInstruction}
<query>${escapeForPrompt(input.query)}</query>
Return up to ${maxResults} relevant tweets as a JSON object with a "tweets" array.
For each tweet include: id, url, author (username, display_name, verified), text, created_at,
metrics (likes, retweets, replies, views if available), media if any, is_retweet, language.
Sort by relevance and engagement.`;

  // Pass date filters to x_search for precise temporal filtering.
  const result = await client.query(prompt, TweetArraySchema, "tweet_array", {
    from_date: input.from_date,
    to_date: input.to_date,
  });

  // Optionally enrich media items with Grok Vision summaries.
  if (input.enrich_media) {
    result.tweets = await Promise.all(
      result.tweets.map(async (tweet) => {
        if (!tweet.media || tweet.media.length === 0) return tweet;
        const enrichedMedia = await Promise.all(
          tweet.media.map(async (item) => {
            const urlToAnalyze =
              item.type === "video" ? (item.thumbnail_url ?? item.url) : item.url;
            if (!urlToAnalyze) return item;
            const summary = await client.analyzeMedia(urlToAnalyze, item.type, tweet.text);
            return summary ? { ...item, media_summary: summary } : item;
          })
        );
        return { ...tweet, media: enrichedMedia };
      })
    );
  }

  return { ...result, next_cursor: computeNextCursor(result.tweets) };
}
