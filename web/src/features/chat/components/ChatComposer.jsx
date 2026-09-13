"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
} from "@/components/ai-elements/prompt-input";

export const ChatComposer = React.forwardRef(
  function ChatComposer({ status, errorMessage, onSend, onStop }, ref) {
    const [input, setInput] = React.useState("");
    const textareaRef = React.useRef(null);
    const isStreaming = status === "submitted" || status === "streaming";

    React.useImperativeHandle(
      ref,
      () => ({
        prefill(text) {
          setInput(text);
          requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(text.length, text.length);
          });
        },
      }),
      [],
    );

    function handleSubmit() {
      const trimmed = input.trim();
      if (!trimmed || isStreaming) return;
      onSend(trimmed);
      setInput("");
    }

    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        {errorMessage ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-destructive mb-2 rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
          >
            {errorMessage}
          </div>
        ) : null}
        <PromptInput
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            placeholder="Ask the agent anything…"
            onChange={(event) => setInput(event.target.value)}
            onSubmit={handleSubmit}
            disabled={isStreaming}
          />
          <PromptInputToolbar>
            {/* Fades in only once there is something to send. As permanent
                text it is onboarding that never stops being shown, and it
                competes with the placeholder directly above it. Opacity rather
                than conditional rendering, so the toolbar never changes height
                and the submit button does not jump. */}
            <span
              aria-hidden={input.length === 0}
              className={cn(
                "text-muted-foreground text-xs transition-opacity duration-200",
                input.length > 0 ? "opacity-100" : "opacity-0",
              )}
            >
              Enter to send · Shift+Enter for newline
            </span>
            <PromptInputSubmit
              status={status}
              onClick={(event) => {
                if (!isStreaming) return;
                event.preventDefault();
                onStop();
              }}
              disabled={!isStreaming && input.trim().length === 0}
            />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    );
  },
);
