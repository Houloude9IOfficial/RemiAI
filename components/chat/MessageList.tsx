"use client";

import type { UIMessage } from "ai";
import { MessageBubble } from "./MessageBubble";
import { ChatMessageProvider } from "./ChatMessageContext";
import { GeneratingIndicator } from "./GeneratingIndicator";

// ── Component ────────────────────────────────────────────────────────

export function MessageList({
  messages,
  status,
  onSend,
  onRegenerate,
}: {
  messages: UIMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
  onSend?: (text: string) => void;
  /** Called with a message id to regenerate it (deleting messages after it). */
  onRegenerate?: (messageId: string) => void;
}) {
  const lastMessage = messages[messages.length - 1];
  const isWaiting =
    (status === "submitted" || status === "streaming") &&
    (!lastMessage || lastMessage.role === "user");

  // Empty conversations render a code-editor-style centered composer via
  // EmptyChatState — nothing to show here until there are messages.
  if (messages.length === 0 && !isWaiting) {
    return null;
  }

  return (
    <ChatMessageProvider value={{ sendMessage: onSend ?? (() => {}) }}>
      <div className="relative flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 md:px-6">
          <div className="flex flex-col gap-5 md:gap-6">
            {messages.map((message, idx) => {
              return (
                <div key={message.id} className="animate-fade-in">
                  <MessageBubble
                    message={message}
                    isStreaming={
                      idx === messages.length - 1 && status === "streaming"
                    }
                    onRegenerate={onRegenerate}
                    messagesAfter={messages.length - idx - 1}
                  />
                </div>
              );
            })}

            {isWaiting && (
              <div className="flex justify-start animate-fade-in">
                <GeneratingIndicator label="Thinking" />
              </div>
            )}

            {/* Spacer — room for the next stream without oversized empty chrome */}
            <div className="h-28 shrink-0 md:h-36" />
          </div>
        </div>
      </div>
    </ChatMessageProvider>
  );
}