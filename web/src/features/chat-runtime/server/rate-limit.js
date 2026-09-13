// Rate limiting for the unauthenticated chat route.
//
// WHY THIS EXISTS BEYOND LLM COST. The policy layer caps the SIZE of each
// transfer and the HOURS it may happen in. Neither caps FREQUENCY. Ten HBAR a
// call times unlimited calls, inside business hours, is the whole balance. This
// is the only layer that bounds how many calls there are.
//
// TWO LAYERS ON PURPOSE:
//   per key    the courtesy layer, only as trustworthy as the proxy chain
//   global     the floor no header can bypass
//
// The honest trade on the global cap, stated rather than discovered: an
// attacker can spend the budget and make the instance return 429 to a real
// visitor. Bounded cost with a possible outage beats unbounded cost.
//
// STANDING LIMIT, and it is the important one: this is PER INSTANCE and held in
// memory. On serverless each cold start is a fresh table and concurrent
// instances do not share one, so this is a real speed bump and NOT a global
// guarantee. A Vercel WAF rule at the edge is the layer that is actually
// global, and it is a dashboard setting rather than code.

export const LIMITS = Object.freeze({
  perKey: 12,
  perKeyWindowMs: 60_000,
  global: 120,
  globalWindowMs: 60_000,
  maxKeys: 5_000,
  unknownKey: "unidentified",
});

// Vercel OVERWRITES x-forwarded-for and does not forward external IPs,
// specifically to prevent spoofing, so on Vercel the leftmost entry is
// trustworthy. That is the opposite of the general rule. The Vercel-specific
// header is preferred because the standard one can still be rewritten by a
// proxy placed on top of Vercel. Off Vercel, treat all of these as spoofable
// and rely on the global cap.
const HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"];

// How many stale entries the age sweep may drop per call. A constant, because
// the whole point is that cleanup cannot become O(table).
const SWEEP_PER_CALL = 8;

export function clientKeyFrom(headers) {
  for (const name of HEADERS) {
    const raw = headers?.get?.(name);
    if (typeof raw !== "string") continue;
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }
  // One shared bucket rather than a fresh unlimited one per anonymous caller.
  // It is the lesser evil: an attacker can exhaust it for other anonymous
  // callers, but the alternative is no limit at all.
  return LIMITS.unknownKey;
}

/**
 * Sliding-window limiter with a bounded key table.
 *
 * `now` is a parameter rather than a clock read, so the whole thing is a pure
 * function of its inputs and the window behaviour is testable without fake
 * timers.
 */
export function createRateLimiter(options = {}) {
  const {
    perKey = LIMITS.perKey,
    perKeyWindowMs = LIMITS.perKeyWindowMs,
    global: globalLimit = LIMITS.global,
    globalWindowMs = LIMITS.globalWindowMs,
    maxKeys = LIMITS.maxKeys,
  } = options;

  // A Map preserves insertion order, which is what makes oldest-first eviction
  // a single `keys().next()` rather than a scan. Re-inserting on touch keeps
  // the order by RECENCY, so the entry evicted is genuinely the stalest.
  const hits = new Map();
  let globalHits = [];

  function prune(list, now, windowMs) {
    const cutoff = now - windowMs;
    let i = 0;
    while (i < list.length && list[i] <= cutoff) i += 1;
    return i === 0 ? list : list.slice(i);
  }

  return {
    size: () => hits.size,

    check(key, now) {
      // Eviction runs on EVERY path, including the rejected ones. An earlier
      // version only swept after an allowed request, which meant a caller being
      // actively rate-limited generated traffic that did no cleanup: under an
      // attack, exactly when the table is largest, the sweep stopped. Found by
      // the drain test, not by reading.
      try {
        globalHits = prune(globalHits, now, globalWindowMs);
        if (globalHits.length >= globalLimit) {
          return {
            ok: false,
            reason: "global",
            retryAfterMs: Math.max(1, globalHits[0] + globalWindowMs - now),
          };
        }

        const existing = hits.get(key) ?? [];
        const recent = prune(existing, now, perKeyWindowMs);

        if (recent.length >= perKey) {
          // Touch on rejection too, so a caller being actively refused does not
          // age out of the table and get a clean slate by waiting.
          hits.delete(key);
          hits.set(key, recent);
          return {
            ok: false,
            reason: "key",
            retryAfterMs: Math.max(1, recent[0] + perKeyWindowMs - now),
          };
        }

        recent.push(now);
        hits.delete(key);
        hits.set(key, recent);
        globalHits.push(now);
        return { ok: true };
      } finally {
        evict(now, key);
      }
    },
  };

  // Two passes, and neither is a full scan.
  //
  // The HIGHWATER limiter scanned the whole table on every allowed request and
  // measured 1.5ms of pure overhead at 80,000 keys, so the cleanup became the
  // cost. The Map is ordered by RECENCY here (every touch re-inserts at the
  // back), which means the stalest entries are always at the FRONT. So a fixed
  // peek at the front is O(1) and finds exactly the entries worth dropping.
  function evict(now, keepKey) {
    // Amortized age sweep. Runs every call, costs a constant, and keeps the
    // table from holding thousands of dead entries just because it happens to
    // be under capacity.
    let looked = 0;
    for (const [key, list] of hits) {
      if (looked >= SWEEP_PER_CALL) break;
      looked += 1;
      if (key === keepKey) continue;
      if (prune(list, now, perKeyWindowMs).length === 0) hits.delete(key);
      else break; // ordered by recency: the first live entry means the rest are live
    }

    // Capacity backstop. Makes the bound absolute rather than dependent on
    // traffic happening to expire.
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
  }
}
