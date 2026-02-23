# Contributing to mcp-x-query

Thank you for your interest in contributing! This document covers how to set up the development environment, the project conventions, and how to submit changes.

---

## Development Setup

```bash
git clone https://github.com/IvyNotFound/mcp-x-query.git
cd mcp-x-query
npm install
cp .env.test.example .env.test   # Add your XAI_API_KEY for integration tests
npm run build
```

---

## Adding a New Tool

1. **Create `src/tools/your-tool.ts`**

   Export:
   - `YourToolInput` — a `z.object({...})` with `.describe()` on every field
   - `yourTool(client: GrokClient, input)` — the async implementation

2. **Add the tool to `src/index.ts`**

   ```ts
   import { YourToolInput, yourTool } from "./tools/your-tool.js";

   server.tool(
     "your_tool",
     "One-sentence description shown to the AI assistant",
     YourToolInput.shape,
     (input) => run(() => yourTool(grok, input))
   );
   ```

3. **Add or extend a schema** in `src/schemas/` if the response shape is new.

4. **Write unit tests** in `src/tests/tools.test.ts` — mock `GrokClient` so tests run without an API key.

---

## Code Conventions

- **TypeScript strict mode** is enabled — no implicit `any`.
- All tool input schemas use Zod `.describe()` on every field (used as the MCP parameter description).
- Schemas use `$refStrategy: "none"` in `zod-to-json-schema` — do not use recursive Zod schemas (`z.lazy()` is forbidden — Grok rejects self-referenced definitions).
- Input normalisation (URL parsing, `@` stripping) belongs in `src/lib/utils.ts`.
- Keep prompts in the tool file (not in GrokClient) — they are tool-specific logic.
- Log only to `console.error` (stdout is reserved for MCP stdio transport).
- **Prompt injection mitigation**: all free-text user inputs (query, category, language…) inserted into prompts **must** be wrapped with `escapeForPrompt()` from `src/lib/utils.ts`. Usernames are safe after `sanitizeUsername()` and do not need escaping.
- **Date field validation**: all `from_date`/`to_date` fields must use `.regex(/^\d{4}-\d{2}-\d{2}$/)` in their Zod schema.
- **TTL cache**: use `TtlCache<K, V>` from `src/lib/cache.ts` for data that is stable over short periods (trending topics, user profiles). Export the cache instance so tests can call `.clear()` in `beforeEach`.
- **Test isolation**: when a mock `GrokClient` returns a shared object that a tool mutates (e.g. `result.tweets = ...`), use `structuredClone(response)` in the mock to prevent cross-test pollution.

---

## Running Tests

```bash
npm test                 # Unit tests only (no API key needed)
npm run test:coverage    # With V8 coverage report
```

Integration tests in `mcp.test.ts` are skipped automatically when `XAI_API_KEY` is not set.

---

## Pull Request Checklist

- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] `npm run lint` reports 0 errors (ESLint v9 flat config)
- [ ] `npm test` passes
- [ ] New tool includes unit tests
- [ ] New tool is documented in README.md (tool table + parameter table)
- [ ] No API keys or secrets in committed files
- [ ] All Zod schema fields have `.describe()` calls
- [ ] Free-text inputs in prompts are wrapped with `escapeForPrompt()`
- [ ] Date fields use `.regex(/^\d{4}-\d{2}-\d{2}$/)` in the Zod schema

---

## Reporting Bugs

Open an issue with:
- The tool name and input you used
- The error message or unexpected output
- Whether the issue is reproducible with the MCP Inspector (`npm run inspector`)
