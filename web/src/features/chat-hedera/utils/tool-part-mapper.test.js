import { describe, expect, it } from "vitest";

import { extractOutcome, mapToolPartState } from "./tool-part-mapper";
import { DENIAL_SENTINEL, PolicyDenial } from "../../../../../shared/policies/denial.js";

// A policy denial arrives as an ordinary kit error envelope. Before this, the
// mapper set `errorMessage` to the whole `humanMessage`, which since the reason
// work carries a machine payload behind a sentinel. That payload would have
// rendered verbatim in the transaction card.

const FIELDS = {
  policy: "Per-Transfer Size Limit",
  stage: "post-params-normalization",
  reason: "HBAR credited (50) exceeds the 10 HBAR per-transfer limit",
  method: "transfer_hbar_tool",
};

// Exactly what BaseTool.handleError produces from a thrown PolicyDenial.
function kitDenialOutput(fields = FIELDS) {
  const message = `Failed to execute transfer_hbar_tool: ${new PolicyDenial(fields).message}`;
  return JSON.stringify({ raw: { error: message }, humanMessage: message });
}

describe("extractOutcome on a policy denial", () => {
  it("never lets the machine payload reach the card", () => {
    const { errorMessage } = extractOutcome("output-available", kitDenialOutput());
    expect(errorMessage).not.toContain(DENIAL_SENTINEL);
    expect(errorMessage).not.toContain('{"policy"');
  });

  it("surfaces the rule's own sentence", () => {
    const { errorMessage } = extractOutcome("output-available", kitDenialOutput());
    expect(errorMessage).toBe(FIELDS.reason);
  });

  it("exposes the structured denial for a renderer to use", () => {
    const { denial } = extractOutcome("output-available", kitDenialOutput());
    expect(denial).toEqual(FIELDS);
  });

  // A guardrail firing is not a malfunction. It gets its own state so the card
  // can say "this was refused on purpose" rather than borrowing the red
  // failure treatment used for a network or SDK error.
  it("maps to its own state, distinct from a failure", () => {
    const outcome = extractOutcome("output-available", kitDenialOutput());
    expect(outcome.status).toBe("BLOCKED_BY_POLICY");
    expect(mapToolPartState("output-available", outcome, false)).toBe("blocked");
  });

  it("does not take the blocked state for an ordinary failure", () => {
    const message = "Failed to execute transfer_hbar_tool: INSUFFICIENT_ACCOUNT_BALANCE";
    const outcome = extractOutcome(
      "output-available",
      JSON.stringify({ raw: { error: message }, humanMessage: message }),
    );
    expect(mapToolPartState("output-available", outcome, false)).toBe("failed");
  });

  it("carries the time-window denial the same way", () => {
    const fields = {
      policy: "Business Hours Only",
      stage: "pre-tool-execution",
      reason: "07:00 UTC is outside the 09:00 to 17:00 UTC window",
      method: "transfer_hbar_tool",
    };
    const { denial, errorMessage } = extractOutcome("output-available", kitDenialOutput(fields));
    expect(denial).toEqual(fields);
    expect(errorMessage).toBe(fields.reason);
  });
});

describe("extractOutcome leaves everything else alone", () => {
  it("a non-policy kit error keeps its message and FAILED status", () => {
    const message = "Failed to execute transfer_hbar_tool: INSUFFICIENT_ACCOUNT_BALANCE";
    const output = JSON.stringify({ raw: { error: message }, humanMessage: message });

    const outcome = extractOutcome("output-available", output);
    expect(outcome.status).toBe("FAILED");
    expect(outcome.errorMessage).toBe(message);
    expect(outcome.denial).toBeUndefined();
  });

  it("a success envelope is untouched", () => {
    const output = JSON.stringify({
      raw: { status: "SUCCESS", transactionId: "0.0.1@2" },
      humanMessage: "done",
    });
    const outcome = extractOutcome("output-available", output);
    expect(outcome.status).toBe("SUCCESS");
    expect(outcome.errorMessage).toBeUndefined();
    expect(outcome.denial).toBeUndefined();
  });

  it("an awaiting-approval envelope is untouched", () => {
    const output = JSON.stringify({
      raw: { status: "AWAITING_APPROVAL", unsignedBytes: "AAEC" },
      humanMessage: "waiting",
    });
    const outcome = extractOutcome("output-available", output);
    expect(outcome.status).toBe("AWAITING_APPROVAL");
    expect(outcome.unsignedBytes).toBe("AAEC");
    expect(outcome.denial).toBeUndefined();
  });

  it("a substrate transport error is untouched", () => {
    const outcome = extractOutcome("output-error", undefined, "network down");
    expect(outcome.errorMessage).toBe("network down");
    expect(outcome.denial).toBeUndefined();
  });
});
