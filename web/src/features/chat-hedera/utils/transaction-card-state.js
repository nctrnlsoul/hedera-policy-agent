import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ShieldX,
  XCircle,
} from "lucide-react";

export function stateBadgeAppearance(state, status) {
  switch (state) {
    case "executing":
      return {
        icon: React.createElement(Loader2, { className: "size-3 animate-spin" }),
        label: "Executing",
        className: "bg-muted text-muted-foreground",
      };
    case "awaiting-approval":
      return {
        icon: React.createElement(ShieldCheck, { className: "size-3" }),
        label: "Awaiting approval",
        className:
          "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
      };
    case "signing":
      return {
        icon: React.createElement(Loader2, { className: "size-3 animate-spin" }),
        label: "Signing",
        className:
          "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
      };
    case "confirmed":
      return {
        icon: React.createElement(CheckCircle2, { className: "size-3" }),
        label: status ?? "Confirmed",
        className:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      };
    case "blocked":
      // A guardrail firing is not an error, so it does not borrow the red
      // `destructive` treatment used for a network or SDK failure. It is a
      // deliberate refusal, and ShieldX says that where XCircle says "broken".
      //
      // Colour is the LIGHT-FIELD block token. The dark-field verdict colours
      // used on the /policy console measure 1.88:1 and 2.98:1 on white and are
      // illegal here; #C42B21 is the documented light-field equivalent.
      return {
        icon: React.createElement(ShieldX, { className: "size-3" }),
        label: "Blocked by policy",
        className: "bg-[#C42B21]/10 text-[#C42B21] dark:bg-[#C42B21]/20 dark:text-[#FF8A80]",
      };
    case "failed":
      return {
        icon: React.createElement(XCircle, { className: "size-3" }),
        label: status ?? "Failed",
        className: "bg-destructive/10 text-destructive",
      };
    case "network-error":
      return {
        icon: React.createElement(AlertTriangle, { className: "size-3" }),
        label: "Network error",
        className:
          "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
      };
  }
}

export function stateBorderClass(state) {
  switch (state) {
    case "executing":
      return "border-l-muted-foreground/30";
    case "awaiting-approval":
      return "border-l-amber-500";
    case "signing":
      return "border-l-blue-500";
    case "confirmed":
      return "border-l-emerald-500";
    case "blocked":
      return "border-l-[#C42B21]";
    case "failed":
      return "border-l-destructive";
    case "network-error":
      return "border-l-amber-500";
  }
}
