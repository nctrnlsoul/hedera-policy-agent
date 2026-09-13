import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

import { PolicyDenial } from "./denial.js";
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
  //
  // Stays a pure boolean predicate: it is the kit's documented extension point.
  shouldBlockPreToolExecution(_params, _method) {
    return evaluateTimeWindow(new Date().getUTCHours()).decision === "DENY";
  }

  // The reason carrier. Same shape and same caveat as the size policy: this
  // overrides a method the kit marks `@internal`, deliberately, so the sentence
  // the rule produced reaches the client instead of the bare policy name. See
  // denial.js for what makes it work and which tests pin it.
  async preToolExecutionHook(params, method) {
    if (!this.relevantTools.includes(method)) return;

    const { decision, reason } = evaluateTimeWindow(new Date().getUTCHours());
    if (decision !== "DENY") return;

    throw new PolicyDenial({
      policy: this.name,
      stage: "pre-tool-execution",
      reason,
      method: String(method),
    });
  }
}
