"use client";

import { createContext, useContext } from "react";

/**
 * Context to provide the sendMessage function deep in the component tree,
 * so components like QuestionsCard can submit formatted user messages.
 *
 * `status` lets those components refuse to submit while a request is in
 * flight — sending during "streaming"/"submitted" starts a SECOND concurrent
 * request whose stream interleaves with the first, duplicating messages.
 */
export type ChatStreamStatus = "submitted" | "streaming" | "ready" | "error";

export interface ChatMessageContextValue {
  sendMessage: (text: string) => void;
  /** Current chat status; "submitted"/"streaming" mean a request is in flight. */
  status?: ChatStreamStatus;
}

const ChatMessageContext = createContext<ChatMessageContextValue | null>(null);

export function ChatMessageProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: ChatMessageContextValue;
}) {
  return (
    <ChatMessageContext.Provider value={value}>
      {children}
    </ChatMessageContext.Provider>
  );
}

export function useChatMessage(): ChatMessageContextValue {
  const ctx = useContext(ChatMessageContext);
  if (!ctx) {
    throw new Error(
      "useChatMessage must be used within a ChatMessageProvider",
    );
  }
  return ctx;
}
