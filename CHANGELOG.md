# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-02-23

### Added

**New tools**
- `get_user_mentions` — fetch tweets mentioning a user, with optional `from_date`/`to_date` filtering
- `get_list_tweets` — fetch tweets from a Twitter/X list (ID or URL), with `cursor` pagination and opt-in `enrich_media`
- `analyze_sentiment` — analyse sentiment on a tweet corpus (query + optional `username`)
- `analyze_thread` — full thread analysis (sentiment, arguments, summary)
- `extract_links` — extract and summarise external links shared by an account

**New parameters on existing tools**
- `get_tweet_replies`: `from_date` / `to_date` for date-range filtering
- `get_trending`: optional `country` / `region` filter (composite TTL cache key)
- `analyze_sentiment`: dedicated `username` parameter
- `search_tweets` + `get_user_tweets` + `get_list_tweets`: opt-in `enrich_media` flag (Grok Vision)
- `search_tweets` + `get_user_tweets` + `get_list_tweets`: `cursor` pagination parameter (F6/F7)

**Infrastructure**
- GitHub Actions CI: `lint` → `build` → `test-unit` (coverage) → `test-integration` (main push only)
- GitHub Actions release workflow with quality gate
- Dependabot for npm and Actions (minor/patch only, major updates blocked)
- Circuit breaker in `GrokClient` (`src/lib/circuit-breaker.ts`): closed/open/half-open states, opens after 5 consecutive transient failures, 30 s retry window (P2)
- Structured JSON logger (`src/lib/logger.ts`): JSON output on stderr, fields `level` / `msg` / `ts`, replaces all `console.error` calls (I1)
- `PersistentTtlCache<V>` in `cache.ts`: JSON-file-backed cache surviving process restarts; used for `trendingCache` (5 min) and `profileCache` (10 min) (P1)

**Developer experience**
- ESLint v9 flat config with `typescript-eslint`
- `.nvmrc` pinned to Node 20
- Coverage thresholds: lines 60 %, functions 60 %, branches 50 %
- `TtlCache<K,V>` — generic in-memory TTL cache with lazy expiration

### Changed

- `get_tweet`: enriches media (images, video thumbnails) via Grok Vision (`grok-2-vision-1212`)
- `GrokClient.query()`: strict Zod validation with `schema.parse()` on every response
- `GrokClient`: integrates `CircuitBreaker` — opens after 5 consecutive transient failures (5xx, network timeout); 401/429 errors do not count towards the threshold
- `trendingCache` and `profileCache`: upgraded from `TtlCache` to `PersistentTtlCache` (survive process restarts)
- Zod schemas: `z.coerce.string()` for tweet IDs, `.nullish()` for optional Grok fields, `.catch()` on `MediaSchema.type`
- Error hierarchy: `GrokError` → `GrokAuthError` (401) / `GrokRateLimitError` (429) / `GrokCircuitOpenError` (circuit open, exposes `retryInMs`)
- `run()` helper in `index.ts`: handles `GrokCircuitOpenError` with a structured MCP error response including retry delay
- All `console.error` calls replaced by structured `log()` from `src/lib/logger.ts`
- `zod-to-json-schema` with `$refStrategy:"none"` — no `$ref`/`$defs` (rejected by Grok API)
- `max_output_tokens: 16384` enforced for long thread responses

### Security

- `escapeForPrompt()` in `utils.ts`: replaces `<`/`>` with Unicode `‹`/`›` to neutralise prompt injection via free-text inputs (query, category, language)
- `extractTweetId()` throws on non-digit input (strict `^\d+$` validation)
- `ALLOWED_MEDIA_DOMAINS` whitelist in `grok-client.ts` for `analyzeMedia()` calls
- API key validated at startup: must match `/^xai-[A-Za-z0-9]{40,}$/`
- `.max(500)` on all free-text `query` fields
- `.regex(/^@?[A-Za-z0-9_]{1,50}$/)` on all `username` fields (`get_user_mentions`, `analyze_sentiment`, `extract_links`) (S5)

### Fixed

- Schema robustness: Grok occasionally returns numbers for string IDs → `z.coerce.string()`
- `extract_links` response truncation: capped `max_tweets` at 100 (was 200, exceeded token limit)
- Thread verbose mode: `Math.min(requestedMax, 10)` enforced when `verbose: true`
- Tweet ID comparison: `.trim()` applied in `get-tweet.ts` to strip whitespace from returned IDs

### Removed

- `src/tests/setup.ts` — dead file, not referenced in `vitest.config.ts` or anywhere else

### Tests

- 158 tests total: 149 unit + 9 integration
  - `tools.test.ts`: 89 tests (all tools + cache-hit, enrich_media, country, date, getListTweets scenarios)
  - `utils.test.ts`: 25 tests (`extractTweetId`, `sanitizeUsername`, `escapeForPrompt`, `extractListId`, `computeNextCursor`)
  - `schemas.test.ts`: 12 snapshot tests — one per MCP tool, detects schema signature changes
  - `cache.test.ts`: 7 tests (TTL, hit, overwrite, clear, generics)
  - `circuit-breaker.test.ts`: 11 tests — all state transitions + threshold + half-open probe (100% coverage)
  - `logger.test.ts`: 5 tests — stderr output, JSON fields, newline (100% coverage)
  - `mcp.test.ts`: 9 integration tests (skip without `XAI_API_KEY`)

---

## [0.1.0] — 2026-02-23 _(initial release)_

### Added

- MCP server over stdio (compatible with Claude Desktop and any MCP client)
- 7 initial tools: `get_tweet`, `get_tweet_replies`, `get_user_tweets`, `get_user_profile`, `search_tweets`, `get_thread`, `get_trending`
- Grok API client wrapping the OpenAI SDK (`baseURL: https://api.x.ai/v1`, `maxRetries: 3`)
- Structured JSON output via `text.format = json_schema` with `strict: false`
- Zod schemas for all tool inputs and API responses

[1.0.0]: https://github.com/IvyNotFound/mcp-x-query/compare/eb3041d...26c6f6b
[0.1.0]: https://github.com/IvyNotFound/mcp-x-query/releases/tag/eb3041d
