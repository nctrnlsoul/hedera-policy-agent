import Link from "next/link";

import { PolicyConsole } from "@/features/policy-console/PolicyConsole";
import { GOVERNED_TOOLS } from "../../../../shared/policies/governed-tools.js";

// The keyless policy console, on its OWN route.
//
// It briefly replaced the landing page and that was wrong: `/` is the chat app
// and replacing it changed the product out from under its owner. This is an
// addition, not a substitution. Nothing about `/` or `/chat/<id>` changes.
//
// Nothing here reads an env var, so this page renders with no .env at all.

const TOTAL_TOOLS = 29;

export default function PolicyPage() {
  return (
    <main
      className="min-h-dvh px-6 py-14 sm:px-10 lg:px-16"
      style={{ background: "var(--pc-canvas)", color: "var(--pc-text)" }}
    >
      <div className="mx-auto max-w-[78rem]">
        <header className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <p className="font-mono text-[12px] uppercase tracking-[0.2em]" style={{ color: "var(--pc-text-dim)" }}>
            Hedera Policy Agent
          </p>
          <p className="font-mono text-[12px]" style={{ color: "var(--pc-text-faint)" }}>
            no keys · no network · no model
          </p>
        </header>

        <h1 className="mt-10 max-w-[24ch] text-[clamp(2.25rem,5.5vw,3.75rem)] leading-[1.02] font-semibold tracking-[-0.025em]">
          Watch the rules stop a transaction.
        </h1>
        <p
          className="mt-5 max-w-[62ch] text-[17px] leading-[1.6]"
          style={{ color: "var(--pc-text-dim)" }}
        >
          Every scenario below is a real Hedera Agent Kit hook payload, run
          through the policy code this repo ships. Pick one and read the reason
          the rule gave. Nothing here calls a model, signs anything, or touches
          the network.
        </p>

        <p
          className="mt-6 max-w-[62ch] text-[15px] leading-[1.6]"
          style={{ color: "var(--pc-text-faint)" }}
        >
          {GOVERNED_TOOLS.length} of this agent&rsquo;s {TOTAL_TOOLS} tools are
          governed. The other {TOTAL_TOOLS - GOVERNED_TOOLS.length} are not, and
          the console says so when you pick one.{" "}
          <Link
            href="/"
            className="underline underline-offset-4"
            style={{ color: "var(--pc-text-dim)" }}
          >
            Open the live agent
          </Link>
          , which does hold a key.
        </p>

        <div className="mt-14">
          <PolicyConsole />
        </div>

        <footer
          className="mt-20 border-t pt-6 font-mono text-[12px] leading-[1.7]"
          style={{ borderColor: "var(--pc-line)", color: "var(--pc-text-faint)" }}
        >
          <p>Built by NorthSchema. Submission for the Hedera AI Bounty, Week 5.</p>
          <p className="mt-1">
            Reads and validates declared policy state. Not a compliance
            certification, not a KYC provider, not regulatory approval.
          </p>
        </footer>
      </div>
    </main>
  );
}
