/**
 * Thread Analysis Schema (Zod)
 *
 * Describes the shape returned by the analyze_thread MCP tool.
 * Covers the full conversation thread starting from a given tweet:
 * sentiment, key arguments, topic clusters, and representative excerpts.
 *
 * Sub-schemas SentimentBreakdownSchema and NotableTweetSchema are imported
 * from sentiment.ts to avoid duplication.
 */

import { z } from "zod";
import { SentimentBreakdownSchema, NotableTweetSchema } from "./sentiment.js";

/** Full analysis result for a Twitter/X thread. */
export const ThreadAnalysisSchema = z.object({
  thread_author:      z.string().describe("Username of the thread starter (without @)"),
  root_tweet_id:      z.string().describe("ID of the first tweet in the thread"),
  root_tweet_url:     z.string().describe("URL of the root tweet"),
  total_tweets:       z.number().int().describe("Number of tweets analyzed in the thread"),
  overall_sentiment:  z.enum(["positive", "negative", "neutral", "mixed"]),
  sentiment_score:    z.number().describe("Aggregate score from -1.0 (very negative) to 1.0 (very positive)"),
  sentiment_breakdown: SentimentBreakdownSchema,
  main_topics:        z.array(z.string()).describe("Main topics or themes discussed across the thread (3–6 items)"),
  key_arguments:      z.array(z.string()).describe("Distinct arguments or positions expressed by participants"),
  summary:            z.string().describe("2–4 sentence narrative summary of the thread content and tone"),
  notable_tweets:     z.array(NotableTweetSchema).describe("3–5 representative tweets (root + key replies)"),
});
