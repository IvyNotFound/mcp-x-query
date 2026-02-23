/**
 * Tool: get_thread
 *
 * Reconstructs a full conversation thread from any tweet in the chain.
 * Works regardless of whether the provided tweet is the root, a mid-thread
 * reply, or the final tweet in the thread.
 *
 * How thread reconstruction works:
 *   1. Grok looks up the given tweet ID.
 *   2. It walks UP the `in_reply_to` chain to find all ancestor tweets.
 *   3. It also collects direct replies that continue the thread.
 *   4. The result is sorted chronologically (root tweet first).
 *
 * Two output modes:
 *   - Normal (default): ThreadTweetSchema — lean fields only, up to 20 tweets.
 *     Reduces token usage significantly for long threads.
 *   - Verbose (verbose:true): TweetSchema — full fields including media,
 *     quoted tweets, views, bookmarks. Max 10 tweets to avoid truncation.
 *
 * Input:
 *   tweet_id_or_url — any tweet in the thread (ID or full URL)
 *   max_tweets      — maximum tweets to return (1–50, default 20 / 10 verbose)
 *   verbose         — when true, use full TweetSchema (default false)
 *
 * Errors thrown:
 *   - Thread not found (Grok returned empty tweets array)
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { ThreadSchema, TweetArraySchema } from "../schemas/tweet.js";
import { extractTweetId } from "../lib/utils.js";

/** MCP input schema for the get_thread tool. */
export const GetThreadInput = z.object({
  tweet_id_or_url: z
    .string()
    .describe("ID or URL of any tweet in the thread (start, middle, or end)"),
  max_tweets: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .optional()
    .describe("Maximum number of tweets to return (default: 20)"),
  verbose: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      "When true, returns full tweet data: media, quoted_tweet, language, views, bookmarks. Reduces max_tweets to 10 to avoid truncation."
    ),
});

/**
 * Fetch and reconstruct a conversation thread via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching GetThreadInput.
 * @returns       Object with a `tweets` array (root tweet first).
 * @throws        If Grok returns no tweets (tweet not found / private).
 */
export async function getThread(
  client: GrokClient,
  input: z.infer<typeof GetThreadInput>
) {
  const tweetId = extractTweetId(input.tweet_id_or_url);
  const verbose = input.verbose ?? false;

  // Verbose mode caps at 10 tweets because the full schema is much larger.
  // The cap is enforced even when the caller explicitly passes a higher value.
  const requestedMax = input.max_tweets ?? (verbose ? 10 : 20);
  const maxTweets = verbose ? Math.min(requestedMax, 10) : requestedMax;

  // Build a fields section appropriate for the selected mode.
  const fieldsPrompt = verbose
    ? `For each tweet include: id, url, author (username, display_name, verified, profile_image_url), text, created_at,
metrics (likes, retweets, replies, views, bookmarks), media (type, url, alt_text if available),
quoted_tweet (id, url, author, text, metrics) if applicable, in_reply_to if applicable, is_retweet, language.`
    : `For each tweet include: id, url, author (username, display_name, verified), text (max 300 chars, truncate if longer),
created_at, metrics (likes, retweets, replies), in_reply_to if applicable.`;

  const prompt = `Retrieve the conversation thread containing tweet ID ${tweetId} on Twitter/X.
Steps:
1. Find tweet ID ${tweetId}.
2. Walk UP the reply chain (follow in_reply_to) to find all ancestor tweets up to the root, regardless of author.
3. Include direct replies that are part of this conversation chain.
4. Return at most ${maxTweets} tweets total, prioritizing the direct ancestor chain (root → tweet ID ${tweetId}).

Return as a JSON object with a "tweets" array sorted chronologically (root first).
${fieldsPrompt}`;

  // Use the appropriate schema depending on verbosity.
  const result = verbose
    ? await client.query(prompt, TweetArraySchema, "tweet_array")
    : await client.query(prompt, ThreadSchema, "thread");

  // An empty tweets array means Grok couldn't find the tweet.
  if (result.tweets.length === 0) {
    throw new Error(`Tweet not found: ID "${tweetId}" does not exist, is private, or has been deleted.`);
  }

  return result;
}
