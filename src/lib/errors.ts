/**
 * Typed error hierarchy for Grok API failures.
 *
 * Using distinct error classes lets callers (e.g. the `run()` helper in
 * index.ts) react differently to auth failures, rate limits, and other errors
 * without string-matching on error messages.
 */

/** Base class for all Grok-related errors. */
export class GrokError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrokError";
  }
}

/**
 * Thrown when the API key is missing, invalid, or revoked.
 * Non-retryable — the server operator must fix the key.
 */
export class GrokAuthError extends GrokError {
  constructor() {
    super(
      "Grok authentication failed. Verify that XAI_API_KEY is set and valid."
    );
    this.name = "GrokAuthError";
  }
}

/**
 * Thrown when the Grok API rate limit is exceeded after all retries.
 * The optional `retryAfterMs` field holds the delay suggested by the API.
 */
export class GrokRateLimitError extends GrokError {
  constructor(public readonly retryAfterMs?: number) {
    const hint = retryAfterMs
      ? ` Retry after ${Math.ceil(retryAfterMs / 1000)}s.`
      : " Try again in a few seconds.";
    super(`Grok rate limit exceeded.${hint}`);
    this.name = "GrokRateLimitError";
  }
}
