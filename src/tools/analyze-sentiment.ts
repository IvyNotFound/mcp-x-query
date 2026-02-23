/**
 * Tool: analyze_sentiment
 *
 * Searches Twitter/X for tweets matching a query, then performs a
 * sentiment analysis on the resulting corpus via a single Grok call.
 *
 * The analysis returns:
 *   - overall sentiment label + numeric score (-1.0 → 1.0)
 *   - percentage breakdown (positive / negative / neutral)
 *   - dominant topics and emotions detected across the corpus
 *   - a narrative summary of the discourse
 *   - 3–5 representative "notable" tweets
 *
 * Implementation note:
 *   A single client.query() call handles both the x_search retrieval and
 *   the analysis. Grok receives the corpus via x_search and is instructed
 *   to return a structured JSON analysis — no second API round-trip needed.
 *
 * Input:
 *   query       — topic or search expression (Twitter operators supported)
 *   max_tweets  — corpus size to analyze (5–100, default 30)
 *   from_date   — optional start date YYYY-MM-DD
 *   to_date     — optional end date YYYY-MM-DD
 *   language    — optional BCP-47 language code filter (e.g. "fr", "en")
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { SentimentAnalysisSchema } from "../schemas/sentiment.js";
import { escapeForPrompt } from "../lib/utils.js";

/** MCP input schema for the analyze_sentiment tool. */
export const AnalyzeSentimentInput = z.object({
  query: z
    .string()
    .describe("Topic or search query to analyze (supports Twitter operators)"),
  max_tweets: z
    .number()
    .int()
    .min(5)
    .max(100)
    .default(30)
    .optional()
    .describe("Number of tweets to analyze (default: 30)"),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("Start date in YYYY-MM-DD format"),
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe("End date in YYYY-MM-DD format"),
  language: z
    .string()
    .optional()
    .describe("Filter by language code (e.g. 'fr', 'en')"),
});

/**
 * Fetch tweets matching a query and analyze their collective sentiment via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching AnalyzeSentimentInput.
 * @returns       SentimentAnalysis object conforming to SentimentAnalysisSchema.
 */
export async function analyzeSentiment(
  client: GrokClient,
  input: z.infer<typeof AnalyzeSentimentInput>
) {
  const maxTweets = input.max_tweets ?? 30;
  // Language filter is passed as an explicit search constraint separate from
  // the query narrative — embedding `lang:xx` inside the quoted query string
  // is ambiguous and may be ignored by Grok's prompt parser.
  const langInstruction = input.language
    ? `\nIMPORTANT: Restrict results to tweets written in language "${escapeForPrompt(input.language)}" — apply the lang:${escapeForPrompt(input.language)} Twitter search operator to your x_search query.`
    : "";
  const dateRange =
    input.from_date || input.to_date
      ? ` between ${input.from_date ?? "the beginning"} and ${input.to_date ?? "now"}`
      : "";

  const prompt = `Search Twitter/X for ${maxTweets} recent tweets about the topic below${dateRange}.${langInstruction}
<query>${escapeForPrompt(input.query)}</query>

Analyze the sentiment of this corpus and return a structured JSON object with exactly these fields:
- query: the topic you analyzed (string)
- total_tweets_analyzed: exact count of tweets you analyzed (integer)
- overall_sentiment: one of "positive", "negative", "neutral", "mixed"
- sentiment_score: float from -1.0 (very negative) to 1.0 (very positive)
- sentiment_breakdown: object with positive_pct, negative_pct, neutral_pct (each 0–100, sum must equal 100)
- dominant_topics: array of 3–7 main sub-topics or themes found in the tweets
- dominant_emotions: array of dominant emotions detected (e.g. "excitement", "frustration", "hope", "anger", "admiration")
- summary: 2–4 sentence narrative describing the overall discourse, key opinions, and context
- notable_tweets: array of 3–5 representative tweets, each with:
    id, url, text, author (username only, no @), sentiment ("positive"/"negative"/"neutral"), reason (why it's notable)

Base your analysis strictly on the tweets retrieved. Do not fabricate content.`;

  return client.query(prompt, SentimentAnalysisSchema, "sentiment_analysis", {
    from_date: input.from_date,
    to_date: input.to_date,
  });
}
