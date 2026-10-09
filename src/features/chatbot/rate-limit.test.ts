import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "./rate-limit";

function setup(overrides: { limit?: number; windowMs?: number; maxKeys?: number } = {}) {
  let time = 1_000_000;
  const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, now: () => time, ...overrides });
  return { limiter, advance: (ms: number) => (time += ms) };
}

describe("createRateLimiter", () => {
  it("allows 10 requests and blocks the 11th with a Retry-After", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 10; i += 1) {
      expect(limiter.check("ip").allowed).toBe(true);
      advance(1_000);
    }
    const blocked = limiter.check("ip");
    expect(blocked.allowed).toBe(false);
    // First hit was 10 s ago; it leaves the window in 50 s.
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it("reports the remaining budget", () => {
    const { limiter } = setup({ limit: 3 });
    expect(limiter.check("ip")).toEqual({ allowed: true, remaining: 2 });
    expect(limiter.check("ip")).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.check("ip")).toEqual({ allowed: true, remaining: 0 });
  });

  it("slides: capacity returns as old hits leave the window", () => {
    const { limiter, advance } = setup({ limit: 2, windowMs: 10_000 });
    expect(limiter.check("ip").allowed).toBe(true); // t=0
    advance(6_000);
    expect(limiter.check("ip").allowed).toBe(true); // t=6s
    advance(1_000);
    expect(limiter.check("ip").allowed).toBe(false); // t=7s, both hits live
    advance(3_000); // t=10s: the t=0 hit has left the window exactly now
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  it("does not count blocked requests against the window", () => {
    const { limiter, advance } = setup({ limit: 1, windowMs: 10_000 });
    limiter.check("ip");
    for (let i = 0; i < 5; i += 1) {
      advance(1_000);
      expect(limiter.check("ip").allowed).toBe(false);
    }
    advance(5_000); // 10 s after the only counted hit
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const { limiter } = setup({ limit: 1 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("never reports a Retry-After below one second", () => {
    const { limiter, advance } = setup({ limit: 1, windowMs: 10_000 });
    limiter.check("ip");
    advance(9_999);
    expect(limiter.check("ip")).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("keeps limiting recent keys when many distinct keys arrive", () => {
    const { limiter } = setup({ maxKeys: 50 });
    for (let i = 0; i < 500; i += 1) limiter.check(`ip-${i}`);
    // The newest key must still be limited correctly after eviction work.
    for (let i = 0; i < 9; i += 1) limiter.check("ip-499");
    expect(limiter.check("ip-499").allowed).toBe(false);
  });

  it("drops expired keys first when it needs room", () => {
    const { limiter, advance } = setup({ maxKeys: 3, limit: 1, windowMs: 1_000 });
    limiter.check("old-1");
    limiter.check("old-2");
    limiter.check("live");
    advance(900);
    limiter.check("live"); // blocked, still live
    advance(200); // old-* have expired, "live" has too (its only counted hit was 1100 ms ago)
    limiter.check("new-1");
    expect(limiter.check("new-1").allowed).toBe(false);
  });
});

describe("clientKey", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("uses the first X-Forwarded-For entry", () => {
    expect(clientKey(h({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  });

  it("falls back to X-Real-IP, then to a shared bucket", () => {
    expect(clientKey(h({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientKey(h({}))).toBe("unknown");
  });

  it("bounds the key length", () => {
    expect(clientKey(h({ "x-forwarded-for": "a".repeat(500) }))).toHaveLength(64);
  });
});
