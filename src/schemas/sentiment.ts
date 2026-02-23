/**
 * Sentiment Analysis Schema (Zod)
 *
 * Describes the shape returned by the analyze_sentiment MCP tool.
 * The analysis covers a corpus of tweets fetched via x_search,
 * returning aggregate sentiment, topic clusters, and representative examples.
 */

import { z } from "zod";

/** Percentage breakdown of sentiment poles across the analyzed corpus. */
export const SentimentBreakdownSchema = z.object({
  positive_pct: z.number().describe("Percentage of positive tweets (0–100)"),
  negative_pct: z.number().describe("Percentage of negative tweets (0–100)"),
  neutral_pct:  z.number().describe("Percentage of neutral tweets (0–100)"),
});

/** A single representative tweet picked from the corpus. */
export const NotableTweetSchema = z.object({
  id:        z.string(),
  url:       z.string(),
  text:      z.string(),
  author:    z.string().describe("Twitter username (without @)"),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  reason:    z.string().describe("Why this tweet is representative or notable"),
});

/** Full sentiment analysis result returned to the MCP host. */
export const SentimentAnalysisSchema = z.object({
  query:                  z.string().describe("The topic or query that was analyzed"),
  total_tweets_analyzed:  z.number().int().describe("Number of tweets included in the analysis"),
  overall_sentiment:      z.enum(["positive", "negative", "neutral", "mixed"]),
  sentiment_score:        z.number().describe("Aggregate score from -1.0 (very negative) to 1.0 (very positive)"),
  sentiment_breakdown:    SentimentBreakdownSchema,
  dominant_topics:        z.array(z.string()).describe("Main sub-topics or themes found in the corpus (3–7 items)"),
  dominant_emotions:      z.array(z.string()).describe("Dominant emotions detected, e.g. excitement, frustration, hope"),
  summary:                z.string().describe("2–4 sentence narrative of the overall discourse and key opinions"),
  notable_tweets:         z.array(NotableTweetSchema).describe("3–5 representative tweets, one per sentiment pole + most viral"),
});
