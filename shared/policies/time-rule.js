// The time rule, with ZERO imports, for the same reason as size-rule.js: the
// browser demo needs the rule without the Hedera Agent Kit behind it.
//
// It returns the same { decision, reason } shape the size rule returns, so a
// caller can render either verdict without knowing which policy produced it.

const ALLOWED_START_HOUR_UTC = 9;
const ALLOWED_END_HOUR_UTC = 17;

export const WINDOW = Object.freeze({
  startHourUtc: ALLOWED_START_HOUR_UTC,
  endHourUtc: ALLOWED_END_HOUR_UTC,
});

const pad = (hour) => String(hour).padStart(2, "0") + ":00";

/**
 * The window is half open: the start hour is inside it, the end hour is not.
 * Takes the hour rather than reading the clock, so the rule is a pure function
 * of its input and a demo can ask it about any hour of the day.
 */
export function evaluateTimeWindow(hourUtc) {
  if (!Number.isInteger(hourUtc) || hourUtc < 0 || hourUtc > 23) {
    return {
      decision: "DENY",
      reason: `"${String(hourUtc)}" is not an hour of the day`,
    };
  }
  if (hourUtc < ALLOWED_START_HOUR_UTC || hourUtc >= ALLOWED_END_HOUR_UTC) {
    return {
      decision: "DENY",
      reason: `${pad(hourUtc)} UTC is outside the ${pad(ALLOWED_START_HOUR_UTC)} to ${pad(ALLOWED_END_HOUR_UTC)} UTC window`,
    };
  }
  return {
    decision: "ALLOW",
    reason: `${pad(hourUtc)} UTC is inside the ${pad(ALLOWED_START_HOUR_UTC)} to ${pad(ALLOWED_END_HOUR_UTC)} UTC window`,
  };
}
