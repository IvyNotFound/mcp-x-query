# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-02-23

### Added

**New tools**
- `get_user_mentions` — fetch tweets mentioning a user, with optional `from_date`/`to_date` filtering
- `analyze_sentiment` — analyse sentiment on a tweet corpus (query + optional `username`)
- `analyze_thread` — full thread analysis (sentiment, arguments, summary)
- `extract_links` — extract and summarise external links shared by an account

**New parameters on existing tools**
- `get_tweet_replies`: `from_date` / `to_date` for date-range filtering
- `get_trending`: optional `country` / `region` filter (composite TTL cache key)
- `analyze_sentiment`: dedicated `username` parameter
- `search_tweets` + `get_user_tweets`: opt-in `enrich_media` flag (Grok Vision)

**Infrastructure**
- GitHub Actions CI: `lint` → `build` → `test-unit` (coverage) → `test-integration` (main push only)
- GitHub Actions release workflow with quality gate
- Dependabot for npm and Actions (minor/patch only, major updates blocked)

**Developer experience**
- ESLint v9 flat config with `typescript-eslint`
- `.nvmrc` pinned to Node 20
- Coverage thresholds: lines 60 %, functions 60 %, branches 50 %
- `TtlCache<K,V>` — generic in-memory TTL cache (`get_trending` 5 min, `get_user_profile` 10 min)

### Changed

- `get_tweet`: enriches media (images, video thumbnails) via Grok Vision (`grok-2-vision-1212`)
- `GrokClient.query()`: strict Zod validation with `schema.parse()` on every response
- Zod schemas: `z.coerce.string()` for tweet IDs, `.nullish()` for optional Grok fields, `.catch()` on `MediaSchema.type`
- Error hierarchy: `GrokError` → `GrokAuthError` (401) / `GrokRateLimitError` (429)
- `zod-to-json-schema` with `$refStrategy:"none"` — no `$ref`/`$defs` (rejected by Grok API)
- `max_output_tokens: 16384` enforced for long thread responses

### Security

- `escapeForPrompt()` in `utils.ts`: replaces `<`/`>` with Unicode `‹`/`›` to neutralise prompt injection via free-text inputs (query, category, language)
- `extractTweetId()` throws on non-digit input (strict `^\d+$` validation)
- `ALLOWED_MEDIA_DOMAINS` whitelist in `grok-client.ts` for `analyzeMedia()` calls
- API key validated at startup: must match `/^xai-[A-Za-z0-9]{40,}$/`
- `.max(500)` on all free-text `query` fields

### Fixed

- Schema robustness: Grok occasionally returns numbers for string IDs → `z.coerce.string()`
- `extract_links` response truncation: capped `max_tweets` at 100 (was 200, exceeded token limit)
- Thread verbose mode: `Math.min(requestedMax, 10)` enforced when `verbose: true`
- Tweet ID comparison: `.trim()` applied in `get-tweet.ts` to strip whitespace from returned IDs

### Removed

- `src/tests/setup.ts` — dead file, not referenced in `vitest.config.ts` or anywhere else

### Tests

- 107 tests total: 99 unit + 8 integration
  - `tools.test.ts`: 75 tests (all tools + cache-hit scenarios)
  - `utils.test.ts`: 17 tests (`extractTweetId`, `sanitizeUsername`, `escapeForPrompt`)
  - `cache.test.ts`: 7 tests (TTL, hit, overwrite, clear, generics)
  - `mcp.test.ts`: 8 integration tests (skip without `XAI_API_KEY`)

---

## [0.1.0] — 2026-02-23 _(initial release)_

### Added

- MCP server over stdio (compatible with Claude Desktop and any MCP client)
- 7 initial tools: `get_tweet`, `get_tweet_replies`, `get_user_tweets`, `get_user_profile`, `search_tweets`, `get_thread`, `get_trending`
- Grok API client wrapping the OpenAI SDK (`baseURL: https://api.x.ai/v1`, `maxRetries: 3`)
- Structured JSON output via `text.format = json_schema` with `strict: false`
- Zod schemas for all tool inputs and API responses

[1.0.0]: https://github.com/IvyNotFound/mcp-x-query/compare/eb3041d...69ededa
[0.1.0]: https://github.com/IvyNotFound/mcp-x-query/releases/tag/eb3041d
