// Bounds for the unauthenticated chat route, and the reasoning for each.
//
// /api/chat has no auth gate and is reachable from the internet. The Security
// Playbook names this exact shape as denial of wallet: an attacker, or just a
// bug, running up a bill on a pay-per-use API. The controls it prescribes are
// all here and all cheap: cap input size, cap the token budget, bound the loop,
// set a timeout.
//
// EVERY CHECK IS SHAPE-INDEPENDENT ON PURPOSE. The AI SDK has changed its
// message shape more than once (`content` string, then `parts[]`). A check that
// understands one shape can be handed another and measure nothing, which is a
// check that cannot fail: worse than no check, because it answers the audit on
// the real check's behalf. So this measures raw bytes and serialized length
// rather than reaching for a field by name.

export const BOUNDS = Object.freeze({
  // Roughly a very long conversation. Measured against the demo prompts, which
  // are 60 to 200 characters each.
  maxBodyBytes: 128 * 1024,
  maxMessages: 60,
  maxMessageChars: 16 * 1024,

  // The single most important line in this file. Without it a response is
  // unbounded and so is its cost.
  maxOutputTokens: 1500,

  // A runaway upstream call should end, not hang until the platform kills it.
  timeoutMs: 45_000,
});

const deny = (reason) => ({ ok: false, status: 400, reason });
const ALLOW = Object.freeze({ ok: true });

/**
 * Decides whether a parsed chat request is within bounds.
 *
 * Pure: takes the already-parsed body and the raw byte count, returns a verdict.
 * No network, no env, no side effects, so it is testable without HTTP.
 *
 * @param {unknown} body        the parsed JSON body
 * @param {number}  rawByteLength  the size of the request text before parsing
 * @returns {{ ok: true } | { ok: false, status: number, reason: string }}
 */
export function checkRequestBounds(body, rawByteLength) {
  // Checked first, because it is the only bound that holds regardless of what
  // the body turns out to contain.
  if (!Number.isFinite(rawByteLength) || rawByteLength > BOUNDS.maxBodyBytes) {
    return deny("Request body is too large.");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return deny("Request body must be a JSON object.");
  }

  const { messages } = body;
  if (!Array.isArray(messages)) {
    return deny("Request body must contain a `messages` array.");
  }
  // NOT rejected here: an empty `messages` array. Three existing contract tests
  // send one deliberately, so refusing it is a behaviour change rather than a
  // bound, and it was not in the approved slice. It is a real if small cost
  // path (an empty conversation still reaches the model) and it is written up
  // as its own decision rather than folded in quietly.
  if (messages.length > BOUNDS.maxMessages) {
    return deny("Too many messages in this conversation.");
  }

  for (const message of messages) {
    if (message === null || typeof message !== "object") {
      return deny("Each message must be an object.");
    }
    // Serialized length rather than a named field, so a renamed or nested
    // content shape is still measured. A message that cannot be serialized at
    // all is rejected rather than skipped, because skipping is how an
    // unmeasurable value contributes zero to a total.
    let size;
    try {
      size = JSON.stringify(message)?.length;
    } catch {
      return deny("A message could not be read.");
    }
    if (!Number.isFinite(size)) return deny("A message could not be read.");
    if (size > BOUNDS.maxMessageChars) return deny("A message is too long.");
  }

  return ALLOW;
}
