/**
 * Tool: get_user_tweets
 *
 * Retrieves recent tweets (and retweets) from a given Twitter/X user.
 * Supports an optional date range to narrow the time window.
 * Returns a TweetArraySchema: { tweets: Tweet[] }, sorted newest-first.
 *
 * Input:
 *   username    — Twitter/X handle (with or without "@")
 *   max_results — number of tweets to return (1–100, default 10)
 *   from_date   — start of date range (YYYY-MM-DD, optional)
 *   to_date     — end of date range (YYYY-MM-DD, optional)
 *
 * Implementation note:
 *   Both `allowed_x_handles` and from_date/to_date are passed to x_search
 *   so Grok applies the filters at the search level, not just in the prompt.
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { TweetArraySchema } from "../schemas/tweet.js";
import { sanitizeUsername } from "../lib/utils.js";

/** MCP input schema for the get_user_tweets tool. */
export const GetUserTweetsInput = z.object({
  username: z.string().describe("Twitter/X username (with or without @)"),
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
});

/**
 * Fetch recent tweets from a Twitter/X user via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching GetUserTweetsInput.
 * @returns       Object with a `tweets` array sorted newest-first.
 */
export async function getUserTweets(
  client: GrokClient,
  input: z.infer<typeof GetUserTweetsInput>
) {
  const username = sanitizeUsername(input.username);
  const maxResults = input.max_results ?? 10;

  // Build a human-readable date range description for the prompt (optional).
  const dateRange =
    input.from_date || input.to_date
      ? ` between ${input.from_date ?? "the beginning"} and ${input.to_date ?? "now"}`
      : "";

  const prompt = `Retrieve up to ${maxResults} recent tweets from @${username} on Twitter/X${dateRange}.
Return as a JSON object with a "tweets" array.
Include original tweets and retweets. For each tweet include: id, url, author (username: "${username}", display_name, verified),
text, created_at, metrics (likes, retweets, replies, views if available), media if any, is_retweet.
Sort by most recent first.`;

  // Pass date filters directly to x_search so Grok applies them at query time.
  const result = await client.query(prompt, TweetArraySchema, "tweet_array", {
    allowed_x_handles: [username],
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

  return result;
}
