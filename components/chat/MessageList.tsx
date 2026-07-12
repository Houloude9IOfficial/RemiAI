"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { Loader2 } from "lucide-react";

export function MessageList({
  messages,
  status,
}: {
  messages: UIMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
}) {
  // Ref to the bottom sentinel div — scroll it into view on new messages
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message whenever the messages array changes
  useEffect(() => {
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages.length, messages[messages.length - 1]?.parts.length]);

  const lastMessage = messages[messages.length - 1];
  const isWaiting =
    (status === "submitted" || status === "streaming") &&
    (!lastMessage || lastMessage.role === "user");

  if (messages.length === 0 && !isWaiting) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-fade-in">
        Ask anything to get started.
      </div>
    );
  }

  // Only apply the fade-in delay to the most recent messages (max 5).
  const animationStartIndex = Math.max(0, messages.length - 5);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <div className="flex flex-col gap-3">
        {messages.map((message, idx) => {
          const isRecent = idx >= animationStartIndex;
          const delay = isRecent
            ? `${(idx - animationStartIndex) * 0.06}s`
            : "0s";
          return (
            <div
              key={message.id}
              className="animate-fade-in"
              style={{ animationDelay: delay }}
            >
              <MessageBubble
                message={message}
                isStreaming={idx === messages.length - 1 && status === "streaming"}
              />
            </div>
          );
        })}

        {isWaiting && (
          <div className="flex justify-start animate-fade-in">
            <div className="w-full max-w-[85%] rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Sentinel for auto-scroll */}
      <div ref={bottomRef} />
    </div>
  );
}
