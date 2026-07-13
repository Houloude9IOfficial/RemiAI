"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { TodoProgressBar } from "@/components/chat/TodoProgressBar";
import { ExportDialog } from "@/components/chat/ExportDialog";
import { ErrorCard } from "@/components/ui/error-card";
import { useErrorHandler } from "@/lib/hooks/use-error-handler";
import { conversationsApi } from "@/lib/api/conversations";
import { useStreamingContext } from "@/lib/chat/streaming-context";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId: conversationIdParam } = use(params);
  const conversationId = Number(conversationIdParam);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => conversationsApi.get(conversationId),
  });

  if (isLoading || !data) {
    return <div className="flex-1" />;
  }

  return (
    <ConversationChat
      key={conversationId}
      conversationId={conversationId}
      initialConversation={data.conversation}
      initialMessages={data.messages}
      onConversationChanged={() =>
        queryClient.invalidateQueries({ queryKey: ["conversations"] })
      }
    />
  );
}

function ConversationChat({
  conversationId,
  initialConversation,
  initialMessages,
  onConversationChanged,
}: {
  conversationId: number;
  initialConversation: Awaited<ReturnType<typeof conversationsApi.get>>["conversation"];
  initialMessages: Awaited<ReturnType<typeof conversationsApi.get>>["messages"];
  onConversationChanged: () => void;
}) {
  const [agenticMode, setAgenticMode] = useState(false);
  const { activeStreams, startStream, endStream } = useStreamingContext();

  // Check if there's already an active stream from a previous mount
  // (navigated away while generating and came back)
  const resume = activeStreams.has(conversationId);

  const { messages, sendMessage, status, stop, error } = useChat({
    id: String(conversationId),
    messages: initialMessages,
    resume,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId, agenticMode },
    }),
    onFinish: () => {
      onConversationChanged();
      // Clean up streaming status — this fires even after unmount
      // (the Chat instance continues running in the background),
      // so the sidebar indicator will persist until the stream ends.
      endStream(conversationId);
    },
  });

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      startStream(conversationId);
    } else if (!resume) {
      // Only end if we're NOT reconnecting to an existing stream
      // This prevents briefly clearing the sidebar indicator
      // before resumeStream triggers the 'submitted' status.
      endStream(conversationId);
    }
    // No cleanup on unmount — this preserves the sidebar indicator
    // while the stream continues in the background, enabling
    // reconnection when the user navigates back.
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

  const handleSend = useCallback(
    (text: string) => {
      lastSentText.current = text;
      clearError();
      sendMessage({ text });
    },
    [clearError, sendMessage],
  );

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
    // Persist this choice for future new conversations
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
      <div className="flex items-center gap-2 border-b px-4 py-2 bg-background/95 backdrop-blur sticky top-0 z-20">
        {messages.length > 0 && (
          <ExportDialog messages={messages} title={initialConversation.title} />
        )}
        <span className="text-sm font-medium">{initialConversation.title}</span>
        <div className="ml-auto">
          <ModelPicker providerId={providerId} modelId={modelId} onChange={handleModelChange} />
        </div>
      </div>
      <TodoProgressBar conversationId={conversationId} />
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} status={status} onSend={(text) => sendMessage({ text })} />
      </div>
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
      <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur">
        <ChatInput
          status={status}
          disabled={!providerId || !modelId}
          agentic={agenticMode}
          onAgenticChange={setAgenticMode}
          onSend={handleSend}
          onStop={stop}
        />
      </div>
    </div>
  );
}
