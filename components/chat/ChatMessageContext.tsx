"use client";

import { createContext, useContext } from "react";

/**
 * Context to provide the sendMessage function deep in the component tree,
 * so components like QuestionsCard can submit formatted user messages.
 */
export interface ChatMessageContextValue {
  sendMessage: (text: string) => void;
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
