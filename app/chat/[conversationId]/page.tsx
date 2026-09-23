"use client";

import { use, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import { Files, Menu, Plus, Timer } from "lucide-react";
import { MessageList } from "@/components/chat/MessageList";
import { EmptyChatState } from "@/components/chat/EmptyChatState";
import { ActiveQuestionsPanel } from "@/components/chat/ActiveQuestionsPanel";
import { ChatInput, type ChatMode } from "@/components/chat/ChatInput";
import {
  normalizeQualityPolicy,
  type QualityPolicy,
} from "@/lib/chat/quality-policy";
import { ChatSkeleton } from "@/components/chat/ChatSkeleton";
import { TodoProgressBar } from "@/components/chat/TodoProgressBar";
import { BuildRunHistory } from "@/components/chat/BuildRunHistory";
import { AutomationRunHistory } from "@/components/chat/AutomationRunHistory";
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
import { applyConversationTitleUpdate, conversationsApi } from "@/lib/api/conversations";
import { useStreamingContext } from "@/lib/chat/streaming-context";
import { findActiveQuestions, type QuestionAnswerSubmission } from "@/lib/chat/questions";
import { shouldPromotePlanToGoal } from "@/lib/chat/mode-transition";
import { useSidebar } from "@/components/sidebar/SidebarContext";
import {
  SESSION_FILES_PRESENT_EVENT,
  dispatchSessionFilesPresent,
  type SessionFilesPresentDetail,
} from "@/lib/api/session-files";
import {
  ResizableCanvasPanel,
  CanvasPanel,
} from "@/components/chat/CanvasPanel";
import {
  CANVAS_PRESENT_EVENT,
  dispatchCanvasClosed,
  dispatchCanvasOpened,
  type CanvasPresentDetail,
} from "@/lib/api/canvas";
import { cn } from "@/lib/utils";
import {
  errorToDisplayMessage,
  decodeStreamError,
} from "@/lib/chat/error-payload";
import { primeClientLocation, userContextHeaders } from "@/lib/chat/user-context";
import { TEMPORARY_CHAT_RETENTION_DAYS } from "@/lib/chat/temporary-chat-constants";

// If the conversation fetch takes longer than this, abort it and surface an
// error instead of leaving the user staring at an endless loading skeleton.
const FETCH_TIMEOUT_MS = 12_000;

// When a run is cut short by the step/token limit (finishReason "length") or
// a dangling stop, the server marks the error `shouldResume`. Instead of
// forcing a manual "Continue" click every time, the page silently resumes
// the run up to this many times per user message so the AI genuinely keeps
// working until the task is done. If it still cannot finish after this many
// automatic resumes (a genuinely stuck/looping run), the error banner shows
// so the user can decide.
const MAX_AUTO_CONTINUES_PER_MESSAGE = 3;

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

/**
 * True when an assistant message presents a canvas (`canvas_create` /
 * `canvas_open` / `canvas_add_file`) — the canvas card owns the panel slot,
 * so session-files fallbacks must not fire for the same message.
 */
function messagePresentsCanvas(message: { parts: unknown[] }): boolean {
  const canvasTools = new Set(["canvas_create", "canvas_open", "canvas_add_file"]);
  for (const rawPart of message.parts ?? []) {
    if (!rawPart || typeof rawPart !== "object") continue;
    const part = rawPart as Record<string, unknown>;
    if (
      typeof part.type === "string" &&
      part.type.startsWith("tool-") &&
      part.type !== "tool-invocation"
    ) {
      if (canvasTools.has(part.type.slice("tool-".length))) return true;
      continue;
    }
    if (part.type === "tool-invocation") {
      const inv = (part.toolInvocation ?? {}) as Record<string, unknown>;
      if (typeof inv.toolName === "string" && canvasTools.has(inv.toolName)) {
        return true;
      }
    }
  }
  return false;
}

/** Empty assistant placeholders are left behind when a generation is stopped
 * before it produces any output. They are not a response the user can read. */
function assistantHasOutput(message: { role?: string; parts?: unknown[] } | undefined): boolean {
  if (message?.role !== "assistant") return false;
  return (message.parts ?? []).some((rawPart) => {
    if (!rawPart || typeof rawPart !== "object") return false;
    const part = rawPart as Record<string, unknown>;
    if (part.type === "text") return typeof part.text === "string" && part.text.trim().length > 0;
    return typeof part.type === "string" &&
      (part.type.startsWith("tool-") || part.type === "tool-invocation" || part.type === "reasoning");
  });
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
    <div className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden px-6 py-16">
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
      queryClient.invalidateQueries({ queryKey: ["sidebar-conversations"] });
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
          onConversationChanged={() => {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["sidebar-conversations"] });
          }}
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
    (initialConversation.mode as ChatMode | undefined) ?? "chat",
  );
  const [qualityPolicy, setQualityPolicy] = useState<QualityPolicy>(
    normalizeQualityPolicy(initialConversation.qualityPolicy),
  );
  // Temporary-chat flag + per-chat memory switch — fully independent toggles.
  // Persisted to the conversation row on change (see effects below).
  const [isTemporary, setIsTemporary] = useState<boolean>(
    initialConversation.isTemporary ?? false,
  );
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(
    initialConversation.memoryEnabled !== false,
  );
  const queryClient = useQueryClient();

  // The server sends a snapshot on connect and pushes the generated title
  // later, so both the visible header and sidebar update without waiting for
  // the old post-response polling delay.
  useEffect(() => {
    const eventSource = new EventSource(`/api/conversations/${conversationId}/title-events`);
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          conversationId?: number;
          title?: string;
          updatedAt?: string;
        };
        if (
          payload.type !== "conversation-title-updated" ||
          payload.conversationId !== conversationId ||
          typeof payload.title !== "string"
        ) {
          return;
        }
        applyConversationTitleUpdate(
          queryClient,
          conversationId,
          payload.title,
          payload.updatedAt,
        );
      } catch {
        // Ignore malformed/reconnect events; EventSource will reconnect itself.
      }
    };
    return () => eventSource.close();
  }, [conversationId, queryClient]);
  const [panelOpen, setPanelOpen] = useState(false);
  // When the AI presents a single file (session_present_file), the panel
  // opens straight to that file in the viewer.
  const [panelFocusPath, setPanelFocusPath] = useState<string | null>(null);
  // Canvas panel — an interactive web-project preview+editor that shares the
  // same right-side slot as session files (they don't stack on narrow screens).
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasFocusSlug, setCanvasFocusSlug] = useState<string | null>(null);
  // Once the user manually closes a panel, later canvas_open /
  // session_present_* calls in this page session no longer force it back open.
  const canvasDismissedRef = useRef(false);
  const filesDismissedRef = useRef(false);
  // A canvas presentation in the current request wins the panel slot over any
  // session-files presentation — models often call session_present_files after
  // canvas_open (or the single-file fallback fires), which would otherwise
  // open the wrong panel. Cleared when the user sends the next message.
  const canvasWinsRef = useRef(false);
  const pendingCanvasPresentRef = useRef<CanvasPresentDetail | null>(null);
  const { activeStreams, startStream, endStream } = useStreamingContext();

  const openCanvasPanel = useCallback((detail: CanvasPresentDetail) => {
    if (canvasDismissedRef.current) return;
    canvasWinsRef.current = true;
    setCanvasFocusSlug(detail.slug ?? null);
    setCanvasOpen(true);
    setPanelOpen(false);
    setPanelFocusPath(null);
    if (detail.slug) dispatchCanvasOpened(detail.slug);
  }, []);

  // Auto-open the session files panel when the AI calls session_present_files
  // or session_present_file; for the single-file variant, focus that file.
  useEffect(() => {
    const handler = (event: Event) => {
      // User dismissed the panel — don't force it open again.
      if (filesDismissedRef.current) return;
      // A canvas was presented in this request — it owns the panel slot.
      if (canvasWinsRef.current) return;
      const detail = (event as CustomEvent<SessionFilesPresentDetail>).detail;
      if (detail?.focusPath) setPanelFocusPath(detail.focusPath);
      setPanelOpen(true);
      // a canvas and session files share the slot — opening files closes canvas
      setCanvasOpen(false);
      dispatchCanvasClosed();
    };
    window.addEventListener(SESSION_FILES_PRESENT_EVENT, handler);
    return () => window.removeEventListener(SESSION_FILES_PRESENT_EVENT, handler);
  }, []);

  // Queue AI canvas presentations until the assistant turn is finished. This
  // keeps the first canvas creation message visible while tools are still
  // running instead of replacing the conversation with the live panel early.
  // Manual "Open canvas" clicks remain immediate.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<CanvasPresentDetail>).detail ?? {};
      if (detail.manual) {
        canvasDismissedRef.current = false;
        filesDismissedRef.current = true;
        openCanvasPanel(detail);
        return;
      }
      pendingCanvasPresentRef.current = detail;
    };
    window.addEventListener(CANVAS_PRESENT_EVENT, handler);
    return () => window.removeEventListener(CANVAS_PRESENT_EVENT, handler);
  }, [openCanvasPanel]);

  // Reflect AI-controlled mode switches in the visible composer immediately.
  useEffect(() => {
    const handler = (event: Event) => {
      const nextMode = (event as CustomEvent<{ mode?: unknown }>).detail?.mode;
      if (nextMode === "chat" || nextMode === "goal" || nextMode === "plan" || nextMode === "build") {
        setMode(nextMode);
      }
    };
    window.addEventListener("remi:mode-changed", handler);
    return () => window.removeEventListener("remi:mode-changed", handler);
  }, []);

  // Persist mode to DB whenever it changes
  useEffect(() => {
    if (mode === initialConversation.mode) return;
    conversationsApi.update(conversationId, { mode }).catch(() => {});
  }, [mode, conversationId, initialConversation]);

  // Persist the per-conversation quality policy alongside the selected mode.
  useEffect(() => {
    if (qualityPolicy === normalizeQualityPolicy(initialConversation.qualityPolicy)) return;
    conversationsApi.update(conversationId, { qualityPolicy }).catch(() => {});
  }, [qualityPolicy, conversationId, initialConversation]);

  // Persist the temporary-chat flag + memory switch when they change, then
  // invalidate the sidebar's conversation list so the Temporary badge (and
  // any other list-derived UI) updates immediately instead of on reload.
  //
  // The guard compares against the LAST PERSISTED value (a ref), not the
  // mount-time `initialConversation` prop: that prop never updates while the
  // page is open, so comparing to it would make the FIRST toggle persist but
  // silently skip toggling BACK to the initial value (e.g. un-making a
  // temporary chat) — the sidebar would stay stale until reload.
  const lastPersistedIsTemporary = useRef(initialConversation.isTemporary ?? false);
  useEffect(() => {
    const prev = lastPersistedIsTemporary.current;
    if (isTemporary === prev) return;
    lastPersistedIsTemporary.current = isTemporary;
    conversationsApi
      .update(conversationId, { isTemporary })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-conversations"] });
      })
      .catch(() => {
        // Persist failed — roll the ref back so the next toggle retries.
        lastPersistedIsTemporary.current = prev;
      });
  }, [isTemporary, conversationId, queryClient]);

  const lastPersistedMemoryEnabled = useRef(initialConversation.memoryEnabled !== false);
  useEffect(() => {
    const prev = lastPersistedMemoryEnabled.current;
    if (memoryEnabled === prev) return;
    lastPersistedMemoryEnabled.current = memoryEnabled;
    conversationsApi
      .update(conversationId, { memoryEnabled })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["sidebar-conversations"] });
      })
      .catch(() => {
        lastPersistedMemoryEnabled.current = prev;
      });
  }, [memoryEnabled, conversationId, queryClient]);

  // ── Resume (reconnection) ──────────────────────────────────────
  // `resume` must be captured once on mount and never change at runtime.
  // If it's tied to the live `activeStreams` set, calling `startStream`
  // (e.g. from `handleAiStart`) can flip resume to `true` mid-session,
  // which triggers a second `resumeStream()` → `makeRequest()` call.
  // Two concurrent `makeRequest()` calls share the same `this.activeResponse`
  // field on the `AbstractChat` instance. Whichever finishes first sets it
  // to `undefined` in its `finally` block, causing the other to crash with:
  //   "can't access property 'state', this.activeResponse is undefined"
  const [resume] = useState(() => isReconnecting);
  const messagesRef = useRef(initialMessages);
  // Automatic-resume budget for step-limited runs. The server ends these runs
  // with a `shouldResume` error instead of completing them; the page silently
  // resumes (like the Continue button) so a long canvas/build keeps going to
  // completion without the user clicking. Decremented per automatic resume and
  // refilled whenever the user sends a new message / regenerates — a genuinely
  // stuck run (one that keeps hitting the limit with no progress) falls back
  // to the visible error banner after the budget is spent.
  const autoContinueBudgetRef = useRef(MAX_AUTO_CONTINUES_PER_MESSAGE);
  // Keep the composer reactive even when a failed request does not cause the
  // SDK to publish the new user message back through `messages`.
  const [pendingUserTurn, setPendingUserTurn] = useState(false);
  // Synchronous guard for double click/Enter events that arrive before the
  // AI SDK has updated `status` to submitted.
  const sendGuardRef = useRef(false);

  useEffect(() => {
    primeClientLocation();
  }, []);

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
          // User edits replace a message that may be far back in the
          // conversation. Include that exact message instead of relying on
          // the bounded tail; regeneration still uses the normal tail.
          messages:
            trigger === "submit-message" && messageId
              ? messages.filter((message) => message.id === messageId)
              : messages.slice(-3),
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
        const pendingCanvas = pendingCanvasPresentRef.current;
        pendingCanvasPresentRef.current = null;
        if (pendingCanvas) openCanvasPanel(pendingCanvas);
      } else {
        pendingCanvasPresentRef.current = null;
      }
      // Small delay to ensure server-side token update completes
      // before the sidebar refetches the conversation list.
      setTimeout(() => {
        onConversationChanged();
        queryClient.invalidateQueries({ queryKey: ["build-runs", conversationId] });
      }, 500);
      endStream(conversationId);
    },
  });

  const [questionAnswerMessages, setQuestionAnswerMessages] = useState<UIMessage[]>([]);
  const [resolvedQuestionIds, setResolvedQuestionIds] = useState<string[]>([]);
  const questionStatusRef = useRef(status);
  useEffect(() => { questionStatusRef.current = status; }, [status]);
  const stoppedQuestionRunRef = useRef<string | null>(null);
  const reconnectingQuestionRunRef = useRef(false);
  const seenQuestionRunsRef = useRef(new Set<string>());
  useEffect(() => {
    const last = messages.at(-1);
    if (status === "streaming" && last?.role === "assistant") seenQuestionRunsRef.current.add(last.id);
  }, [messages, status]);
  const displayMessages = useMemo(() => {
    const known = new Set(messages.map((message) => message.id));
    return [...messages, ...questionAnswerMessages.filter((message) => !known.has(message.id))];
  }, [messages, questionAnswerMessages]);

  useEffect(() => {
    let disposed = false;
    let polling = false;
    let idleSynced = false;
    let done = false;
    const streamIsBusy = () => questionStatusRef.current === "streaming" || questionStatusRef.current === "submitted";
    const poll = async () => {
      if (polling || disposed || done) return;
      polling = true;
      try {
        const response = await fetch(`/api/chat/${conversationId}/question-answers`);
        if (!response.ok || disposed) return;
        const state = await response.json() as {
          resolvedIds: string[]; answerMessages: UIMessage[]; activeAssistantId: string | null; initialAssistantMessage: UIMessage | null; mode: string | null; hasAutomaticPending: boolean;
        };
        if (disposed) return;
        if (state.mode === "goal") setMode((previous) => previous === "plan" ? "goal" : previous);
        setResolvedQuestionIds((previous) => previous.join("\0") === state.resolvedIds.join("\0") ? previous : state.resolvedIds);
        setQuestionAnswerMessages((previous) => previous.map((m) => m.id).join("\0") === state.answerMessages.map((m) => m.id).join("\0") ? previous : state.answerMessages);
        if (streamIsBusy()) return;
        if (state.activeAssistantId && stoppedQuestionRunRef.current !== "*" && !seenQuestionRunsRef.current.has(state.activeAssistantId) && !reconnectingQuestionRunRef.current) {
          // A server-owned follow-up may start after the original finish chunk.
          // Reconnect rather than issuing another generation request.
          const streamState = await fetch(`/api/chat/${conversationId}/stream/status`).then((r) => r.json());
          if (disposed || !streamState.active || streamIsBusy()) return;
          reconnectingQuestionRunRef.current = true;
          seenQuestionRunsRef.current.add(state.activeAssistantId);
          const current = messagesRef.current;
          const activeIndex = current.findIndex((message) => message.id === state.activeAssistantId);
          if (activeIndex >= 0) {
            // The reconnect stream replays this run from the start. Retain only
            // the pre-run seed so saved partial text isn't duplicated.
            setMessages([...current.slice(0, activeIndex), ...(state.initialAssistantMessage ? [state.initialAssistantMessage] : [])]);
          } else {
            const known = new Set(current.map((message) => message.id));
            setMessages([...current, ...state.answerMessages.filter((message) => !known.has(message.id))]);
          }
          try { await resumeStream(); } catch {
            seenQuestionRunsRef.current.delete(state.activeAssistantId);
          } finally { reconnectingQuestionRunRef.current = false; }
        } else if (!state.activeAssistantId && state.resolvedIds.length && !idleSynced) {
          const transcript = await fetch(`/api/chat/${conversationId}/question-answers?transcript=1`).then((r) => r.ok ? r.json() : null);
          if (disposed || streamIsBusy() || transcript?.activeAssistantId) return;
          if (transcript?.messages) {
            const persisted = transcript.messages as UIMessage[];
            const known = new Set(persisted.map((message) => message.id));
            setMessages([...persisted, ...messagesRef.current.filter((message) => !known.has(message.id))]);
          }
          idleSynced = true;
        }
        if (!state.activeAssistantId && !state.hasAutomaticPending) done = true;
      } catch {
        // A transient polling failure must not disturb the active stream.
      } finally { polling = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, [conversationId, status, resolvedQuestionIds.length, resumeStream, setMessages]);

  const handleQuestionSubmit = useCallback(async (submission: QuestionAnswerSubmission) => {
    const response = await fetch(`/api/chat/${conversationId}/question-answers`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not send answers. Try again.");
    stoppedQuestionRunRef.current = null;
    setResolvedQuestionIds((previous) => previous.includes(result.toolCallId) ? previous : [...previous, result.toolCallId]);
    setQuestionAnswerMessages((previous) => previous.some((message) => message.id === result.message.id) ? previous : [...previous, result.message]);
  }, [conversationId]);

  const handleStop = useCallback(() => {
    stoppedQuestionRunRef.current = "*";
    void fetch(`/api/chat/${conversationId}/question-answers`, { method: "DELETE" }).catch(() => {
      toast.error("Could not stop the server response. Try again.");
    });
    void stop();
  }, [conversationId, stop]);

  // Keep the latest message list available to the retryable closure without
  // putting the (constantly changing) `messages` array in the effect deps:
  // editing the deps array LENGTH under Fast Refresh makes React throw
  // ("changed size between renders"), and a live messages dep would also
  // re-register the handler on every streamed chunk.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      startStream(conversationId);
      return;
    }

    sendGuardRef.current = false;

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

  // Sync AI SDK error to our handler — but silently auto-continue runs the
  // server cut short by the step/token limit (finishReason "length" / dangling
  // stop). Those end with a `step_limit` + `shouldResume` payload; resuming is
  // safe and deterministic (it re-runs generation from the accumulated
  // messages), so do it automatically up to the per-message budget instead of
  // forcing a manual Continue click on every truncation.
  //
  // The resume runs through the SAME retryable the Continue button uses
  // (registered below via onRetryable), so it keeps every safeguard: it
  // re-checks whether the server stream is still live, and only then re-sends
  // the accumulated messages. Deferred with setTimeout(0) so the onRetryable
  // registration effect has re-registered with the CURRENT error before
  // retry() reads it. The SDK error is left in place on purpose — the retryable
  // clears it itself once the continuation request actually starts.
  useEffect(() => {
    if (!error) return;
    const rawMessage =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "";
    const decoded = decodeStreamError(rawMessage);
    const mapped = errorToDisplayMessage(error);
    const canAutoResume =
      mapped.shouldResume === true &&
      decoded?.category === "step_limit" &&
      autoContinueBudgetRef.current > 0;

    if (!canAutoResume) {
      handleError(error);
      return;
    }

    autoContinueBudgetRef.current -= 1;
    const timer = setTimeout(() => {
      void retry().catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [error, handleError, retry]);

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

  // Generation belongs to the server, not this page. Keep the server informed
  // about whether this conversation can be seen so it can notify the user
  // once a background response has been safely persisted.
  useEffect(() => {
    const sendVisibility = (visible: boolean, unloadSafe = false) => {
      const url = `/api/chat/${conversationId}/generation-presence`;
      const body = JSON.stringify({ visible });
      if (unloadSafe && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: unloadSafe,
      }).catch(() => undefined);
    };
    const syncDocumentVisibility = () => sendVisibility(document.visibilityState === "visible");
    syncDocumentVisibility();
    document.addEventListener("visibilitychange", syncDocumentVisibility);
    const leave = () => sendVisibility(false, true);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", syncDocumentVisibility);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [conversationId]);

  const handleSend = useCallback(
    (text: string) => {
      if (sendGuardRef.current || status === "submitted" || status === "streaming") return;
      stoppedQuestionRunRef.current = null;
      sendGuardRef.current = true;
      clearError();
      clearChatError();
      // A fresh user message gets a fresh auto-continue budget — the previous
      // turn's silent resumes must not leak into the new request.
      autoContinueBudgetRef.current = MAX_AUTO_CONTINUES_PER_MESSAGE;
      setPendingUserTurn(true);
      // Keep the UI and persisted conversation in sync with the server's
      // automatic Plan → Goal transition when the user answers planning
      // questions. This must happen before the request starts so the client
      // does not keep filtering the response as Plan mode.
      if (shouldPromotePlanToGoal(mode, messagesRef.current)) {
        setMode("goal");
        void conversationsApi.update(conversationId, { mode: "goal" }).catch(() => {});
      }
      // A fresh request starts a fresh present — the previous request's canvas
      // no longer claims the panel slot.
      canvasWinsRef.current = false;
      sendMessage({ text });
    },
    [clearError, clearChatError, conversationId, mode, sendMessage, status],
  );

  // A user message can survive locally even when its assistant request never
  // started (for example after a dropped connection). Re-submit the current
  // last message so the SDK/server can generate the missing assistant reply.
  const handleContinueLastMessage = useCallback(() => {
    if (status === "submitted" || status === "streaming") return;
    stoppedQuestionRunRef.current = null;
    clearError();
    clearChatError();
    autoContinueBudgetRef.current = MAX_AUTO_CONTINUES_PER_MESSAGE;
    setPendingUserTurn(true);
    canvasWinsRef.current = false;
    const lastUserMessage = [...messagesRef.current]
      .reverse()
      .find((message) => message.role === "user");
    if (lastUserMessage) {
      sendMessage({ parts: lastUserMessage.parts, messageId: lastUserMessage.id });
    } else {
      sendMessage();
    }
  }, [status, clearError, clearChatError, sendMessage]);

  const lastVisibleMessage = messages.at(-1);
  const hasUnansweredLastMessage =
    lastVisibleMessage?.role === "user" ||
    (lastVisibleMessage?.role === "assistant" && !assistantHasOutput(lastVisibleMessage)) ||
    (pendingUserTurn && lastVisibleMessage?.role !== "assistant");

  const [isRegenerating, setIsRegenerating] = useState(false);
  const handleEdit = useCallback(
    async (messageId: string, text: string) => {
      if (isRegenerating || status === "submitted" || status === "streaming") return;
      const trimmed = text.trim();
      if (!trimmed) {
        toast.error("Message cannot be empty");
        return;
      }
      setIsRegenerating(true);
      clearError();
      clearChatError();
      // A fresh request gets a fresh auto-continue budget.
      autoContinueBudgetRef.current = MAX_AUTO_CONTINUES_PER_MESSAGE;
      canvasWinsRef.current = false;
      try {
        // The SDK replaces this user message locally and submits it with the
        // messageId, allowing the server to trim the stale branch.
        await sendMessage({ text: trimmed, messageId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to edit message");
      } finally {
        setIsRegenerating(false);
      }
    },
    [isRegenerating, status, clearError, clearChatError, sendMessage],
  );

  /**
   * Regenerate an assistant message: truncate the persisted messages at that
   * point (deleting it and everything after), then re-run the generation.
   */
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      if (isRegenerating || status === "submitted" || status === "streaming") return;
      setIsRegenerating(true);
      clearError();
      clearChatError();
      autoContinueBudgetRef.current = MAX_AUTO_CONTINUES_PER_MESSAGE;
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
    filesDismissedRef.current = true;
    setPanelOpen(false);
    setPanelFocusPath(null);
    setCanvasOpen(false);
    setCanvasFocusSlug(null);
  }, []);
  const closeCanvasPanel = useCallback(() => {
    canvasDismissedRef.current = true;
    setCanvasOpen(false);
    setCanvasFocusSlug(null);
    // Let canvas cards flip their copy back to the neutral label.
    dispatchCanvasClosed();
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
      // A canvas presentation owns the panel slot (canvas_create / canvas_open
      // / canvas_add_file) — never fall back to the session files panel for
      // the same message, even if it touched exactly one canvas file.
      if (messagePresentsCanvas(lastAssistant)) return;
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
        // canvas shares the slot — close it when toggling files
        if (canvasOpen) closeCanvasPanel();
      }}
      aria-label="Toggle session files"
      title="Session files"
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95",
        panelOpen && !canvasOpen && "bg-primary/10 text-primary",
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

  // The newest unanswered ask_questions set — drives the Nexus-style "active"
  // questions panel above the composer. Derived from the message list, so it
  // survives reloads (any user message after a questions part marks it answered).
  const activeQuestions = useMemo(() => findActiveQuestions(displayMessages, resolvedQuestionIds), [displayMessages, resolvedQuestionIds]);

  const handleModeChange = useCallback(
    (nextMode: ChatMode) => {
      setMode(nextMode);
      void conversationsApi.update(conversationId, { mode: nextMode }).catch(() => {});
    },
    [conversationId],
  );

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
        isTemporary={isTemporary}
        memoryEnabled={memoryEnabled}
        onTemporaryChange={setIsTemporary}
        onMemoryChange={setMemoryEnabled}
        actions={
          <>
            {messages.length > 0 && (
              <ExportDialog messages={messages} title={initialConversation.title} />
            )}
            {filesToggle}
          </>
        }
      />

      {/* ── Temporary-chat banner — hacky/temporary look, with a one-click
          way to make the chat permanent again. Only for temporary chats. */}
      {isTemporary && (
        <div className="flex items-center gap-2 border-b border-dashed border-status-warning/40 bg-status-warning/6 px-4 py-1.5 text-xs text-foreground/80">
          <Timer className="h-3.5 w-3.5 shrink-0 text-status-warning" />
          <span className="min-w-0 flex-1 truncate">
            Temporary chat · Memory {memoryEnabled ? "enabled" : "disabled"} · deleted after{" "}
            {TEMPORARY_CHAT_RETENTION_DAYS} days of inactivity
          </span>
          <button
            type="button"
            onClick={() => setIsTemporary(false)}
            className="shrink-0 rounded-md px-2 py-0.5 font-medium text-status-warning transition-colors hover:bg-status-warning/10"
          >
            Make permanent
          </button>
        </div>
      )}

      {/* ── Todo progress ── */}
      <TodoProgressBar conversationId={conversationId} mode={mode} />
      {mode === "build" && <BuildRunHistory conversationId={conversationId} />}
      <AutomationRunHistory conversationId={conversationId} />

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
                onModeChange={handleModeChange}
                qualityPolicy={qualityPolicy}
                onQualityPolicyChange={setQualityPolicy}
                providerId={providerId}
                modelId={modelId}
                onModelChange={handleModelChange}
                onSend={handleSend}
                onStop={handleStop}
                onAiStart={handleAiStart}
                isAiStarting={isAiStarting}
                isTemporary={isTemporary}
                memoryEnabled={memoryEnabled}
                onTemporaryChange={setIsTemporary}
                onMemoryChange={setMemoryEnabled}
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
                messages={displayMessages}
                status={status}
                onSend={(text) => sendMessage({ text })}
                onRegenerate={handleRegenerate}
                onEdit={handleEdit}
                onContinue={handleContinueLastMessage}
                conversationId={conversationId}
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
                {/* Nexus-style "active" questions — the AI's pending questions
                    live above the composer, not as static text in the chat. */}
                <AnimatePresence>
                  {activeQuestions && (
                    <motion.div
                      key={activeQuestions.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      <ActiveQuestionsPanel
                        data={activeQuestions.data}
                        toolCallId={activeQuestions.id}
                        onSubmit={handleQuestionSubmit}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Docked composer — fades in at its final position without
                    ever animating the box's size or position on send. (A shared
                    layoutId with the EmptyChatState composer used to fly the
                    box from the center to the dock and morph its width while
                    the inner controls snapped to the compact size — removed.) */}
                <div className="relative animate-fade-in-opacity">
                  <ChatInput
                    conversationId={conversationId}
                    status={status}
                    disabled={!providerId || !modelId}
                    mode={mode}
                    onModeChange={handleModeChange}
                    qualityPolicy={qualityPolicy}
                    onQualityPolicyChange={setQualityPolicy}
                    providerId={providerId}
                    modelId={modelId}
                    onModelChange={handleModelChange}
                    onSend={handleSend}
                    onContinue={
                      hasUnansweredLastMessage ? handleContinueLastMessage : undefined
                    }
                    onStop={handleStop}
                    isTemporary={isTemporary}
                    memoryEnabled={memoryEnabled}
                    onTemporaryChange={setIsTemporary}
                    onMemoryChange={setMemoryEnabled}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Desktop — inline right-side panel (user-resizable width). The canvas
            and session-files panels share this slot; they never stack. */}
        <AnimatePresence>
          {canvasOpen && (
            <ResizableCanvasPanel
              conversationId={conversationId}
              onClose={closeCanvasPanel}
              focusSlug={canvasFocusSlug}
            />
          )}
          {!canvasOpen && panelOpen && (
            <ResizableSessionFilesPanel
              conversationId={conversationId}
              onClose={closePanel}
              focusPath={panelFocusPath}
            />
          )}
        </AnimatePresence>

        {/* Mobile — full-height drawer over the chat */}
        <AnimatePresence>
          {canvasOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  canvasDismissedRef.current = true;
                  setCanvasOpen(false);
                  dispatchCanvasClosed();
                }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
              />
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm md:hidden"
              >
                <CanvasPanel
                  conversationId={conversationId}
                  onClose={closeCanvasPanel}
                  focusSlug={canvasFocusSlug}
                />
              </motion.div>
            </>
          )}
          {!canvasOpen && panelOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  filesDismissedRef.current = true;
                  setPanelOpen(false);
                }}
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
