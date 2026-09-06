import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

const MAX_HBAR_PER_TRANSFER = 10;
const MAX_TOKEN_PER_TRANSFER = 10;

const HBAR_TOOL = "transfer_hbar_tool";
const TOKEN_TOOL = "airdrop_fungible_token_tool";

const allow = (reason) => ({ decision: "ALLOW", reason });
const deny = (reason) => ({ decision: "DENY", reason });

/**
 * Decides whether a transfer may proceed under the per-asset size limit.
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
  if (method === HBAR_TOOL) return evaluateHbarTransfer(allParams);
  if (method === TOKEN_TOOL) return evaluateTokenAirdrop(allParams);
  // Reached when `relevantTools` gains a tool that has no branch here. Allowing
  // it would silently exempt that tool from the limit.
  return deny(`tool "${String(method)}" has no size rule in this policy`);
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

function evaluateTokenAirdrop(allParams) {
  const raw = allParams.rawParams;
  if (raw === null || typeof raw !== "object") {
    return deny("rawParams is missing or not an object");
  }

  const recipients = raw.recipients;
  if (!Array.isArray(recipients)) {
    return deny("rawParams.recipients is missing or not an array");
  }
  if (recipients.length === 0) {
    return deny("rawParams.recipients is empty");
  }

  let total = 0;
  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index];
    if (recipient === null || typeof recipient !== "object") {
      return deny(`recipients[${index}] is not an object`);
    }
    if (!("amount" in recipient)) {
      return deny(`recipients[${index}].amount is missing`);
    }
    const amount = toFiniteNumber(recipient.amount);
    if (amount === null) {
      return deny(`recipients[${index}].amount could not be parsed as a number`);
    }
    // Airdrop amounts are display units owed to a recipient and are always
    // positive. A zero or negative one is not a shape this rule can reason about.
    if (amount <= 0) {
      return deny(`recipients[${index}].amount is not a positive amount`);
    }
    total += amount;
  }

  if (total > MAX_TOKEN_PER_TRANSFER) {
    return deny(`token display units (${total}) exceed the ${MAX_TOKEN_PER_TRANSFER} per-transfer limit`);
  }
  return allow(`token display units (${total}) are within the ${MAX_TOKEN_PER_TRANSFER} per-transfer limit`);
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

export class TransferSizeLimitPolicy extends AbstractPolicy {
  name = "Per-Transfer Size Limit";
  description =
    "Transfers above the configured per-asset limit, or whose amount cannot be parsed, are blocked";
  relevantTools = [HBAR_TOOL, TOKEN_TOOL];

  shouldBlockPostParamsNormalization(allParams, method) {
    const { decision, reason } = evaluateTransferSize(allParams, method);
    if (decision === "DENY") {
      // The error the kit raises names the policy but not which rule fired.
      // Without this line a parse-failure block is indistinguishable from an
      // over-limit block in the logs.
      console.warn(`${this.name}: blocked ${String(method)} - ${reason}`);
      return true;
    }
    return false;
  }
}
