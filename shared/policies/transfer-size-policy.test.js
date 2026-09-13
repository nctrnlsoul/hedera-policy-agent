import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hbar } from "@hiero-ledger/sdk";

import {
  TransferSizeLimitPolicy,
  evaluateTransferSize,
} from "./transfer-size-policy.js";
import { TimeWindowPolicy } from "./time-window-policy.js";

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
    it.each(MUST_DENY)("denies: %s", (_label, method, params) => {
      expect(policy.shouldBlockPostParamsNormalization(params, method)).toBe(true);
    });

    it.each(MUST_DENY)("gives a reason naming the rule: %s", (_label, method, params) => {
      const result = evaluateTransferSize(params, method);
      expect(result.decision).toBe("DENY");
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it("never throws on malformed input, it returns a decision", () => {
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

    it("stays registered for every governed tool, and for nothing else", () => {
      expect(policy.relevantTools).toEqual([
        "transfer_hbar_tool",
        "transfer_hbar_with_allowance_tool",
        "airdrop_fungible_token_tool",
        "transfer_fungible_token_with_allowance_tool",
        "approve_hbar_allowance_tool",
        "approve_token_allowance_tool",
      ]);
    });

    // The revocation path must never be governed. Blocking a cancel is worse
    // than no guardrail, so this asserts the absence rather than trusting it.
    it("never governs a tool that revokes an allowance", () => {
      for (const tool of [
        "delete_hbar_allowance_tool",
        "delete_token_allowance_tool",
        "delete_non_fungible_token_allowance_tool",
      ]) {
        expect(policy.relevantTools).not.toContain(tool);
      }
    });

    // Every governed name must have a branch. A name with no branch is denied
    // by the fall-through, which is safe but means the tool is unusable, so it
    // should fail here rather than in production.
    it("has a size rule for every tool it claims to govern", () => {
      for (const tool of policy.relevantTools) {
        const { reason } = evaluateTransferSize({}, tool);
        expect(reason).not.toMatch(/has no size rule/);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// The four tool paths added when coverage was widened past the original two.
// ---------------------------------------------------------------------------

const HBAR_ALLOWANCE_TOOL = "transfer_hbar_with_allowance_tool";
const TOKEN_ALLOWANCE_TOOL = "transfer_fungible_token_with_allowance_tool";
const APPROVE_HBAR_TOOL = "approve_hbar_allowance_tool";
const APPROVE_TOKEN_TOOL = "approve_token_allowance_tool";

const tokenTransferParams = (transfers) => ({
  rawParams: { tokenId: "0.0.9999", sourceAccountId: "0.0.1111", transfers },
  normalisedParams: { tokenId: "0.0.9999", tokenTransfers: [] },
});

const approveHbarParams = (amount) => ({
  rawParams: { spenderAccountId: "0.0.2222", amount },
  normalisedParams: {},
});

const approveTokenParams = (tokenApprovals) => ({
  rawParams: { spenderAccountId: "0.0.2222", tokenApprovals },
  normalisedParams: {},
});

describe("widened coverage", () => {
  let policy;
  let warnSpy;

  beforeEach(() => {
    policy = new TransferSizeLimitPolicy();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // The kit defines transferHbarWithAllowanceParameters AS transferHbarParameters,
  // and both normalise to the same hbarTransfers array, so this path must behave
  // identically to the plain HBAR path rather than merely similarly.
  describe("transfer_hbar_with_allowance_tool", () => {
    it("allows a credit under the limit", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(hbarParams(hbarTransfers(5)), HBAR_ALLOWANCE_TOOL),
      ).toBe(false);
    });

    it("blocks a credit over the limit", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(hbarParams(hbarTransfers(50)), HBAR_ALLOWANCE_TOOL),
      ).toBe(true);
    });

    it("blocks credits that only exceed the limit in aggregate", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(hbarParams(hbarTransfers(6, 6)), HBAR_ALLOWANCE_TOOL),
      ).toBe(true);
    });

    it("fails closed on unparseable input", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(hbarParams([{ amount: "abc" }]), HBAR_ALLOWANCE_TOOL),
      ).toBe(true);
    });

    it("reaches the same verdict as the plain HBAR tool on every fixture", () => {
      for (const fixture of [
        hbarParams(hbarTransfers(5)),
        hbarParams(hbarTransfers(50)),
        hbarParams([{ amount: "abc" }]),
        hbarParams([]),
        {},
      ]) {
        expect(evaluateTransferSize(fixture, HBAR_ALLOWANCE_TOOL)).toEqual(
          evaluateTransferSize(fixture, HBAR_TOOL),
        );
      }
    });
  });

  describe("transfer_fungible_token_with_allowance_tool", () => {
    it("allows a transfer under the limit", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(tokenTransferParams([{ amount: 5 }]), TOKEN_ALLOWANCE_TOOL),
      ).toBe(false);
    });

    it("blocks a transfer over the limit", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(tokenTransferParams([{ amount: 50 }]), TOKEN_ALLOWANCE_TOOL),
      ).toBe(true);
    });

    // Every amount hangs off one tokenId, so the limit applies to the total.
    it("sums amounts, because they all draw on one token", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(
          tokenTransferParams([{ amount: 6 }, { amount: 6 }]),
          TOKEN_ALLOWANCE_TOOL,
        ),
      ).toBe(true);
    });

    it("reads rawParams.transfers, not the airdrop's recipients key", () => {
      const { reason } = evaluateTransferSize(
        { rawParams: { tokenId: "0.0.9999", recipients: [{ amount: 5 }] } },
        TOKEN_ALLOWANCE_TOOL,
      );
      expect(reason).toContain("rawParams.transfers is missing or not an array");
    });

    const MUST_DENY = [
      ["rawParams missing", {}],
      ["transfers null", tokenTransferParams(null)],
      ["transfers empty", tokenTransferParams([])],
      ["transfers is a string", tokenTransferParams("5")],
      ["entry not an object", tokenTransferParams(["5"])],
      ["amount missing", tokenTransferParams([{ accountId: "0.0.2" }])],
      ["amount unparseable", tokenTransferParams([{ amount: "abc" }])],
      ["amount empty string", tokenTransferParams([{ amount: "" }])],
      ["amount boolean", tokenTransferParams([{ amount: true }])],
      ["amount NaN", tokenTransferParams([{ amount: NaN }])],
      ["amount Infinity", tokenTransferParams([{ amount: Infinity }])],
      ["amount zero", tokenTransferParams([{ amount: 0 }])],
      ["amount negative", tokenTransferParams([{ amount: -5 }])],
      ["one good amount beside one unreadable", tokenTransferParams([{ amount: 1 }, { amount: "abc" }])],
    ];

    it.each(MUST_DENY)("blocks when %s", (_label, params) => {
      expect(policy.shouldBlockPostParamsNormalization(params, TOKEN_ALLOWANCE_TOOL)).toBe(true);
    });
  });

  describe("approve_hbar_allowance_tool", () => {
    it("allows an allowance under the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(approveHbarParams(5), APPROVE_HBAR_TOOL)).toBe(false);
    });

    it("allows an allowance at exactly the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(approveHbarParams(10), APPROVE_HBAR_TOOL)).toBe(false);
    });

    it("blocks an allowance over the limit", () => {
      expect(policy.shouldBlockPostParamsNormalization(approveHbarParams(50), APPROVE_HBAR_TOOL)).toBe(true);
    });

    // The whole point of governing approvals: an ungoverned grant lets a
    // spender drain later, outside the window, without another tool call.
    it("blocks an over-limit grant that no transfer policy would ever see", () => {
      const { decision, reason } = evaluateTransferSize(approveHbarParams(1000), APPROVE_HBAR_TOOL);
      expect(decision).toBe("DENY");
      expect(reason).toMatch(/allowance/i);
    });

    // Zero is how an HBAR allowance is cancelled. A guardrail that blocks the
    // cancel is worse than no guardrail.
    it("allows zero, because zero is a revocation", () => {
      expect(policy.shouldBlockPostParamsNormalization(approveHbarParams(0), APPROVE_HBAR_TOOL)).toBe(false);
    });

    it("says so in the reason, so a log reader can tell a revocation apart", () => {
      const { reason } = evaluateTransferSize(approveHbarParams(0), APPROVE_HBAR_TOOL);
      expect(reason).toMatch(/revocation/i);
    });

    const MUST_DENY = [
      ["rawParams missing", {}],
      ["rawParams null", { rawParams: null }],
      ["amount missing", { rawParams: { spenderAccountId: "0.0.2222" } }],
      ["amount unparseable", approveHbarParams("abc")],
      ["amount empty string", approveHbarParams("")],
      ["amount boolean", approveHbarParams(true)],
      ["amount NaN", approveHbarParams(NaN)],
      ["amount Infinity", approveHbarParams(Infinity)],
      ["amount negative", approveHbarParams(-1)],
    ];

    it.each(MUST_DENY)("blocks when %s", (_label, params) => {
      expect(policy.shouldBlockPostParamsNormalization(params, APPROVE_HBAR_TOOL)).toBe(true);
    });
  });

  describe("approve_token_allowance_tool", () => {
    it("allows an approval under the limit", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(
          approveTokenParams([{ tokenId: "0.0.1", amount: 5 }]),
          APPROVE_TOKEN_TOOL,
        ),
      ).toBe(false);
    });

    it("blocks an approval over the limit", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(
          approveTokenParams([{ tokenId: "0.0.1", amount: 50 }]),
          APPROVE_TOKEN_TOOL,
        ),
      ).toBe(true);
    });

    // Each entry carries its own tokenId, so 10 of token A beside 10 of token B
    // is two separate caps and not a 20 cap on the pair. Summing here would
    // block a pair of perfectly legal approvals.
    it("checks each token separately instead of summing across tokens", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(
          approveTokenParams([
            { tokenId: "0.0.1", amount: 10 },
            { tokenId: "0.0.2", amount: 10 },
          ]),
          APPROVE_TOKEN_TOOL,
        ),
      ).toBe(false);
    });

    it("still blocks when one token among several is over the limit", () => {
      const { decision, reason } = evaluateTransferSize(
        approveTokenParams([
          { tokenId: "0.0.1", amount: 5 },
          { tokenId: "0.0.2", amount: 50 },
          { tokenId: "0.0.3", amount: 5 },
        ]),
        APPROVE_TOKEN_TOOL,
      );
      expect(decision).toBe("DENY");
      expect(reason).toContain("tokenApprovals[1]");
    });

    it("allows zero, because zero is a revocation", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(
          approveTokenParams([{ tokenId: "0.0.1", amount: 0 }]),
          APPROVE_TOKEN_TOOL,
        ),
      ).toBe(false);
    });

    it("allows a revocation sitting beside a legal approval", () => {
      expect(
        policy.shouldBlockPostParamsNormalization(
          approveTokenParams([
            { tokenId: "0.0.1", amount: 0 },
            { tokenId: "0.0.2", amount: 5 },
          ]),
          APPROVE_TOKEN_TOOL,
        ),
      ).toBe(false);
    });

    const MUST_DENY = [
      ["rawParams missing", {}],
      ["tokenApprovals null", approveTokenParams(null)],
      ["tokenApprovals empty", approveTokenParams([])],
      ["tokenApprovals is a string", approveTokenParams("5")],
      ["entry not an object", approveTokenParams(["5"])],
      ["amount missing", approveTokenParams([{ tokenId: "0.0.1" }])],
      ["amount unparseable", approveTokenParams([{ tokenId: "0.0.1", amount: "abc" }])],
      ["amount empty string", approveTokenParams([{ tokenId: "0.0.1", amount: "" }])],
      ["amount boolean", approveTokenParams([{ tokenId: "0.0.1", amount: true }])],
      ["amount NaN", approveTokenParams([{ tokenId: "0.0.1", amount: NaN }])],
      ["amount Infinity", approveTokenParams([{ tokenId: "0.0.1", amount: Infinity }])],
      ["amount negative", approveTokenParams([{ tokenId: "0.0.1", amount: -1 }])],
      ["one legal approval beside one unreadable", approveTokenParams([
        { tokenId: "0.0.1", amount: 5 },
        { tokenId: "0.0.2", amount: "abc" },
      ])],
    ];

    it.each(MUST_DENY)("blocks when %s", (_label, params) => {
      expect(policy.shouldBlockPostParamsNormalization(params, APPROVE_TOKEN_TOOL)).toBe(true);
    });
  });

  // The time window carries no amount logic, so the only thing worth asserting
  // is that the two policies cover exactly the same surface. A tool governed by
  // one and not the other is a gap nothing else reports.
  describe("both policies cover the same surface", () => {
    it("registers the identical tool list on both policies", () => {
      expect(new TimeWindowPolicy().relevantTools).toEqual(new TransferSizeLimitPolicy().relevantTools);
    });
  });
});

