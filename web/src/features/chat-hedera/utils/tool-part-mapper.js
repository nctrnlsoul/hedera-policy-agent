import { parsePolicyDenial } from "../../../../../shared/policies/denial.js";

// Hedera-side sentinel emitted in human mode for the HITL approval flow.
// Duplicated from `chat-hedera/server/` to keep the client free of server
// imports; the value is part of the JSON-on-the-wire contract.
export const AWAITING_APPROVAL_STATUS = "AWAITING_APPROVAL";

// A policy block is not a network failure and should not be described as one.
// It is the product working.
export const BLOCKED_BY_POLICY_STATUS = "BLOCKED_BY_POLICY";

export function mapToolPartState(state, outcome, isSigning) {
  switch (state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      return "executing";
    case "output-available":
      if (outcome.status === AWAITING_APPROVAL_STATUS) {
        return isSigning ? "signing" : "awaiting-approval";
      }
      // Its own state, deliberately not "failed". A policy block is the system
      // doing its job, and rendering it in the red treatment reserved for a
      // network or SDK error tells the reader the opposite.
      if (outcome.status === BLOCKED_BY_POLICY_STATUS) {
        return "blocked";
      }
      if (outcome.status === "REJECTED") {
        return "failed";
      }
      return isFailureStatus(outcome.status) ? "failed" : "confirmed";
    case "output-error":
      return "network-error";
    case "output-denied":
      return "failed";
    default:
      return "executing";
  }
}

export function extractOutcome(state, output, substrateErrorMessage) {
  if (state === "output-error") {
    return { errorMessage: substrateErrorMessage };
  }
  if (state !== "output-available") {
    return {};
  }
  const parsed = parseToolOutput(output);
  if (!parsed) return {};
  const raw = isRecord(parsed.raw) ? parsed.raw : null;

  // A policy denial arrives looking like any other kit error, because that is
  // what it is by the time it gets here. Recognising it first does two things:
  // it strips the machine payload the reason rides on, which would otherwise
  // render verbatim in the card, and it separates "your guardrail stopped this"
  // from "the network failed".
  const denial = parsePolicyDenial(parsed);
  if (denial) {
    return {
      status: BLOCKED_BY_POLICY_STATUS,
      // The rule's own sentence, and nothing else. Not the kit's
      // "Failed to execute X:" preamble, which frames a working guardrail as a
      // malfunction, and not the sentinel payload behind it.
      errorMessage: denial.reason,
      denial,
    };
  }

  // The Hedera Agent Kit's `handleError` returns `{ raw: { status: SDK.Status,
  // error } }`. SDK Status is a frozen class that JSON-serializes as
  // `{ "_code": <n> }`, so a strict `typeof === "string"` check loses the
  // failure signal and the card would render as confirmed. Falling back to
  // `raw.error` recovers the failure, which always pairs with that envelope.
  let status;
  if (typeof raw?.status === "string") {
    status = raw.status;
  } else if (typeof raw?.error === "string" && raw.error.length > 0) {
    status = "FAILED";
  }
  const transactionId =
    typeof raw?.transactionId === "string" ? raw.transactionId : undefined;
  const errorMessage =
    isFailureStatus(status) && typeof parsed.humanMessage === "string"
      ? parsed.humanMessage
      : undefined;
  const unsignedBytes =
    typeof raw?.unsignedBytes === "string" ? raw.unsignedBytes : undefined;
  return { transactionId, status, errorMessage, unsignedBytes };
}

function parseToolOutput(output) {
  if (typeof output === "string") {
    try {
      return JSON.parse(output);
    } catch {
      return null;
    }
  }
  if (isRecord(output)) return output;
  return null;
}

function isFailureStatus(status) {
  if (!status) return false;
  if (status === AWAITING_APPROVAL_STATUS) return false;
  return status !== "SUCCESS" && status !== "OK";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
