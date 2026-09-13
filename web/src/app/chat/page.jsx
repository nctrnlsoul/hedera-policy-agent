"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createChat } from "@/features/chat/state";

// The new-chat flow, moved here from `/` on 2026-09-13 when the landing page
// became the policy console. The behaviour is unchanged: minting a fresh chat
// and redirecting to `/chat/<id>` keeps every chat at a stable, bookmarkable
// URL. It just no longer sits in front of every first-time visitor.
export default function NewChat() {
  const router = useRouter();

  React.useEffect(() => {
    const chat = createChat();
    router.replace(`/chat/${encodeURIComponent(chat.id)}`);
  }, [router]);

  return (
    <div
      className="flex h-dvh items-center justify-center text-sm"
      style={{ color: "var(--pc-text-faint)" }}
    >
      Starting a new chat...
    </div>
  );
}
