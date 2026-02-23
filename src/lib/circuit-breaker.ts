/**
 * Simple three-state circuit breaker for async operations.
 *
 * States:
 *   closed    — normal operation; transient failures are counted.
 *   open      — calls are rejected immediately via GrokCircuitOpenError;
 *               transitions to half-open after retryTimeoutMs.
 *   half-open — one probe call is allowed through; if it succeeds the circuit
 *               closes; if it fails the circuit reopens.
 *
 * Only "transient" failures (5xx, network errors, timeouts) should be
 * reported via onFailure().  Client errors (auth, rate limit) are
 * non-transient and must NOT call onFailure() — they would falsely trip
 * the circuit even when the Grok service itself is healthy.
 */

import { GrokCircuitOpenError } from "./errors.js";

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private nextAttemptAt = 0;

  /**
   * @param failureThreshold  Consecutive transient failures before opening.
   * @param retryTimeoutMs    Time in open state before allowing a probe.
   */
  constructor(
    private readonly failureThreshold = 5,
    private readonly retryTimeoutMs = 30_000
  ) {}

  get currentState(): CircuitState {
    return this.state;
  }

  /**
   * Call before every API request.
   * Throws GrokCircuitOpenError if the circuit is open and the retry window
   * has not yet elapsed.  Transitions open → half-open when the window passes.
   */
  check(): void {
    if (this.state === "closed") return;

    if (this.state === "open") {
      if (Date.now() >= this.nextAttemptAt) {
        this.state = "half-open";
        return; // allow one probe through
      }
      throw new GrokCircuitOpenError(this.nextAttemptAt - Date.now());
    }

    // half-open: allow the probe through (already set by a previous check() call)
  }

  /**
   * Call after a successful API response.
   * Resets the failure counter and closes the circuit.
   */
  onSuccess(): void {
    this.failureCount = 0;
    this.state = "closed";
  }

  /**
   * Call after a transient failure (5xx, network timeout, unexpected error).
   * Do NOT call this for auth (401/403) or rate-limit (429) errors.
   */
  onFailure(): void {
    this.failureCount++;
    if (this.state === "half-open" || this.failureCount >= this.failureThreshold) {
      this.state = "open";
      this.nextAttemptAt = Date.now() + this.retryTimeoutMs;
      this.failureCount = 0; // reset so the count starts fresh after circuit reopens
    }
  }
}
