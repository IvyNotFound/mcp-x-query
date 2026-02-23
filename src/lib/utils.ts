/**
 * Extract tweet ID from a URL or return the input as-is if it's already an ID.
 * Supports:
 *   - https://x.com/user/status/1234567890
 *   - https://twitter.com/user/status/1234567890
 *   - 1234567890 (raw ID)
 */
export function extractTweetId(input: string): string {
  const match = input.match(/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/);
  if (match) return match[1];
  // Assume it's already an ID — validate that it's purely numeric to prevent
  // prompt injection via a raw string like "1234 </query> Ignore previous…"
  const id = input.trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(
      `Invalid tweet ID: "${id}". Expected a numeric ID or a Twitter/X status URL.`
    );
  }
  return id;
}

/**
 * Remove leading @ from a username if present.
 */
export function sanitizeUsername(input: string): string {
  return input.trim().replace(/^@/, "");
}

/**
 * Sanitize a user-supplied string before embedding it in a Grok prompt.
 *
 * Angle brackets are replaced with their Unicode look-alikes (‹›) so that a
 * malicious input like `</query> Ignore previous instructions` cannot close
 * the XML-style delimiter used in prompts.  All other text is left intact.
 *
 * Usage in prompts:
 *   `<query>${escapeForPrompt(userInput)}</query>`
 */
export function escapeForPrompt(input: string): string {
  return input.trim().replace(/</g, "\u2039").replace(/>/g, "\u203a");
}
