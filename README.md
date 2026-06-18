# Hedera Policy Agent

An AI agent that makes payments on Hedera and enforces runtime policies (Hedera Agent Kit Hooks & Policies) before any transfer executes.

> Submission for **Hedera AI Bounty — Week 5: Policy Agent**.

---

## What it does

A natural-language agent for the Hedera network. You can ask it to send HBAR, create fungible tokens, airdrop tokens, query balances, and so on — but every transfer is intercepted by a **policy layer** before it touches the network. If a policy says no, the transaction never executes and the agent surfaces a clear reason.

- Built on the [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js) (v4).
- Runs on Hedera **testnet** out of the box.
- Web UI powered by Next.js with an LLM (OpenAI or Anthropic) driving tool calls.

---

## The policies

Both policies extend `AbstractPolicy` from `@hashgraph/hedera-agent-kit` and are registered in the `hooks` array of [`shared/config.js`](shared/config.js). They are the core of this submission.

### 1. Business Hours Only — `shared/policies/time-window-policy.js`

Blocks HBAR transfers attempted outside a configurable UTC hour window. Implemented at the **pre-tool-execution** stage — the cheapest stage to reject, since no parameter normalization or network round-trip is needed.

Configure by editing the two constants at the top of the file:

```js
const ALLOWED_START_HOUR_UTC = 9;   // inclusive, 0–23
const ALLOWED_END_HOUR_UTC   = 17;  // exclusive, 0–24
```

A transfer is blocked when `currentUtcHour < START || currentUtcHour >= END`. Defaults to **09:00–17:00 UTC** (business hours); widen or shift the window by editing the constants.

### 2. Per-Transfer Size Limit — `shared/policies/transfer-size-policy.js`

Blocks any HBAR transfer whose total outgoing amount exceeds a configurable limit. Implemented at the **post-params-normalization** stage — that's the first stage at which the kit has parsed the user's natural-language amount into a numeric `Hbar` value, so it's the earliest point we can compare against a numeric threshold.

Configure by editing the single constant at the top of the file:

```js
const MAX_HBAR_PER_TRANSFER = 10;   // HBAR
```

The policy sums the positive (credit) entries in `normalisedParams.hbarTransfers`, mirroring the amount-handling logic of the kit's built-in `MaxRecipientsPolicy` (tolerates `Hbar`, `BigNumber`, number, or string).

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

Every relevant tool call (currently scoped to `transfer_hbar_tool` via each policy's `relevantTools` field) passes through the registered hooks. If any policy's `shouldBlock…` method returns `true`, the kit throws and the agent reports:

> *Action transfer_hbar_tool blocked by policy: \<policy name\> (\<description\>)*

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

Try these in the chat UI to see the policy layer in action. With the default policy settings (size limit `10` HBAR, time window `9`–`17` UTC):

1. **Passes** — small transfer, under the size limit, inside the time window:
   > *Send 1 HBAR to `0.0.98`.*

2. **Blocked by size limit** — exceeds `MAX_HBAR_PER_TRANSFER = 10`:
   > *Send 50 HBAR to `0.0.98`.*
   >
   > → *"blocked by policy: Per-Transfer Size Limit"*

3. **Blocked by time window** — run this outside 09:00–17:00 UTC (or temporarily edit the constants in `shared/policies/time-window-policy.js` to a window that excludes the current UTC hour, then restart the dev server):
   > *Send 1 HBAR to `0.0.98`.*
   >
   > → *"blocked by policy: Business Hours Only"*
