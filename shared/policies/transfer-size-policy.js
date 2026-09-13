import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

import { PolicyDenial } from "./denial.js";
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

  // The kit's documented extension point, and it stays a PURE BOOLEAN
  // PREDICATE. An earlier attempt threw from here to carry the reason out, and
  // 166 existing tests went red: they assert this returns true, because that is
  // the contract. They were right and the attempt was wrong.
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

  // The reason carrier, overriding the kit's own hook rather than its predicate.
  //
  // The kit's version of this method calls the predicate above and, on true,
  // throws `Action X blocked by policy: <name>` — which never says WHY. This
  // override evaluates once and throws an error that carries the reason, so the
  // sentence the rule already produced reaches the client instead of dying in a
  // console.warn.
  //
  // COUPLING, STATED PLAINLY: the kit marks this method `@internal`, so this is
  // a deliberate reach into an implementation detail. Two facts make it work
  // and both are pinned by tests that fail loudly if a kit upgrade changes
  // them: `BaseTool.execute` catches whatever a hook throws, and its handler
  // appends `error.message` to the tool result verbatim.
  async postParamsNormalizationHook(allParams, method) {
    if (!this.relevantTools.includes(method)) return;

    const { decision, reason } = evaluateTransferSize(allParams, method);
    if (decision !== "DENY") return;

    console.warn(`${this.name}: blocked ${String(method)} - ${reason}`);
    throw new PolicyDenial({
      policy: this.name,
      stage: "post-params-normalization",
      reason,
      method: String(method),
    });
  }
}
