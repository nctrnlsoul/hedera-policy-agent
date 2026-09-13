import * as React from "react";

// The verdict. This is the moment the product IS the product, and until now it
// rendered as a red "failed" card carrying the kit's generic
// "Action X blocked by policy: <name>" with no reason in it.
//
// Shape borrowed from the /policy console's verdict row, translated to the
// light field: the stage in small mono caps, the policy name in the sentence
// weight, and the rule's own words verbatim underneath. Verbatim matters. A
// paraphrase is a second source of truth that can drift from the rule, and the
// whole point of this work was that the reason existed and nobody could see it.
export function ChatHederaPolicyVerdict({ denial }) {
  if (!denial) return null;

  return (
    <div className="px-4 pt-1">
      <div className="border-l-2 border-l-[#C42B21] pl-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.08em] uppercase">
            {denial.stage.replace(/-/g, " ")}
          </span>
          <span className="text-[13px] font-medium">{denial.policy}</span>
        </div>
        {/* Mono, because the reason names amounts, limits, field paths and
            timestamps. It is machine data in a sentence, and the house rule is
            mono for machine data. */}
        <p className="text-muted-foreground mt-1 font-mono text-[12px] leading-[1.5]">
          {denial.reason}
        </p>
      </div>
    </div>
  );
}
