# Contributing to mcp-x-query

Thank you for your interest in contributing! This document covers how to set up the development environment, the project conventions, and how to submit changes.

---

## Development Setup

```bash
git clone https://github.com/your-username/mcp-x-query.git
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
- Schemas use `$refStrategy: "none"` in `zod-to-json-schema` — do not use recursive Zod schemas.
- Input normalisation (URL parsing, `@` stripping) belongs in `src/lib/utils.ts`.
- Keep prompts in the tool file (not in GrokClient) — they are tool-specific logic.
- Log only to `console.error` (stdout is reserved for MCP stdio transport).

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
- [ ] `npm test` passes
- [ ] New tool includes unit tests
- [ ] New tool is documented in README.md (tool table + parameter table)
- [ ] No API keys or secrets in committed files
- [ ] All Zod schema fields have `.describe()` calls

---

## Reporting Bugs

Open an issue with:
- The tool name and input you used
- The error message or unexpected output
- Whether the issue is reproducible with the MCP Inspector (`npm run inspector`)
