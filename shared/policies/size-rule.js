// The size rule, with ZERO imports on purpose.
//
// The policy class below this in transfer-size-policy.js extends AbstractPolicy
// and therefore drags the whole Hedera Agent Kit in with it. The browser demo
// needs the rule and not the kit, so the decision function lives here and the
// class is a thin wrapper around it. That keeps the console honest: it runs the
// same function the agent runs, not a reimplementation of it.

const MAX_HBAR_PER_TRANSFER = 10;
const MAX_TOKEN_PER_TRANSFER = 10;

// Every name in GOVERNED_TOOLS must have a branch in `evaluateTransferSize`. A
// name added there with no branch here falls through to the default and is
// denied outright, which is loud and safe rather than silently exempt.
const HBAR_TOOL = "transfer_hbar_tool";
const HBAR_ALLOWANCE_TOOL = "transfer_hbar_with_allowance_tool";
const TOKEN_AIRDROP_TOOL = "airdrop_fungible_token_tool";
const TOKEN_ALLOWANCE_TOOL = "transfer_fungible_token_with_allowance_tool";
const APPROVE_HBAR_TOOL = "approve_hbar_allowance_tool";
const APPROVE_TOKEN_TOOL = "approve_token_allowance_tool";

const allow = (reason) => ({ decision: "ALLOW", reason });
const deny = (reason) => ({ decision: "DENY", reason });

/**
 * Decides whether a value-moving call may proceed under the per-asset size
 * limit.
 *
 * Every path that cannot produce a number this rule is willing to compare
 * returns DENY. A size limit that waves through input it failed to parse is
 * worse than no size limit, because it reports a guardrail that is not there:
 * an attacker only has to malform the field the check reads. The kit's own
 * MaxRecipientsPolicy takes the same stance, throwing on any tool it has no
 * strategy for rather than defaulting to allow.
 *
 * Exported so the fail-closed behaviour can be asserted directly, including the
 * reason, which the boolean hook contract below has no room to carry.
 */
export function evaluateTransferSize(allParams, method) {
  if (allParams === null || typeof allParams !== "object") {
    return deny("hook parameters are missing or not an object");
  }

  switch (method) {
    // `transferHbarWithAllowanceParameters` IS `transferHbarParameters` by
    // identity in the kit, and both normalise to the same `hbarTransfers`
    // array, so this is the same rule and not an approximation of one.
    case HBAR_TOOL:
    case HBAR_ALLOWANCE_TOOL:
      return evaluateHbarTransfer(allParams);

    // Both carry a single `tokenId` with a list of amounts under it, so the
    // amounts are summed: they all draw on the same token.
    case TOKEN_AIRDROP_TOOL:
      return evaluateTokenTotal(allParams, "recipients");
    case TOKEN_ALLOWANCE_TOOL:
      return evaluateTokenTotal(allParams, "transfers");

    case APPROVE_HBAR_TOOL:
      return evaluateHbarApproval(allParams);
    case APPROVE_TOKEN_TOOL:
      return evaluateTokenApprovals(allParams);

    // Reached when `relevantTools` gains a tool that has no branch here.
    // Allowing it would silently exempt that tool from the limit.
    default:
      return deny(`tool "${String(method)}" has no size rule in this policy`);
  }
}

