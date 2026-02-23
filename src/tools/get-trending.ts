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

/** MCP input schema for the get_trending tool. */
export const GetTrendingInput = z.object({
  category: z
    .string()
    .optional()
    .describe(
      "Optional category filter (e.g. 'technology', 'sports', 'politics')"
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
  // Build an optional category clause for the prompt.
  const categoryFilter = input.category
    ? ` in the "${input.category}" category`
    : "";

  const prompt = `What are the current trending topics on Twitter/X${categoryFilter} right now?
Return as a JSON object with a "topics" array of trending topics.
For each topic include: name (the trending hashtag or topic),
tweet_count (approximate number of tweets if known), category (if classifiable),
and a brief description of why it's trending.
Return at least 10 trending topics if available.`;

  // No x_search handle filter — trending is platform-wide.
  return client.query(prompt, TrendingTopicsSchema, "trending_topics");
}
