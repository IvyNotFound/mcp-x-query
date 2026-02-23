/**
 * Tool: get_tweet
 *
 * Retrieves a single tweet by its ID or full URL.
 * Returns the complete TweetSchema: author, text, metrics, media,
 * quoted tweet (if any), and reply context.
 *
 * Grok is instructed NOT to fabricate content: if the tweet does not exist
 * or is inaccessible, it must return an empty `id` field. The tool then
 * converts that into a thrown Error so the MCP host sees a clean error response.
 *
 * Input:
 *   tweet_id_or_url — raw tweet ID (e.g. "1234567890") or a full x.com / twitter.com URL
 *
 * Errors thrown:
 *   - Tweet not found / deleted / private (Grok returned empty id)
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { TweetSchema } from "../schemas/tweet.js";
import { extractTweetId } from "../lib/utils.js";

/** MCP input schema for the get_tweet tool. */
export const GetTweetInput = z.object({
  tweet_id_or_url: z
    .string()
    .describe("Tweet ID or full URL (x.com/twitter.com)"),
});

/**
 * Fetch a single tweet from Twitter/X via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching GetTweetInput.
 * @returns       Tweet object conforming to TweetSchema.
 * @throws        If the tweet is not found or the returned id doesn't match.
 */
export async function getTweet(
  client: GrokClient,
  input: z.infer<typeof GetTweetInput>
) {
  // Normalise: accept both raw IDs and full tweet URLs.
  const tweetId = extractTweetId(input.tweet_id_or_url);

  // The prompt is deliberately strict: Grok must return id="" for missing tweets
  // instead of hallucinating content. We detect this below.
  const prompt = `Retrieve the tweet with ID ${tweetId} from Twitter/X.
IMPORTANT: If the tweet does not exist, is deleted, or is inaccessible, return an object with id set to empty string "" and all other fields as empty/zero values. Do NOT fabricate tweet content.
If found, include: id (must be "${tweetId}"), url, author (username, display_name, verified), text, created_at,
metrics (likes, retweets, replies, views/bookmarks if available), media if any, in_reply_to if reply, is_retweet, language.
The tweet URL should be https://x.com/<username>/status/${tweetId}.`;

  const result = await client.query(prompt, TweetSchema, "tweet");

  // If Grok couldn't find the tweet it returns id="" — surface this as an error.
  if (!result.id || result.id !== tweetId) {
    throw new Error(`Tweet not found: ID "${tweetId}" does not exist, has been deleted, or is not accessible.`);
  }

  // Enrich each media item with a Grok-vision summary when media is present.
  if (result.media && result.media.length > 0) {
    result.media = await Promise.all(
      result.media.map(async (item) => {
        // For videos use the thumbnail (static frame); for images/GIFs use the direct URL.
        const urlToAnalyze =
          item.type === "video" ? (item.thumbnail_url ?? item.url) : item.url;

        if (!urlToAnalyze) return item;

        const summary = await client.analyzeMedia(
          urlToAnalyze,
          item.type,
          result.text
        );

        return summary ? { ...item, media_summary: summary } : item;
      })
    );
  }

  return result;
}
