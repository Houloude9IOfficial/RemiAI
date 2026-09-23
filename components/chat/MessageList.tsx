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
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
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
      lastUserMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [isWaiting, lastUserIndex]);

  // Opening a conversation should land on the latest exchange, not on the top
  // of a long transcript (scrollTop 0) and not pinned to the very bottom: the
  // newest user message settles near the top of the viewport — it is
  // right-aligned, so it reads as top-right — and its answer occupies the rest
  // of the screen below it (bottom-left). Runs once per mount (MessageList is
  // keyed by conversation) and instantly, so opening a chat never animates or
  // jumps after paint.
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    // A render that is already waiting is the send path's job (effect above).
    // Mark it handled so completing that run cannot later yank the user back.
    if (isWaiting) {
      didInitialScrollRef.current = true;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const el = lastUserMessageRef.current;
      if (!el || didInitialScrollRef.current) return;
      didInitialScrollRef.current = true;
      el.scrollIntoView({ block: "start", inline: "nearest" });
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
                  ref={idx === lastUserIndex ? lastUserMessageRef : undefined}
                  // scroll-mt keeps a little breathing room above the anchored
                  // message so it never sits flush against the header.
                  className="animate-fade-in scroll-mt-6"
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
