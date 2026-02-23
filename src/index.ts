/**
 * mcp-x-query — MCP Server Entry Point
 *
 * This is the root of the MCP server. It:
 *  1. Validates the XAI_API_KEY environment variable (hard-fails without it).
 *  2. Creates a shared GrokClient that wraps the Grok API.
 *  3. Registers all twelve MCP tools with their input schemas and descriptions.
 *  4. Starts a stdio-based transport so that MCP hosts (e.g. Claude Desktop)
 *     can communicate with this server via standard input/output.
 *
 * Architecture note:
 *  Each tool lives in its own file under src/tools/ and exports:
 *    - An `Input` Zod object (used as the MCP input schema)
 *    - An async function that performs the actual query via GrokClient
 *
 * Error handling:
 *  The `run()` helper converts any thrown Error into a proper MCP error
 *  response (isError: true) so the host always receives a structured reply.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GrokClient } from "./lib/grok-client.js";
import { GrokAuthError, GrokRateLimitError, GrokCircuitOpenError } from "./lib/errors.js";
import { log } from "./lib/logger.js";
import { GetTweetInput, getTweet } from "./tools/get-tweet.js";
import {
  GetTweetRepliesInput,
  getTweetReplies,
} from "./tools/get-tweet-replies.js";
import { GetUserTweetsInput, getUserTweets } from "./tools/get-user-tweets.js";
import {
  GetUserProfileInput,
  getUserProfile,
} from "./tools/get-user-profile.js";
import { SearchTweetsInput, searchTweets } from "./tools/search-tweets.js";
import { GetThreadInput, getThread } from "./tools/get-thread.js";
import { GetTrendingInput, getTrending } from "./tools/get-trending.js";
import { AnalyzeSentimentInput, analyzeSentiment } from "./tools/analyze-sentiment.js";
import { AnalyzeThreadInput, analyzeThread } from "./tools/analyze-thread.js";
import { ExtractLinksInput, extractLinks } from "./tools/extract-links.js";
import {
  GetUserMentionsInput,
  getUserMentions,
} from "./tools/get-user-mentions.js";
import { GetListTweetsInput, getListTweets } from "./tools/get-list-tweets.js";

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const apiKey = process.env.XAI_API_KEY;
if (!apiKey) {
  log("fatal", "XAI_API_KEY environment variable is required.");
  process.exit(1);
}
if (!/^xai-[A-Za-z0-9]{40,}$/.test(apiKey)) {
  log("fatal", "XAI_API_KEY format is invalid. Expected: xai-<40+ alphanumeric characters>.");
  process.exit(1);
}

// Single shared GrokClient — stateless, safe to reuse across tool calls.
const grok = new GrokClient(apiKey);

const server = new McpServer({
  name: "mcp-x-query",
  version: "1.0.0",
});

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Wraps a tool call and converts any thrown error into an MCP error response.
 *
 * MCP hosts expect one of two shapes:
 *   - Success: { content: [{ type: "text", text: "..." }] }
 *   - Failure: { isError: true, content: [{ type: "text", text: "Error: ..." }] }
 *
 * Using this wrapper ensures every tool always returns the correct shape,
 * even when GrokClient throws or a validation error occurs.
 */
