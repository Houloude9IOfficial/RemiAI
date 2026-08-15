"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import { Files, Menu, Plus } from "lucide-react";
import { MessageList } from "@/components/chat/MessageList";
import { EmptyChatState } from "@/components/chat/EmptyChatState";
import { ChatInput, type ChatMode } from "@/components/chat/ChatInput";
import { ChatSkeleton } from "@/components/chat/ChatSkeleton";
import { TodoProgressBar } from "@/components/chat/TodoProgressBar";
import { ExportDialog } from "@/components/chat/ExportDialog";
import { MobileChatHeader } from "@/components/chat/MobileChatHeader";
import { ChatHeader } from "@/components/chat/ChatHeader";
import {
  SessionFilesPanel,
  ResizableSessionFilesPanel,
} from "@/components/chat/SessionFilesPanel";
import { ErrorCard } from "@/components/ui/error-card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useErrorHandler } from "@/lib/hooks/use-error-handler";
import { conversationsApi } from "@/lib/api/conversations";
import { useStreamingContext } from "@/lib/chat/streaming-context";
import { useSidebar } from "@/components/sidebar/SidebarContext";
import {
  SESSION_FILES_PRESENT_EVENT,
  dispatchSessionFilesPresent,
  type SessionFilesPresentDetail,
} from "@/lib/api/session-files";
import { cn } from "@/lib/utils";
import { errorToDisplayMessage } from "@/lib/chat/error-payload";
import { userContextHeaders } from "@/lib/chat/user-context";

// If the conversation fetch takes longer than this, abort it and surface an
// error instead of leaving the user staring at an endless loading skeleton.
const FETCH_TIMEOUT_MS = 12_000;

// ── Session-file auto-present helpers ───────────────────────────────
// The AI is instructed to present files it creates (session_present_file /
// session_present_files), but smaller models occasionally forget. These
// helpers provide a client-side fallback: when a finished assistant message
// created/edited exactly ONE session file and never presented it, we open
// the panel straight to that file so the user always sees the result.

/**
 * Extract session-file activity from an assistant message's tool parts:
 * the distinct file paths touched by `session_file_write`/`session_file_edit`,
 * and whether the AI already presented files (`session_present_*`).
 * Handles both AI SDK v7 parts (`tool-<name>`) and legacy tool-invocation
 * parts, and never throws on malformed shapes.
 */
function sessionFilesTouchedByMessage(message: { parts: unknown[] }): {
  paths: Set<string>;
  presented: boolean;
} {
  const paths = new Set<string>();
  let presented = false;

  const absorbOutput = (toolName: unknown, output: unknown) => {
    if (toolName === "session_present_file" || toolName === "session_present_files") {
      presented = true;
      return;
    }
    if (
      (toolName === "session_file_write" || toolName === "session_file_edit") &&
      output &&
      typeof output === "object"
    ) {
      const p = (output as Record<string, unknown>).path;
      if (typeof p === "string" && p) paths.add(p);
    }
  };

  for (const rawPart of message.parts ?? []) {
    // Defensive: skip null/primitive parts — never throw on malformed shapes.
    if (!rawPart || typeof rawPart !== "object") continue;
    const part = rawPart as Record<string, unknown>;
    // AI SDK v7: type is `tool-<name>`
    if (
      typeof part.type === "string" &&
      part.type.startsWith("tool-") &&
      part.type !== "tool-invocation" &&
      part.toolCallId !== undefined
    ) {
      absorbOutput(part.type.slice("tool-".length), part.output);
      continue;
    }
    // Legacy: `tool-invocation` with `toolInvocation`
    if (part.type === "tool-invocation") {
      const inv = (part.toolInvocation ?? {}) as Record<string, unknown>;
      const output = inv.output ?? inv.result;
      absorbOutput(inv.toolName, output);
    }
  }

  return { paths, presented };
}

// ── Reconnecting Banner ─────────────────────────────────────────────

function ReconnectingBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex items-center justify-center gap-2.5 border-b border-primary/20 bg-primary/4 px-4 py-2 text-sm text-primary backdrop-blur-sm"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
      </span>
      <span className="font-medium">Reconnecting to active generation...</span>
    </motion.div>
  );
}

// ── Mobile header shown while loading / on error ────────────────────
// The regular MobileChatHeader only renders once conversation data is
// loaded, and GlobalMobileHeader hides itself on /chat/* routes — so
// without this, mobile users stuck on a skeleton or an error would have
// no way to open the sidebar or navigate anywhere.

function ChatMobileHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <div className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur supports-[padding-top:env(safe-area-inset-top)]:pt-[calc(0.5rem+env(safe-area-inset-top))] md:hidden">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-foreground">
        RemiAI
      </span>
    </div>
  );
}

// ── Error state (the fetch failed) ──────────────────────────────────
// Previously, any fetch failure (404 on a stale /chat/:id redirect,
// 500, network drop, or a request that hung) left the page showing
// ChatSkeleton forever because the render logic only checked
// `isLoading || !data`. This gives the user a way out.

function ChatLoadError({
  error,
  isBusy,
  onRetry,
  onCreateNew,
  onToggleSidebar,
}: {
  error: Error;
  isBusy: boolean;
  onRetry: () => void;
  onCreateNew: () => void;
  onToggleSidebar: () => void;
}) {
  const statusCode = (error as Error & { statusCode?: number }).statusCode;
  const isNotFound = statusCode === 404;
  const isTimeout = error.name === "AbortError" || error.name === "TimeoutError";

  const title = isNotFound
    ? "Conversation not found"
    : isTimeout
      ? "Timed out loading this conversation"
      : "Couldn't load this conversation";

  return (
    <div className="flex flex-1 flex-col h-full">
      <ChatMobileHeader onToggleSidebar={onToggleSidebar} />
      <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
        <div className="w-full max-w-md pt-8">
          <ErrorCard
            error={error}
            title={title}
            onRetry={onRetry}
            isRetrying={isBusy}
            retryLabel="Try again"
          />
          <p className="mb-3 px-2 text-center text-xs text-muted-foreground">
            {isNotFound
              ? "This conversation may have been deleted. Start a new one instead."
              : "The server may still be starting up, or your connection dropped. You can retry, or start a fresh conversation."}
          </p>
          <div className="flex justify-center">
            <Button onClick={onCreateNew} disabled={isBusy} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Start a new chat
            </Button>
          </div>
        </div>
      </div>
    </div>
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
  const isValidId = Number.isInteger(conversationId) && conversationId > 0;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeStreams } = useStreamingContext();
  const { toggleMobileSidebar } = useSidebar();

  // Redirect invalid /chat/:id paths (e.g. /chat/conversations) to the home
  // page, which will auto-create a new conversation if none exist.
  useEffect(() => {
    if (!isValidId) {
      router.replace("/chat");
    }
  }, [isValidId, router]);

  // Check if there's an active stream BEFORE the data fetch. All hooks are
  // called unconditionally (before any early return) to satisfy the Rules
  // of Hooks — the old code returned early for invalid IDs, which could
  // change the hook count between renders and crash React.
  const hasActiveStream = activeStreams.has(conversationId);
  const [showReconnecting, setShowReconnecting] = useState(hasActiveStream);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch conversation data. On any failure (404, 500, network error,
  // timeout) we render ChatLoadError below instead of an endless skeleton.
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => conversationsApi.get(conversationId, { timeoutMs: FETCH_TIMEOUT_MS }),
    enabled: isValidId,
    staleTime: hasActiveStream ? 60_000 : 30_000,
    // Don't refetch during stream to avoid message flicker
    refetchOnMount: hasActiveStream ? false : undefined,
    // Surface failures quickly instead of retrying for many seconds behind
    // a skeleton that never resolves.
    retry: 1,
    retryDelay: 800,
  });

  // Hide reconnecting banner once data is available
  useEffect(() => {
    if (data && showReconnecting) {
      // Short delay so the user sees the banner transition smoothly
      const timer = setTimeout(() => setShowReconnecting(false), 600);
      return () => clearTimeout(timer);
    }
  }, [data, showReconnecting]);

  // Escape hatch when the conversation can't be loaded: create a brand new
  // conversation (reusing the last-selected model, mirroring the sidebar)
  // and navigate to it.
  const startNewChat = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const lastModel = globalThis.localStorage?.getItem("lastModel");
      let providerId: number | undefined;
      let modelId: string | undefined;
      if (lastModel) {
        try {
          const parsed = JSON.parse(lastModel);
          if (typeof parsed.providerId === "number") providerId = parsed.providerId;
          if (typeof parsed.modelId === "string") modelId = parsed.modelId;
        } catch {
          // Ignore corrupt localStorage value
        }
      }
      const conversation = await conversationsApi.create(
        providerId && modelId ? { providerId, modelId } : undefined,
      );
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.replace(`/chat/${conversation.id}`);
    } catch (err) {
      // Creation failed too (e.g. DB is down) — stay on the error card, but
      // tell the user why the button appeared to do nothing.
      toast.error("Couldn't start a new chat", {
        description: err instanceof Error ? err.message : "The server may be unavailable.",
        duration: 5000,
      });
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, queryClient, router]);

  // Show nothing while redirecting invalid IDs
  if (!isValidId) {
    return null;
  }

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

      {isError ? (
        <ChatLoadError
          error={error ?? new Error("Failed to load conversation")}
          isBusy={isFetching || isCreating}
          onRetry={() => refetch()}
          onCreateNew={startNewChat}
          onToggleSidebar={toggleMobileSidebar}
        />
      ) : isLoading || !data ? (
        <>
          <ChatMobileHeader onToggleSidebar={toggleMobileSidebar} />
          <ChatSkeleton messageCount={3} />
        </>
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
  const queryClient = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);
  // When the AI presents a single file (session_present_file), the panel
  // opens straight to that file in the viewer.
  const [panelFocusPath, setPanelFocusPath] = useState<string | null>(null);
  const { activeStreams, startStream, endStream } = useStreamingContext();

  // Auto-open the session files panel when the AI calls session_present_files
  // or session_present_file; for the single-file variant, focus that file.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SessionFilesPresentDetail>).detail;
      if (detail?.focusPath) setPanelFocusPath(detail.focusPath);
      setPanelOpen(true);
    };
    window.addEventListener(SESSION_FILES_PRESENT_EVENT, handler);
    return () => window.removeEventListener(SESSION_FILES_PRESENT_EVENT, handler);
  }, []);

  // Persist mode to DB whenever it changes
  useEffect(() => {
    if (mode === (initialConversation as any).mode) return;
    conversationsApi.update(conversationId, { mode }).catch(() => {});
  }, [mode, conversationId, initialConversation]);

  // ── Resume (reconnection) ──────────────────────────────────────
  // `resume` must be captured once on mount and never change at runtime.
  // If it's tied to the live `activeStreams` set, calling `startStream`
  // (e.g. from `handleAiStart`) can flip resume to `true` mid-session,
  // which triggers a second `resumeStream()` → `makeRequest()` call.
  // Two concurrent `makeRequest()` calls share the same `this.activeResponse`
  // field on the `AbstractChat` instance. Whichever finishes first sets it
  // to `undefined` in its `finally` block, causing the other to crash with:
  //   "can't access property 'state', this.activeResponse is undefined"
  const resumeRef = useRef(isReconnecting);
  const resume = resumeRef.current;

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    error,
    resumeStream,
    regenerate,
    clearError: clearChatError,
  } = useChat({
    id: String(conversationId),
    messages: initialMessages,
    resume,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId },
      // Tell the server the user's timezone + locale so get_time_details
      // reports the user's LOCAL time and search results are localized.
      headers: () => userContextHeaders(),
      // ChatGPT-style requests: never upload the whole conversation on every
      // message (that caused HTTP 413 payload-too-large errors and re-
      // serialization lag on long chats). Only the newest few messages — the
      // "delta" — are shipped; the server reconstructs the full history from
      // the database and merges this delta in (deduping by message id). The
      // small bounded tail is a safety net so a message that failed to reach
      // the server on a previous attempt is not lost.
      prepareSendMessagesRequest: async ({ messages, body, trigger, messageId }) => ({
        body: {
          ...body,
          trigger,
          messageId,
          messages: messages.slice(-3),
        },
      }),
    }),
    onFinish: ({
      messages: finishedMessages,
      isAbort,
      isError,
      isDisconnect,
    }) => {
      // Fallback presentation: the AI is instructed to present session files
      // it creates (session_present_file / session_present_files), but if a
      // finished message created/edited exactly ONE session file and never
      // presented it, open the panel straight to that file so the user always
      // sees the result. Skip aborted/failed runs.
      if (!isAbort && !isError && !isDisconnect) {
        maybeAutoPresentSingleSessionFile(finishedMessages);
      }
      // Small delay to ensure server-side token update completes
      // before the sidebar refetches the conversation list.
      setTimeout(() => onConversationChanged(), 500);
      // First exchange in a brand-new chat (user + assistant only): the
      // server generates a real AI title in the background, so refetch again
      // shortly after to pick it up in the sidebar AND the header.
      if (messagesRef.current.length <= 2) {
        setTimeout(() => {
          onConversationChanged();
          queryClient.invalidateQueries({ queryKey: ["conversation"] });
        }, 6_000);
      }
      endStream(conversationId);
    },
  });

  // Keep the latest message list available to the retryable closure without
  // putting the (constantly changing) `messages` array in the effect deps:
  // editing the deps array LENGTH under Fast Refresh makes React throw
  // ("changed size between renders"), and a live messages dep would also
  // re-register the handler on every streamed chunk.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      startStream(conversationId);
      return;
    }

    // Keep stream state intact on transport errors so Resume/Continue can
    // reconnect instead of immediately downgrading to a blind resend flow.
    if (status === "error") {
      return;
    }

    if (!resume) {
      endStream(conversationId);
    }
  }, [status, conversationId, resume, startStream, endStream]);

  const {
    error: handlerError,
    isRetrying,
    handleError,
    retry,
    clearError,
    onRetryable,
  } = useErrorHandler({ showToast: false });

  // Sync AI SDK error to our handler
  useEffect(() => {
    if (error) {
      handleError(error);
    }
  }, [error, handleError]);

  // Register the retryable action — continue the interrupted run first.
  useEffect(() => {
    onRetryable(async () => {
      const mapped = errorToDisplayMessage(error ?? handlerError ?? "");

      // Resume-first policy: never resend the user prompt automatically.
      // If resume is not possible, bubble a clear error so the user can
      // explicitly decide to send a new message.
      if (mapped.shouldResume !== false) {
        // Only reconnect to the live stream if the server still has one.
        // Otherwise the AI SDK's resumeStream() silently no-ops (204 → null
        // → early return), which makes the run appear to "just end" when the
        // error card is cleared.
        const streamActive = await fetch(
          `/api/chat/${conversationId}/stream/status`,
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d?.active === true)
          .catch(() => false);

        if (streamActive) {
          startStream(conversationId);
          try {
            await resumeStream();
          } catch (err) {
            endStream(conversationId);
            throw err;
          }
          return;
        }

        // Nothing to continue from — tell the user instead of POSTing an
        // empty request to /api/chat (which would 400 confusingly).
        if (messagesRef.current.length === 0) {
          throw new Error(
            mapped.message ??
              "This run cannot be continued automatically. Send a new message to try again.",
          );
        }

        // The run already ended server-side — continue it by re-running the
        // generation with the accumulated messages (including any partial
        // assistant output), so the AI keeps working from where it stopped.
        // The continuation is appended as a new assistant message.
        clearError();
        clearChatError();
        sendMessage();
        return;
      }

      throw new Error(
        mapped.message ??
          "This run cannot be continued automatically. Send a new message to try again.",
      );
    });
  }, [
    onRetryable,
    error,
    handlerError,
    startStream,
    endStream,
    conversationId,
    resumeStream,
    clearError,
    clearChatError,
    sendMessage,
    messagesRef,
  ]);

  const [isAiStarting, setIsAiStarting] = useState(false);

  const handleSend = useCallback(
    (text: string) => {
      clearError();
      clearChatError();
      sendMessage({ text });
    },
    [clearError, clearChatError, sendMessage],
  );

  /**
   * Regenerate an assistant message: truncate the persisted messages at that
   * point (deleting it and everything after), then re-run the generation.
   */
  const [isRegenerating, setIsRegenerating] = useState(false);
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      if (isRegenerating || status === "submitted" || status === "streaming") return;
      setIsRegenerating(true);
      clearError();
      clearChatError();
      try {
        const res = await fetch(`/api/chat/${conversationId}/messages`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uiId: messageId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to prepare regeneration");
        }
        await regenerate({ messageId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to regenerate");
      } finally {
        setIsRegenerating(false);
      }
    },
    [conversationId, isRegenerating, status, clearError, clearChatError, regenerate],
  );

  const handleAiStart = useCallback(async () => {
    if (isAiStarting) return;
    setIsAiStarting(true);
    clearError();

    try {
      const response = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...userContextHeaders() },
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

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPanelFocusPath(null);
  }, []);

  // Fallback auto-present: when a finished assistant message created/edited
  // exactly ONE session file and the AI never called session_present_file /
  // session_present_files, open the panel straight to that file. This backs
  // up the prompt guidance (which asks the model to present) for models that
  // occasionally forget. Tracked by message id so it only fires once per
  // message and never re-opens the panel for an already-presented one.
  const autoPresentedMessageRef = useRef<string | null>(null);
  const maybeAutoPresentSingleSessionFile = useCallback(
    (finishedMessages: Array<{ id?: string; role?: string; parts: unknown[] }>) => {
      const lastAssistant = [...finishedMessages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (!lastAssistant) return;
      if (lastAssistant.id && autoPresentedMessageRef.current === lastAssistant.id) {
        return;
      }
      const { paths, presented } = sessionFilesTouchedByMessage(lastAssistant);
      // Only the single-file case: the user asked for the panel to open when
      // exactly one file was created. Multi-file runs rely on the AI calling
      // session_present_files (or the user opening the panel manually).
      if (presented || paths.size !== 1) return;
      const onlyPath = [...paths][0];
      if (!onlyPath) return;
      if (lastAssistant.id) autoPresentedMessageRef.current = lastAssistant.id;
      // Small delay so the streaming UI settles before the panel opens.
      setTimeout(() => {
        dispatchSessionFilesPresent({ focusPath: onlyPath });
      }, 450);
    },
    [],
  );

  const filesToggle = (
    <button
      type="button"
      onClick={() => {
        if (panelOpen) setPanelFocusPath(null);
        setPanelOpen((o) => !o);
      }}
      aria-label="Toggle session files"
      title="Session files"
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95",
        panelOpen && "bg-primary/10 text-primary",
      )}
    >
      <Files className="h-4 w-4" />
    </button>
  );

  // True while the conversation has no content yet — renders the centered,
  // code-editor-style composer instead of the docked messages + input.
  const lastMessage = messages[messages.length - 1];
  const isWaiting =
    (status === "submitted" || status === "streaming") &&
    (!lastMessage || lastMessage.role === "user");
  const isEmpty = messages.length === 0 && !isWaiting;

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
      {/* ── Mobile Header ── */}
      <MobileChatHeader
        title={initialConversation.title}
        providerId={providerId}
        modelId={modelId}
        onModelChange={handleModelChange}
        actions={filesToggle}
      />

      {/* ── Desktop Header (redesigned: model status + live usage meter) ── */}
      <ChatHeader
        conversationId={conversationId}
        title={initialConversation.title}
        providerId={providerId}
        modelId={modelId}
        status={status}
        initialTotalTokens={
          (initialConversation.totalInputTokens ?? 0) +
          (initialConversation.totalOutputTokens ?? 0)
        }
        onModelChange={handleModelChange}
        actions={
          <>
            {messages.length > 0 && (
              <ExportDialog messages={messages} title={initialConversation.title} />
            )}
            {filesToggle}
          </>
        }
      />

      {/* ── Todo progress ── */}
      <TodoProgressBar conversationId={conversationId} />

      {/* ── Messages + Session files panel ── */}
      <div className="relative flex min-h-0 flex-1">
        {/* Chat column: messages, error card, and input live together so they
            shrink as one when the session files panel opens — keeping the
            input aligned with the message column. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-w-0 flex-1 overflow-y-auto">
            {isEmpty ? (
              <EmptyChatState
                conversationId={conversationId}
                status={status}
                disabled={!providerId || !modelId}
                mode={mode}
                onModeChange={setMode}
                onSend={handleSend}
                onStop={stop}
                onAiStart={handleAiStart}
                isAiStarting={isAiStarting}
              >
                {handlerError && (
                  <div className="w-full max-w-2xl">
                    <ErrorCard
                      error={handlerError}
                      onRetry={retry}
                      isRetrying={isRetrying}
                      retryLabel="Continue"
                      onDismiss={clearError}
                    />
                  </div>
                )}
              </EmptyChatState>
            ) : (
              <MessageList
                messages={messages}
                status={status}
                onSend={(text) => sendMessage({ text })}
                onRegenerate={handleRegenerate}
              />
            )}
          </div>

          {/* Docked composer + error — only once the conversation has content. */}
          {!isEmpty && (
            <>
              {/* ── Error ── */}
              {handlerError && (
                <div className="mx-auto w-full max-w-3xl px-4 pb-2 md:px-6">
                  <ErrorCard
                    error={handlerError}
                    onRetry={retry}
                    isRetrying={isRetrying}
                    retryLabel="Continue"
                    onDismiss={clearError}
                  />
                </div>
              )}

              {/* ── Input ── */}
              <div className="sticky bottom-0 z-20 supports-[padding-bottom:env(safe-area-inset-bottom)]:pb-[env(safe-area-inset-bottom)]">
                {/* Shared layoutId with the centered EmptyChatState composer —
                    makes the input glide down to the dock when chat starts. */}
                <motion.div
                  layoutId="chat-input"
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                  className="relative"
                >
                  <ChatInput
                    conversationId={conversationId}
                    status={status}
                    disabled={!providerId || !modelId}
                    mode={mode}
                    onModeChange={setMode}
                    onSend={handleSend}
                    onStop={stop}
                  />
                </motion.div>
              </div>
            </>
          )}
        </div>

        {/* Desktop — inline right-side panel (user-resizable width) */}
        <AnimatePresence>
          {panelOpen && (
            <ResizableSessionFilesPanel
              conversationId={conversationId}
              onClose={closePanel}
              focusPath={panelFocusPath}
            />
          )}
        </AnimatePresence>

        {/* Mobile — full-height drawer over the chat */}
        <AnimatePresence>
          {panelOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPanelOpen(false)}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
              />
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm md:hidden"
              >
                <SessionFilesPanel
                  conversationId={conversationId}
                  onClose={closePanel}
                  focusPath={panelFocusPath}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
