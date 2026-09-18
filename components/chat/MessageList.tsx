"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { MessageBubble } from "./MessageBubble";
import { ChatMessageProvider } from "./ChatMessageContext";
import { GeneratingIndicator } from "./GeneratingIndicator";
import { preferencesApi } from "@/lib/api/preferences";

// ── Component ────────────────────────────────────────────────────────

export function MessageList({
  messages,
  status,
  onSend,
  onRegenerate,
  onEdit,
  onContinue,
  conversationId,
}: {
  messages: UIMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
  onSend?: (text: string) => void;
  /** Called with a message id to regenerate it (deleting messages after it). */
  onRegenerate?: (messageId: string) => void;
  /** Called with a message id and replacement text to edit it. */
  onEdit?: (messageId: string, text: string) => void;
  /** Called when the last user message has no assistant response yet. */
  onContinue?: () => void;
  conversationId?: number;
}) {
  const waitingMessageRef = useRef<HTMLDivElement>(null);
  const { data: preferences } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });
  // Preserve the prior UI defaults while preferences are loading or if a
  // legacy response does not yet include these fields.
  const collapseLongUserMessages = preferences?.collapseLongUserMessages ?? true;
  const expandReasoningWhileWorking = preferences?.expandReasoningWhileWorking ?? true;
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
  const lastAssistantHasOutput =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some((part) => {
      if (!part || typeof part !== "object") return false;
      const candidate = part as Record<string, unknown>;
      if (candidate.type === "text") {
        return typeof candidate.text === "string" && candidate.text.trim().length > 0;
      }
      return typeof candidate.type === "string" &&
        (candidate.type.startsWith("tool-") ||
          candidate.type === "tool-invocation" ||
          candidate.type === "reasoning");
    });
  const hasUnansweredLastMessage =
    lastMessage?.role === "user" ||
    (lastMessage?.role === "assistant" && !lastAssistantHasOutput);
  const lastUserIndex = deduped.findLastIndex((message) => message.role === "user");
  const isWaiting =
    (status === "submitted" || status === "streaming") &&
    (!lastMessage ||
      lastMessage.role === "user" ||
      (lastMessage.role === "assistant" && !lastAssistantHasOutput));

  // A send should bring the new request to the top of the readable area and
  // leave deliberate room below it for the pending state, rather than keeping
  // the prior conversation in view.
  useEffect(() => {
    if (!isWaiting) return;
    const frame = requestAnimationFrame(() => {
      waitingMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [isWaiting, lastUserIndex]);

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
                <div
                  key={message.id}
                  ref={idx === lastUserIndex && isWaiting ? waitingMessageRef : undefined}
                  className="animate-fade-in"
                >
                  <MessageBubble
                    message={message}
                    collapseLongUserMessages={collapseLongUserMessages}
                    expandReasoningWhileWorking={expandReasoningWhileWorking}
                    isStreaming={
                      idx === deduped.length - 1 && status === "streaming"
                    }
                    onRegenerate={onRegenerate}
                    onEdit={canSend ? onEdit : undefined}
                    onContinue={
                      canSend &&
                      hasUnansweredLastMessage &&
                      idx === lastUserIndex &&
                      message.role === "user"
                        ? onContinue
                        : undefined
                    }
                    messagesAfter={deduped.length - idx - 1}
                    conversationId={conversationId}
                  />
                </div>
              );
            })}

            {isWaiting && (
              <div className="flex justify-start animate-fade-in">
                <GeneratingIndicator state="working" label={null} />
              </div>
            )}

            {/* Keep a stable response area after every request so completing
                a run never pulls the conversation back upward. */}
            <div className="h-64 shrink-0 md:h-80" />
          </div>
        </div>
      </div>
    </ChatMessageProvider>
  );
}
