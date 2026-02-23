/**
 * Tool: get_list_tweets
 *
 * Retrieves recent tweets from a Twitter/X list by its ID or URL.
 * Supports an optional date range and pagination cursor.
 * Returns a TweetArraySchema: { tweets: Tweet[], next_cursor? }, sorted newest-first.
 *
 * Input:
 *   list_id     — Twitter/X list ID (numeric) or list URL
 *   max_results — number of tweets to return (1–100, default 10)
 *   from_date   — start of date range (YYYY-MM-DD, optional)
 *   to_date     — end of date range (YYYY-MM-DD, optional)
 *   cursor      — pagination cursor (tweet ID from previous page's next_cursor, optional)
 *   enrich_media — when true, enrich media with Grok Vision summaries (optional)
 *
 * Implementation note:
 *   The list ID is extracted from the URL (if provided) or used directly.
 *   Date filters are forwarded to x_search for precise temporal filtering.
 *   next_cursor is the ID of the oldest tweet in the page; pass it as cursor
 *   in the next call to fetch older tweets.
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { TweetArraySchema } from "../schemas/tweet.js";
import { extractListId, computeNextCursor } from "../lib/utils.js";

/** MCP input schema for the get_list_tweets tool. */
export const GetListTweetsInput = z.object({
  list_id: z
    .string()
    .describe(
      "Twitter/X list ID (numeric, e.g. \"1234567890\") or full list URL (e.g. \"https://x.com/i/lists/1234567890\")"
    ),
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
  cursor: z
    .string()
    .regex(/^\d+$/, "Cursor must be a numeric tweet ID")
    .optional()
    .describe(
      "Pagination cursor: tweet ID returned as next_cursor in the previous response. Pass it to fetch the next (older) page."
    ),
  enrich_media: z
    .boolean()
    .optional()
    .describe(
      "When true, each tweet's media items are analysed with Grok Vision and a media_summary field is added. Increases latency."
    ),
});

/**
 * Fetch recent tweets from a Twitter/X list via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching GetListTweetsInput.
 * @returns       Object with a `tweets` array sorted newest-first, plus an
 *                optional `next_cursor` for fetching the next page.
 */
export async function getListTweets(
  client: GrokClient,
  input: z.infer<typeof GetListTweetsInput>
) {
  const listId = extractListId(input.list_id);
  const maxResults = input.max_results ?? 10;

  const dateRange =
    input.from_date || input.to_date
      ? ` between ${input.from_date ?? "the beginning"} and ${input.to_date ?? "now"}`
      : "";

  const cursorInstruction = input.cursor
    ? ` Only return tweets with a numeric ID strictly less than ${input.cursor} (pagination: older tweets only).`
    : "";

  const prompt = `Retrieve up to ${maxResults} recent tweets from Twitter/X list with ID ${listId}${dateRange}.${cursorInstruction}
Return as a JSON object with a "tweets" array.
For each tweet include: id, url, author (username, display_name, verified), text, created_at,
metrics (likes, retweets, replies, views if available), media if any, is_retweet, language.
Sort by most recent first.`;

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
