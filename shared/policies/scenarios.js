import { GOVERNED_TOOLS } from "./governed-tools.js";

// Fixtures for the no-key demo console.
//
// Every one of these is a real hook payload in the shape the Hedera Agent Kit
// hands a policy. The console runs the shipped rules against them directly, so
// what you see on screen is the decision the agent would make, not a recording
// of one. No LLM, no keys, no network, no clock: the hour is an input.
//
// Written as a group per idea rather than a flat list, because the point of the
// demo is the argument, not the count.

const hbarTransfer = (...credits) => {
  const total = credits.reduce((sum, n) => sum + n, 0);
  return {
    rawParams: { transfers: credits.map((amount) => ({ accountId: "0.0.98", amount })) },
    normalisedParams: {
      hbarTransfers: [
        ...credits.map((amount) => ({ accountId: "0.0.98", amount })),
        { accountId: "0.0.1111", amount: -total },
      ],
    },
  };
};

const airdrop = (...amounts) => ({
  rawParams: { tokenId: "0.0.429274", recipients: amounts.map((amount) => ({ amount })) },
  normalisedParams: { tokenTransfers: [] },
});

const approveHbar = (amount) => ({
  rawParams: { spenderAccountId: "0.0.7777", amount },
  normalisedParams: {},
});

const approveTokens = (...pairs) => ({
  rawParams: {
    spenderAccountId: "0.0.7777",
    tokenApprovals: pairs.map(([tokenId, amount]) => ({ tokenId, amount })),
  },
  normalisedParams: {},
});

export const SCENARIO_GROUPS = Object.freeze([
  {
    id: "ordinary",
    title: "Ordinary traffic",
    blurb: "The gate has to pass real work, or it is not a gate, it is an outage.",
    scenarios: [
      {
        id: "payroll",
        label: "Send 5 HBAR to a contractor",
        tool: "transfer_hbar_tool",
        hourUtc: 11,
        params: hbarTransfer(5),
      },
      {
        id: "usdc-airdrop",
        label: "Airdrop 5 USDC to a customer",
        tool: "airdrop_fungible_token_tool",
        hourUtc: 11,
        params: airdrop(5),
      },
    ],
  },
  {
    id: "over-limit",
    title: "Over the limit",
    blurb: "The obvious case, and the one that looks fine until you add it up.",
    scenarios: [
      {
        id: "oversized",
        label: "Send 50 HBAR in one go",
        tool: "transfer_hbar_tool",
        hourUtc: 11,
        params: hbarTransfer(50),
      },
      {
        id: "split",
        label: "Split it: 6 HBAR and 6 HBAR",
        tool: "transfer_hbar_tool",
        hourUtc: 11,
        note: "Each leg is under the cap. The rule sums the credits, so the pair is not.",
        params: hbarTransfer(6, 6),
      },
    ],
  },
  {
    id: "allowance",
    title: "The allowance bypass",
    blurb:
      "A transfer moves funds once. An allowance lets someone move them later, repeatedly, at an hour nobody is watching. Both of these were invisible to this policy layer until its coverage was widened past the two tools it shipped with.",
    scenarios: [
      {
        id: "grant",
        label: "Approve a 1000 HBAR allowance",
        tool: "approve_hbar_allowance_tool",
        hourUtc: 11,
        note: "No funds move here. That is the point: the authority to move them is granted instead.",
        params: approveHbar(1000),
      },
      {
        id: "spend",
        label: "Spend 50 HBAR against an allowance",
        tool: "transfer_hbar_with_allowance_tool",
        hourUtc: 11,
        note: "The kit defines this tool's parameters AS the plain transfer's, so it runs the same rule.",
        params: hbarTransfer(50),
      },
    ],
  },
  {
    id: "fail-closed",
    title: "Input it cannot read",
    blurb:
      "A size limit that waves through what it failed to parse reports a guardrail that is not there. An attacker only has to malform the one field the check reads.",
    scenarios: [
      {
        id: "unparseable",
        label: "Airdrop an amount of \"abc\"",
        tool: "airdrop_fungible_token_tool",
        hourUtc: 11,
        note: "Blocked on a value it could not turn into a number, and it names the field.",
        params: airdrop("abc"),
      },
      {
        id: "empty-string",
        label: "Airdrop an amount of \"\"",
        tool: "airdrop_fungible_token_tool",
        hourUtc: 11,
        note: "Number(\"\") is 0 in JavaScript, which would have read as a real amount.",
        params: airdrop(""),
      },
    ],
  },
  {
    id: "carve-outs",
    title: "What it deliberately does not block",
    blurb:
      "A guardrail that can block the cancel is worse than no guardrail. These two are decisions with tests behind them, not gaps.",
    scenarios: [
      {
        id: "revoke-zero",
        label: "Set an HBAR allowance to 0",
        tool: "approve_hbar_allowance_tool",
        hourUtc: 11,
        note: "Zero is how an allowance is cancelled. Allowed on purpose, and the reason says so.",
        params: approveHbar(0),
      },
      {
        id: "two-tokens",
        label: "Approve 10 of token A and 10 of token B",
        tool: "approve_token_allowance_tool",
        hourUtc: 11,
        note: "Each entry carries its own tokenId, so the cap is per token. Summing would block a legal pair.",
        params: approveTokens(["0.0.1001", 10], ["0.0.1002", 10]),
      },
      {
        id: "ungoverned-revoke",
        label: "Delete an HBAR allowance at 03:00 UTC",
        tool: "delete_hbar_allowance_tool",
        hourUtc: 3,
        note: "Not in the governed list at all. If an allowance is compromised at 3am, pulling it back cannot wait for business hours.",
        params: { rawParams: { spenderAccountId: "0.0.7777" }, normalisedParams: {} },
      },
    ],
  },
  {
    id: "clock",
    title: "The clock is a separate gate",
    blurb: "Two policies run at two different lifecycle stages. Either one can stop a call on its own.",
    scenarios: [
      {
        id: "after-hours",
        label: "Send 1 HBAR at 03:00 UTC",
        tool: "transfer_hbar_tool",
        hourUtc: 3,
        note: "Well within the size limit. Stopped by the window instead, before params are even normalized.",
        params: hbarTransfer(1),
      },
    ],
  },
]);

export const SCENARIOS = SCENARIO_GROUPS.flatMap((group) => group.scenarios);

/** True when both policies list this tool. Everything else reaches the network untouched. */
export const isGoverned = (tool) => GOVERNED_TOOLS.includes(tool);
