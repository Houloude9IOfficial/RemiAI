"use client";

import { useState, useCallback, useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, normalizeDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PenLine,
  Trash2,
  Copy,
  Check,
  X,
  Loader2,
  CheckSquare,
  Square,
  MessageSquare,
  ArrowUpToLine,
  ArrowDownToLine,
  Clock,
  Timer,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react";
import { conversationsApi, type Conversation } from "@/lib/api/conversations";
import { ConversationTitle } from "@/components/sidebar/ConversationTitle";
import { toast } from "sonner";
import { useActiveStreams } from "@/lib/chat/streaming-context";
import { useNewChat } from "@/lib/hooks/use-new-chat";
import { useSidebarPreference } from "./useSidebarPreference";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDate(dateStr: string): string {
  const d = new Date(normalizeDate(dateStr));
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function ContextMenuPortal({
  conversation,
  position,
  onRename,
  onDuplicate,
  onDelete,
  onConvert,
  onClose,
}: {
  conversation: Conversation;
  position: { x: number; y: number };
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      {/* Menu */}
      <div
        className="fixed z-50 w-56 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        style={{ left: position.x, top: position.y }}
      >
        {/* Title */}
        <div className="truncate px-1.5 py-1 text-sm font-medium">
          {conversation.title}
        </div>

        <div className="mx-1 h-px bg-border" />

        {/* Actions */}
        {conversation.isTemporary ? (
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm select-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onConvert();
              onClose();
            }}
          >
            <Timer className="h-3.5 w-3.5 text-status-warning" />
            Make permanent
          </button>
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm select-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onConvert();
              onClose();
            }}
          >
            <Timer className="h-3.5 w-3.5" />
            Make temporary
          </button>
        )}
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm select-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => {
            onRename();
            onClose();
          }}
        >
          <PenLine className="h-3.5 w-3.5" />
          Rename
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm select-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => {
            onDuplicate();
            onClose();
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-destructive select-none hover:bg-destructive/10"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>

        <div className="mx-1 h-px bg-border" />

        {/* Stats header */}
        {/* <div className="relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground select-none opacity-50">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Conversation stats
        </div> */}

        {/* Stats rows */}
        <div className="space-y-1 px-1.5 py-1">
          <StatRow
            icon={<Clock className="h-3 w-3" />}
            label="Created"
            value={formatDate(conversation.createdAt)}
          />
          <StatRow
            icon={<Clock className="h-3 w-3" />}
            label="Last active"
            value={formatDate(conversation.updatedAt)}
          />
          <StatRow
            icon={<ArrowUpToLine className="h-3 w-3" />}
            label="Input tokens"
            value={formatNumber(conversation.totalInputTokens)}
          />
          <StatRow
            icon={<ArrowDownToLine className="h-3 w-3" />}
            label="Output tokens"
            value={formatNumber(conversation.totalOutputTokens)}
          />
          <StatRow
            icon={<MessageSquare className="h-3 w-3" />}
            label="Total tokens"
            value={formatNumber(conversation.totalInputTokens + conversation.totalOutputTokens)}
          />
        </div>

        <div className="mx-1 h-px bg-border" />

        {/* Copy stats */}
        <div
          className="relative flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm select-none hover:bg-accent hover:text-accent-foreground"
          onClick={() => {
            navigator.clipboard.writeText(
              `Conversation: ${conversation.title}\n` +
              `Created: ${conversation.createdAt}\n` +
              `Input tokens: ${conversation.totalInputTokens}\n` +
              `Output tokens: ${conversation.totalOutputTokens}`,
            );
            toast.success("Stats copied to clipboard");
            onClose();
          }}
          role="menuitem"
          tabIndex={0}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy stats
        </div>
      </div>
    </>,
    document.body,
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-muted-foreground/60 shrink-0">{icon}</span>
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function ConversationList() {
  const newChatMutation = useNewChat();
  const listId = useId();
  const reduceMotion = useReducedMotion();
  const [sectionValue, setSectionValue] = useSidebarPreference("remiai:sidebar-recents-open", "open");
  const sectionOpen = sectionValue === "open";
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data: conversationPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["sidebar-conversations"],
    queryFn: ({ pageParam }) =>
      conversationsApi.listPage({ cursor: pageParam, limit: pageParam ? 20 : 40, unlinked: true }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  // A chat can move to the top while another page is loading. De-duplicate by
  // id so a refetch never renders the same unchanged tile twice.
  const conversations = useMemo(() => {
    const seen = new Set<number>();
    return (conversationPages?.pages.flatMap((page) => page.conversations) ?? []).filter((conversation) => {
      if (seen.has(conversation.id)) return false;
      seen.add(conversation.id);
      return true;
    });
  }, [conversationPages]);

  // Filter out empty conversations (no tokens consumed) unless they're the
  // currently active conversation or actively streaming. This prevents
  // freshly created chats from cluttering the sidebar until the user
  // actually sends a message.
  const activeStreams = useActiveStreams();
  const filteredConversations = conversations.filter(
    (c) =>
      c.projectId == null && (
      c.totalInputTokens > 0 ||
      c.totalOutputTokens > 0 ||
      pathname === `/chat/${c.id}` ||
      activeStreams.has(c.id)),
  );

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!sectionOpen || !target || !hasNextPage || isFetchingNextPage || isError) return;
    let scrollRoot: Element | null = target.parentElement;
    while (scrollRoot && scrollRoot !== document.body) {
      const overflowY = window.getComputedStyle(scrollRoot).overflowY;
      if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") break;
      scrollRoot = scrollRoot.parentElement;
    }
    const root = scrollRoot === document.body ? null : scrollRoot as HTMLElement | null;
    const scrollTarget = root ?? window;
    const readyAt = performance.now() + 120;
    let userScrolled = false;
    let pendingLoad: number | null = null;
    let requested = false;

    const nearEnd = () => {
      const targetRect = target.getBoundingClientRect();
      const top = root?.getBoundingClientRect().top ?? 0;
      const bottom = root?.getBoundingClientRect().bottom ?? window.innerHeight;
      return targetRect.top <= bottom + 24 && targetRect.bottom >= top;
    };
    const needsFill = () => root
      ? root.scrollHeight <= root.clientHeight + 1
      : document.documentElement.scrollHeight <= window.innerHeight + 1;
    const scheduleLoad = () => {
      if (requested || pendingLoad !== null || !nearEnd() || (!userScrolled && !needsFill())) return;
      pendingLoad = window.setTimeout(() => {
        pendingLoad = null;
        if (!nearEnd()) return;
        requested = true;
        void fetchNextPage();
      }, 250);
    };
    const markScroll = () => {
      if (performance.now() < readyAt) return;
      userScrolled = true;
      scheduleLoad();
    };
    const markGesture = () => {
      userScrolled = true;
      scheduleLoad();
    };
    const onKeyDown = (event: Event) => {
      if (["ArrowDown", "PageDown", "End", " "].includes((event as KeyboardEvent).key)) markGesture();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) scheduleLoad();
        else if (pendingLoad !== null) {
          window.clearTimeout(pendingLoad);
          pendingLoad = null;
        }
      },
      { root, rootMargin: "0px 0px 24px 0px" },
    );
    observer.observe(target);
    scrollTarget.addEventListener("scroll", markScroll, { passive: true });
    scrollTarget.addEventListener("wheel", markGesture, { passive: true });
    scrollTarget.addEventListener("touchmove", markGesture, { passive: true });
    scrollTarget.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      scrollTarget.removeEventListener("scroll", markScroll);
      scrollTarget.removeEventListener("wheel", markGesture);
      scrollTarget.removeEventListener("touchmove", markGesture);
      scrollTarget.removeEventListener("keydown", onKeyDown);
      if (pendingLoad !== null) window.clearTimeout(pendingLoad);
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isError, sectionOpen]);

  const refreshConversationLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["sidebar-conversations"] });
  }, [queryClient]);

  // Rename state
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Single delete confirmation
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Batch select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  // Right-click context menu state
  const [contextMenuId, setContextMenuId] = useState<number | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      conversationsApi.update(id, { title }),
    onSuccess: () => {
      refreshConversationLists();
      setRenamingId(null);
      toast.success("Conversation renamed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: conversationsApi.remove,
    onSuccess: () => {
      refreshConversationLists();
      setDeletingId(null);
      toast.success("Conversation deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: conversationsApi.removeMany,
    onSuccess: () => {
      refreshConversationLists();
      setBatchDeleteConfirm(false);
      setSelectedIds(new Set());
      setSelectMode(false);
      // Navigate away if the current conversation was deleted
      const currentId = Number(pathname.split("/").pop());
      if (selectedIds.has(currentId)) {
        router.push("/chat");
      }
      toast.success(`${selectedIds.size} conversations deleted`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: conversationsApi.duplicate,
    onSuccess: (conversation) => {
      refreshConversationLists();
      router.push(`/chat/${conversation.id}`);
      toast.success("Conversation duplicated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Convert between temporary and permanent — flips the is_temporary flag.
  const convertMutation = useMutation({
    mutationFn: ({ id, temporary }: { id: number; temporary: boolean }) =>
      conversationsApi.update(id, { isTemporary: temporary }),
    onSuccess: (_, { temporary }) => {
      refreshConversationLists();
      toast.success(temporary ? "Converted to temporary chat" : "Made permanent");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const startRename = useCallback(
    (id: number, currentTitle: string) => {
      setRenamingId(id);
      setRenameValue(currentTitle);
    },
    [],
  );

  const commitRename = useCallback(() => {
    if (renamingId === null) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    renameMutation.mutate({ id: renamingId, title: trimmed });
  }, [renamingId, renameValue, renameMutation]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  // Navigate away if deleting the current conversation
  const confirmDelete = useCallback(
    (id: number) => {
      const isCurrent = pathname === `/chat/${id}`;
      deleteMutation.mutate(id, {
        onSuccess: () => {
          if (isCurrent) {
            router.push("/chat");
          }
        },
      });
    },
    [pathname, deleteMutation, router],
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === filteredConversations.length
        ? new Set<number>()
        : new Set(filteredConversations.map((c) => c.id)),
    );
  };

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // Prefetch conversation data on hover for instant navigation
  const prefetchConversation = useCallback(
    (id: number) => {
      queryClient.prefetchQuery({
        queryKey: ["conversation", id],
        queryFn: () => conversationsApi.get(id),
        staleTime: 30_000,
      });
    },
    [queryClient],
  );

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenuId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenuId(null);
        setContextMenuPos(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [contextMenuId]);

  const sectionHeader = (
    <div className="group flex items-center gap-1 px-1 pb-1.5">
      <button
        type="button"
        onClick={() => setSectionValue(sectionOpen ? "closed" : "open")}
        aria-expanded={sectionOpen}
        aria-controls={listId}
        className="flex min-h-9 min-w-0 flex-1 items-center rounded-lg px-2 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-sidebar-foreground"
      >
        Recents
      </button>
      {sectionOpen && !selectMode && filteredConversations.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setSectionValue("open");
            setSelectMode(true);
          }}
          className="invisible inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 opacity-0 transition-[opacity,visibility,color,background-color] hover:bg-sidebar-accent hover:text-foreground group-hover:visible group-hover:opacity-100 focus-visible:visible focus-visible:opacity-100"
          title="Select conversations"
          aria-label="Select conversations"
        >
          <CheckSquare className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => newChatMutation.mutate()}
        disabled={newChatMutation.isPending}
        className="invisible inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 opacity-0 transition-[opacity,visibility,color,background-color] hover:bg-sidebar-accent hover:text-foreground group-hover:visible group-hover:opacity-100 focus-visible:visible focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-50"
        title="New chat"
        aria-label="New chat"
      >
        <PenLine className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setSectionValue(sectionOpen ? "closed" : "open")}
        aria-expanded={sectionOpen}
        aria-controls={listId}
        className="invisible inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 opacity-0 transition-[opacity,visibility,color,background-color] hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover:visible group-hover:opacity-100 focus-visible:visible focus-visible:opacity-100"
        title={sectionOpen ? "Collapse recents" : "Expand recents"}
        aria-label={sectionOpen ? "Collapse recents" : "Expand recents"}
      >
        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground/70 transition-transform duration-200 ${sectionOpen ? "rotate-90" : ""}`} />
      </button>
    </div>
  );

  if (isLoading) {
    return <section>{sectionHeader}{sectionOpen && <p className="px-3 py-2 text-xs text-muted-foreground/70">Loading conversations…</p>}</section>;
  }

  if (isError && conversations.length === 0) {
    return (
      <section>{sectionHeader}{sectionOpen && <button
        type="button"
        onClick={() => refetch()}
        className="px-3 py-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Could not load conversations. Retry
      </button>}</section>
    );
  }

  if (filteredConversations.length === 0 && !hasNextPage) {
    return <section>{sectionHeader}{sectionOpen && <p className="px-3 py-2 text-xs text-muted-foreground/70">No recent chats</p>}</section>;
  }

  return (
    <section>
      {sectionHeader}
      <AnimatePresence initial={false}>
      {sectionOpen && <motion.div
        id={listId}
        initial={reduceMotion ? false : { height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeInOut" }}
        className="overflow-hidden [overflow-anchor:none]"
      >
      {/* Batch selection header */}
      {selectMode && <div className="flex items-center justify-between px-2 py-2">
        {selectMode ? (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                title={
                  selectedIds.size === filteredConversations.length
                      ? "Deselect all"
                      : "Select all"
                }
              >
                {selectedIds.size === filteredConversations.length ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} selected
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (selectedIds.size > 0) setBatchDeleteConfirm(true);
                }}
                disabled={selectedIds.size === 0}
                className="inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                {/* Delete */}
              </button>
              <button
                type="button"
                onClick={exitSelectMode}
                className="inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
            </div>
          </>
        ) : null}
      </div>}

      <div className="flex flex-col gap-1">
        {filteredConversations.map((conversation) => {
          const isActive = pathname === `/chat/${conversation.id}`;
          const isSelected = selectedIds.has(conversation.id);
          const isStreaming = activeStreams.has(conversation.id);

          return (
            <div
              key={conversation.id}
              className="relative"
              onContextMenu={(e) => {
                if (!selectMode) {
                  e.preventDefault();
                  setContextMenuId(conversation.id);
                  setContextMenuPos({ x: e.clientX, y: e.clientY });
                }
              }}
            >
                  {renamingId === conversation.id ? (
                    /* ---- Inline rename input ---- */
                    <div
                      className={cn(
                        "group/conversation flex min-h-9 w-full items-center justify-start rounded-lg px-2.5 py-1.5 text-sm text-left",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-foreground"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      )}
                    >
                      <form
                        className="flex flex-1 items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitRename();
                        }}
                      >
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") cancelRename();
                          }}
                          className="h-7 min-w-0 flex-1 px-1.5 text-sm"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          className="flex h-5 w-5 shrink-0 rounded text-muted-foreground hover:text-foreground"
                          onClick={cancelRename}
                          tabIndex={-1}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </form>
                    </div>
                  ) : selectMode ? (
                    /* ---- Select mode: whole row toggles selection ---- */
                    <div
                      className={cn(
                        "group/conversation flex min-h-9 w-full items-center justify-start rounded-lg px-2.5 py-1.5 text-sm text-left cursor-pointer",
                        isSelected && "bg-primary/10",
                      )}
                      onClick={() => toggleSelect(conversation.id)}
                    >
                      <div className="flex h-5 w-5 shrink-0 rounded text-muted-foreground">
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </div>
                      <ConversationTitle
                        title={conversation.title}
                        className={cn(
                          "ml-2 flex-1 truncate text-sm",
                          isSelected && "text-foreground font-medium",
                        )}
                      />
                    </div>
                  ) : (
                    /* ---- Normal view: the whole row is the link ---- */
                    <div className={cn("group/conversation relative flex min-h-9 w-full items-center rounded-lg text-sm text-left transition-colors", isActive ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground")}>
                    <Link
                      href={`/chat/${conversation.id}`}
                      className="flex min-w-0 flex-1 items-center px-2.5 py-1.5"
                      onMouseEnter={() => prefetchConversation(conversation.id)}
                      onFocus={() => prefetchConversation(conversation.id)}
                    >
                      {/* {isStreaming && (
                        <span className="inline-flex items-center mr-1.5">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                          </span>
                        </span>
                      )} */}
                      <ConversationTitle
                        title={conversation.title}
                        className={cn(
                          "min-w-0 flex-1 truncate transition-[padding-right] duration-300 ease-out group-hover/conversation:pr-8 group-focus-within/conversation:pr-8",
                        )}
                      />

                      {(conversation.isTemporary || isStreaming) && (
                        <span className={`ml-0.5 flex shrink-0 items-center transition-transform duration-300 ease-out group-hover/conversation:-translate-x-8 group-focus-within/conversation:-translate-x-8 ${isActive ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/75"}`}>
                          {/* Temporary badge stays flush right until the action button enters. */}
                          {conversation.isTemporary && (
                            <span
                              className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-dashed border-status-warning/50 bg-status-warning/[0.08] px-1.5 py-px text-[10px] font-medium text-foreground/80 group-hover/conversation:bg-sidebar-accent group-focus-within/conversation:bg-sidebar-accent"
                              title="Temporary chat — deleted after 30 days of inactivity"
                            >
                              <Timer className="h-2.5 w-2.5 text-status-warning" />
                              Temporary
                            </span>
                          )}

                          {/* Keep only critical state icon */}
                          {isStreaming && (
                            <span className="flex h-3 w-3 items-center justify-center" title="Generating...">
                              <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            </span>
                          )}
                        </span>
                      )}
                    </Link>
                    <button
                      type="button"
                      aria-label={`Actions for ${conversation.title}`}
                      title="Conversation actions"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenuId(conversation.id);
                        const rect = event.currentTarget.getBoundingClientRect();
                        setContextMenuPos({ x: rect.right - 224, y: rect.bottom + 4 });
                      }}
                      className="conversation-actions-button pointer-events-none absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 translate-x-2 cursor-pointer items-center justify-center rounded-md bg-sidebar-accent/80 text-muted-foreground opacity-0 shadow-none transition-[transform,opacity,background-color,color] duration-300 ease-out group-hover/conversation:pointer-events-auto group-hover/conversation:translate-x-0 group-hover/conversation:opacity-100 group-focus-within/conversation:pointer-events-auto group-focus-within/conversation:translate-x-0 group-focus-within/conversation:opacity-100 hover:bg-black/10 dark:hover:bg-black/20 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    </div>
                  )}
            </div>
          );
        })}
      </div>

      <div ref={loadMoreRef} className="flex min-h-8 items-center justify-center py-2" aria-live="polite">
        {isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Loading more conversations" />}
        {isError && (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {error instanceof Error ? "Could not load more conversations. Retry" : "Retry loading conversations"}
          </button>
        )}
      </div>
      </motion.div>}
      </AnimatePresence>

      {/* Single delete confirmation dialog */}
      <Dialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this conversation? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
              onClick={() => setDeletingId(null)}
            >
              Cancel
            </button>
            {deletingId !== null && (
              <button
                type="button"
                disabled={deleteMutation.isPending}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                onClick={() => confirmDelete(deletingId)}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Delete
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch delete confirmation dialog */}
      <Dialog
        open={batchDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) setBatchDeleteConfirm(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversations</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.size} conversations?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
              onClick={() => setBatchDeleteConfirm(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={batchDeleteMutation.isPending}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              onClick={() =>
                batchDeleteMutation.mutate(Array.from(selectedIds))
              }
            >
              {batchDeleteMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Delete {selectedIds.size} conversations
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Right-click context menu (portal) */}
      {contextMenuId !== null && contextMenuPos && (() => {
        const conversation = filteredConversations.find((c) => c.id === contextMenuId);
        if (!conversation) return null;
        return (
          <ContextMenuPortal
            conversation={conversation}
            position={contextMenuPos}
            onRename={() => startRename(conversation.id, conversation.title)}
            onDuplicate={() => duplicateMutation.mutate(conversation.id)}
            onDelete={() => setDeletingId(conversation.id)}
            onConvert={() =>
              convertMutation.mutate({
                id: conversation.id,
                temporary: !conversation.isTemporary,
              })
            }
            onClose={() => {
              setContextMenuId(null);
              setContextMenuPos(null);
            }}
          />
        );
      })()}
    </section>
  );
}