function evaluateHbarTransfer(allParams) {
  const normalised = allParams.normalisedParams;
  if (normalised === null || typeof normalised !== "object") {
    return deny("normalisedParams is missing or not an object");
  }

  const transfers = normalised.hbarTransfers;
  if (!Array.isArray(transfers)) {
    return deny("normalisedParams.hbarTransfers is missing or not an array");
  }
  if (transfers.length === 0) {
    return deny("normalisedParams.hbarTransfers is empty");
  }

  let credited = 0;
  let creditCount = 0;
  for (let index = 0; index < transfers.length; index += 1) {
    const transfer = transfers[index];
    if (transfer === null || typeof transfer !== "object") {
      return deny(`hbarTransfers[${index}] is not an object`);
    }
    if (!("amount" in transfer)) {
      return deny(`hbarTransfers[${index}].amount is missing`);
    }
    const amount = toFiniteNumber(transfer.amount);
    if (amount === null) {
      return deny(`hbarTransfers[${index}].amount could not be parsed as a number`);
    }
    // The normaliser appends the sender's negated total to this array, so a
    // debit leg is expected. Only credits are what the recipient actually gets.
    if (amount > 0) {
      credited += amount;
      creditCount += 1;
    }
  }

  if (creditCount === 0) {
    return deny("hbarTransfers contains no positive credit to size-check");
  }
  if (credited > MAX_HBAR_PER_TRANSFER) {
    return deny(`HBAR credited (${credited}) exceeds the ${MAX_HBAR_PER_TRANSFER} HBAR per-transfer limit`);
  }
  return allow(`HBAR credited (${credited}) is within the ${MAX_HBAR_PER_TRANSFER} HBAR per-transfer limit`);
}

/**
 * Sums a list of display-unit amounts hanging off a single `tokenId` and
 * compares the total to the token limit. `field` is the raw-params array name,
 * which differs per tool and is carried into every reason so a block names the
 * field it actually read.
 *
 * Display units are the kit's own contract for these fields: the airdrop schema
 * documents "Amount in display units, the tool will handle parsing" and the
 * allowance-transfer schema documents "Amount of tokens to transfer in display
 * unit". So no decimals lookup and no mirror-node round trip is needed.
 */
function evaluateTokenTotal(allParams, field) {
  const raw = allParams.rawParams;
  if (raw === null || typeof raw !== "object") {
    return deny("rawParams is missing or not an object");
  }

  const entries = raw[field];
  if (!Array.isArray(entries)) {
    return deny(`rawParams.${field} is missing or not an array`);
  }
  if (entries.length === 0) {
    return deny(`rawParams.${field} is empty`);
  }

  let total = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const amount = readEntryAmount(entries[index], field, index);
    if (amount.decision === "DENY") return amount;
    // A transfer of zero or less is not a shape this rule can reason about.
    // Approvals are different and are handled separately below.
    if (amount.value <= 0) {
      return deny(`${field}[${index}].amount is not a positive amount`);
    }
    total += amount.value;
  }

  if (total > MAX_TOKEN_PER_TRANSFER) {
    return deny(`token display units (${total}) exceed the ${MAX_TOKEN_PER_TRANSFER} per-transfer limit`);
  }
  return allow(`token display units (${total}) are within the ${MAX_TOKEN_PER_TRANSFER} per-transfer limit`);
}

/**
 * An HBAR allowance is a standing authority to spend, so it is capped by the
 * same constant as a direct transfer.
 *
 * ZERO IS ALLOWED ON PURPOSE. Setting an allowance to zero is how an allowance
 * is cancelled, and a guardrail that blocks the cancel is worse than no
 * guardrail. Negative is still denied: it is not a shape the kit produces.
 */
function evaluateHbarApproval(allParams) {
  const raw = allParams.rawParams;
  if (raw === null || typeof raw !== "object") {
    return deny("rawParams is missing or not an object");
  }
  if (!("amount" in raw)) {
    return deny("rawParams.amount is missing");
  }

  const amount = toFiniteNumber(raw.amount);
  if (amount === null) {
    return deny("rawParams.amount could not be parsed as a number");
  }
  if (amount < 0) {
    return deny(`rawParams.amount (${amount}) is negative`);
  }
  if (amount === 0) {
    return allow("HBAR allowance of 0 is a revocation and is never blocked");
  }
  if (amount > MAX_HBAR_PER_TRANSFER) {
    return deny(`HBAR allowance (${amount}) exceeds the ${MAX_HBAR_PER_TRANSFER} HBAR limit`);
  }
  return allow(`HBAR allowance (${amount}) is within the ${MAX_HBAR_PER_TRANSFER} HBAR limit`);
}

