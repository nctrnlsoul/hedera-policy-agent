import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

import { GOVERNED_TOOLS } from "./governed-tools.js";

const ALLOWED_START_HOUR_UTC = 9;
const ALLOWED_END_HOUR_UTC = 17;

export class TimeWindowPolicy extends AbstractPolicy {
  name = "Business Hours Only";
  description = "Transfers and allowances are only allowed within the configured UTC window";
  relevantTools = GOVERNED_TOOLS;

  // Purely time-based, so it needs neither the params nor the tool name and
  // applies identically to HBAR, tokens and allowance grants. Revocation is not
  // reachable from this list at all: see governed-tools.js.
  shouldBlockPreToolExecution(_params, _method) {
    const currentHour = new Date().getUTCHours();
    return currentHour < ALLOWED_START_HOUR_UTC || currentHour >= ALLOWED_END_HOUR_UTC;
  }
}
