"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useChatExtension } from "@/features/chat/extension";

export function ChatEmptyState({ onSelect }) {
  const { suggestions } = useChatExtension();
  return (
    <div
      data-slot="empty-state"
      // Was `py-16` inside a tall scroll area, which parked the whole block at
      // the top and left a large empty band above the composer. Centring it
      // costs nothing and closes the gap.
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-12"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">
          Start chatting with your agent
        </h2>
        <p className="text-muted-foreground max-w-[58ch] text-[14px] leading-relaxed">
          Pick a suggestion to populate the composer, then edit the placeholder
          IDs before sending.
        </p>
      </div>

      {/* `bg-border` on the container is what turns the 1px gaps into hairline
          dividers: the cells paint `bg-background` over it and the gaps show
          through. Without it the gaps are white on white and invisible. */}
      <div className="bg-border grid w-full grid-cols-1 gap-px overflow-hidden rounded-xl border sm:grid-cols-2">
        {suggestions.map((chip) => (
          <SuggestionButton key={chip.id} chip={chip} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

// One bordered grid with hairline dividers, rather than six separately bordered
// cards floating in space. The uniform `rounded-lg border` on every card is the
// documented shadcn-default tell, and six of them in a 2x3 grid reads as a
// template. This keeps a single edge and lets the rows sit as one object.
function SuggestionButton({ chip, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(chip.prompt)}
      className={cn(
        "group bg-background hover:bg-accent focus-visible:ring-ring/50 relative",
        "flex h-full flex-col items-start gap-1.5 px-4 py-3.5 text-left outline-none",
        "transition-colors focus-visible:ring-[3px] focus-visible:z-10",
      )}
    >
      {/* The affordance lives on an edge that appears on hover, so the resting
          state stays quiet and the active one is unmistakable. */}
      <span
        aria-hidden
        className="bg-foreground/0 group-hover:bg-foreground/70 absolute inset-y-0 left-0 w-[2px] transition-colors"
      />

      <span className="flex w-full items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium">{chip.label}</span>
        {chip.mutating ? (
          <span className="text-muted-foreground shrink-0 font-mono text-[10px] tracking-[0.1em] uppercase">
            mutating
          </span>
        ) : null}
      </span>

      <span className="text-muted-foreground line-clamp-2 text-[13px] leading-[1.5]">
        {chip.prompt}
      </span>
    </button>
  );
}
