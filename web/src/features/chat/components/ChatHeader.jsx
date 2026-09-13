"use client";

import * as React from "react";

export function ChatHeader({ chat, slots }) {
  return (
    <header className="border-b">
      {/* The title is chat metadata, not a page heading. It was `font-semibold`
          at the same weight as the content below it and read as more important
          than the conversation. The controls on the right are the things a
          person actually acts on, so they keep the visual weight. */}
      <div className="flex w-full items-center justify-between gap-4 px-4 py-2.5">
        <div
          className="text-muted-foreground min-w-0 truncate text-[13px]"
          title={chat.title}
        >
          {chat.title}
        </div>
        {slots ? (
          <div className="flex shrink-0 items-center gap-2">{slots}</div>
        ) : null}
      </div>
    </header>
  );
}
