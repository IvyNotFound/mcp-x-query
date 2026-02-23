/**
 * Tool: analyze_thread
 *
 * Retrieves a full Twitter/X conversation thread and performs a structured
 * analysis of its content in a single Grok call.
 *
 * The analysis returns:
 *   - thread author and root tweet reference
 *   - overall sentiment label + numeric score (-1.0 → 1.0)
 *   - percentage breakdown (positive / negative / neutral)
 *   - main topics and distinct arguments expressed across the thread
 *   - a narrative summary of the conversation
 *   - 3–5 representative tweets (root + notable replies)
 *
 * Implementation note:
 *   A single client.query() call handles both the x_search thread retrieval
 *   and the analysis — no second API round-trip needed.
 *
 * Input:
 *   tweet_id_or_url — any tweet ID or URL belonging to the thread
 *   max_tweets      — how many tweets to include in the analysis (5–50, default 20)
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { ThreadAnalysisSchema } from "../schemas/thread-analysis.js";
import { extractTweetId } from "../lib/utils.js";

/** MCP input schema for the analyze_thread tool. */
export const AnalyzeThreadInput = z.object({
  tweet_id_or_url: z
    .string()
    .describe("ID or URL of any tweet in the thread to analyze"),
  max_tweets: z
    .number()
    .int()
    .min(5)
    .max(50)
    .default(20)
    .optional()
    .describe("Maximum number of thread tweets to include in the analysis (default: 20)"),
});

/**
 * Retrieve a thread and analyze its content and tone via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching AnalyzeThreadInput.
 * @returns       ThreadAnalysis object conforming to ThreadAnalysisSchema.
 */
export async function analyzeThread(
  client: GrokClient,
  input: z.infer<typeof AnalyzeThreadInput>
) {
  const tweetId = extractTweetId(input.tweet_id_or_url);
  const maxTweets = input.max_tweets ?? 20;

  const prompt = `Retrieve the full Twitter/X conversation thread containing tweet ID ${tweetId}.
Collect up to ${maxTweets} tweets from the thread (starting with the root tweet, then key replies in chronological order).

Then analyze the thread and return a structured JSON object with exactly these fields:
- thread_author: username of the person who started the thread (no @)
- root_tweet_id: ID of the first tweet in the thread
- root_tweet_url: URL of the root tweet (https://x.com/<author>/status/<id>)
- total_tweets: number of tweets you actually analyzed
- overall_sentiment: one of "positive", "negative", "neutral", "mixed"
- sentiment_score: float from -1.0 (very negative) to 1.0 (very positive)
- sentiment_breakdown: object with positive_pct, negative_pct, neutral_pct (sum = 100)
- main_topics: array of 3–6 main topics or themes discussed across the thread
- key_arguments: array of distinct arguments or positions expressed (3–6 items)
- summary: 2–4 sentence narrative describing the thread content, tone, and main takeaways
- notable_tweets: array of 3–5 representative tweets, each with:
    id, url, text, author (username only, no @), sentiment ("positive"/"negative"/"neutral"), reason (why it's notable)

Base your analysis strictly on the tweets retrieved. Do not fabricate content.`;

  return client.query(prompt, ThreadAnalysisSchema, "thread_analysis");
}
