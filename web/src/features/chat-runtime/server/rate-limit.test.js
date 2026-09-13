import { describe, expect, it } from "vitest";

import { createRateLimiter, LIMITS, clientKeyFrom } from "./rate-limit.js";

// /api/chat is unauthenticated, so the policy layer's per-transfer cap bounds
// each call and nothing bounds the NUMBER of calls. 10 HBAR a call times
// unlimited calls, inside business hours, is the whole balance. This is the
// layer that bounds frequency.

const at = (ms) => ms;

describe("createRateLimiter", () => {
  const build = (over = {}) =>
    createRateLimiter({
      perKey: 3,
      perKeyWindowMs: 1000,
      global: 100,
      globalWindowMs: 1000,
      maxKeys: 10,
      ...over,
    });

  it("allows requests under the per-key limit", () => {
    const rl = build();
    for (let i = 0; i < 3; i += 1) {
      expect(rl.check("a", at(i)).ok, `request ${i}`).toBe(true);
    }
  });

  it("blocks the request past the per-key limit", () => {
    const rl = build();
    for (let i = 0; i < 3; i += 1) rl.check("a", at(i));
    const verdict = rl.check("a", at(4));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("key");
    expect(verdict.retryAfterMs).toBeGreaterThan(0);
  });

  it("lets the window slide, so a blocked caller recovers", () => {
    const rl = build();
    for (let i = 0; i < 3; i += 1) rl.check("a", at(i));
    expect(rl.check("a", at(500)).ok).toBe(false);
    expect(rl.check("a", at(1500)).ok).toBe(true);
  });

  it("keeps keys independent", () => {
    const rl = build();
    for (let i = 0; i < 3; i += 1) rl.check("a", at(i));
    expect(rl.check("a", at(4)).ok).toBe(false);
    expect(rl.check("b", at(4)).ok).toBe(true);
  });
});

// The HIGHWATER lesson, verbatim from the vault: an eviction policy that scans
// for empty entries frees nothing, because a deque is only pruned when its own
// key is looked up again and every new key gets a timestamp immediately. The
// table grew unbounded and the scan itself went O(n) on every allowed request.
// Evict by AGE, and TEST that the table stays bounded under a flood of
// distinct keys. That test is this one.
describe("the key table stays bounded", () => {
  it("does not grow without limit under a flood of distinct keys", () => {
    const rl = createRateLimiter({
      perKey: 3, perKeyWindowMs: 1000, global: 1e9, globalWindowMs: 1000, maxKeys: 50,
    });
    for (let i = 0; i < 5000; i += 1) rl.check(`key-${i}`, at(i));
    expect(rl.size()).toBeLessThanOrEqual(50);
  });

  it("evicts the oldest key first, not an arbitrary one", () => {
    const rl = createRateLimiter({
      perKey: 1, perKeyWindowMs: 1e6, global: 1e9, globalWindowMs: 1e6, maxKeys: 2,
    });
    rl.check("oldest", at(0));
    rl.check("middle", at(10));
    rl.check("newest", at(20));

    // "oldest" was pushed out, so it starts fresh and is allowed again.
    expect(rl.check("oldest", at(30)).ok).toBe(true);
    // "newest" is still tracked and is still over its limit.
    expect(rl.check("newest", at(31)).ok).toBe(false);
  });

  // The guarantee is that the table DRAINS under continued traffic, not that a
  // single call cleans it. Cleanup is amortized at a constant per call, because
  // the HIGHWATER limiter's full scan measured 1.5ms of pure overhead at 80,000
  // keys and the cleanup became the cost. So the honest assertion is: flood it,
  // keep using it, and the dead entries go away.
  it("drains expired keys under continued traffic, without a full scan", () => {
    const rl = createRateLimiter({
      perKey: 3, perKeyWindowMs: 100, global: 1e9, globalWindowMs: 100, maxKeys: 1000,
    });
    for (let i = 0; i < 200; i += 1) rl.check(`k-${i}`, at(i));
    // Converges to the LIVE window rather than the total inserted: keys arrive
    // 1ms apart into a 100ms window, so about 100 are live at any moment and
    // the sweep has already dropped the rest. The lower bound matters as much
    // as the upper one, because a limiter that silently held nothing would
    // also pass an upper-bound-only assertion.
    expect(rl.size()).toBeGreaterThan(50);
    expect(rl.size()).toBeLessThan(200);

    for (let i = 0; i < 40; i += 1) rl.check("live", at(100_000 + i));

    expect(rl.size()).toBeLessThan(5);
  });
});

