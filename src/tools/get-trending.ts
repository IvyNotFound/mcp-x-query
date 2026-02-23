/**
 * Tool: get_trending
 *
 * Returns currently trending topics on Twitter/X.
 * Grok is asked to return at least 10 topics with name, tweet volume,
 * category, and a short description of why the topic is trending.
 *
 * Input:
 *   category — optional filter (e.g. "technology", "sports", "politics")
 *              When omitted, all trending topics are returned.
 *
 * Note:
 *   Trending data is sourced in real-time via Grok's x_search tool.
 *   Results reflect what is trending at the time of the API call.
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { TrendingTopicsSchema } from "../schemas/trending.js";
import { join } from "node:path";
import { TtlCache, PersistentTtlCache } from "../lib/cache.js";
import { escapeForPrompt } from "../lib/utils.js";

// Trending topics rarely change within a 5-minute window; caching avoids
// redundant API calls when the same category is queried in quick succession.
// If CACHE_DIR is set the cache persists across server restarts (JSON file).
// Exported so test suites can call cache.clear() between tests.
const CACHE_DIR = process.env.CACHE_DIR;
export const trendingCache: TtlCache<string, z.infer<typeof TrendingTopicsSchema>> = CACHE_DIR
  ? new PersistentTtlCache<z.infer<typeof TrendingTopicsSchema>>(
      5 * 60_000,
      join(CACHE_DIR, "trending.json")
    )
  : new TtlCache<string, z.infer<typeof TrendingTopicsSchema>>(5 * 60_000);

/** MCP input schema for the get_trending tool. */
export const GetTrendingInput = z.object({
  category: z
    .string()
    .optional()
    .describe(
      "Optional category filter (e.g. 'technology', 'sports', 'politics')"
    ),
  country: z
    .string()
    .optional()
    .describe(
      "Optional country or region filter (e.g. 'France', 'United States', 'worldwide')"
    ),
});

/**
 * Fetch current trending topics from Twitter/X via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching GetTrendingInput.
 * @returns       Object with a `topics` array of trending topic objects.
 */
export async function getTrending(
  client: GrokClient,
  input: z.infer<typeof GetTrendingInput>
) {
  // Use category + country as the cache key.
  const categorySuffix = input.category ? input.category.toLowerCase().trim() : "";
  const countrySuffix = input.country ? input.country.toLowerCase().trim() : "";
  const cacheKey = `${categorySuffix}|${countrySuffix}`;
  const cached = trendingCache.get(cacheKey);
  if (cached) return cached;

  // Build optional clause fragments for the prompt.
  const categoryFilter = input.category
    ? ` in the <category>${escapeForPrompt(input.category)}</category> category`
    : "";
  const countryFilter = input.country
    ? ` in <country>${escapeForPrompt(input.country)}</country>`
    : "";

  const prompt = `What are the current trending topics on Twitter/X${categoryFilter}${countryFilter} right now?
Return as a JSON object with a "topics" array of trending topics.
For each topic include: name (the trending hashtag or topic),
tweet_count (approximate number of tweets if known), category (if classifiable),
and a brief description of why it's trending.
Return at least 10 trending topics if available.`;

  // No x_search handle filter — trending is platform-wide.
  const result = await client.query(prompt, TrendingTopicsSchema, "trending_topics");
  trendingCache.set(cacheKey, result);
  return result;
}
