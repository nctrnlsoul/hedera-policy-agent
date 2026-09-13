"use client";

import * as React from "react";

import { SCENARIO_GROUPS } from "../../../../shared/policies/scenarios.js";
import { runScenario } from "../../../../shared/policies/evaluate-scenario.js";
import { LIMITS } from "../../../../shared/policies/size-rule.js";
import { WINDOW } from "../../../../shared/policies/time-rule.js";
import { GOVERNED_TOOLS } from "../../../../shared/policies/governed-tools.js";
import { VerdictRow } from "./VerdictRow";

// The console runs the SHIPPED rules. `runScenario` calls the same
// `evaluateTransferSize` and `evaluateTimeWindow` the policy classes call, so
// what renders here is the decision the agent makes, not a recording of one.
// Those four modules import nothing but each other, which is why this page
// carries no Hedera SDK, no keys, no network and no clock.

const OUTCOME = {
  ALLOW: { word: "EXECUTES", token: "--pc-allow", note: "Both gates passed. The tool call reaches the network." },
  BLOCK: { word: "BLOCKED", token: "--pc-block", note: "The kit throws and the transaction never executes." },
  UNGOVERNED: { word: "UNGOVERNED", token: "--pc-skip", note: "No policy lists this tool. It reaches the network without passing a gate." },
};

const pad = (h) => String(h).padStart(2, "0") + ":00";

function summarize(scenario) {
  const raw = scenario.params.rawParams ?? {};
  if (Array.isArray(raw.transfers) && raw.transfers.length) {
    return raw.transfers.map((t) => `${t.amount} HBAR`).join(" + ");
  }
  if (Array.isArray(raw.recipients)) {
    return raw.recipients.map((r) => `${JSON.stringify(r.amount)} units`).join(" + ");
  }
  if (Array.isArray(raw.tokenApprovals)) {
    return raw.tokenApprovals.map((a) => `${a.amount} of ${a.tokenId}`).join(" + ");
  }
  if ("amount" in raw) return `${raw.amount} HBAR allowance`;
  return "no amount";
}

function ScenarioButton({ scenario, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(scenario)}
      aria-current={selected ? "true" : undefined}
      className="grid w-full grid-cols-[2px_1fr] gap-x-3 text-left transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        // Minimum target height, per the 24px non-negotiable.
        minHeight: 44,
        "--tw-ring-color": "var(--ns-blue)",
        "--tw-ring-offset-color": "var(--pc-canvas)",
      }}
    >
      <span
        aria-hidden
        style={{ background: selected ? "var(--ns-blue)" : "transparent" }}
      />
      <span className="py-2.5 pr-2">
        <span
          className="block text-[14px] leading-snug"
          style={{ color: selected ? "var(--pc-text)" : "var(--pc-text-dim)" }}
        >
          {scenario.label}
        </span>
        <span
          className="mt-0.5 block font-mono text-[11px]"
          style={{ color: "var(--pc-text-faint)" }}
        >
          {scenario.tool}
        </span>
      </span>
    </button>
  );
}

