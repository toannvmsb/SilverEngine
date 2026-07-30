import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rateLimit";

describe("checkRateLimit", () => {
  it("allows up to the limit and then blocks", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    expect(checkRateLimit(keyA, 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit(keyA, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit(keyB, 1, 60_000).allowed).toBe(true);
  });

  it("allows again once the window has fully elapsed", () => {
    const key = `test-window-${Math.random()}`;
    expect(checkRateLimit(key, 1, 10).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 10).allowed).toBe(false);
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(checkRateLimit(key, 1, 10).allowed).toBe(true);
        resolve(undefined);
      }, 20);
    });
  });
});
