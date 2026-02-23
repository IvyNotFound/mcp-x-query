import { describe, it, expect, vi, afterEach } from "vitest";
import { CircuitBreaker } from "../lib/circuit-breaker.js";
import { GrokCircuitOpenError } from "../lib/errors.js";

describe("CircuitBreaker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in closed state", () => {
    const cb = new CircuitBreaker();
    expect(cb.currentState).toBe("closed");
  });

  it("check() on closed circuit does not throw", () => {
    const cb = new CircuitBreaker();
    expect(() => cb.check()).not.toThrow();
  });

  it("opens after reaching failure threshold", () => {
    const cb = new CircuitBreaker(3, 30_000);
    cb.onFailure();
    cb.onFailure();
    expect(cb.currentState).toBe("closed");
    cb.onFailure();
    expect(cb.currentState).toBe("open");
  });

  it("check() on open circuit throws GrokCircuitOpenError", () => {
    const cb = new CircuitBreaker(2, 30_000);
    cb.onFailure();
    cb.onFailure();
    expect(() => cb.check()).toThrow(GrokCircuitOpenError);
  });

  it("GrokCircuitOpenError carries retryInMs", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker(1, 30_000);
    cb.onFailure();
    let thrown: GrokCircuitOpenError | undefined;
    try {
      cb.check();
    } catch (e) {
      thrown = e as GrokCircuitOpenError;
    }
    expect(thrown).toBeInstanceOf(GrokCircuitOpenError);
    expect(thrown!.retryInMs).toBeGreaterThan(0);
    expect(thrown!.retryInMs).toBeLessThanOrEqual(30_000);
  });

  it("transitions open → half-open after retryTimeoutMs", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker(1, 1_000);
    cb.onFailure(); // open
    vi.advanceTimersByTime(1_001);
    expect(() => cb.check()).not.toThrow();
    expect(cb.currentState).toBe("half-open");
  });

  it("half-open: onSuccess() closes the circuit", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker(1, 1_000);
    cb.onFailure();
    vi.advanceTimersByTime(1_001);
    cb.check(); // transitions to half-open
    cb.onSuccess();
    expect(cb.currentState).toBe("closed");
  });

  it("half-open: onFailure() reopens the circuit", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker(1, 1_000);
    cb.onFailure();
    vi.advanceTimersByTime(1_001);
    cb.check(); // half-open
    cb.onFailure(); // fails in half-open → reopens
    expect(cb.currentState).toBe("open");
  });

  it("half-open: subsequent check() before new timeout throws", () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker(1, 1_000);
    cb.onFailure();
    vi.advanceTimersByTime(1_001);
    cb.check(); // half-open
    cb.onFailure(); // reopens
    expect(() => cb.check()).toThrow(GrokCircuitOpenError);
  });

  it("onSuccess() resets failure count so threshold requires fresh failures", () => {
    const cb = new CircuitBreaker(3, 30_000);
    cb.onFailure();
    cb.onFailure();
    cb.onSuccess(); // resets count
    cb.onFailure();
    cb.onFailure();
    expect(cb.currentState).toBe("closed"); // still needs one more
    cb.onFailure();
    expect(cb.currentState).toBe("open");
  });

  it("does not open before reaching the failure threshold", () => {
    const cb = new CircuitBreaker(5, 30_000);
    for (let i = 0; i < 4; i++) cb.onFailure();
    expect(cb.currentState).toBe("closed");
    expect(() => cb.check()).not.toThrow();
  });
});
