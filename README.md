# mcp-x-query

[![CI](https://github.com/IvyNotFound/mcp-x-query/actions/workflows/ci.yml/badge.svg)](https://github.com/IvyNotFound/mcp-x-query/actions/workflows/ci.yml)
[![Release](https://github.com/IvyNotFound/mcp-x-query/actions/workflows/release.yml/badge.svg)](https://github.com/IvyNotFound/mcp-x-query/actions/workflows/release.yml)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that gives AI assistants real-time access to Twitter/X data through the [Grok API](https://x.ai/api).

Connect this server to Claude Desktop (or any MCP-compatible host) and ask questions like:
- *"What did @sama tweet this week?"*
- *"Show me the full thread starting from this tweet."*
- *"What's trending in tech right now?"*
- *"Find tweets about the latest GPT release."*

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Available Tools](#available-tools)
- [Claude Desktop Setup](#claude-desktop-setup)
- [Development](#development)
- [Testing](#testing)
- [Architecture](#architecture)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| Tool | Description |
|------|-------------|
| `get_tweet` | Retrieve a single tweet by ID or URL — images/videos auto-analyzed by Grok Vision |
| `get_tweet_replies` | Get replies to a tweet, sorted by engagement, with optional date range |
| `get_user_tweets` | Recent tweets from a user, with optional date range and media enrichment |
| `get_user_profile` | Full profile: bio, followers, pinned tweet, etc. |
| `search_tweets` | Full-text search with Twitter operators, date range, and media enrichment |
| `get_thread` | Full conversation thread reconstructed from any tweet |
| `get_trending` | Current trending topics, optionally filtered by category and country |
| `analyze_sentiment` | Sentiment analysis on a corpus of tweets (by query or account, with language filter) |
| `analyze_thread` | Full analysis of a thread: sentiment, key arguments, summary |
| `extract_links` | Extract and summarize all external links shared by an account |
| `get_user_mentions` | Tweets from other accounts mentioning a user, with optional date range |
| `get_list_tweets` | Tweets from a Twitter/X list by ID or URL, with optional date range, pagination cursor, and media enrichment |

---

## Prerequisites

- [Node.js](https://nodejs.org) 20 or later (`.nvmrc` provided)
- An [xAI API key](https://x.ai/api) (starts with `xai-`)

---

## Installation

```bash
git clone https://github.com/IvyNotFound/mcp-x-query.git
cd mcp-x-query
npm install
npm run build
```

---

## Configuration

Copy the environment template and add your API key:

```bash
cp .env.example .env
# Edit .env and set XAI_API_KEY=xai-...
```

The server reads `XAI_API_KEY` from the environment at startup and exits immediately if it is missing.

---

## Available Tools

### `get_tweet`

Retrieves a single tweet with full metadata (media, quoted tweet, engagement metrics).

When the tweet contains images, videos, or GIFs, each media item is automatically analyzed by **Grok Vision** (`grok-2-vision-1212`) and enriched with a `media_summary` field describing the visual content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tweet_id_or_url` | string | Yes | Tweet ID or full x.com / twitter.com URL |

### `get_tweet_replies`

Returns the most-engaged replies to a tweet, optionally filtered by date.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tweet_id_or_url` | string | Yes | Tweet ID or URL |
| `max_results` | number | No | 1–100, default 10 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |

### `get_user_tweets`

Fetches a user's recent tweets and retweets (newest first). Pass `enrich_media: true` to have each media item analyzed by Grok Vision (increases latency).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Handle with or without `@` |
| `max_results` | number | No | 1–100, default 10 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |
| `enrich_media` | boolean | No | `true` = add `media_summary` via Grok Vision (slower) |

### `get_user_profile`

Returns full profile information including bio, counters, and pinned tweet.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Handle with or without `@` |

### `search_tweets`

Full-text search supporting [Twitter search operators](https://help.twitter.com/en/using-x/x-advanced-search) (`from:`, `to:`, `-is:retweet`, `lang:`, `#hashtag`, etc.). Pass `enrich_media: true` for Grok Vision analysis of each media item.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `max_results` | number | No | 1–100, default 10 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |
| `enrich_media` | boolean | No | `true` = add `media_summary` via Grok Vision (slower) |

### `get_thread`

Reconstructs a full conversation thread from any tweet in the chain (root, mid-thread, or leaf).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tweet_id_or_url` | string | Yes | Any tweet in the thread |
| `max_tweets` | number | No | 1–50, default 20 |
| `verbose` | boolean | No | `true` = full fields (media, quoted tweets); limits to 10 tweets to avoid truncation |

### `get_trending`

Returns currently trending topics on Twitter/X. Results are cached for 5 minutes to avoid redundant API calls.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | e.g. `"technology"`, `"sports"`, `"politics"` |
| `country` | string | No | e.g. `"France"`, `"United States"`, `"worldwide"` |

### `analyze_sentiment`

Performs sentiment analysis on a corpus of tweets retrieved via a search query or from a specific account. Returns a breakdown (positive/negative/neutral percentages), top themes, and notable tweets.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query (Twitter operators supported) |
| `username` | string | No | Restrict analysis to tweets from this account (with or without `@`) |
| `max_tweets` | number | No | 1–100, default 30 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |
| `language` | string | No | BCP-47 language code filter (e.g. `"fr"`, `"en"`) |

### `analyze_thread`

Reconstructs a full thread then produces a structured analysis: overall sentiment, key arguments made by each participant, a summary, and notable quotes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tweet_id_or_url` | string | Yes | Any tweet in the thread |
| `max_tweets` | number | No | 1–50, default 20 |

### `extract_links`

Extracts all external URLs shared by a Twitter account (or matching a search query) and returns each link with its title, domain, and a brief summary of the shared content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Handle with or without `@` |
| `max_tweets` | number | No | 1–100, default 50 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |

### `get_user_mentions`

Returns tweets from other accounts that mention a given user. Useful for monitoring brand mentions, replies from the community, or tracking conversations around a specific handle.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Handle to find mentions for (with or without `@`) |
| `max_results` | number | No | 1–100, default 10 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |

### `get_list_tweets`

Fetches recent tweets from a Twitter/X list. Accepts a numeric list ID or a full list URL (`https://x.com/i/lists/<ID>`). Supports pagination via cursor: the `next_cursor` field in the response is the ID of the oldest tweet on the page — pass it as `cursor` in the next call to fetch older tweets. Pass `enrich_media: true` to have each media item analyzed by Grok Vision (increases latency).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `list_id` | string | Yes | Numeric list ID (e.g. `"1234567890"`) or full URL (`https://x.com/i/lists/1234567890`) |
| `max_results` | number | No | 1–100, default 10 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |
| `cursor` | string | No | Pagination cursor: `next_cursor` value from the previous response |
| `enrich_media` | boolean | No | `true` = add `media_summary` via Grok Vision (slower) |

---

## Claude Desktop Setup

Add the server to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-x-query": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-x-query/dist/index.js"],
      "env": {
        "XAI_API_KEY": "xai-your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop after saving the file.

---

## Development

```bash
# Watch mode — recompiles on every file save
npm run dev

# Single build
npm run build

# Interactive MCP inspector (useful for manual tool testing)
npm run inspector
```

The TypeScript source lives in `src/`. Compiled output goes to `dist/` (gitignored).

### Project Structure

```
src/
├── index.ts              # MCP server entry point — tool registration & startup (12 tools)
├── lib/
│   ├── grok-client.ts    # Grok API wrapper (OpenAI SDK + x_search tool, maxRetries: 3)
│   ├── errors.ts         # Typed error hierarchy: GrokError, GrokAuthError, GrokRateLimitError
│   ├── utils.ts          # Input helpers: URL→ID extraction, @ stripping, escapeForPrompt
│   └── cache.ts          # TtlCache<K,V>: in-memory TTL cache (used by get_trending, get_user_profile)
├── schemas/
│   ├── tweet.ts          # TweetSchema, ThreadSchema, TweetArraySchema, MediaSchema
│   ├── user.ts           # UserProfileSchema
│   ├── trending.ts       # TrendingTopicsSchema
│   ├── sentiment.ts      # SentimentAnalysisSchema, SentimentBreakdownSchema, NotableTweetSchema
│   ├── thread-analysis.ts# ThreadAnalysisSchema
│   └── link-extract.ts   # LinkExtractSchema, ExtractedLinkSchema
└── tools/                # One file per MCP tool
    ├── get-tweet.ts
    ├── get-tweet-replies.ts
    ├── get-user-profile.ts
    ├── get-user-tweets.ts
    ├── get-thread.ts
    ├── get-trending.ts
    ├── search-tweets.ts
    ├── analyze-sentiment.ts
    ├── analyze-thread.ts
    ├── extract-links.ts
    ├── get-user-mentions.ts
    └── get-list-tweets.ts
```

---

## Testing

```bash
# Unit tests only — no API key required, runs in < 5 s
npm test

# Unit tests with coverage report (thresholds: lines 60%, functions 60%, branches 50%)
npm run test:coverage

# Integration tests — makes real Grok API calls (requires XAI_API_KEY in .env.test)
cp .env.test.example .env.test
# Edit .env.test and set XAI_API_KEY=xai-..., then:
npm run test:integration

# All tests (unit + integration)
npm run test:all
```

**Test types:**

| File | Type | Tests | Requires API key |
|------|------|-------|-----------------|
| `src/tests/utils.test.ts` | Unit | 25 | No |
| `src/tests/cache.test.ts` | Unit | 7 | No |
| `src/tests/schemas.test.ts` | Unit — MCP schema snapshots | 12 | No |
| `src/tests/tools.test.ts` | Unit (mocked Grok client) | 89 | No |
| `src/tests/mcp.test.ts` | Integration — real Grok API calls | 8 | Yes |

---

## Architecture

```
MCP Host (e.g. Claude Desktop)
        │  stdio (JSON-RPC)
        ▼
  src/index.ts  ←── registers 12 tools, wraps errors via run()
        │
        ▼
  GrokClient.query()                GrokClient.analyzeMedia()
  (maxRetries: 3)                   (get_tweet only)
        │  HTTPS                            │  HTTPS
        ▼                                   ▼
  api.x.ai/v1  ── x_search ──▶  Twitter/X real-time data
  api.x.ai/v1  ── chat/completions (grok-2-vision-1212) ──▶  media_summary
```

**Key design decisions:**

- **Schema-driven responses**: Every tool uses a Zod schema to define the exact JSON shape. `GrokClient` converts it to JSON Schema (with `$refStrategy: "none"` to avoid `$ref` nodes Grok rejects) and validates the parsed response via `schema.parse()`.
- **Lean vs. verbose thread mode**: Threads default to a minimal schema to stay within token limits. Pass `verbose: true` when you need full metadata (capped at 10 tweets).
- **Input normalisation**: `extractTweetId` handles both raw IDs and full URLs. `sanitizeUsername` strips leading `@`. All tools accept user-friendly input.
- **Typed error hierarchy**: `src/lib/errors.ts` defines `GrokError`, `GrokAuthError` (401), and `GrokRateLimitError` (429). The `run()` helper discriminates these for better log messages and always returns a valid MCP response shape.
- **Media enrichment**: `get_tweet` performs a second API call via `GrokClient.analyzeMedia()` after fetching. For videos the thumbnail frame is used; for images/GIFs the direct URL. The call is fire-and-forget safe — failures are logged and silently skipped so the tweet is always returned.
- **Single-call analysis tools**: `analyze_sentiment`, `analyze_thread`, and `extract_links` each use a single `client.query()` call — `x_search` fetches and Grok analyses in the same inference step.

---

## Security

Several hardening measures are built into the server to protect against common attack vectors:

| Measure | Where | What it does |
|---------|-------|-------------|
| **API key validation** | `src/index.ts` | Rejects keys that don't match `/^xai-[A-Za-z0-9]{40,}$/` at startup |
| **Prompt injection mitigation** | `src/lib/utils.ts` — `escapeForPrompt()` | Replaces `<`/`>` with `‹`/`›` Unicode in all free-text inputs (query, category, language) before they are inserted into prompts |
| **Username sanitisation** | `src/lib/utils.ts` — `sanitizeUsername()` | Strips `@` and enforces alphanumeric + underscore only |
| **Tweet ID validation** | `src/lib/utils.ts` — `extractTweetId()` | Throws if the extracted ID is not purely numeric (`^\d+$`) |
| **Input length cap** | Zod schemas | `query` fields are capped at 500 characters |
| **Date format validation** | Zod schemas | All `from_date`/`to_date` fields require `YYYY-MM-DD` format via regex |
| **API timeouts** | `src/lib/grok-client.ts` | `timeout: 30_000` ms on all API calls |
| **Media domain whitelist** | `src/lib/grok-client.ts` | `analyzeMedia()` only accepts URLs from a fixed set of trusted domains (`x.com`, `twimg.com`, etc.) |
| **TTL cache** | `src/lib/cache.ts` | Trending topics (5 min) and user profiles (10 min) are cached to reduce API surface area |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)
