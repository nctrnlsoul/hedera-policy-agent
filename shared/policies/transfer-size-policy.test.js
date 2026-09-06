import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hbar } from "@hiero-ledger/sdk";

import {
  TransferSizeLimitPolicy,
  evaluateTransferSize,
} from "./transfer-size-policy.js";

const HBAR_TOOL = "transfer_hbar_tool";
const TOKEN_TOOL = "airdrop_fungible_token_tool";

// `HederaParameterNormaliser.normaliseTransferHbar` appends the sender's negated
// total to `hbarTransfers`, so a faithful fixture carries that debit leg next to
// the credits. Anything that treats the debit as a credit would under-count.
function hbarTransfers(...creditAmounts) {
  const total = creditAmounts.reduce((sum, n) => sum + n, 0);
  return [
    ...creditAmounts.map((amount) => ({ accountId: "0.0.2222", amount: new Hbar(amount) })),
    { accountId: "0.0.1111", amount: new Hbar(-total) },
  ];
}

const hbarParams = (hbarTransfersValue) => ({
  rawParams: { transfers: [] },
  normalisedParams: { hbarTransfers: hbarTransfersValue },
});

const tokenParams = (recipients) => ({
  rawParams: { tokenId: "0.0.9999", recipients },
  normalisedParams: { tokenTransfers: [] },
});

let policy;
let warnSpy;