// ---------------------------------------------------------------------------
// The object-carrier branch of toFiniteNumber.
//
// Found 2026-09-13 by mutation, not by reading: changing that branch to return
// 0 instead of null survived all 455 tests. The source comment asserts the
// behaviour ("skipping is what let an unparseable amount contribute zero to the
// total") and nothing proved it. A zero is SKIPPED on the HBAR path rather than
// denied, so a malformed object amount beside real credits under-counts the
// total, which is the original fail-open bug in one surviving branch.
//
// Rule 91b: a test named after a bug that has been green since birth is an
// untested test. These were red-proved against that mutation before landing.
// ---------------------------------------------------------------------------

const CARRIERS = [
  ["a bare object with no bridge", {}],
  ["an object carrying unrelated keys", { value: 5, unit: "hbar" }],
  ["toNumber that is not a function", { toNumber: 5 }],
  ["toNumber that throws", { toNumber() { throw new Error("nope"); } }],
  ["toNumber returning a string", { toNumber: () => "5" }],
  ["toNumber returning NaN", { toNumber: () => NaN }],
  ["toNumber returning Infinity", { toNumber: () => Infinity }],
  ["toBigNumber returning a bridgeless object", { toBigNumber: () => ({}) }],
  ["toBigNumber that throws", { toBigNumber() { throw new Error("nope"); } }],
  ["an array", []],
  ["a Date", new Date()],
];

