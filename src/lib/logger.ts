/**
 * Structured logger for mcp-x-query.
 *
 * Emits newline-delimited JSON to stderr.
 * stdout is reserved for the MCP stdio transport and must never be used for logs.
 *
 * Log format: {"level":"...","msg":"...","ts":<unix_ms>[,"tool":"..."][,...]}
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Write a structured JSON log entry to stderr.
 *
 * @param level  Severity level.
 * @param msg    Human-readable message.
 * @param extra  Optional additional fields (e.g. { tool: "get_tweet", detail: "..." }).
 */
export function log(
  level: LogLevel,
  msg: string,
  extra?: Record<string, unknown>
): void {
  const entry: Record<string, unknown> = { level, msg, ts: Date.now() };
  if (extra) Object.assign(entry, extra);
  process.stderr.write(JSON.stringify(entry) + "\n");
}