// "A global per-instance rate limit is the only layer no header can bypass."
// Per-key limits are only as trustworthy as the proxy chain in front of them.
describe("the global cap, which no header can bypass", () => {
  it("bites even when every individual key is under its own limit", () => {
    const rl = createRateLimiter({
      perKey: 100, perKeyWindowMs: 1000, global: 5, globalWindowMs: 1000, maxKeys: 1000,
    });
    for (let i = 0; i < 5; i += 1) {
      expect(rl.check(`distinct-${i}`, at(i)).ok, `request ${i}`).toBe(true);
    }
    const verdict = rl.check("distinct-6", at(6));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("global");
  });

  it("recovers once the global window slides", () => {
    const rl = createRateLimiter({
      perKey: 100, perKeyWindowMs: 1000, global: 2, globalWindowMs: 1000, maxKeys: 100,
    });
    rl.check("a", at(0));
    rl.check("b", at(1));
    expect(rl.check("c", at(2)).ok).toBe(false);
    expect(rl.check("c", at(1500)).ok).toBe(true);
  });
});

// Vercel OVERWRITES x-forwarded-for and does not forward external IPs,
// explicitly to prevent spoofing, so on Vercel these values are trustworthy.
// That is the opposite of the general case, where the leftmost entry is
// attacker-controlled. `x-vercel-forwarded-for` is preferred because the
// standard header can still be overwritten by a proxy sitting on top of Vercel.
describe("clientKeyFrom", () => {
  const headers = (obj) => new Headers(obj);

  it("prefers the Vercel header over the standard one", () => {
    expect(
      clientKeyFrom(headers({
        "x-vercel-forwarded-for": "1.1.1.1",
        "x-forwarded-for": "9.9.9.9",
        "x-real-ip": "8.8.8.8",
      })),
    ).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip, then x-forwarded-for", () => {
    expect(clientKeyFrom(headers({ "x-real-ip": "8.8.8.8", "x-forwarded-for": "9.9.9.9" }))).toBe("8.8.8.8");
    expect(clientKeyFrom(headers({ "x-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("takes the first entry of a chain and trims it", () => {
    expect(clientKeyFrom(headers({ "x-forwarded-for": " 9.9.9.9 , 10.0.0.1 " }))).toBe("9.9.9.9");
  });

  // A request with no usable header must not become its own unlimited bucket,
  // and must not collapse every anonymous caller into one shared bucket that a
  // single attacker can exhaust for everyone. One shared bucket is the lesser
  // evil: the global cap is what actually protects the instance.
  it("returns a single shared key when no header identifies the caller", () => {
    expect(clientKeyFrom(headers({}))).toBe(LIMITS.unknownKey);
    expect(clientKeyFrom(headers({ "x-forwarded-for": "   " }))).toBe(LIMITS.unknownKey);
  });

  it("never returns an empty key", () => {
    for (const h of [headers({}), headers({ "x-real-ip": "" }), headers({ "x-forwarded-for": "," })]) {
      expect(clientKeyFrom(h).length).toBeGreaterThan(0);
    }
  });
});

describe("published limits", () => {
  it("exposes every limit it enforces as an integer", () => {
    for (const k of ["perKey", "perKeyWindowMs", "global", "globalWindowMs", "maxKeys"]) {
      expect(Number.isInteger(LIMITS[k]), k).toBe(true);
      expect(LIMITS[k], k).toBeGreaterThan(0);
    }
  });
});
