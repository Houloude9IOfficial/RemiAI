"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type StreamingContextValue = {
  /** Set of conversation IDs that are currently streaming */
  activeStreams: Set<number>;
  /** Register a conversation as streaming */
  startStream: (conversationId: number) => void;
  /** Unregister a conversation as no longer streaming */
  endStream: (conversationId: number) => void;
};

const StreamingContext = createContext<StreamingContextValue | null>(null);

export function StreamingProvider({ children }: { children: ReactNode }) {
  const [activeStreams, setActiveStreams] = useState<Set<number>>(new Set());

  const startStream = useCallback((conversationId: number) => {
    setActiveStreams((prev) => {
      if (prev.has(conversationId)) return prev;
      const next = new Set(prev);
      next.add(conversationId);
      return next;
    });
  }, []);

  const endStream = useCallback((conversationId: number) => {
    setActiveStreams((prev) => {
      if (!prev.has(conversationId)) return prev;
      const next = new Set(prev);
      next.delete(conversationId);
      return next;
    });
  }, []);

  return (
    <StreamingContext.Provider value={{ activeStreams, startStream, endStream }}>
      {children}
    </StreamingContext.Provider>
  );
}

export function useStreamingContext(): StreamingContextValue {
  const ctx = useContext(StreamingContext);
  if (!ctx) {
    throw new Error("useStreamingContext must be used within a StreamingProvider");
  }
  return ctx;
}

export function useActiveStreams(): Set<number> {
  return useStreamingContext().activeStreams;
}

export function useIsStreaming(conversationId: number): boolean {
  const activeStreams = useActiveStreams();
  return activeStreams.has(conversationId);
}
