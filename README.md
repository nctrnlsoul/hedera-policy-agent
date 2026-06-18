# Hedera Policy Agent

An AI agent that makes payments on Hedera and enforces runtime policies (Hedera Agent Kit Hooks & Policies) before any transfer executes.

> Submission for **Hedera AI Bounty — Week 5: Policy Agent**.

---

## What it does

A natural-language agent for the Hedera network. You can ask it to send HBAR, create fungible tokens, airdrop tokens, query balances, and so on — but every transfer is intercepted by a **policy layer** before it touches the network. If a policy says no, the transaction never executes and the agent surfaces a clear reason.

Both policies govern **HBAR transfers and fungible-token airdrops** (including stablecoins like Circle's USDC on testnet). The size limit enforces a separate per-asset threshold for each, so 10 HBAR and 10 USDC are checked independently.

- Built on the [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js) (v4).
- Runs on Hedera **testnet** out of the box.
- Web UI powered by Next.js with an LLM (OpenAI or Anthropic) driving tool calls.

---

## The policies

Both policies extend `AbstractPolicy` from `@hashgraph/hedera-agent-kit` and are registered in the `hooks` array of [`shared/config.js`](shared/config.js). They are the core of this submission.

Each policy's `relevantTools` field lists `transfer_hbar_tool` **and** `airdrop_fungible_token_tool`, so both HBAR sends and fungible-token airdrops pass through the same gates.

### 1. Business Hours Only — `shared/policies/time-window-policy.js`

Blocks HBAR transfers and fungible-token airdrops attempted outside a configurable UTC hour window. Implemented at the **pre-tool-execution** stage — the cheapest stage to reject, since no parameter normalization or network round-trip is needed. The check is purely time-based, so it applies identically to HBAR and tokens.

Configure by editing the two constants at the top of the file:

```js
const ALLOWED_START_HOUR_UTC = 9;   // inclusive, 0–23
const ALLOWED_END_HOUR_UTC   = 17;  // exclusive, 0–24
```

A transfer is blocked when `currentUtcHour < START || currentUtcHour >= END`. Defaults to **09:00–17:00 UTC** (business hours); widen or shift the window by editing the constants.

### 2. Per-Transfer Size Limit — `shared/policies/transfer-size-policy.js`

Blocks transfers whose total outgoing amount exceeds a configurable per-asset limit. Implemented at the **post-params-normalization** stage — the first stage at which the kit has parsed natural-language amounts into numeric values.

Configure by editing the two constants at the top of the file:

```js
const MAX_HBAR_PER_TRANSFER  = 10;  // HBAR
const MAX_TOKEN_PER_TRANSFER = 10;  // token display units (e.g. USDC)
```

- **HBAR path** sums the positive (credit) entries in `normalisedParams.hbarTransfers`, mirroring the amount-handling logic of the kit's built-in `MaxRecipientsPolicy` (tolerates `Hbar`, `BigNumber`, number, or string).
- **Token path** sums `rawParams.recipients[].amount` directly. The kit's `AirdropRecipientSchema` documents this field as *"Amount in display units, the tool will handle parsing"*, so the comparison happens in the same units as the limit constant — no decimals lookup, no network round-trip required.

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

Every relevant tool call (`transfer_hbar_tool` and `airdrop_fungible_token_tool`) passes through the registered hooks. If any policy's `shouldBlock…` method returns `true`, the kit throws and the agent reports:

> *Action \<tool\> blocked by policy: \<policy name\> (\<description\>)*

— instead of executing.

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

---

## Demo prompts

Try these in the chat UI to see the policy layer in action. With the default policy settings (HBAR limit `10`, token limit `10`, time window `9`–`17` UTC):

> **Heads-up:** run during 09:00–17:00 UTC, or widen the window in `shared/policies/time-window-policy.js` (e.g. `0`–`24`) so the size-limit demos aren't masked by the business-hours block.

1. **HBAR — passes** — small transfer, under the size limit, inside the time window:
   > *Send 1 HBAR to `0.0.98`.*

2. **HBAR — blocked by size limit** — exceeds `MAX_HBAR_PER_TRANSFER = 10`:
   > *Send 50 HBAR to `0.0.98`.*
   >
   > → *"blocked by policy: Per-Transfer Size Limit"*

3. **Token — blocked by size limit** — exceeds `MAX_TOKEN_PER_TRANSFER = 10`:
   > *Airdrop 50 of a fungible token you control to `0.0.98`.*
   >
   > → *"blocked by policy: Per-Transfer Size Limit"*
   >
   > The same flow works against Circle's testnet USDC by swapping in token ID `0.0.429274`. Any 6-decimal fungible token behaves the same way; a 5-unit airdrop passes, 50 blocks.

4. **Blocked by time window** — run this outside 09:00–17:00 UTC (or temporarily edit the constants in `shared/policies/time-window-policy.js` to a window that excludes the current UTC hour, then restart the dev server):
   > *Send 1 HBAR to `0.0.98`.*
   >
   > → *"blocked by policy: Business Hours Only"*

---

## Development notes

Built solo. Used AI coding assistants (Claude Code) to implement the policy classes — the architecture, policy design (which lifecycle stage each hook lives at, how display-unit vs. base-unit amounts are read, the choice to keep HBAR and token limits as independent constants), and the testing approach were my own. Dual-asset enforcement was verified end-to-end against a 6-decimal fungible token (a USDC-equivalent) on live Hedera testnet; the same flow applies to Circle's testnet USDC by token ID.
