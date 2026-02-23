/**
 * Tool: get_tweet_replies
 *
 * Retrieves replies to a given tweet, sorted by engagement (most-liked first).
 * Returns a TweetArraySchema: { tweets: Tweet[] }.
 *
 * Input:
 *   tweet_id_or_url — tweet ID or full URL (x.com / twitter.com)
 *   max_results     — how many replies to return (1–100, default 10)
 *
 * Note:
 *   Grok sources replies through x_search; availability depends on
 *   the tweet's visibility and the Grok API's real-time index.
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { TweetArraySchema } from "../schemas/tweet.js";
import { extractTweetId } from "../lib/utils.js";

/** MCP input schema for the get_tweet_replies tool. */
export const GetTweetRepliesInput = z.object({
  tweet_id_or_url: z
    .string()
    .describe("Tweet ID or full URL (x.com/twitter.com)"),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .optional()
    .describe("Maximum number of replies to return (default: 10)"),
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
});

/**
 * Fetch replies to a tweet via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching GetTweetRepliesInput.
 * @returns       Object with a `tweets` array of reply tweets.
 */
export async function getTweetReplies(
  client: GrokClient,
  input: z.infer<typeof GetTweetRepliesInput>
) {
  const tweetId = extractTweetId(input.tweet_id_or_url);
  const maxResults = input.max_results ?? 10;

  const dateRange =
    input.from_date || input.to_date
      ? ` between ${input.from_date ?? "the beginning"} and ${input.to_date ?? "now"}`
      : "";

  const prompt = `Find the replies to tweet ID ${tweetId} on Twitter/X${dateRange}.
Return up to ${maxResults} replies as a JSON object with a "tweets" array.
Each reply should include: id, url, author (username, display_name, verified), text, created_at,
metrics (likes, retweets, replies), in_reply_to (tweet_id: "${tweetId}"), is_retweet: false.
Sort replies by engagement (most liked/replied first).`;

  // No x_search handle filter here — replies can come from any account.
  return client.query(prompt, TweetArraySchema, "tweet_array", {
    from_date: input.from_date,
    to_date: input.to_date,
  });
}
