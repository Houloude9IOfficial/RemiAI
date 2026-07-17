"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput, type ChatMode } from "@/components/chat/ChatInput";
import { ChatSkeleton } from "@/components/chat/ChatSkeleton";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { TodoProgressBar } from "@/components/chat/TodoProgressBar";
import { ExportDialog } from "@/components/chat/ExportDialog";
import { ErrorCard } from "@/components/ui/error-card";
import { useErrorHandler } from "@/lib/hooks/use-error-handler";
import { conversationsApi } from "@/lib/api/conversations";
import { useStreamingContext } from "@/lib/chat/streaming-context";


// ── Reconnecting Banner ─────────────────────────────────────────────

function ReconnectingBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex items-center justify-center gap-2.5 border-b border-primary/20 bg-primary/[0.04] px-4 py-2 text-sm text-primary backdrop-blur-sm"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
      </span>
      <span className="font-medium">Reconnecting to active generation...</span>
    </motion.div>
  );
}

// ── Page Component ──────────────────────────────────────────────────

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId: conversationIdParam } = use(params);
  const conversationId = Number(conversationIdParam);
  const queryClient = useQueryClient();
  const { activeStreams } = useStreamingContext();

  // Check if there's an active stream BEFORE the data fetch
  const hasActiveStream = activeStreams.has(conversationId);
  const [showReconnecting, setShowReconnecting] = useState(hasActiveStream);

  // Fetch conversation data with keepPreviousData-like behavior
  // using staleTime to avoid unnecessary refetches
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => conversationsApi.get(conversationId),
    staleTime: hasActiveStream ? 60_000 : 30_000,
    // Don't refetch during stream to avoid message flicker
    refetchOnMount: hasActiveStream ? false : undefined,
  });

  // Hide reconnecting banner once data is available
  useEffect(() => {
    if (data && showReconnecting) {
      // Short delay so the user sees the banner transition smoothly
      const timer = setTimeout(() => setShowReconnecting(false), 600);
      return () => clearTimeout(timer);
    }
  }, [data, showReconnecting]);

  // Page enter animation wrapper
  return (
    <motion.div
      className="flex flex-1 flex-col h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {/* Reconnecting banner — shows immediately while data loads */}
      <AnimatePresence>
        {showReconnecting && <ReconnectingBanner />}
      </AnimatePresence>

      {isLoading || !data ? (
        <ChatSkeleton messageCount={3} />
      ) : (
        <ConversationChat
          key={conversationId}
          conversationId={conversationId}
          initialConversation={data.conversation}
          initialMessages={data.messages}
          isReconnecting={hasActiveStream}
          onConversationChanged={() =>
            queryClient.invalidateQueries({ queryKey: ["conversations"] })
          }
        />
      )}
    </motion.div>
  );
}

// ── Chat Component ──────────────────────────────────────────────────

