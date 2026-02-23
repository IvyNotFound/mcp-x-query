/**
 * Link Extraction Schema (Zod)
 *
 * Describes the shape returned by the extract_links MCP tool.
 * Aggregates all external URLs shared by a user over a given period,
 * with domain, optional title, and a brief content summary.
 */

import { z } from "zod";

/** A single external link extracted from a user's tweets. */
export const ExtractedLinkSchema = z.object({
  url:        z.string().describe("Full URL of the shared link"),
  domain:     z.string().describe("Domain name (e.g. arxiv.org, reuters.com)"),
  title:      z.string().nullish().describe("Page title or link text when available"),
  summary:    z.string().describe("Brief description of what the link is about (1–2 sentences)"),
  shared_at:  z.string().nullish().describe("ISO 8601 timestamp of the tweet that shared this link"),
  tweet_id:   z.string().nullish().describe("ID of the tweet that shared this link"),
});

/** Full result returned by extract_links — always contains a `links` array. */
export const LinkExtractSchema = z.object({
  username:    z.string().describe("Twitter/X username (without @)"),
  total_links: z.number().int().describe("Total number of distinct links found"),
  links:       z.array(ExtractedLinkSchema),
});
