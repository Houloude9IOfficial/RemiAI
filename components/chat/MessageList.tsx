import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";

export function MessageList({ messages }: { messages: UIMessage[] }) {
  // Ref to the bottom sentinel div — scroll it into view on new messages
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message whenever the messages array changes
  useEffect(() => {
    // Small delay to let React finish rendering before scrolling
    const timer = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages.length, messages[messages.length - 1]?.parts.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-fade-in">
        Ask anything to get started.
      </div>
    );
  }

  // Only apply the fade-in delay to the most recent messages (max 5).
  // Older messages render instantly so the user doesn't wait for a long
  // staggered animation when loading a long conversation.
  const animationStartIndex = Math.max(0, messages.length - 5);

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
      {messages.map((message, idx) => {
        const isRecent = idx >= animationStartIndex;
        const delay = isRecent ? `${(idx - animationStartIndex) * 0.06}s` : "0s";
        return (
          <div
            key={message.id}
            className="animate-fade-in"
            style={{ animationDelay: delay }}
          >
            <MessageBubble message={message} />
          </div>
        );
      })}
      {/* Sentinel for auto-scroll */}
      <div ref={bottomRef} />
    </div>
  );
}
