import { describe, expect, it } from "vitest";

import {
  DENIAL_SENTINEL,
  PolicyDenial,
  parsePolicyDenial,
} from "./denial.js";

// A policy knows exactly why it blocked. The kit's hook contract returns a
// boolean, so that reason used to die in a console.warn. But the kit catches a
// thrown hook error and passes `error.message` straight into the tool result:
//
//   handleError(error) -> { raw: { error: `Failed to execute X: ${msg}` }, ... }
//
// So throwing carries the reason all the way to the client with no side
// channel, no shared state on the module-level policy singletons, and no
// re-evaluation of a rule against params it never saw.

const FIELDS = {
  policy: "Per-Transfer Size Limit",
  stage: "post-params-normalization",
  reason: "HBAR credited (50) exceeds the 10 HBAR per-transfer limit",
  method: "transfer_hbar_tool",
};

// What the kit produces from a thrown hook error.
const asKitResult = (message) => ({
  raw: { error: `Failed to execute transfer_hbar_tool: ${message}` },
  humanMessage: `Failed to execute transfer_hbar_tool: ${message}`,
});

describe("PolicyDenial", () => {
  it("keeps every field on the instance", () => {
    const denial = new PolicyDenial(FIELDS);
    expect(denial.policy).toBe(FIELDS.policy);
    expect(denial.stage).toBe(FIELDS.stage);
    expect(denial.reason).toBe(FIELDS.reason);
    expect(denial.method).toBe(FIELDS.method);
  });

  it("is a real Error, so the kit's `error instanceof Error` branch takes it", () => {
    // handleError only appends the message when this is true. If it were not an
    // Error the reason would be dropped and the whole approach silently fails.
    expect(new PolicyDenial(FIELDS)).toBeInstanceOf(Error);
  });

  it("leads with a sentence a person can read", () => {
    const { message } = new PolicyDenial(FIELDS);
    expect(message.startsWith(`Blocked by policy "${FIELDS.policy}": ${FIELDS.reason}`)).toBe(true);
  });

  it("carries the structured fields after a sentinel", () => {
    const { message } = new PolicyDenial(FIELDS);
    const [, encoded] = message.split(DENIAL_SENTINEL);
    expect(JSON.parse(encoded)).toEqual(FIELDS);
  });
});

describe("parsePolicyDenial", () => {
  it("recovers the fields from a kit result object", () => {
    const denial = new PolicyDenial(FIELDS);
    expect(parsePolicyDenial(asKitResult(denial.message))).toEqual(FIELDS);
  });

  it("recovers the fields when the kit result arrived as a JSON string", () => {
    const denial = new PolicyDenial(FIELDS);
    expect(parsePolicyDenial(JSON.stringify(asKitResult(denial.message)))).toEqual(FIELDS);
  });

  it("recovers the fields from a bare message string", () => {
    expect(parsePolicyDenial(new PolicyDenial(FIELDS).message)).toEqual(FIELDS);
  });
});

// Everything below is the fail-closed half. A parser that guesses is worse than
// no parser here: the UI would print a confident sentence about a rule that
// never ran. Anything it cannot fully reconstruct returns null, and the caller
// falls back to the kit's generic message.
describe("parsePolicyDenial returns null rather than guessing", () => {
  const cases = [
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an ordinary success envelope", { raw: { status: "SUCCESS" }, humanMessage: "done" }],
    ["a non-policy kit error", asKitResult("INSUFFICIENT_ACCOUNT_BALANCE")],
    ["a string with no sentinel", "Failed to execute transfer_hbar_tool: something else"],
    ["a sentinel with malformed JSON", `Blocked${DENIAL_SENTINEL}{not json`],
    ["a sentinel with a JSON array", `Blocked${DENIAL_SENTINEL}["policy"]`],
    ["a sentinel with JSON null", `Blocked${DENIAL_SENTINEL}null`],
    ["a sentinel with nothing after it", `Blocked${DENIAL_SENTINEL}`],
  ];

  it.each(cases)("%s", (_label, value) => {
    expect(parsePolicyDenial(value)).toBeNull();
  });

  // A partial payload is the dangerous case: enough to look real, not enough to
  // explain anything. Every field is required.
  it.each(["policy", "stage", "reason", "method"])("a payload missing %s", (field) => {
    const partial = { ...FIELDS };
    delete partial[field];
    expect(parsePolicyDenial(`x${DENIAL_SENTINEL}${JSON.stringify(partial)}`)).toBeNull();
  });

  it.each(["policy", "stage", "reason", "method"])("a payload where %s is not a string", (field) => {
    expect(parsePolicyDenial(`x${DENIAL_SENTINEL}${JSON.stringify({ ...FIELDS, [field]: 7 })}`)).toBeNull();
  });

  it("a payload where a field is an empty string", () => {
    expect(parsePolicyDenial(`x${DENIAL_SENTINEL}${JSON.stringify({ ...FIELDS, reason: "" })}`)).toBeNull();
  });
});

describe("the reason never leaks the sentinel to a reader", () => {
  it("parsed fields contain no machine markup", () => {
    const parsed = parsePolicyDenial(asKitResult(new PolicyDenial(FIELDS).message));
    for (const value of Object.values(parsed)) {
      expect(value).not.toContain(DENIAL_SENTINEL);
      expect(value).not.toContain("{");
    }
  });

  it("survives a reason that itself contains braces and quotes", () => {
    const awkward = {
      ...FIELDS,
      reason: 'hbarTransfers[0].amount {"weird"} could not be parsed',
    };
    expect(parsePolicyDenial(new PolicyDenial(awkward).message)).toEqual(awkward);
  });
});
