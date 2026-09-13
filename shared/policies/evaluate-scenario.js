import { GOVERNED_TOOLS } from "./governed-tools.js";
import { evaluateTimeWindow } from "./time-rule.js";
import { evaluateTransferSize } from "./size-rule.js";

// Runs both shipped rules against one hook payload and reports what the kit
// would have done with the result.
//
// The two policies sit at different lifecycle stages, so ORDER IS PART OF THE
// ANSWER. `Business Hours Only` runs at pre-tool-execution, before parameters
// are normalized; `Per-Transfer Size Limit` runs after. A real call stopped by
// the clock never reaches the size rule at all, so the size gate is reported as
// `reached: false` rather than quietly evaluated and shown as if it had run.

const TIME_GATE = Object.freeze({
  policy: "Business Hours Only",
  stage: "pre-tool-execution",
});

const SIZE_GATE = Object.freeze({
  policy: "Per-Transfer Size Limit",
  stage: "post-params-normalization",
});

/**
 * @returns {{
 *   outcome: "ALLOW" | "BLOCK" | "UNGOVERNED",
 *   stoppedBy: string | null,
 *   gates: Array<{ policy: string, stage: string, decision: string, reason: string, reached: boolean }>
 * }}
 */
export function runScenario({ tool, hourUtc, params }) {
  if (!GOVERNED_TOOLS.includes(tool)) {
    return {
      outcome: "UNGOVERNED",
      stoppedBy: null,
      gates: [
        { ...TIME_GATE, decision: "SKIP", reason: "tool is not in the governed list", reached: false },
        { ...SIZE_GATE, decision: "SKIP", reason: "tool is not in the governed list", reached: false },
      ],
    };
  }

  const time = evaluateTimeWindow(hourUtc);
  if (time.decision === "DENY") {
    return {
      outcome: "BLOCK",
      stoppedBy: TIME_GATE.policy,
      gates: [
        { ...TIME_GATE, ...time, reached: true },
        { ...SIZE_GATE, decision: "SKIP", reason: "never reached: the call was stopped one stage earlier", reached: false },
      ],
    };
  }

  const size = evaluateTransferSize(params, tool);
  return {
    outcome: size.decision === "DENY" ? "BLOCK" : "ALLOW",
    stoppedBy: size.decision === "DENY" ? SIZE_GATE.policy : null,
    gates: [
      { ...TIME_GATE, ...time, reached: true },
      { ...SIZE_GATE, ...size, reached: true },
    ],
  };
}
