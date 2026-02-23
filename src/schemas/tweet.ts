/**
 * Tweet Schemas (Zod)
 *
 * Defines the data shapes returned by tweet-related MCP tools.
 * All schemas are validated by Zod and also converted to JSON Schema
 * to instruct Grok on the expected response format (see GrokClient.query).
 *
 * Schema hierarchy:
 *
 *   MediaSchema          — an image, video, or GIF attachment
 *   AuthorSchema         — minimal author info attached to every tweet
 *   InReplyToSchema      — parent tweet reference (id + username)
 *   MetricsSchema        — engagement counters (likes, retweets…)
 *   QuotedTweetSchema    — flat quoted tweet (no recursive quoted_tweet)
 *   TweetSchema          — full tweet (used by most tools)
 *   TweetArraySchema     — wrapper: { tweets: TweetSchema[] }
 *   ThreadTweetSchema    — lean tweet variant for thread queries (fewer fields)
 *   ThreadSchema         — wrapper: { tweets: ThreadTweetSchema[] }
 */

import { z } from "zod";

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/** A single media attachment (image, video, or GIF) embedded in a tweet. */
const MediaSchema = z.object({
  type: z.enum(["image", "video", "gif"]),
  url: z.string(),
  thumbnail_url: z.string().optional(), // Video only: thumbnail frame URL
  alt_text: z.string().optional(),      // Accessibility description
  media_summary: z.string().optional(), // AI-generated description (populated post-fetch, not by Grok x_search)
});

/** Minimal author info embedded inside every tweet object. */
const AuthorSchema = z.object({
  username: z.string(),
  display_name: z.string(),
  verified: z.boolean(),               // True if account has any verification badge
  profile_image_url: z.string().optional(),
});

/** Reference to the tweet this tweet is replying to. */
const InReplyToSchema = z.object({
  tweet_id: z.string(),
  username: z.string(),                // Handle of the author of the parent tweet
});

/** Public engagement counters for a tweet. */
const MetricsSchema = z.object({
  likes: z.number(),
  retweets: z.number(),
  replies: z.number(),
  views: z.number().optional(),        // Not always available via API
  bookmarks: z.number().optional(),    // Not always available via API
});

/**
 * Flat quoted tweet — intentionally has no nested `quoted_tweet` field.
 * This prevents circular self-references that Zod and JSON Schema cannot express.
 */
const QuotedTweetSchema = z.object({
  id: z.string(),
  url: z.string(),
  author: AuthorSchema,
  text: z.string(),
  created_at: z.string(),
  metrics: MetricsSchema,
  media: z.array(MediaSchema).optional(),
  is_retweet: z.boolean(),
});

// ─── Full tweet schema ────────────────────────────────────────────────────────

/**
 * Complete tweet shape returned by get_tweet, get_tweet_replies,
 * get_user_tweets, search_tweets, and get_thread (verbose mode).
 */
export const TweetSchema = z.object({
  id: z.string(),
  url: z.string(),
  author: AuthorSchema,
  text: z.string(),
  created_at: z.string(),             // ISO 8601 timestamp
  metrics: MetricsSchema,
  media: z.array(MediaSchema).optional(),
  quoted_tweet: QuotedTweetSchema.optional(),
  in_reply_to: InReplyToSchema.optional(),
  is_retweet: z.boolean(),
  language: z.string().optional(),    // BCP-47 language code (e.g. "en")
});

export type Tweet = z.infer<typeof TweetSchema>;

/** Wrapper used when a tool returns multiple tweets. */
export const TweetArraySchema = z.object({
  tweets: z.array(TweetSchema),
});

// ─── Lean thread schema ───────────────────────────────────────────────────────

/**
 * Reduced tweet shape used by get_thread (non-verbose mode).
 *
 * Omitting media, quoted_tweet, and language significantly reduces token usage,
 * allowing threads of up to 20 tweets to fit within the model's output budget.
 * Use `verbose: true` on the get_thread tool to get the full TweetSchema instead.
 */
export const ThreadTweetSchema = z.object({
  id: z.string(),
  url: z.string(),
  author: z.object({
    username: z.string(),
    display_name: z.string(),
    verified: z.boolean(),
    // profile_image_url intentionally omitted to save tokens
  }),
  text: z.string(),                   // Truncated to 300 chars in the prompt
  created_at: z.string(),
  metrics: z.object({
    likes: z.number(),
    retweets: z.number(),
    replies: z.number(),
    // views / bookmarks omitted to save tokens
  }),
  in_reply_to: InReplyToSchema.optional(),
});

/** Wrapper for thread results (sorted chronologically: root tweet first). */
export const ThreadSchema = z.object({
  tweets: z.array(ThreadTweetSchema),
});
