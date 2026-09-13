import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The guard that actually holds the design line.
//
// Design Gate ranks the mechanisms by how little they depend on the agent being
// diligent, and a failing test sits at the top while a note sits at the bottom.
// So the rules live here, not in a comment. "Assert the RULE, not the token": a
// token check confirms a value arrived, a rule check confirms it is the right
// value on the right surface.

const CSS = readFileSync(
  fileURLToPath(new URL("./globals.css", import.meta.url)),
  "utf8",
);

const BLOSSOM_ACCENT = "#4392e6";
const NS_ACCENTS = ["#0052fd", "#0055fd", "#005bfe", "#146ffe"];

// Documented AI tells. Interface Standard section 2, and the palette that was
// shipped on 2026-08-21 and rejected on sight for being close to Anthropic's own.
const BANNED = ["#faf9f5", "#fdfcfa", "#d97757"];

const css = CSS.toLowerCase();

// Comments stripped. A colour check that reads its own explanatory prose is not
// a colour check, and this project has logged that exact failure four times
// (C-150, C-151, C-154, C-167). The brand-set declaration is DELIBERATELY in a
// comment, so that one rule reads `css` and every colour rule reads `code`.
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function token(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`));
  if (!match) throw new Error(`token --${name} is not defined in globals.css`);
  return match[1];
}

describe("brand set", () => {
  // Rule 1 of the amended Design Gate check: the set is a decision, not a
  // default, so the build has to say which one it is on. Fail closed.
  it("declares its logo set exactly once", () => {
    const declarations = css.match(/brand-set:\s*(blossom|ns)/g) ?? [];
    expect(declarations).toHaveLength(1);
    expect(declarations[0]).toContain("blossom");
  });

  // Rule 2: present, not merely not-absent. A purely negative test is satisfied
  // by inventing a third palette, which is what happened on 2026-08-21.
  it("carries the blossom accent", () => {
    expect(code).toContain(BLOSSOM_ACCENT);
  });

  it("carries no accent from the NS monogram set", () => {
    for (const accent of NS_ACCENTS) {
      expect(code).not.toContain(accent);
    }
  });

  it("carries none of the documented AI-tell values", () => {
    for (const tell of BANNED) {
      expect(code).not.toContain(tell);
    }
  });
});

describe("contrast, computed and not eyeballed", () => {
  const canvas = () => token("pc-canvas");

  // WCAG 2.2 AA. Non-negotiable in northschema-design.
  it.each([
    ["pc-text", 4.5],
    ["pc-text-dim", 4.5],
    ["pc-text-faint", 4.5],
  ])("%s clears %s:1 on the canvas", (name, floor) => {
    expect(contrast(token(name), canvas())).toBeGreaterThanOrEqual(floor);
  });

  it.each([["pc-allow"], ["pc-block"], ["pc-skip"]])(
    "%s clears 4.5:1 on the canvas",
    (name) => {
      expect(contrast(token(name), canvas())).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("keeps structure lines visible without reading as text", () => {
    expect(contrast(token("pc-line"), canvas())).toBeGreaterThanOrEqual(1.2);
  });
});

describe("the blossom accent stays off body text", () => {
  // Rule 3. #4392E6 is 3.23:1 on white and does not clear the 4.5:1 body floor
  // on any light field. On this console it is 5.30:1, which passes, but the
  // rule is about WHERE it lands, not only whether it can.
  it("is legal on this dark field, which is why the set is usable here", () => {
    expect(contrast(BLOSSOM_ACCENT, token("pc-canvas"))).toBeGreaterThanOrEqual(4.5);
  });

  it("would fail the body floor on white, so it is never a light-field body colour", () => {
    expect(contrast(BLOSSOM_ACCENT, "#ffffff")).toBeLessThan(4.5);
    expect(contrast(BLOSSOM_ACCENT, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  // The blue lives in the wordmark, per NorthSchema Brand. If it starts driving
  // buttons, links and labels it has been spent four times and reads as theme
  // rather than intent.
  it("is not bound to any interactive or body token", () => {
    const bound = [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)]
      .filter(([, , value]) => value === BLOSSOM_ACCENT)
      .map(([, name]) => name);
    expect(bound).toEqual(["ns-blue"]);
  });
});

describe("mark size", () => {
  // Rule 4. Measured 2026-09-02: at 32px the NS monogram holds and the blossom
  // does not, because the negative space between petals closes. This console is
  // on the blossom set, so the mark cannot appear in any small chrome. The
  // header therefore uses the wordmark alone.
  const FLOOR_PX = 96;

  it("states the floor as a token so a component cannot pick its own", () => {
    const declared = css.match(/--pc-mark-min-px:\s*(\d+)/);
    expect(declared, "--pc-mark-min-px must be declared").not.toBeNull();
    expect(Number(declared[1])).toBeGreaterThanOrEqual(FLOOR_PX);
  });
});
