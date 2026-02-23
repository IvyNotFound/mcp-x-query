/**
 * Tool: get_user_mentions
 *
 * Retrieves tweets mentioning a given Twitter/X user (i.e. tweets from other
 * accounts that include @username in their text).
 * Supports an optional date range to narrow the time window.
 * Returns a TweetArraySchema: { tweets: Tweet[] }, sorted newest-first.
 *
 * Input:
 *   username    — Twitter/X handle to find mentions for (with or without "@")
 *   max_results — number of mentions to return (1–100, default 10)
 *   from_date   — start of date range (YYYY-MM-DD, optional)
 *   to_date     — end of date range (YYYY-MM-DD, optional)
 *
 * Implementation note:
 *   No `allowed_x_handles` filter is applied — mentions come from any account.
 *   Date filters are forwarded to x_search for precise temporal filtering.
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { TweetArraySchema } from "../schemas/tweet.js";
import { sanitizeUsername } from "../lib/utils.js";

/** MCP input schema for the get_user_mentions tool. */
export const GetUserMentionsInput = z.object({
  username: z
    .string()
    .regex(
      /^@?[A-Za-z0-9_]{1,50}$/,
      "Username must contain only letters, digits, or underscores (max 50 characters)"
    )
    .describe("Twitter/X username to find mentions for (with or without @)"),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .optional()
    .describe("Maximum number of mentions to return (default: 10)"),
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
 * Fetch tweets mentioning a Twitter/X user via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching GetUserMentionsInput.
 * @returns       Object with a `tweets` array of mention tweets, newest-first.
 */
export async function getUserMentions(
  client: GrokClient,
  input: z.infer<typeof GetUserMentionsInput>
) {
  const username = sanitizeUsername(input.username);
  const maxResults = input.max_results ?? 10;

  const dateRange =
    input.from_date || input.to_date
      ? ` between ${input.from_date ?? "the beginning"} and ${input.to_date ?? "now"}`
      : "";

  const prompt = `Find up to ${maxResults} recent tweets mentioning @${username} on Twitter/X${dateRange}.
Return as a JSON object with a "tweets" array.
For each tweet include: id, url, author (username, display_name, verified), text, created_at,
metrics (likes, retweets, replies, views if available), media if any, is_retweet, language.
Only return tweets from other accounts that mention @${username} — exclude tweets authored by @${username} themselves.
Sort by most recent first.`;

  // Mentions come from any account — no allowed_x_handles filter.
  return client.query(prompt, TweetArraySchema, "tweet_array", {
    from_date: input.from_date,
    to_date: input.to_date,
  });
}
