"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";

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
  // `localStreams` makes a just-submitted request feel immediate. The server
  // inventory is authoritative across navigation, reloads, tabs and devices.
  const [localStreams, setLocalStreams] = useState<Set<number>>(new Set());
  const [serverStreams, setServerStreams] = useState<Set<number>>(new Set());

  useEffect(() => {
    let disposed = false;
    let polling = false;
    const sync = async () => {
      if (disposed || polling) return;
      polling = true;
      try {
        const response = await fetch("/api/chat/streams", { cache: "no-store" });
        if (!response.ok || disposed) return;
        const body = await response.json() as { conversationIds?: number[] };
        setServerStreams(new Set((body.conversationIds ?? []).filter(Number.isInteger)));
      } catch {
        // A transient inventory failure must not hide local streaming state.
      } finally {
        polling = false;
      }
    };
    void sync();
    const timer = setInterval(() => void sync(), 1_500);
    return () => { disposed = true; clearInterval(timer); };
  }, []);

  const activeStreams = useMemo(
    () => new Set([...localStreams, ...serverStreams]),
    [localStreams, serverStreams],
  );

  const startStream = useCallback((conversationId: number) => {
    setLocalStreams((prev) => {
      if (prev.has(conversationId)) return prev;
      const next = new Set(prev);
      next.add(conversationId);
      return next;
    });
  }, []);

  const endStream = useCallback((conversationId: number) => {
    setLocalStreams((prev) => {
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