export function PolicyConsole() {
  // Preselected on purpose. "Show state on load, not on first event": a judge
  // who opens this and sees an empty pane has learned nothing, and the
  // configuration IS the feature.
  const [scenario, setScenario] = React.useState(SCENARIO_GROUPS[0].scenarios[0]);
  const resultRef = React.useRef(null);
  const userPicked = React.useRef(false);

  // Measured at 375, 430 and 1440: the scenario list is far taller than the
  // verdict pane, so on a narrow screen the answer sits below the entire list
  // and picking anything past the first group puts it off-screen. Sticky fixes
  // the wide case; this fixes the narrow one by bringing the answer to the
  // reader. Only fires on a real selection, never on mount, so the page does
  // not jump before anyone has done anything.
  React.useEffect(() => {
    if (!userPicked.current || !resultRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "nearest",
    });
  }, [scenario]);

  const pick = (next) => {
    userPicked.current = true;
    setScenario(next);
  };

  const result = runScenario(scenario);
  const outcome = OUTCOME[result.outcome];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-14">
      {/* Left: the argument, grouped. Not a flat menu, because the grouping is
          what the demo is actually saying. */}
      <div className="flex flex-col gap-7">
        {SCENARIO_GROUPS.map((group) => (
          <section key={group.id}>
            <h2
              className="font-mono text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--pc-text-faint)" }}
            >
              {group.title}
            </h2>
            <p
              className="mt-2 max-w-[46ch] text-[13px] leading-[1.6]"
              style={{ color: "var(--pc-text-dim)" }}
            >
              {group.blurb}
            </p>
            <ul className="mt-3 flex flex-col">
              {group.scenarios.map((s) => (
                <li key={s.id}>
                  <ScenarioButton
                    scenario={s}
                    selected={s.id === scenario.id}
                    onSelect={pick}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Right: the mechanic IS the layout. A call enters at the top, falls
          through two gates in lifecycle order, and lands or is stopped.
          Sticky from lg up, because the scenario list beside it is roughly
          three times taller and the verdict would otherwise scroll away from
          the control that changes it. `self-start` is required: a grid item
          stretches by default and a stretched item cannot stick. */}
      <div ref={resultRef} className="min-w-0 lg:sticky lg:top-10 lg:self-start">
        <div
          className="border-l-2 pl-5"
          style={{ borderColor: "var(--pc-line)" }}
        >
          <p
            className="font-mono text-[11px] uppercase tracking-[0.16em]"
            style={{ color: "var(--pc-text-faint)" }}
          >
            the call
          </p>
          <p
            className="mt-2 font-mono text-[15px] break-all"
            style={{ color: "var(--pc-text)" }}
          >
            {scenario.tool}
          </p>
          <p className="mt-1 font-mono text-[13px]" style={{ color: "var(--pc-text-dim)" }}>
            {summarize(scenario)} · {pad(scenario.hourUtc)} UTC
          </p>
          {!GOVERNED_TOOLS.includes(scenario.tool) && (
            <p
              className="mt-3 max-w-[60ch] text-[13px] leading-[1.6]"
              style={{ color: "var(--pc-text-dim)" }}
            >
              This tool is not in the governed list, so neither policy sees it.
              That is a decision with a test behind it, not a gap.
            </p>
          )}
        </div>

        <ol className="mt-6 flex flex-col gap-1">
          {result.gates.map((gate) => (
            <VerdictRow key={gate.policy} gate={gate} />
          ))}
        </ol>

        {/* The outcome, in display type. The one number a judge came for does
            not get the same size as a field label. */}
        <div
          className="mt-7 border-t pt-6"
          style={{ borderColor: "var(--pc-line)" }}
        >
          <p
            className="text-[clamp(2rem,6vw,3.25rem)] leading-[0.95] font-semibold tracking-[-0.02em]"
            style={{ color: `var(${outcome.token})` }}
          >
            {outcome.word}
          </p>
          <p
            className="mt-3 max-w-[58ch] text-[14px] leading-[1.6]"
            style={{ color: "var(--pc-text-dim)" }}
          >
            {outcome.note}
            {result.stoppedBy ? ` Stopped by ${result.stoppedBy}.` : ""}
          </p>
          {scenario.note && (
            <p
              className="mt-4 max-w-[62ch] border-l-2 pl-4 text-[14px] leading-[1.65]"
              style={{ borderColor: "var(--ns-blue)", color: "var(--pc-text-dim)" }}
            >
              {scenario.note}
            </p>
          )}
        </div>

        {/* State on load. The configuration is the feature, so it is readable
            without pressing anything, and every number is derived from the rule
            rather than typed here. */}
        <dl
          className="mt-8 grid gap-x-8 gap-y-3 border-t pt-5 sm:grid-cols-3"
          style={{ borderColor: "var(--pc-line)" }}
        >
          {[
            ["HBAR limit", `${LIMITS.hbar} per transfer`],
            ["Token limit", `${LIMITS.token} display units`],
            ["Window", `${pad(WINDOW.startHourUtc)} to ${pad(WINDOW.endHourUtc)} UTC`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt
                className="font-mono text-[11px] uppercase tracking-[0.14em]"
                style={{ color: "var(--pc-text-faint)" }}
              >
                {label}
              </dt>
              <dd className="mt-1 font-mono text-[14px]" style={{ color: "var(--pc-text)" }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
