// The verdict row. This is the signature element of the console and it is built
// first on purpose.
//
// It is not a status pill. The thing worth showing is the REASON STRING the
// rule actually produced, verbatim, in the same monospace the rest of the
// machine data uses. No other Week 5 entry showed one, and it is what separates
// "a policy blocked this" from "a policy blocked this BECAUSE hbarTransfers[1]
// .amount could not be parsed as a number".
//
// Meaning never rides on colour alone: every decision carries a glyph, a word
// and a colour, so it survives a monochrome screen and a colour-blind reader.

const DECISION = {
  ALLOW: { word: "PASS", token: "--pc-allow" },
  DENY: { word: "BLOCK", token: "--pc-block" },
  SKIP: { word: "SKIP", token: "--pc-skip" },
};

function Glyph({ decision, color }) {
  const common = { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": true };
  if (decision === "ALLOW") {
    return (
      <svg {...common}>
        <path d="M2 7.5 L5.5 11 L12 3.5" fill="none" stroke={color} strokeWidth="2" />
      </svg>
    );
  }
  if (decision === "DENY") {
    return (
      <svg {...common}>
        <path d="M3 3 L11 11 M11 3 L3 11" fill="none" stroke={color} strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M2.5 7 L11.5 7" fill="none" stroke={color} strokeWidth="2" strokeDasharray="3 2" />
    </svg>
  );
}

export function VerdictRow({ gate }) {
  const { policy, stage, decision, reason, reached } = gate;
  const meta = DECISION[decision] ?? DECISION.SKIP;
  const color = `var(${meta.token})`;

  return (
    <li
      className="grid grid-cols-[3px_1fr] gap-x-4"
      style={{ opacity: reached ? 1 : 0.55 }}
    >
      <div style={{ background: reached ? color : "var(--pc-line)" }} />

      <div className="min-w-0 py-3 pr-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="font-mono text-[11px] uppercase tracking-[0.14em]"
            style={{ color: "var(--pc-text-faint)" }}
          >
            {stage}
          </span>
          <span className="text-[15px] font-medium" style={{ color: "var(--pc-text)" }}>
            {policy}
          </span>
          <span className="inline-flex items-center gap-1.5" style={{ color }}>
            <Glyph decision={decision} color={color} />
            <span className="font-mono text-[12px] font-bold tracking-[0.08em]">
              {meta.word}
            </span>
          </span>
        </div>

        {/* The product. Verbatim, wrapping, never truncated: a reason cut off
            at the edge of a card is the half that would have told you why. */}
        <p
          className="mt-1.5 font-mono text-[13px] leading-[1.55] break-words"
          style={{ color: reached ? "var(--pc-text-dim)" : "var(--pc-text-faint)" }}
        >
          {reason}
        </p>
      </div>
    </li>
  );
}
