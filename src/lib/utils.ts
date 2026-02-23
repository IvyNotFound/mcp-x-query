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
  // Assume it's already an ID
  return input.trim();
}

/**
 * Remove leading @ from a username if present.
 */
export function sanitizeUsername(input: string): string {
  return input.trim().replace(/^@/, "");
}
