import { NextResponse } from "next/server";

// In-memory sliding-window rate limiter. Deliberately no external
// dependency (Redis etc.) — good enough for a single-process deployment,
// but resets on restart and does NOT coordinate across multiple server
// instances/serverless invocations. If this ever runs behind a
// multi-instance/serverless deploy, replace with a shared store (Redis,
// Upstash) before relying on it for real abuse protection.
const buckets = new Map<string, number[]>();

// Periodic cleanup so long-running processes don't leak memory from keys
// that stop being used (e.g. an old session id, an IP that moved on).
const MAX_TRACKED_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = buckets.get(key);
  if (!timestamps) {
    timestamps = [];
    if (buckets.size >= MAX_TRACKED_KEYS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    buckets.set(key, timestamps);
  }

  while (timestamps.length > 0 && timestamps[0] < windowStart) timestamps.shift();

  if (timestamps.length >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: timestamps[0] + windowMs - now };
  }

  timestamps.push(now);
  return { allowed: true, remaining: limit - timestamps.length, retryAfterMs: 0 };
}

/** Route-handler convenience: returns a 429 NextResponse if rate-limited, else null. */
export function rateLimitOrResponse(key: string, limit: number, windowMs: number): NextResponse | null {
  const result = checkRateLimit(key, limit, windowMs);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "RATE_LIMITED", retry_after_ms: result.retryAfterMs },
    { status: 429, headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) } }
  );
}
