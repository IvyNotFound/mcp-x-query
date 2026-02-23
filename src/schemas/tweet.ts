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
 *
 * Null-tolerance notes:
 *   Fields marked with .nullish() accept both null (returned by Grok when a
 *   field is unavailable) and undefined (absent from the JSON object).
 *   Tweet IDs use z.coerce.string() because Grok occasionally returns them
 *   as numbers rather than quoted strings.
 */

import { z } from "zod";

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/** A single media attachment (image, video, or GIF) embedded in a tweet. */
const MediaSchema = z.object({
  // Grok may return Twitter API type names ("photo", "animated_gif") instead of
  // our enum values. .catch() defaults unknown values to "image" to stay valid.
  type: z.enum(["image", "video", "gif"]).catch("image"),
  url: z.string(),
  thumbnail_url: z.string().nullish(), // Video only: thumbnail frame URL
  alt_text: z.string().nullish(),      // Accessibility description
  media_summary: z.string().nullish(), // AI-generated description (populated post-fetch, not by Grok x_search)
});

/** Minimal author info embedded inside every tweet object. */
const AuthorSchema = z.object({
  username: z.string(),
  display_name: z.string(),
  verified: z.boolean(),               // True if account has any verification badge
  profile_image_url: z.string().nullish(),
});

/** Reference to the tweet this tweet is replying to. */
const InReplyToSchema = z.object({
  tweet_id: z.string().optional(),     // May be absent if Grok omits it
  username: z.string(),                // Handle of the author of the parent tweet
});

/** Public engagement counters for a tweet. */
const MetricsSchema = z.object({
  likes: z.number(),
  retweets: z.number(),
  replies: z.number(),
  views: z.number().nullish(),         // Grok returns null when unavailable
  bookmarks: z.number().nullish(),     // Grok returns null when unavailable
});

/**
 * Flat quoted tweet — intentionally has no nested `quoted_tweet` field.
 * This prevents circular self-references that Zod and JSON Schema cannot express.
 */
const QuotedTweetSchema = z.object({
  id: z.coerce.string(),               // Grok may return numeric IDs
  url: z.string(),
  author: AuthorSchema,
  text: z.string(),
  created_at: z.string(),
  metrics: MetricsSchema,
  media: z.array(MediaSchema).nullish(),
  is_retweet: z.boolean(),
});

// ─── Full tweet schema ────────────────────────────────────────────────────────

/**
 * Complete tweet shape returned by get_tweet, get_tweet_replies,
 * get_user_tweets, search_tweets, and get_thread (verbose mode).
 */
export const TweetSchema = z.object({
  id: z.coerce.string(),               // Grok may return numeric IDs
  url: z.string(),
  author: AuthorSchema,
  text: z.string(),
  created_at: z.string(),             // ISO 8601 timestamp
  metrics: MetricsSchema,
  media: z.array(MediaSchema).nullish(),
  quoted_tweet: QuotedTweetSchema.nullish(),
  // Grok sometimes returns a string (e.g. "") instead of an object for non-replies.
  // Preprocess: coerce any non-object to null so the rest of the schema stays clean.
  in_reply_to: z.preprocess(
    (v) => (v !== null && typeof v === "object" ? v : null),
    InReplyToSchema.nullish()
  ),
  is_retweet: z.boolean(),
  language: z.string().nullish(),     // BCP-47 language code (e.g. "en")
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
  id: z.coerce.string(),               // Grok may return numeric IDs
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
  in_reply_to: z.preprocess(
    (v) => (v !== null && typeof v === "object" ? v : null),
    InReplyToSchema.nullish()
  ),
});

/** Wrapper for thread results (sorted chronologically: root tweet first). */
export const ThreadSchema = z.object({
  tweets: z.array(ThreadTweetSchema),
});
