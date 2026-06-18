import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

const ALLOWED_START_HOUR_UTC = 0;
const ALLOWED_END_HOUR_UTC = 24;

export class TimeWindowPolicy extends AbstractPolicy {
  name = "Business Hours Only";
  description = "Transfers are only allowed within the configured UTC window";
  relevantTools = ["transfer_hbar_tool"];

  shouldBlockPreToolExecution(_params, _method) {
    const currentHour = new Date().getUTCHours();
    return currentHour < ALLOWED_START_HOUR_UTC || currentHour >= ALLOWED_END_HOUR_UTC;
  }
}
