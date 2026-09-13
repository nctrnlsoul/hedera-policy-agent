# Hedera Policy Agent

An AI agent that makes payments on Hedera and enforces runtime policies (Hedera Agent Kit Hooks & Policies) before a governed transfer executes.

> Submission for **Hedera AI Bounty, Week 5: Policy Agent**.

---

## What it does

A natural-language agent for the Hedera network. It can send HBAR, create and mint tokens, airdrop tokens, manage allowances and query balances.

Two policy hooks sit in front of every fungible value path: HBAR transfers, HBAR transfers spent against an allowance, fungible-token airdrops, fungible-token transfers spent against an allowance, and the two tools that grant HBAR and fungible-token allowances in the first place. When a policy blocks, the transaction never executes and the agent surfaces a clear reason.

The size limit enforces a separate per-asset threshold for HBAR and for tokens, including stablecoins such as Circle's USDC on testnet, so 10 HBAR and 10 USDC are checked independently.

- Built on the [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js) (v4).
- Runs on Hedera **testnet** out of the box.
- Web UI powered by Next.js with an LLM (OpenAI or Anthropic) driving tool calls.

**Read [Coverage and limits](#coverage-and-limits) before trusting the policy layer with anything.** Six of this agent's 29 tools are governed. The other 23 are not.

---

## Coverage and limits

The five core plugins wired in [`shared/config.js`](shared/config.js) expose **29 tools**. Both policies govern the same **6**, listed once in [`shared/policies/governed-tools.js`](shared/policies/governed-tools.js) and imported by each, so the two cannot drift apart:

- `transfer_hbar_tool`
- `transfer_hbar_with_allowance_tool`
- `airdrop_fungible_token_tool`
- `transfer_fungible_token_with_allowance_tool`
- `approve_hbar_allowance_tool`
- `approve_token_allowance_tool`

That is every fungible value path the agent exposes, plus the two tools that hand out fungible spending authority. Governing transfers while leaving the grants open is the hole worth naming: an ungoverned `approve_*_allowance` lets a spender move funds later, repeatedly, outside the time window, without another tool call the policy layer can see.

**Deliberately never governed.** The three tools that revoke authority stay open at any hour and any size:

- `delete_hbar_allowance_tool`
- `delete_token_allowance_tool`
- `delete_non_fungible_token_allowance_tool`

A guardrail that can block the cancel is worse than no guardrail. If an allowance is compromised at 3am, pulling it back must not depend on a business-hours window. This is a decision, not an oversight, and there is a test asserting the absence.

**Not yet governed.** The NFT paths, `transfer_non_fungible_token_tool`, `transfer_non_fungible_token_with_allowance_tool` and `approve_nft_allowance_tool`, move a serial number rather than an amount, so a per-asset size limit is the wrong rule shape. They need their own policy rather than a bad branch in this one. Also ungoverned: `create_account_tool`, `delete_account_tool`, `mint_fungible_token_tool`, `update_token_tool` and `sign_schedule_transaction_tool`.

Regenerate the full list at any time:

```bash
npm run coverage
```

That script reads the governed tool names off the policy classes themselves, so it cannot drift from the code it audits.

**What this is:** a policy layer that holds across every fungible transfer and allowance grant the agent can make, fails closed on input it cannot parse, and states its own boundary.

**What it is not:** complete coverage of all 29 tools. The gaps above are named rather than implied, and each is a stated decision with a reason.

---

## The policies

Both policies extend `AbstractPolicy` from `@hashgraph/hedera-agent-kit` and are registered in the `hooks` array of [`shared/config.js`](shared/config.js). They are the core of this submission.

Each policy's `relevantTools` is the shared `GOVERNED_TOOLS` list, so both gates cover exactly the same six tools. A test asserts the two lists are equal, because a tool governed by one policy and not the other is a gap nothing else would report.

### 1. Business Hours Only, `shared/policies/time-window-policy.js`

Blocks governed transfers attempted outside a configurable UTC hour window. Implemented at the **pre-tool-execution** stage, the cheapest stage to reject from, since no parameter normalization or network round trip is needed. The check is purely time-based, so it applies identically to HBAR and tokens.

Configure by editing the two constants at the top of the file:

```js
const ALLOWED_START_HOUR_UTC = 9;   // inclusive, 0-23
const ALLOWED_END_HOUR_UTC   = 17;  // exclusive, 0-24
```

A transfer is blocked when `currentUtcHour < START || currentUtcHour >= END`. Defaults to **09:00-17:00 UTC** (business hours). Widen or shift the window by editing the constants.

### 2. Per-Transfer Size Limit, `shared/policies/transfer-size-policy.js`

Blocks transfers whose total outgoing amount exceeds a configurable per-asset limit. Implemented at the **post-params-normalization** stage, the first stage at which the kit has parsed natural-language amounts into numeric values.

Configure by editing the two constants at the top of the file:

```js
const MAX_HBAR_PER_TRANSFER  = 10;  // HBAR
const MAX_TOKEN_PER_TRANSFER = 10;  // token display units (e.g. USDC)
```

- **HBAR paths** sum the positive (credit) entries in `normalisedParams.hbarTransfers`, mirroring the amount handling of the kit's built-in `MaxRecipientsPolicy` (tolerates `Hbar`, `BigNumber`, number or string). The kit defines `transferHbarWithAllowanceParameters` **as** `transferHbarParameters`, and both normalise to the same array, so the allowance variant runs the same rule rather than an approximation of it.
- **Token transfer paths** sum `rawParams.recipients[].amount` for the airdrop and `rawParams.transfers[].amount` for the allowance transfer. The kit documents both as display units (*"Amount in display units, the tool will handle parsing"* and *"Amount of tokens to transfer in display unit"*), so the comparison happens in the same units as the limit constant. No decimals lookup, no network round trip required. Each carries a single `tokenId`, so the amounts are summed.
- **Allowance grants** read `rawParams.amount` for HBAR and `rawParams.tokenApprovals[]` for tokens, both documented as display units. Token approvals are checked **per entry, not summed**, because each entry carries its own `tokenId`: a 10 cap on token A beside a 10 cap on token B is two separate caps, not a 20 cap on the pair.

**Zero is a revocation, and a revocation is never blocked.** Setting an allowance to zero is how an allowance is cancelled, so `approve_hbar_allowance` and `approve_token_allowance` allow `0` explicitly and say so in the logged reason. Negative amounts are still denied. The same instinct is why the three `delete_*_allowance` tools are ungoverned entirely.

**It fails closed.** Every input shape the rule cannot turn into a number it is willing to compare returns a block, with the reason logged: missing hook parameters, a missing or non-array list, an empty list, a non-object entry, a missing amount, an unparseable amount, a non-positive transfer amount, a negative allowance, and any tool added to `GOVERNED_TOOLS` that has no branch in the rule. A size limit that waves through input it failed to parse reports a guardrail that is not there, and an attacker only has to malform the one field the check reads.

The decision function is exported as `evaluateTransferSize` so the fail-closed behaviour can be asserted directly, including the reason, which the boolean hook contract has no room to carry.

---

## How it works

```
shared/config.js
└── hooks: [ TimeWindowPolicy, TransferSizeLimitPolicy ]
                       │
                       ▼
       Hedera Agent Kit runtime
                       │
   ┌───────────────────┼───────────────────┐
   ▼                   ▼                   ▼
pre-tool-execution   post-params-norm   (other stages)
   │                   │
   └── time window ────┴── size limit
```

A call to any of the six governed tools passes through the registered hooks. If a policy's `shouldBlock…` method returns `true`, the kit throws and the agent reports:

> *Action \<tool\> blocked by policy: \<policy name\> (\<description\>)*

instead of executing. A call to any of the other 23 tools never reaches a hook.

---

## Tests

```bash
npm test
```

500 tests across 18 files. 268 of those cover the size policy's decision surface directly, including every fail-closed path listed above, the revocation carve-outs, and a check that every tool the policy claims to govern actually has a rule behind it.

The suite passes under any `NODE_ENV`. Tests that assert development-only behavior pin the variable themselves rather than inheriting it from the shell.

---

## Setup & run

**Requirements:** Node.js **22+**.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# then edit .env and fill in:
#   HEDERA_ACCOUNT_ID    your testnet account, e.g. 0.0.12345
#   HEDERA_PRIVATE_KEY   HEX / ECDSA private key for that account
#   HEDERA_NETWORK       testnet
#   LLM_PROVIDER         openai | anthropic
#   OPENAI_API_KEY  OR   ANTHROPIC_API_KEY

# 3. Run the web app
npm run web
```

Open <http://localhost:3000> and chat with the agent.

`.env` is gitignored. Keep the operator key there or in an OS environment variable, never in a tracked file. Use a **testnet** account: in `auto` mode the server signs and submits with that key.

---

## Demo prompts

Try these in the chat UI to see the policy layer in action. With the default settings (HBAR limit `10`, token limit `10`, time window `9` to `17` UTC):

> **Heads-up:** run during 09:00-17:00 UTC, or widen the window in `shared/policies/time-window-policy.js` (e.g. `0` to `24`) so the size-limit demos are not masked by the business-hours block.

1. **HBAR, passes.** Small transfer, under the size limit, inside the time window:
   > *Send 1 HBAR to `0.0.98`.*

2. **HBAR, blocked by size limit.** Exceeds `MAX_HBAR_PER_TRANSFER = 10`:
   > *Send 50 HBAR to `0.0.98`.*
   >
   > → *"blocked by policy: Per-Transfer Size Limit"*

3. **Token, blocked by size limit.** Exceeds `MAX_TOKEN_PER_TRANSFER = 10`:
   > *Airdrop 50 of a fungible token you control to `0.0.98`.*
   >
   > → *"blocked by policy: Per-Transfer Size Limit"*
   >
   > The same flow works against Circle's testnet USDC by swapping in token ID `0.0.429274`. Any 6-decimal fungible token behaves the same way: a 5-unit airdrop passes, 50 blocks.

4. **Blocked by time window.** Run this outside 09:00-17:00 UTC, or temporarily edit the constants to a window that excludes the current UTC hour and restart the dev server:
   > *Send 1 HBAR to `0.0.98`.*
   >
   > → *"blocked by policy: Business Hours Only"*

---

## Development notes

Built solo. Used AI coding assistants (Claude Code) to implement the policy classes. The architecture, the policy design (which lifecycle stage each hook lives at, how display-unit and base-unit amounts are read, the choice to keep HBAR and token limits as independent constants), and the testing approach were my own. Dual-asset enforcement was verified end to end against a 6-decimal fungible token on live Hedera testnet; the same flow applies to Circle's testnet USDC by token ID.
