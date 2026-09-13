import { randomUUID } from "node:crypto";

// One place that turns a thrown error into a client response.
//
// The rule it enforces: never return a raw `err.message`, a stack, or a
// provider error to the client. A Hedera SDK failure names node account ids and
// endpoints, and a parse failure reflects the caller's own bytes back at them.
// Both fingerprint the stack for free.
//
// Detail is not discarded, it is MOVED. The real error goes to the server log
// with a reference, and the same reference goes to the client, so a user can
// quote it and the log line can be found. A generic message with no reference
// is the version that makes support impossible.

export const SUBMIT_BOUNDS = Object.freeze({
  // A signed Hedera transaction is small. This is generous by a wide margin and
  // still rejects a payload sent to make the server do base64 work.
  maxSignedBytesChars: 64 * 1024,
});

/**
 * @param {number} status        HTTP status for the client
 * @param {string} publicMessage safe to show a stranger
 * @param {unknown} error        the real failure, logged and never returned
 * @param {Record<string, unknown>} [context] extra detail for the log only
 */
export function safeErrorResponse(status, publicMessage, error, context = {}) {
  const ref = randomUUID();

  const detail = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { value: String(error) };

  console.error(`[${ref}] ${publicMessage}`, { status, ...context, ...detail });

  return new Response(JSON.stringify({ error: publicMessage, ref }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