function ConversationChat({
  conversationId,
  initialConversation,
  initialMessages,
  isReconnecting,
  onConversationChanged,
}: {
  conversationId: number;
  initialConversation: Awaited<ReturnType<typeof conversationsApi.get>>["conversation"];
  initialMessages: Awaited<ReturnType<typeof conversationsApi.get>>["messages"];
  isReconnecting?: boolean;
  onConversationChanged: () => void;
}) {
  const [mode, setMode] = useState<ChatMode>(
    (initialConversation as any).mode ?? "chat",
  );
  const { activeStreams, startStream, endStream } = useStreamingContext();

  // Persist mode to DB whenever it changes
  useEffect(() => {
    if (mode === (initialConversation as any).mode) return;
    conversationsApi.update(conversationId, { mode }).catch(() => {});
  }, [mode, conversationId, initialConversation]);

  // If reconnecting, resume the active stream
  const resume = isReconnecting || activeStreams.has(conversationId);

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    id: String(conversationId),
    messages: initialMessages,
    resume,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId },
    }),
    onFinish: () => {
      // Small delay to ensure server-side token update completes
      // before the sidebar refetches the conversation list.
      setTimeout(() => onConversationChanged(), 500);
      endStream(conversationId);
    },
  });

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      startStream(conversationId);
    } else if (!resume) {
      endStream(conversationId);
    }
  }, [status, conversationId, resume, startStream, endStream]);

  const lastSentText = useRef<string>("");

  const {
    error: handlerError,
    isRetrying,
    handleError,
    retry,
    clearError,
    onRetryable,
  } = useErrorHandler({ showToast: true });

  // Sync AI SDK error to our handler
  useEffect(() => {
    if (error) {
      handleError(error);
    }
  }, [error, handleError]);

  // Register the retryable action — resend the last failed message
  useEffect(() => {
    onRetryable(async () => {
      if (lastSentText.current) {
        sendMessage({ text: lastSentText.current });
      }
    });
  }, [onRetryable, sendMessage]);

  const [sendCount, setSendCount] = useState(0);
  const [isAiStarting, setIsAiStarting] = useState(false);

  const handleSend = useCallback(
    (text: string) => {
      lastSentText.current = text;
      clearError();
      sendMessage({ text });
      setSendCount((n) => n + 1);
    },
    [clearError, sendMessage],
  );

  const handleAiStart = useCallback(async () => {
    if (isAiStarting) return;
    setIsAiStarting(true);
    clearError();

    try {
      const response = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Failed to start conversation" }));
        throw new Error(err.error ?? "Failed to start conversation");
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      startStream(conversationId);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let messageId = "";
      let accumulatedText = "";

      // Collect ALL text from the SSE stream first, then call setMessages
      // ONCE at the end to avoid conflicting with useChat's internal state.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "start") {
              messageId = data.messageId ?? data.id ?? "";
            }

            if (data.type === "text-delta") {
              accumulatedText += data.delta ?? "";
            }
            // All other chunk types (tool calls, etc.) are ignored
          } catch {
            // Ignore parse errors for incomplete lines
          }
        }
      }

      // Now set the complete message once — no duplicate risk
      if (accumulatedText && messageId) {
        setMessages([
          {
            id: messageId,
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: accumulatedText }],
          },
        ]);
      }

      endStream(conversationId);
      onConversationChanged();
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsAiStarting(false);
    }
  }, [conversationId, isAiStarting, clearError, startStream, endStream, onConversationChanged, handleError, setMessages]);

  const [{ providerId, modelId }, setModel] = useState({
    providerId: initialConversation.providerId,
    modelId: initialConversation.modelId,
  });

  const handleModelChange = async (nextProviderId: number, nextModelId: string) => {
    await conversationsApi.update(conversationId, {
      providerId: nextProviderId,
      modelId: nextModelId,
    });
    setModel({ providerId: nextProviderId, modelId: nextModelId });
    try {
      localStorage.setItem(
        "lastModel",
        JSON.stringify({ providerId: nextProviderId, modelId: nextModelId }),
      );
    } catch {
      // localStorage may be unavailable — ignore
    }
    onConversationChanged();
  };

  return (
    <div className="flex flex-1 flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 border-b px-4 py-2 bg-background/95 backdrop-blur sticky top-0 z-20">
        {messages.length > 0 && (
          <ExportDialog messages={messages} title={initialConversation.title} />
        )}
        <span className="text-sm font-medium truncate">{initialConversation.title}</span>
        <div className="ml-auto">
          <ModelPicker providerId={providerId} modelId={modelId} onChange={handleModelChange} />
        </div>
      </div>

      {/* ── Todo progress ── */}
      <TodoProgressBar conversationId={conversationId} />

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          status={status}
          sendCount={sendCount}
          onSend={(text) => sendMessage({ text })}
          onAiStart={handleAiStart}
          isAiStarting={isAiStarting}
        />
      </div>

      {/* ── Error ── */}
      {handlerError && (
        <div className="px-4 pb-2">
          <ErrorCard
            error={handlerError}
            onRetry={retry}
            isRetrying={isRetrying}
            onDismiss={clearError}
          />
        </div>
      )}

      {/* ── Input ── */}
      <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur">
        <ChatInput
          conversationId={conversationId}
          status={status}
          disabled={!providerId || !modelId}
          mode={mode}
          onModeChange={setMode}
          onSend={handleSend}
          onStop={stop}
        />
      </div>
    </div>
  );
}
