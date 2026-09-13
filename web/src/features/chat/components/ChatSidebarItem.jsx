"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ChatSidebarItemRename } from "./ChatSidebarItemRename";

export function ChatSidebarItem({
  entry,
  isActive,
  onDelete,
}) {
  const [isEditing, setIsEditing] = React.useState(false);

  if (isEditing) {
    return (
      <ChatSidebarItemRename
        entry={entry}
        onDone={() => setIsEditing(false)}
      />
    );
  }

  return (
    <li
      className={cn(
        "group relative flex items-center rounded-md",
        // The active row is marked by an accent rule on its leading edge rather
        // than a filled block. A filled row competes with the hover state and
        // makes the list read as a grid of chips instead of a list.
        "before:absolute before:inset-y-1 before:left-0 before:w-[2px] before:rounded-full before:transition-colors",
        isActive
          ? "bg-accent/60 before:bg-foreground/70"
          : "hover:bg-accent/40 before:bg-transparent",
      )}
    >
      <Link
        href={`/chat/${encodeURIComponent(entry.id)}`}
        className={cn(
          "min-w-0 flex-1 truncate py-1.5 pr-1 pl-3 text-[13px] leading-5",
          isActive ? "font-medium" : "text-muted-foreground",
        )}
        title={entry.title}
      >
        {entry.title}
      </Link>

      {/* Revealed on hover AND on keyboard focus. Hover-only would make these
          unreachable by keyboard, which is the same defect as the clipping in a
          different form: present in the DOM, unusable by a person. */}
      <span className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground size-7"
          onClick={() => setIsEditing(true)}
          title="Rename"
          aria-label={`Rename ${entry.title}`}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive size-7"
          onClick={onDelete}
          title="Delete"
          aria-label={`Delete ${entry.title}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </span>
    </li>
  );
}
