import { describe, expect, it } from "vitest";

import { SCENARIOS, SCENARIO_GROUPS } from "./scenarios.js";
import { runScenario } from "./evaluate-scenario.js";

// Every scenario the demo console can show, pinned to the outcome its label
// promises. A demo is a claim about the product, so it gets the same treatment
// as any other claim: if a scenario stops behaving the way its copy says, this
// goes red before a judge sees it.
const EXPECTED = {
  payroll: { outcome: "ALLOW", stoppedBy: null },
  "usdc-airdrop": { outcome: "ALLOW", stoppedBy: null },
  oversized: { outcome: "BLOCK", stoppedBy: "Per-Transfer Size Limit" },
  split: { outcome: "BLOCK", stoppedBy: "Per-Transfer Size Limit" },
  grant: { outcome: "BLOCK", stoppedBy: "Per-Transfer Size Limit" },
  spend: { outcome: "BLOCK", stoppedBy: "Per-Transfer Size Limit" },
  unparseable: { outcome: "BLOCK", stoppedBy: "Per-Transfer Size Limit" },
  "empty-string": { outcome: "BLOCK", stoppedBy: "Per-Transfer Size Limit" },
  "revoke-zero": { outcome: "ALLOW", stoppedBy: null },
  "two-tokens": { outcome: "ALLOW", stoppedBy: null },
  "ungoverned-revoke": { outcome: "UNGOVERNED", stoppedBy: null },
  "after-hours": { outcome: "BLOCK", stoppedBy: "Business Hours Only" },
};

describe("demo scenarios", () => {
  it("has an expectation pinned for every scenario, and no orphan expectations", () => {
    const ids = SCENARIOS.map((s) => s.id).sort();
    expect(ids).toEqual(Object.keys(EXPECTED).sort());
  });

  it("gives every scenario a unique id", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SCENARIOS)("$id resolves to the outcome its label promises", (scenario) => {
    const { outcome, stoppedBy } = runScenario(scenario);
    expect({ outcome, stoppedBy }).toEqual(EXPECTED[scenario.id]);
  });

  // The reason string is the thing this demo exists to show. An empty or
  // generic one would make the console a set of colored pills.
  it.each(SCENARIOS)("$id produces a reason on every gate that ran", (scenario) => {
    for (const gate of runScenario(scenario).gates) {
      expect(typeof gate.reason).toBe("string");
      expect(gate.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("the lifecycle order is part of the answer", () => {
  it("does not evaluate the size rule when the clock already stopped the call", () => {
    const afterHours = SCENARIOS.find((s) => s.id === "after-hours");
    const [time, size] = runScenario(afterHours).gates;

    expect(time.reached).toBe(true);
    expect(time.decision).toBe("DENY");
    // 1 HBAR is well inside the limit. If the size gate were evaluated anyway
    // the console would show an ALLOW beside a blocked call, which is a lie
    // about what the kit does.
    expect(size.reached).toBe(false);
    expect(size.decision).toBe("SKIP");
  });

  it("reports both gates as skipped for an ungoverned tool", () => {
    const ungoverned = SCENARIOS.find((s) => s.id === "ungoverned-revoke");
    const result = runScenario(ungoverned);

    expect(result.outcome).toBe("UNGOVERNED");
    expect(result.gates.every((gate) => gate.reached === false)).toBe(true);
  });

  it("names the stage each policy runs at, so the console cannot invent one", () => {
    const [time, size] = runScenario(SCENARIOS[0]).gates;
    expect(time.stage).toBe("pre-tool-execution");
    expect(size.stage).toBe("post-params-normalization");
  });
});

describe("scenario groups", () => {
  it("assigns every scenario to exactly one group", () => {
    const grouped = SCENARIO_GROUPS.flatMap((g) => g.scenarios.map((s) => s.id));
    expect(grouped.sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
  });

  it("gives every group a title and a blurb", () => {
    for (const group of SCENARIO_GROUPS) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.blurb.length).toBeGreaterThan(20);
    }
  });
});
