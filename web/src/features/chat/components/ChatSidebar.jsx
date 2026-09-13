"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatList } from "@/features/chat/hooks/useChatList";

import { ChatSidebarItem } from "./ChatSidebarItem";

export function ChatSidebar({
  activeChatId,
  onActiveChatDeleted,
  onChatCreated,
}) {
  const { entries, createNewChat, deleteWithConfirm } = useChatList({
    activeChatId,
    onActiveChatDeleted,
    onChatCreated,
  });

  return (
    <aside className="bg-card flex w-64 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase">
          Chats
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground h-7 gap-1.5 px-2 text-[13px]"
          onClick={createNewChat}
          title="Start a new chat"
        >
          <Plus className="size-3.5" /> New
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-px px-2 pb-2">
          {entries.length === 0 ? (
            <li className="text-muted-foreground px-3 py-8 text-center text-[13px] leading-relaxed">
              No chats yet.
              <br />
              Start one to see it here.
            </li>
          ) : (
            entries.map((entry) => (
              <ChatSidebarItem
                key={entry.id}
                entry={entry}
                isActive={entry.id === activeChatId}
                onDelete={() => deleteWithConfirm(entry.id)}
              />
            ))
          )}
        </ul>
      </ScrollArea>
    </aside>
  );
}
