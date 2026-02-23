/**
 * Tool: extract_links
 *
 * Fetches recent tweets from a user and aggregates all external URLs they
 * shared, with domain, optional title, and a brief content summary per link.
 *
 * Useful for monitoring what sources a person cites, tracking reading lists,
 * or auditing the external content promoted by a given account.
 *
 * Returns a LinkExtractSchema: { username, total_links, links: [...] }
 *
 * Input:
 *   username    — Twitter/X handle (with or without @)
 *   max_tweets  — number of recent tweets to scan (10–100, default 50)
 *   from_date   — optional start date YYYY-MM-DD
 *   to_date     — optional end date YYYY-MM-DD
 *
 * Implementation note:
 *   A single client.query() call uses x_search with allowed_x_handles to
 *   scope the search to the target user, then instructs Grok to extract and
 *   summarise all external links found in the retrieved tweets.
 */

import { z } from "zod";
import type { GrokClient } from "../lib/grok-client.js";
import { LinkExtractSchema } from "../schemas/link-extract.js";
import { sanitizeUsername } from "../lib/utils.js";

/** MCP input schema for the extract_links tool. */
export const ExtractLinksInput = z.object({
  username: z
    .string()
    .regex(
      /^@?[A-Za-z0-9_]{1,50}$/,
      "Username must contain only letters, digits, or underscores (max 50 characters)"
    )
    .describe("Twitter/X username to scan (with or without @)"),
  max_tweets: z
    .number()
    .int()
    .min(10)
    .max(100)
    .default(50)
    .optional()
    .describe("Number of recent tweets to scan for links (default: 50, max: 100)"),
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
});

/**
 * Scan a user's recent tweets and extract all shared external links via Grok.
 *
 * @param client  Shared GrokClient instance.
 * @param input   Validated input matching ExtractLinksInput.
 * @returns       LinkExtract object conforming to LinkExtractSchema.
 */
export async function extractLinks(
  client: GrokClient,
  input: z.infer<typeof ExtractLinksInput>
) {
  const username = sanitizeUsername(input.username);
  const maxTweets = input.max_tweets ?? 50;
  const dateRange =
    input.from_date || input.to_date
      ? ` between ${input.from_date ?? "the beginning"} and ${input.to_date ?? "now"}`
      : "";

  const prompt = `Retrieve the ${maxTweets} most recent tweets from @${username} on Twitter/X${dateRange}.

Extract every external URL shared in those tweets (ignore t.co wrappers — resolve to the final destination URL).
Exclude Twitter/X internal links (x.com, twitter.com) and media attachments.

Return a JSON object with:
- username: "${username}"
- total_links: exact count of distinct external links found
- links: array of all links, each with:
    url: full resolved URL
    domain: domain name only (e.g. "arxiv.org", "reuters.com")
    title: page title or anchor text if available (omit if unknown)
    summary: 1–2 sentences describing what the link is about, based on context from the tweet text
    shared_at: ISO 8601 timestamp of the tweet (omit if unknown)
    tweet_id: ID of the tweet that shared this link (omit if unknown)

Deduplicate: if the same URL appears in multiple tweets, include it once with the earliest shared_at.
If no external links are found, return total_links: 0 and an empty links array.`;

  return client.query(prompt, LinkExtractSchema, "link_extract", {
    allowed_x_handles: [username],
    from_date: input.from_date,
    to_date: input.to_date,
  });
}