describe("an amount this rule cannot bridge to a number is denied, never skipped", () => {
  let policy;
  let warnSpy;

  beforeEach(() => {
    policy = new TransferSizeLimitPolicy();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it.each(CARRIERS)("HBAR: blocks %s", (_label, amount) => {
    expect(policy.shouldBlockPostParamsNormalization(hbarParams([{ amount }]), HBAR_TOOL)).toBe(true);
  });

  // The case that actually loses money: one real credit beside one carrier the
  // rule cannot read. Skipping the unreadable one hides part of the total.
  it.each(CARRIERS)("HBAR: blocks a real credit sitting beside %s", (_label, amount) => {
    const params = hbarParams([{ amount: 5 }, { amount }]);
    expect(policy.shouldBlockPostParamsNormalization(params, HBAR_TOOL)).toBe(true);
  });

  it.each(CARRIERS)("token airdrop: blocks %s", (_label, amount) => {
    expect(policy.shouldBlockPostParamsNormalization(tokenParams([{ amount }]), TOKEN_TOOL)).toBe(true);
  });

  it.each(CARRIERS)("HBAR allowance: blocks %s", (_label, amount) => {
    expect(policy.shouldBlockPostParamsNormalization(approveHbarParams(amount), APPROVE_HBAR_TOOL)).toBe(true);
  });

  it("names the unparseable field rather than reporting a generic block", () => {
    const { decision, reason } = evaluateTransferSize(hbarParams([{ amount: {} }]), HBAR_TOOL);
    expect(decision).toBe("DENY");
    expect(reason).toContain("hbarTransfers[0].amount");
    expect(reason).toMatch(/parse/i);
  });
});
