// Carrying a policy's reason out through an error, with ZERO imports so the
// browser demo can use it too.
//
// WHY AN ERROR AND NOT A RETURN VALUE. The kit's hook contract is
// `shouldBlock...(params, method) => boolean`. There is no room in a boolean for
// the sentence explaining the block, so the reason used to end in a
// console.warn that only the server operator ever saw. The user got:
//
//   "Action transfer_hbar_tool blocked by policy: Per-Transfer Size Limit"
//
// which never says that 50 exceeds 10.
//
// Verified in the installed kit rather than assumed: `BaseTool.execute` wraps
// every hook in a try/catch and its handler does
//
//   const message = `Failed to execute ${name}` + (error instanceof Error ? `: ${error.message}` : "");
//   return { raw: { error: message }, humanMessage: message };
//
// so a thrown hook error has its message passed through verbatim into the tool
// result. Throwing is therefore the only channel that reaches the client
// without shared mutable state on the policy singletons (which are module-level
// in shared/config.js and shared across concurrent requests) and without
// re-evaluating a rule against parameters it never saw.
//
// If a kit upgrade stops catching, or stops appending `error.message`, the
// tests pinning that behaviour fail loudly rather than degrading to a blank UI.

export const DENIAL_SENTINEL = "::policy-denial::";

const REQUIRED = ["policy", "stage", "reason", "method"];

export class PolicyDenial extends Error {
  constructor({ policy, stage, reason, method }) {
    // Human sentence FIRST, so anything that renders the raw message without
    // parsing still shows something worth reading. The machine payload trails
    // behind a sentinel and is stripped by the parser below.
    super(
      `Blocked by policy "${policy}": ${reason}` +
        DENIAL_SENTINEL +
        JSON.stringify({ policy, stage, reason, method }),
    );
    this.name = "PolicyDenial";
    this.policy = policy;
    this.stage = stage;
    this.reason = reason;
    this.method = method;
  }
}

/**
 * Recovers the structured denial from whatever shape the kit result arrived in.
 *
 * FAIL CLOSED. Every path that cannot fully reconstruct all four fields returns
 * null, and the caller falls back to the kit's generic message. A parser that
 * guesses is worse than no parser on this surface: the UI would print a
 * confident sentence about a rule that never ran, which is the exact failure
 * this whole change exists to fix.
 *
 * @param {unknown} value a kit result object, a JSON string of one, or a bare message
 * @returns {{policy: string, stage: string, reason: string, method: string} | null}
 */
export function parsePolicyDenial(value) {
  const text = extractText(value);
  if (text === null) return null;

  const at = text.indexOf(DENIAL_SENTINEL);
  if (at === -1) return null;

  // `lastIndexOf` would be wrong: a reason containing the sentinel would split
  // at the wrong place. The first occurrence is the one this class wrote.
  const encoded = text.slice(at + DENIAL_SENTINEL.length);
  if (encoded.length === 0) return null;

  let payload;
  try {
    payload = JSON.parse(encoded);
  } catch {
    return null;
  }

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const out = {};
  for (const key of REQUIRED) {
    const field = payload[key];
    if (typeof field !== "string" || field.length === 0) return null;
    out[key] = field;
  }
  return out;
}

function extractText(value) {
  if (typeof value === "string") {
    // A stringified kit envelope has to be unwrapped BEFORE the sentinel is
    // located. Searching the raw string finds the sentinel inside an escaped
    // JSON field, so everything after it is the remainder of the OUTER
    // envelope and the payload parse fails. Unwrap first, then search.
    const unwrapped = tryParseObject(value);
    return unwrapped ? extractText(unwrapped) : value;
  }
  if (value === null || typeof value !== "object") return null;

  // The kit's error envelope, which is what a denial actually looks like by the
  // time it reaches the tool wrapper.
  const error = value.raw?.error;
  if (typeof error === "string") return error;

  const human = value.humanMessage;
  if (typeof human === "string") return human;

  return null;
}

function tryParseObject(text) {
  const trimmed = text.trim();
  // Cheap guard so an ordinary message never pays for a parse attempt.
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}
