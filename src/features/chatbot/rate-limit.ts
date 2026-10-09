export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = { check: (key: string) => RateLimitResult };

type Options = {
  limit: number;
  windowMs: number;
  /** Injected so tests do not need real time. */
  now?: () => number;
  /** Upper bound on tracked keys, so a flood of spoofed addresses cannot grow memory forever. */
  maxKeys?: number;
};

/**
 * Sliding-window-log limiter: at most `limit` requests per key in any `windowMs` window.
 * State lives in this process only. On serverless hosts each instance has its own memory, so
 * the effective limit is per instance, not global. Use a shared store (Redis, KV) for that.
 */
export function createRateLimiter({ limit, windowMs, now = Date.now, maxKeys = 5_000 }: Options): RateLimiter {
  const hits = new Map<string, number[]>();

  function sweep(cutoff: number) {
    for (const [key, times] of hits) {
      if (times[times.length - 1] <= cutoff) hits.delete(key);
    }
    // Still too many live keys: forget the oldest-inserted ones, leaving room for one more.
    for (const key of hits.keys()) {
      if (hits.size < maxKeys) break;
      hits.delete(key);
    }
  }

  return {
    check(key) {
      const t = now();
      const cutoff = t - windowMs;
      if (hits.size >= maxKeys && !hits.has(key)) sweep(cutoff);

      const recent = (hits.get(key) ?? []).filter((time) => time > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const retryMs = recent[0] + windowMs - t;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
      }
      recent.push(t);
      // Delete first so the key moves to the back of the Map's insertion order.
      hits.delete(key);
      hits.set(key, recent);
      return { allowed: true, remaining: limit - recent.length };
    },
  };
}

/** Best-effort client address. Behind a proxy the first X-Forwarded-For entry is the client;
 *  without one the header is client-controlled, which is acceptable for a demo limiter. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const raw = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return raw.slice(0, 64);
}
