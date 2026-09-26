"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  isGenerationActive,
  type GenerationDescriptor,
  type GenerationEvent,
} from "./generation-events";

export type { GenerationDescriptor, GenerationStatus } from "./generation-events";

type StreamingContextValue = {
  /** Set of conversation IDs that are currently streaming (server + optimistic) */
  activeStreams: Set<number>;
  /** Active generation descriptors keyed by conversation id */
  streams: Map<number, GenerationDescriptor>;
  /** Register a conversation as streaming (optimistic, immediate UI feedback) */
  startStream: (conversationId: number) => void;
  /** Unregister a conversation as no longer streaming */
  endStream: (conversationId: number) => void;
};

const StreamingContext = createContext<StreamingContextValue | null>(null);

/** Compare two descriptor maps so duplicate snapshots/events don't set state. */
function sameDescriptors(
  a: Map<number, GenerationDescriptor>,
  b: Map<number, GenerationDescriptor>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [conversationId, descriptor] of a) {
    const other = b.get(conversationId);
    if (!other) return false;
    if (
      descriptor.streamId !== other.streamId ||
      descriptor.assistantMessageId !== other.assistantMessageId ||
      descriptor.status !== other.status
    ) {
      return false;
    }
  }
  return true;
}

export function StreamingProvider({ children }: { children: ReactNode }) {
  const { account } = useAuth();
  // `localStreams` makes a just-submitted request feel immediate. The server
  // push feed is authoritative across navigation, reloads, tabs and devices.
  const [localStreams, setLocalStreams] = useState<Set<number>>(new Set());
  const [serverStreams, setServerStreams] = useState<Map<number, GenerationDescriptor>>(
    () => new Map(),
  );

  useEffect(() => {
    // Do not open the stream before the session cookie is available — the
    // initial 401 would otherwise restart the connection in a tight loop.
    if (!account) return;

    let disposed = false;
    let source: EventSource | null = null;

    const apply = (
      update: (previous: Map<number, GenerationDescriptor>) => Map<number, GenerationDescriptor>,
    ) => {
      if (disposed) return;
      setServerStreams((previous) => {
        const next = update(previous);
        return sameDescriptors(previous, next) ? previous : next;
      });
    };

    const connect = () => {
      source = new EventSource("/api/chat/streams/events");
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as GenerationEvent;
          if (payload.type === "snapshot") {
            const next = new Map<number, GenerationDescriptor>();
            for (const descriptor of payload.generations ?? []) {
              if (isGenerationActive(descriptor.status)) {
                next.set(descriptor.conversationId, descriptor);
              }
            }
            apply(() => next);
            return;
          }
          if (payload.type === "generation") {
            const descriptor = payload.generation;
            if (!descriptor) return;
            apply((previous) => {
              const next = new Map(previous);
              if (isGenerationActive(descriptor.status)) {
                next.set(descriptor.conversationId, descriptor);
              } else {
                // Terminal/inactive state: the client removes the descriptor.
                next.delete(descriptor.conversationId);
              }
              return next;
            });
          }
        } catch {
          // Ignore malformed/reconnect events; EventSource reconnects itself.
        }
      };
      // EventSource reconnects automatically; the next snapshot reconciles any
      // events missed while disconnected, so onerror needs no manual retry.
      source.onerror = () => undefined;
    };

    connect();
    return () => {
      disposed = true;
      source?.close();
    };
  }, [account]);

  const activeStreams = useMemo(() => {
    const next = new Set(serverStreams.keys());
    for (const conversationId of localStreams) next.add(conversationId);
    return next;
  }, [serverStreams, localStreams]);

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

  const value = useMemo<StreamingContextValue>(
    () => ({ activeStreams, streams: serverStreams, startStream, endStream }),
    [activeStreams, serverStreams, startStream, endStream],
  );

  return (
    <StreamingContext.Provider value={value}>
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
