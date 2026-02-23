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
- [Contributing](#contributing)
- [License](#license)

---

## Features

| Tool | Description |
|------|-------------|
| `get_tweet` | Retrieve a single tweet by ID or URL — images/videos auto-analyzed by Grok Vision |
| `get_tweet_replies` | Get replies to a tweet, sorted by engagement |
| `get_user_tweets` | Recent tweets from a user, with optional date range |
| `get_user_profile` | Full profile: bio, followers, pinned tweet, etc. |
| `search_tweets` | Full-text search with Twitter operators & date range |
| `get_thread` | Full conversation thread reconstructed from any tweet |
| `get_trending` | Current trending topics, optionally filtered by category |
| `analyze_sentiment` | Sentiment analysis on a corpus of tweets (by account or search query) |
| `analyze_thread` | Full analysis of a thread: sentiment, key arguments, summary |
| `extract_links` | Extract and summarize all external links shared by an account |

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

Returns the most-engaged replies to a tweet.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tweet_id_or_url` | string | Yes | Tweet ID or URL |
| `max_results` | number | No | 1–100, default 10 |

### `get_user_tweets`

Fetches a user's recent tweets and retweets (newest first).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Handle with or without `@` |
| `max_results` | number | No | 1–100, default 10 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |

### `get_user_profile`

Returns full profile information including bio, counters, and pinned tweet.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | Handle with or without `@` |

### `search_tweets`

Full-text search supporting [Twitter search operators](https://help.twitter.com/en/using-x/x-advanced-search) (`from:`, `to:`, `-is:retweet`, `lang:`, `#hashtag`, etc.).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `max_results` | number | No | 1–100, default 10 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |

### `get_thread`

Reconstructs a full conversation thread from any tweet in the chain (root, mid-thread, or leaf).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tweet_id_or_url` | string | Yes | Any tweet in the thread |
| `max_tweets` | number | No | 1–50, default 20 |
| `verbose` | boolean | No | `true` = full fields (media, quoted tweets); limits to 10 tweets to avoid truncation |

### `get_trending`

Returns currently trending topics on Twitter/X.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | e.g. `"technology"`, `"sports"`, `"politics"` |

### `analyze_sentiment`

Performs sentiment analysis on a corpus of tweets retrieved via a search query or from a specific account. Returns a breakdown (positive/negative/neutral percentages), top themes, and notable tweets.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query or `from:username` |
| `max_tweets` | number | No | 1–100, default 50 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |

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
| `max_tweets` | number | No | 1–100, default 20 |
| `from_date` | string | No | YYYY-MM-DD |
| `to_date` | string | No | YYYY-MM-DD |

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
├── index.ts              # MCP server entry point — tool registration & startup (10 tools)
├── lib/
│   ├── grok-client.ts    # Grok API wrapper (OpenAI SDK + x_search tool, maxRetries: 3)
│   ├── errors.ts         # Typed error hierarchy: GrokError, GrokAuthError, GrokRateLimitError
│   └── utils.ts          # Input helpers: URL→ID extraction, @ stripping
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
    └── extract-links.ts
```

---

## Testing

```bash
# Run all tests (unit tests only, no API key required)
npm test

# Run with coverage report (thresholds: lines 60%, functions 60%, branches 50%)
npm run test:coverage

# Run integration tests (requires XAI_API_KEY in .env.test)
cp .env.test.example .env.test
# Edit .env.test and add your key, then:
npm test
```

**Test types:**

| File | Type | Requires API key |
|------|------|-----------------|
| `src/tests/utils.test.ts` | Unit | No |
| `src/tests/tools.test.ts` | Unit (mocked) — 58 tests | No |
| `src/tests/mcp.test.ts` | Integration — 8 tests (auto-skipped without key) | Yes |

---

## Architecture

```
MCP Host (e.g. Claude Desktop)
        │  stdio (JSON-RPC)
        ▼
  src/index.ts  ←── registers 10 tools, wraps errors via run()
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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)
