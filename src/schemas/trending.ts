/**
 * Trending Topics Schema (Zod)
 *
 * Describes the shape returned by the get_trending MCP tool.
 * Grok is asked to return at least 10 topics; the actual count depends
 * on what is currently trending and the optional category filter.
 */

import { z } from "zod";

/** A single trending topic on Twitter/X. */
export const TrendingTopicSchema = z.object({
  name: z.string(),                   // Hashtag or topic name (e.g. "#AI" or "World Cup")
  tweet_count: z.number().nullish(),  // Approximate volume; Grok returns null when unknown
  category: z.string().nullish(),     // e.g. "technology", "sports", "politics"
  description: z.string().nullish(),  // Brief explanation of why it's trending
});

/** Wrapper returned by get_trending — always contains a "topics" array. */
export const TrendingTopicsSchema = z.object({
  topics: z.array(TrendingTopicSchema),
});
