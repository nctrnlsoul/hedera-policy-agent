# Hedera Policy Agent

An AI agent that makes payments on Hedera and enforces runtime policies (Hedera Agent Kit Hooks & Policies) before a governed transfer executes.

> Submission for **Hedera AI Bounty, Week 5: Policy Agent**.

---

## What it does

A natural-language agent for the Hedera network. It can send HBAR, create and mint tokens, airdrop tokens, manage allowances and query balances.

Two policy hooks sit in front of two of those tools. When a policy blocks, the transaction never executes and the agent surfaces a clear reason.

Both policies govern **HBAR transfers and fungible-token airdrops**, including stablecoins such as Circle's USDC on testnet. The size limit enforces a separate per-asset threshold for each, so 10 HBAR and 10 USDC are checked independently.

- Built on the [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js) (v4).
- Runs on Hedera **testnet** out of the box.
- Web UI powered by Next.js with an LLM (OpenAI or Anthropic) driving tool calls.

**Read [Coverage and limits](#coverage-and-limits) before trusting the policy layer with anything.** Two of this agent's 29 tools are governed. The other 27 are not.

---

## Coverage and limits

The five core plugins wired in [`shared/config.js`](shared/config.js) expose **29 tools**. The two policies govern **2** of them:

- `transfer_hbar_tool`
- `airdrop_fungible_token_tool`

Every other tool reaches the network without passing a policy. **Four of the ungoverned tools move value:**

- `transfer_hbar_with_allowance_tool`
- `transfer_fungible_token_with_allowance_tool`
- `transfer_non_fungible_token_tool`
- `transfer_non_fungible_token_with_allowance_tool`

Tools that grant spending authority are ungoverned too, including `approve_hbar_allowance_tool`, `approve_token_allowance_tool` and `approve_nft_allowance_tool`, as are `create_account_tool`, `delete_account_tool`, `mint_fungible_token_tool` and `update_token_tool`.

Regenerate the full list at any time:

```bash
npm run coverage
```

That script reads the governed tool names off the policy classes themselves, so it cannot drift from the code it audits.

**What this is:** a working demonstration of the Agent Kit hook mechanism, enforced end to end on two tool paths and verified on live testnet for both, with dual-asset (HBAR and fungible token) enforcement through a single gate.

**What it is not:** a complete spend guard for a Hedera agent. Widening the surface means adding tool names to each policy's `relevantTools` plus a matching branch in the size rule, not new architecture. The narrow scope was a Week 5 bounty decision, and it is stated here rather than implied.

---

## The policies

Both policies extend `AbstractPolicy` from `@hashgraph/hedera-agent-kit` and are registered in the `hooks` array of [`shared/config.js`](shared/config.js). They are the core of this submission.

Each policy's `relevantTools` field lists `transfer_hbar_tool` **and** `airdrop_fungible_token_tool`, so both HBAR sends and fungible-token airdrops pass through the same gates.

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

- **HBAR path** sums the positive (credit) entries in `normalisedParams.hbarTransfers`, mirroring the amount handling of the kit's built-in `MaxRecipientsPolicy` (tolerates `Hbar`, `BigNumber`, number or string).
- **Token path** sums `rawParams.recipients[].amount` directly. The kit's `AirdropRecipientSchema` documents this field as *"Amount in display units, the tool will handle parsing"*, so the comparison happens in the same units as the limit constant. No decimals lookup, no network round trip required.

**It fails closed.** Every input shape the rule cannot turn into a number it is willing to compare returns a block, with the reason logged: missing hook parameters, a missing or non-array transfer list, an empty list, a non-object entry, a missing amount, an unparseable amount, a non-positive airdrop amount, and any tool added to `relevantTools` that has no branch in the rule. A size limit that waves through input it failed to parse reports a guardrail that is not there, and an attacker only has to malform the one field the check reads.

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

A call to `transfer_hbar_tool` or `airdrop_fungible_token_tool` passes through the registered hooks. If a policy's `shouldBlock…` method returns `true`, the kit throws and the agent reports:

> *Action \<tool\> blocked by policy: \<policy name\> (\<description\>)*

instead of executing. A call to any of the other 27 tools never reaches a hook.

---

## Tests

```bash
npm test
```

349 tests across 16 files. 163 of those cover the size policy's decision surface directly, including every fail-closed path listed above.

One caveat worth knowing: three tests in `web/src/features/chat/extension/registry.test.js` assert a development-only `console.warn`, so they fail if `NODE_ENV=production` is set in your shell. Unset it, or set it to `development`, before running the suite.

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
