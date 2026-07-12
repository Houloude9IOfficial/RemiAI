"use client";

import { use, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { conversationsApi } from "@/lib/api/conversations";

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
  const { messages, sendMessage, status, stop, error } = useChat({
    id: String(conversationId),
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId, agenticMode },
    }),
    onFinish: onConversationChanged,
  });

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
        <span className="text-sm font-medium">{initialConversation.title}</span>
        <div className="ml-auto">
          <ModelPicker providerId={providerId} modelId={modelId} onChange={handleModelChange} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} status={status} onSend={(text) => sendMessage({ text })} />
      </div>
      {error && (
        <p className="px-6 pb-2 text-xs text-destructive">{error.message}</p>
      )}
      <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur">
        <ChatInput
          status={status}
          disabled={!providerId || !modelId}
          agentic={agenticMode}
          onAgenticChange={setAgenticMode}
          onSend={(text) => sendMessage({ text })}
          onStop={stop}
        />
      </div>
    </div>
  );
}
