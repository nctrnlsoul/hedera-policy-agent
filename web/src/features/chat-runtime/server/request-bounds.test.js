import { describe, expect, it } from "vitest";

import { BOUNDS, checkRequestBounds } from "./request-bounds.js";

// Denial of wallet is the named money risk: /api/chat is unauthenticated and
// reachable, so an unbounded body or message count is a bill someone else can
// run up. These bounds are shape-independent on purpose. The AI SDK has moved
// its message shape more than once, and a check that understands one shape can
// be fed another and measure nothing.

const text = (n) => "x".repeat(n);
const msg = (chars) => ({ role: "user", parts: [{ type: "text", text: text(chars) }] });
const body = (messages) => ({ messages });

function circular() {
  const node = { role: "user" };
  node.self = node;
  return node;
}

describe("checkRequestBounds", () => {
  it("accepts an ordinary request", () => {
    expect(checkRequestBounds(body([msg(200)]), 500)).toEqual({ ok: true });
  });

  it("accepts a long but plausible conversation", () => {
    expect(checkRequestBounds(body(Array.from({ length: 20 }, () => msg(500))), 40_000))
      .toEqual({ ok: true });
  });

  describe("rejects", () => {
    const cases = [
      ["body is not an object", null, 10],
      ["body is a string", "nope", 10],
      ["messages missing", {}, 10],
      ["messages is not an array", { messages: "nope" }, 10],
      ["too many messages", body(Array.from({ length: BOUNDS.maxMessages + 1 }, () => msg(1))), 10_000],
      // Byte count deliberately UNDER maxBodyBytes. An earlier version of this
      // case passed 10_000_000, so the body cap rejected it first and the
      // per-message cap was never exercised: the test passed for the wrong
      // reason and survived a mutation that deleted the rule it names.
      ["one message too large", body([msg(BOUNDS.maxMessageChars + 1)]), 1000],
      ["raw body too large", body([msg(10)]), BOUNDS.maxBodyBytes + 1],
      ["a message is not an object", body(["hello"]), 100],
      ["a message is null", body([null]), 100],
      ["a message cannot be serialized", body([{ role: "user", n: 1n }]), 100],
      // Must be a real OBJECT. An earlier fixture here was a function, which
      // `typeof message !== "object"` rejects one branch earlier, so the
      // serialization guard was never reached and survived its own mutation.
      ["a message serializes to undefined", body([{ toJSON: () => undefined }]), 100],
      ["a message serializes to a circular structure", body([circular()]), 100],
    ];

    it.each(cases)("%s", (_label, payload, bytes) => {
      const result = checkRequestBounds(payload, bytes);
      expect(result.ok).toBe(false);
      expect(typeof result.reason).toBe("string");
      expect(result.status).toBe(400);
    });
  });

  // The reason is returned to a stranger, so it must say what is wrong without
  // describing the internals. It also must not echo the offending input back.
  it("never echoes the submitted content in the reason", () => {
    const secretish = "SUPERSECRETMARKER";
    const payload = body([{ role: "user", parts: [{ type: "text", text: secretish.repeat(2000) }] }]);
    const result = checkRequestBounds(payload, 1000);
    expect(result.ok).toBe(false);
    expect(result.reason).not.toContain(secretish);
  });

  it("publishes every bound it enforces, so nothing is a hidden magic number", () => {
    for (const key of ["maxBodyBytes", "maxMessages", "maxMessageChars", "maxOutputTokens", "timeoutMs"]) {
      expect(Number.isInteger(BOUNDS[key]), key).toBe(true);
      expect(BOUNDS[key], key).toBeGreaterThan(0);
    }
  });

  // Documented as a deliberate allow, not an oversight. If this ever starts
  // failing, someone has changed the policy and should say so out loud.
  it("allows an empty messages array, because refusing it is a behaviour change", () => {
    expect(checkRequestBounds(body([]), 10)).toEqual({ ok: true });
  });
});