async function run<T>(
  tool: string,
  fn: () => Promise<T>
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  try {
    const result = await fn();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (err instanceof GrokAuthError) {
      // Fatal — wrong or expired key. Log prominently so the operator notices.
      log("error", "Authentication error", { tool, detail: message });
    } else if (err instanceof GrokRateLimitError) {
      log("warn", "Rate limit exceeded", { tool, detail: message });
    } else if (err instanceof GrokCircuitOpenError) {
      log("warn", "Circuit open — Grok API unavailable", { tool, retryInMs: err.retryInMs });
    } else {
      log("error", "Tool error", { tool, detail: message });
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${message}` }],
    };
  }
}

// ─── Tool registrations ───────────────────────────────────────────────────────

// get_tweet — retrieve a single tweet by ID or URL (full schema: media, metrics, quoted tweet…)
server.tool(
  "get_tweet",
  "Retrieve a single tweet by its ID or URL (full data: media, quoted tweet, metrics)",
  GetTweetInput.shape,
  (input) => run("get_tweet", () => getTweet(grok, input))
);

// get_tweet_replies — fetch the most-engaged replies to a tweet, with optional date range
server.tool(
  "get_tweet_replies",
  "Get replies to a tweet by its ID or URL, with optional date range (from_date/to_date)",
  GetTweetRepliesInput.shape,
  (input) => run("get_tweet_replies", () => getTweetReplies(grok, input))
);

// get_user_tweets — timeline for a given handle, with optional date range and media enrichment
server.tool(
  "get_user_tweets",
  "Get recent tweets from a Twitter/X user, with optional date range and enrich_media (Grok Vision analysis)",
  GetUserTweetsInput.shape,
  (input) => run("get_user_tweets", () => getUserTweets(grok, input))
);

// get_user_profile — bio, counters, pinned tweet, verification status
server.tool(
  "get_user_profile",
  "Get the profile information of a Twitter/X user",
  GetUserProfileInput.shape,
  (input) => run("get_user_profile", () => getUserProfile(grok, input))
);

// search_tweets — full-text search supporting Twitter operators, with optional media enrichment
server.tool(
  "search_tweets",
  "Search Twitter/X for tweets matching a query, with optional date range and enrich_media (Grok Vision analysis)",
  SearchTweetsInput.shape,
  (input) => run("search_tweets", () => searchTweets(grok, input))
);

// get_thread — reconstruct a full conversation thread from any tweet in it
server.tool(
  "get_thread",
  "Retrieve the full conversation thread for any tweet. Use verbose:true for complete fields (media, quoted_tweet, etc.)",
  GetThreadInput.shape,
  (input) => run("get_thread", () => getThread(grok, input))
);

// get_trending — current trending topics, optionally filtered by category and country
server.tool(
  "get_trending",
  "Get currently trending topics on Twitter/X, with optional category and country/region filter",
  GetTrendingInput.shape,
  (input) => run("get_trending", () => getTrending(grok, input))
);

// analyze_sentiment — fetch tweets for a query and analyze collective sentiment
server.tool(
  "analyze_sentiment",
  "Analyze the sentiment of tweets about a topic or query: returns overall sentiment, score, breakdown, dominant topics/emotions, and representative tweets",
  AnalyzeSentimentInput.shape,
  (input) => run("analyze_sentiment", () => analyzeSentiment(grok, input))
);

// analyze_thread — retrieve a thread and analyze its content, sentiment, and arguments
server.tool(
  "analyze_thread",
  "Retrieve a full Twitter/X thread and analyze its sentiment, key arguments, topics, and tone",
  AnalyzeThreadInput.shape,
  (input) => run("analyze_thread", () => analyzeThread(grok, input))
);

// extract_links — aggregate and summarize all external URLs shared by a user
server.tool(
  "extract_links",
  "Extract and summarize all external links shared by a Twitter/X user, with optional date range",
  ExtractLinksInput.shape,
  (input) => run("extract_links", () => extractLinks(grok, input))
);

// get_user_mentions — tweets from other accounts mentioning a given user
server.tool(
  "get_user_mentions",
  "Get recent tweets mentioning a Twitter/X user (@username), with optional date range",
  GetUserMentionsInput.shape,
  (input) => run("get_user_mentions", () => getUserMentions(grok, input))
);

// get_list_tweets — tweets from a Twitter/X list by ID or URL, with pagination
server.tool(
  "get_list_tweets",
  "Get recent tweets from a Twitter/X list by its ID or URL, with optional date range and cursor-based pagination",
  GetListTweetsInput.shape,
  (input) => run("get_list_tweets", () => getListTweets(grok, input))
);

// ─── Start server ─────────────────────────────────────────────────────────────

// StdioServerTransport reads from stdin and writes to stdout.
// MCP hosts (Claude Desktop, etc.) spawn this process and communicate over stdio.
const transport = new StdioServerTransport();
await server.connect(transport);
log("info", "MCP server started. Listening on stdio.");