beforeEach(() => {
  policy = new TransferSizeLimitPolicy();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

// Every input shape reachable from the source that the policy cannot confidently
// evaluate. A size guardrail that cannot read its input must block, because the
// input it cannot read is exactly the input it exists to stop.
const MUST_DENY = [
  // --- tool selector -------------------------------------------------------
  ["unrecognised tool name", "transfer_hbar_tool_v2", hbarParams(hbarTransfers(999))],
  ["tool name undefined", undefined, hbarParams(hbarTransfers(999))],
  ["tool name null", null, hbarParams(hbarTransfers(999))],
  ["tool name empty string", "", hbarParams(hbarTransfers(999))],

  // --- hook parameter container -------------------------------------------
  ["params null", HBAR_TOOL, null],
  ["params undefined", HBAR_TOOL, undefined],
  ["params empty object", HBAR_TOOL, {}],
  ["params is a string", HBAR_TOOL, "nope"],

  // --- HBAR branch: container ---------------------------------------------
  ["hbar: normalisedParams missing", HBAR_TOOL, { rawParams: {} }],
  ["hbar: normalisedParams null", HBAR_TOOL, { normalisedParams: null }],
  ["hbar: normalisedParams is a string", HBAR_TOOL, { normalisedParams: "nope" }],
  ["hbar: hbarTransfers key missing", HBAR_TOOL, { normalisedParams: {} }],
  ["hbar: hbarTransfers key renamed", HBAR_TOOL, { normalisedParams: { transfers: hbarTransfers(999) } }],
  ["hbar: hbarTransfers null", HBAR_TOOL, hbarParams(null)],
  ["hbar: hbarTransfers undefined", HBAR_TOOL, hbarParams(undefined)],
  ["hbar: hbarTransfers empty array", HBAR_TOOL, hbarParams([])],
  ["hbar: hbarTransfers is a string", HBAR_TOOL, hbarParams("999")],
  ["hbar: hbarTransfers is a number", HBAR_TOOL, hbarParams(999)],
  ["hbar: hbarTransfers is a plain object", HBAR_TOOL, hbarParams({ 0: { amount: 999 } })],

  // --- HBAR branch: entries -----------------------------------------------
  ["hbar: entry null", HBAR_TOOL, hbarParams([null])],
  ["hbar: entry undefined", HBAR_TOOL, hbarParams([undefined])],
  ["hbar: entry is a string", HBAR_TOOL, hbarParams(["5"])],
  ["hbar: entry amount key missing", HBAR_TOOL, hbarParams([{ accountId: "0.0.2222" }])],
  ["hbar: entry amount key renamed", HBAR_TOOL, hbarParams([{ accountId: "0.0.2222", value: 5 }])],
  ["hbar: amount null", HBAR_TOOL, hbarParams([{ amount: null }])],
  ["hbar: amount undefined", HBAR_TOOL, hbarParams([{ amount: undefined }])],
  ["hbar: amount unparseable string", HBAR_TOOL, hbarParams([{ amount: "abc" }])],
  ["hbar: amount numeric-looking but unparseable", HBAR_TOOL, hbarParams([{ amount: "10abc" }])],
  ["hbar: amount empty string", HBAR_TOOL, hbarParams([{ amount: "" }])],
  ["hbar: amount whitespace string", HBAR_TOOL, hbarParams([{ amount: "   " }])],
  ["hbar: amount NaN", HBAR_TOOL, hbarParams([{ amount: NaN }])],
  ["hbar: amount Infinity", HBAR_TOOL, hbarParams([{ amount: Infinity }])],
  ["hbar: amount -Infinity", HBAR_TOOL, hbarParams([{ amount: -Infinity }])],
  ["hbar: amount boolean true", HBAR_TOOL, hbarParams([{ amount: true }])],
  ["hbar: amount empty object", HBAR_TOOL, hbarParams([{ amount: {} }])],
  ["hbar: amount array", HBAR_TOOL, hbarParams([{ amount: [5] }])],
  ["hbar: amount object whose toBigNumber throws", HBAR_TOOL, hbarParams([
    { amount: { toBigNumber() { throw new Error("boom"); } } },
  ])],
  ["hbar: amount object whose toNumber returns NaN", HBAR_TOOL, hbarParams([
    { amount: { toBigNumber: () => ({ toNumber: () => NaN }) } },
  ])],
  ["hbar: one good credit plus one unparseable", HBAR_TOOL, hbarParams([
    { amount: new Hbar(5) },
    { amount: "abc" },
  ])],
  ["hbar: no positive credit to size-check", HBAR_TOOL, hbarParams([{ amount: new Hbar(-5) }])],

  // --- token branch: container --------------------------------------------
  ["token: rawParams missing", TOKEN_TOOL, { normalisedParams: {} }],
  ["token: rawParams null", TOKEN_TOOL, { rawParams: null }],
  ["token: rawParams is a string", TOKEN_TOOL, { rawParams: "nope" }],
  ["token: recipients key missing", TOKEN_TOOL, { rawParams: { tokenId: "0.0.9999" } }],
  ["token: recipients key renamed", TOKEN_TOOL, { rawParams: { transfers: [{ amount: 999 }] } }],
  ["token: recipients null", TOKEN_TOOL, tokenParams(null)],
  ["token: recipients undefined", TOKEN_TOOL, tokenParams(undefined)],
  ["token: recipients empty array", TOKEN_TOOL, tokenParams([])],
  ["token: recipients is a string", TOKEN_TOOL, tokenParams("999")],
  ["token: recipients is a number", TOKEN_TOOL, tokenParams(999)],
  ["token: recipients is a plain object", TOKEN_TOOL, tokenParams({ 0: { amount: 999 } })],

  // --- token branch: entries ----------------------------------------------
  ["token: recipient null", TOKEN_TOOL, tokenParams([null])],
  ["token: recipient undefined", TOKEN_TOOL, tokenParams([undefined])],
  ["token: recipient is a string", TOKEN_TOOL, tokenParams(["5"])],
  ["token: amount key missing", TOKEN_TOOL, tokenParams([{ accountId: "0.0.2222" }])],
  ["token: amount key renamed", TOKEN_TOOL, tokenParams([{ accountId: "0.0.2222", value: 5 }])],
  ["token: amount null", TOKEN_TOOL, tokenParams([{ amount: null }])],
  ["token: amount undefined", TOKEN_TOOL, tokenParams([{ amount: undefined }])],
  ["token: amount unparseable string", TOKEN_TOOL, tokenParams([{ amount: "abc" }])],
  ["token: amount numeric-looking but unparseable", TOKEN_TOOL, tokenParams([{ amount: "10abc" }])],
  ["token: amount empty string", TOKEN_TOOL, tokenParams([{ amount: "" }])],
  ["token: amount whitespace string", TOKEN_TOOL, tokenParams([{ amount: "   " }])],
  ["token: amount NaN", TOKEN_TOOL, tokenParams([{ amount: NaN }])],
  ["token: amount Infinity", TOKEN_TOOL, tokenParams([{ amount: Infinity }])],
  ["token: amount boolean true", TOKEN_TOOL, tokenParams([{ amount: true }])],
  ["token: amount empty object", TOKEN_TOOL, tokenParams([{ amount: {} }])],
  ["token: amount array", TOKEN_TOOL, tokenParams([{ amount: [5] }])],
  ["token: amount zero", TOKEN_TOOL, tokenParams([{ amount: 0 }])],
  ["token: amount negative", TOKEN_TOOL, tokenParams([{ amount: -50 }])],
  ["token: one good amount plus one unparseable", TOKEN_TOOL, tokenParams([
    { amount: 5 },
    { amount: "abc" },
  ])],
];

describe("TransferSizeLimitPolicy", () => {
  describe("fails closed on every input it cannot confidently evaluate", () => {
    it.each(MUST_DENY)("denies — %s", (_label, method, params) => {
      expect(policy.shouldBlockPostParamsNormalization(params, method)).toBe(true);
    });

    it.each(MUST_DENY)("gives a reason naming the rule — %s", (_label, method, params) => {
      const result = evaluateTransferSize(params, method);
      expect(result.decision).toBe("DENY");
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it("never throws on malformed input — it returns a decision", () => {
      for (const [label, method, params] of MUST_DENY) {
        expect(() => policy.shouldBlockPostParamsNormalization(params, method), label).not.toThrow();
      }
    });
  });

  describe("deny reasons identify which rule fired", () => {
    it("names the unparseable amount for HBAR", () => {
      const { reason } = evaluateTransferSize(hbarParams([{ amount: "abc" }]), HBAR_TOOL);
      expect(reason).toMatch(/hbarTransfers\[0\]\.amount/);
      expect(reason).toMatch(/parse/i);
    });

    it("names the missing container for HBAR", () => {
      const { reason } = evaluateTransferSize({ normalisedParams: null }, HBAR_TOOL);
      expect(reason).toMatch(/normalisedParams/);
    });

    it("names the unparseable amount for tokens", () => {
      const { reason } = evaluateTransferSize(tokenParams([{ amount: "abc" }]), TOKEN_TOOL);
      expect(reason).toMatch(/recipients\[0\]\.amount/);
      expect(reason).toMatch(/parse/i);
    });

    it("names the unrecognised tool", () => {
      const { reason } = evaluateTransferSize(hbarParams(hbarTransfers(1)), "some_new_tool");
      expect(reason).toMatch(/some_new_tool/);
    });

    it("names the limit it enforced when over the HBAR cap", () => {
      const { reason } = evaluateTransferSize(hbarParams(hbarTransfers(50)), HBAR_TOOL);
      expect(reason).toMatch(/10/);
    });

    it("warns with the policy name and the reason when it blocks", () => {
      policy.shouldBlockPostParamsNormalization(hbarParams([{ amount: "abc" }]), HBAR_TOOL);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0][0]);
      expect(message).toContain("Per-Transfer Size Limit");
      expect(message).toMatch(/parse/i);
    });
  });

  // A guardrail that denies everything is not fixed, it is broken in the other
  // direction. These prove the policy still passes legitimate traffic.
  describe("still allows well-formed transfers within the limit", () => {
    it("allows a single HBAR credit under the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(hbarParams(hbarTransfers(5)), HBAR_TOOL)).toBe(false);
    });

    it("allows HBAR credits summing to exactly the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(hbarParams(hbarTransfers(4, 6)), HBAR_TOOL)).toBe(false);
    });

    it("allows a numeric-string HBAR amount under the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(hbarParams([{ amount: "5" }]), HBAR_TOOL)).toBe(false);
    });

    it("allows a plain-number HBAR amount under the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(hbarParams([{ amount: 5 }]), HBAR_TOOL)).toBe(false);
    });

    it("allows a token airdrop under the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(tokenParams([{ amount: 5 }]), TOKEN_TOOL)).toBe(false);
    });

    it("allows a numeric-string token amount under the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(tokenParams([{ amount: "5" }]), TOKEN_TOOL)).toBe(false);
    });

    it("does not warn when it allows", () => {
      policy.shouldBlockPostParamsNormalization(hbarParams(hbarTransfers(5)), HBAR_TOOL);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe("still blocks well-formed transfers over the limit", () => {
    it("blocks a single HBAR credit over the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(hbarParams(hbarTransfers(50)), HBAR_TOOL)).toBe(true);
    });

    it("blocks HBAR credits that only exceed the limit in aggregate", () => {
      expect(policy.shouldBlockPostParamsNormalization(hbarParams(hbarTransfers(6, 6)), HBAR_TOOL)).toBe(true);
    });

    it("blocks a token airdrop over the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(tokenParams([{ amount: 50 }]), TOKEN_TOOL)).toBe(true);
    });

    it("blocks token amounts that only exceed the limit in aggregate", () => {
      expect(policy.shouldBlockPostParamsNormalization(tokenParams([{ amount: 6 }, { amount: 6 }]), TOKEN_TOOL)).toBe(true);
    });

    it("counts credits only, ignoring the sender's negated debit leg", () => {
      // 6 + 6 credits with a -12 debit leg must still read as 12, not 0.
      expect(policy.shouldBlockPostParamsNormalization(hbarParams(hbarTransfers(6, 6)), HBAR_TOOL)).toBe(true);
    });
  });

  // The boolean return only matters because of what the kit does with it. These
  // drive the kit's own AbstractPolicy wrapper, so they prove a DENY actually
  // stops the tool call rather than merely returning true.
  describe("integrates with the kit's AbstractPolicy hook contract", () => {
    it("throws a policy-block error through the kit hook on unparseable input", async () => {
      await expect(
        policy.postParamsNormalizationHook(hbarParams([{ amount: "abc" }]), HBAR_TOOL),
      ).rejects.toThrow(/blocked by policy: Per-Transfer Size Limit/);
    });

    it("throws a policy-block error through the kit hook on missing keys", async () => {
      await expect(
        policy.postParamsNormalizationHook({}, TOKEN_TOOL),
      ).rejects.toThrow(/blocked by policy: Per-Transfer Size Limit/);
    });

    it("does not throw through the kit hook for a transfer within the limit", async () => {
      await expect(
        policy.postParamsNormalizationHook(hbarParams(hbarTransfers(5)), HBAR_TOOL),
      ).resolves.toBeUndefined();
    });

    it("stays registered for both governed tools", () => {
      expect(policy.relevantTools).toEqual(["transfer_hbar_tool", "airdrop_fungible_token_tool"]);
    });
  });
});
