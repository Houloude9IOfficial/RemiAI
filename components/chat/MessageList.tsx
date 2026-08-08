"use client";

import { useMemo } from "react";
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
  // Defensive safety net: the AI SDK merges streamed assistant messages into
  // this list by id, and under rare interleaved-stream conditions (two
  // concurrent requests on the same chat) the same id can appear twice. A
  // duplicate key crashes the whole message list, so drop later copies — the
  // first occurrence is the fuller one. The real fix is preventing concurrent
  // requests (below + the QuestionsCard/FollowupSuggestions guards); this
  // just guarantees the UI can never break again.
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const out: UIMessage[] = [];
    for (const m of messages) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  }, [messages]);

  const lastMessage = deduped[deduped.length - 1];
  const isWaiting =
    (status === "submitted" || status === "streaming") &&
    (!lastMessage || lastMessage.role === "user");

  // Empty conversations render a code-editor-style centered composer via
  // EmptyChatState — nothing to show here until there are messages.
  if (deduped.length === 0 && !isWaiting) {
    return null;
  }

  // Context-level guard: never let ANY consumer start a second request while
  // a stream is active — that is what made the SDK push duplicate messages
  // (see ChatMessageContext docs). QuestionsCard / FollowupSuggestions also
  // disable their own buttons, so this is defense in depth for future
  // consumers of the context.
  const canSend = status !== "submitted" && status !== "streaming";
  const safeSend = canSend && onSend ? onSend : () => {};

  return (
    <ChatMessageProvider value={{ sendMessage: safeSend, status }}>
      <div className="relative flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 md:px-6">
          <div className="flex flex-col gap-5 md:gap-6">
            {deduped.map((message, idx) => {
              return (
                <div key={message.id} className="animate-fade-in">
                  <MessageBubble
                    message={message}
                    isStreaming={
                      idx === deduped.length - 1 && status === "streaming"
                    }
                    onRegenerate={onRegenerate}
                    messagesAfter={deduped.length - idx - 1}
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