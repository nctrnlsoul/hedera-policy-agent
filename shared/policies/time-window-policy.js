import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

import { GOVERNED_TOOLS } from "./governed-tools.js";
import { evaluateTimeWindow } from "./time-rule.js";

// Re-exported so callers and tests have one import path for the rule and the
// policy that applies it.
export { evaluateTimeWindow };

export class TimeWindowPolicy extends AbstractPolicy {
  name = "Business Hours Only";
  description = "Transfers and allowances are only allowed within the configured UTC window";
  relevantTools = GOVERNED_TOOLS;

  // Purely time-based, so it needs neither the params nor the tool name and
  // applies identically to HBAR, tokens and allowance grants. Revocation is not
  // reachable from this list at all: see governed-tools.js.
  shouldBlockPreToolExecution(_params, _method) {
    return evaluateTimeWindow(new Date().getUTCHours()).decision === "DENY";
  }
}
