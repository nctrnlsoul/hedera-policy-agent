import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

import { GOVERNED_TOOLS } from "./governed-tools.js";
import { evaluateTransferSize } from "./size-rule.js";

// Re-exported so callers and tests have one import path for the rule and the
// policy that applies it.
export { evaluateTransferSize };

export class TransferSizeLimitPolicy extends AbstractPolicy {
  name = "Per-Transfer Size Limit";
  description =
    "Transfers and allowances above the configured per-asset limit, or whose amount cannot be parsed, are blocked";
  relevantTools = GOVERNED_TOOLS;

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
