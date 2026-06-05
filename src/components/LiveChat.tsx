"use client";

import { useEffect, useRef } from "react";
import type { RevealedComment } from "@/lib/useLiveStream";
import { ChatMessage } from "./ChatMessage";

// Scrolling live-chat surface. Auto-sticks to the bottom as new messages land.
export function LiveChat({ messages }: { messages: RevealedComment[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="relative h-full overflow-hidden">
      {/* top fade — messages dissolve as they scroll up */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[var(--surface)] to-transparent" />
      <div className="flex h-full flex-col justify-end overflow-y-auto pb-3">
        {messages.map((m) => (
          <ChatMessage key={m.uid} comment={m} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