/**
 * Token approvals are checked PER ENTRY, not summed.
 *
 * Each entry carries its own `tokenId`, so the limit applies per token. Summing
 * across different tokens would compare unrelated quantities: a 10 cap on token
 * A and a 10 cap on token B is two separate caps, not a 20 cap on the pair.
 * That is the one place this rule deliberately differs from the airdrop path,
 * which hangs every amount off a single `tokenId` and is summed.
 *
 * Zero is a revocation here for the same reason as the HBAR allowance above.
 */
function evaluateTokenApprovals(allParams) {
  const raw = allParams.rawParams;
  if (raw === null || typeof raw !== "object") {
    return deny("rawParams is missing or not an object");
  }

  const approvals = raw.tokenApprovals;
  if (!Array.isArray(approvals)) {
    return deny("rawParams.tokenApprovals is missing or not an array");
  }
  if (approvals.length === 0) {
    return deny("rawParams.tokenApprovals is empty");
  }

  let revocations = 0;
  for (let index = 0; index < approvals.length; index += 1) {
    const amount = readEntryAmount(approvals[index], "tokenApprovals", index);
    if (amount.decision === "DENY") return amount;
    if (amount.value < 0) {
      return deny(`tokenApprovals[${index}].amount (${amount.value}) is negative`);
    }
    if (amount.value === 0) {
      revocations += 1;
      continue;
    }
    if (amount.value > MAX_TOKEN_PER_TRANSFER) {
      return deny(
        `tokenApprovals[${index}] approves ${amount.value} display units, over the ${MAX_TOKEN_PER_TRANSFER} per-token limit`,
      );
    }
  }

  if (revocations === approvals.length) {
    return allow(`${revocations} token allowance revocation(s), never blocked`);
  }
  return allow(`every token allowance is within the ${MAX_TOKEN_PER_TRANSFER} per-token limit`);
}

/**
 * Pulls one `amount` off a list entry. Returns a DENY verdict the caller can
 * return straight through, or `{ decision: "ALLOW", value }` with a finite
 * number. The caller decides what range is acceptable, because a transfer and
 * an approval disagree about zero.
 */
function readEntryAmount(entry, field, index) {
  if (entry === null || typeof entry !== "object") {
    return deny(`${field}[${index}] is not an object`);
  }
  if (!("amount" in entry)) {
    return deny(`${field}[${index}].amount is missing`);
  }
  const value = toFiniteNumber(entry.amount);
  if (value === null) {
    return deny(`${field}[${index}].amount could not be parsed as a number`);
  }
  return { decision: "ALLOW", value };
}

/**
 * Returns a finite number, or null when the value is anything this rule refuses
 * to guess at. Null is the caller's signal to deny, never to skip the entry:
 * skipping is what let an unparseable amount contribute zero to the total.
 */
function toFiniteNumber(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === "string") {
    // Number("") and Number("  ") are 0, which would read as a real amount.
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === "object") {
    // Hbar exposes toBigNumber(); BigNumber and Long expose toNumber() directly.
    // Anything without that bridge is an unknown carrier, not a zero.
    try {
      const bridged = typeof value.toBigNumber === "function" ? value.toBigNumber() : value;
      if (!bridged || typeof bridged.toNumber !== "function") return null;
      const asNumber = bridged.toNumber();
      return typeof asNumber === "number" && Number.isFinite(asNumber) ? asNumber : null;
    } catch {
      return null;
    }
  }
  // Booleans coerce to 0/1 and would be counted as an amount. They are not one.
  return null;
}

// Surfaced so a UI can state the limits it is demonstrating rather than
// hardcoding numbers that would drift from the rule.
export const LIMITS = Object.freeze({
  hbar: MAX_HBAR_PER_TRANSFER,
  token: MAX_TOKEN_PER_TRANSFER,
});
