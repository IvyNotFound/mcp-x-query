/**
 * Snapshot tests for MCP tool input schemas.
 *
 * Serialises each tool's Input Zod schema to JSON Schema via zodToJsonSchema
 * and asserts it matches a stored snapshot. Any accidental change to a tool's
 * public signature (added/removed/renamed field, changed validation rule) will
 * cause a snapshot mismatch and must be reviewed intentionally.
 *
 * To update snapshots after an intentional change:
 *   npm test -- --update-snapshots
 */

import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { GetTweetInput } from "../tools/get-tweet.js";
import { GetTweetRepliesInput } from "../tools/get-tweet-replies.js";
import { GetUserTweetsInput } from "../tools/get-user-tweets.js";
import { GetUserProfileInput } from "../tools/get-user-profile.js";
import { SearchTweetsInput } from "../tools/search-tweets.js";
import { GetThreadInput } from "../tools/get-thread.js";
import { GetTrendingInput } from "../tools/get-trending.js";
import { AnalyzeSentimentInput } from "../tools/analyze-sentiment.js";
import { AnalyzeThreadInput } from "../tools/analyze-thread.js";
import { ExtractLinksInput } from "../tools/extract-links.js";
import { GetUserMentionsInput } from "../tools/get-user-mentions.js";
import { GetListTweetsInput } from "../tools/get-list-tweets.js";

const SCHEMA_OPTS = { $refStrategy: "none" } as const;

const tools = [
  ["get_tweet", GetTweetInput],
  ["get_tweet_replies", GetTweetRepliesInput],
  ["get_user_tweets", GetUserTweetsInput],
  ["get_user_profile", GetUserProfileInput],
  ["search_tweets", SearchTweetsInput],
  ["get_thread", GetThreadInput],
  ["get_trending", GetTrendingInput],
  ["analyze_sentiment", AnalyzeSentimentInput],
  ["analyze_thread", AnalyzeThreadInput],
  ["extract_links", ExtractLinksInput],
  ["get_user_mentions", GetUserMentionsInput],
  ["get_list_tweets", GetListTweetsInput],
] as const;

describe("MCP tool input schemas", () => {
  it.each(tools)("%s input schema matches snapshot", (_name, schema) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema = zodToJsonSchema(schema as any, SCHEMA_OPTS);
    expect(jsonSchema).toMatchSnapshot();
  });
});
