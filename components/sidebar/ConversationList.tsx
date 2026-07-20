"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Info,
  MessageSquare,
  ArrowUpToLine,
  ArrowDownToLine,
  Clock,
} from "lucide-react";
import { conversationsApi, type Conversation } from "@/lib/api/conversations";
import { toast } from "sonner";
import { useActiveStreams } from "@/lib/chat/streaming-context";

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
  onClose,
}: {
  conversation: Conversation;
  position: { x: number; y: number };
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
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: conversationsApi.list,
  });

  // Filter out empty conversations (no tokens consumed) unless they're the
  // currently active conversation or actively streaming. This prevents
  // freshly created chats from cluttering the sidebar until the user
  // actually sends a message.
  const activeStreams = useActiveStreams();
  const filteredConversations = conversations.filter(
    (c) =>
      c.totalInputTokens > 0 ||
      c.totalOutputTokens > 0 ||
      pathname === `/chat/${c.id}` ||
      activeStreams.has(c.id),
  );

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
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setRenamingId(null);
      toast.success("Conversation renamed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: conversationsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setDeletingId(null);
      toast.success("Conversation deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: conversationsApi.removeMany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push(`/chat/${conversation.id}`);
      toast.success("Conversation duplicated");
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

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredConversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredConversations.map((c) => c.id)));
    }
  }, [filteredConversations, selectedIds]);

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

  if (filteredConversations.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground/70">
        No conversations yet
      </p>
    );
  }

  return (
    <>
      {/* Batch selection header */}
      <div className="flex items-center justify-between px-2 py-1">
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
        ) : (
          <>
            <span className="text-xs uppercase tracking-wide text-muted-foreground/60">
              Chats
            </span>
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Select
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
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
              <div
                className={cn(
                  "group/conversation flex w-full items-center justify-start rounded-md px-2 py-1.5 text-sm text-left",
                  isActive && !selectMode
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  selectMode && isSelected && "bg-primary/10",
                  selectMode && "cursor-pointer",
                  (!selectMode) && "cursor-default",
                )}
                onClick={
                  selectMode ? () => toggleSelect(conversation.id) : undefined
                }
              >
                  {renamingId === conversation.id ? (
                    /* ---- Inline rename input ---- */
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
                        className="h-6 min-w-0 flex-1 px-1 text-sm"
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
                  ) : selectMode ? (
                    /* ---- Select mode: checkbox + title ---- */
                    <>
                      <div className="flex h-5 w-5 shrink-0 rounded text-muted-foreground">
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </div>
                      <span
                        className={cn(
                          "ml-2 flex-1 truncate text-sm",
                          isSelected && "text-foreground font-medium",
                        )}
                      >
                        {conversation.title}
                      </span>
                    </>
                  ) : (
                    /* ---- Normal link view with prefetch on hover ---- */
                    <>
                      <Link
                        href={`/chat/${conversation.id}`}
                        className="flex-1 truncate"
                        onMouseEnter={() => prefetchConversation(conversation.id)}
                        onFocus={() => prefetchConversation(conversation.id)}
                      >
                        {isStreaming && (
                          <span className="inline-flex items-center mr-1.5">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                            </span>
                          </span>
                        )}
                        {conversation.title}
                      </Link>

                      {/* Hover actions (hide when streaming) */}
                      <div
                        className={cn(
                          "flex shrink-0 items-center gap-0.5 transition-opacity",
                          isStreaming
                            ? "opacity-100"
                            : "opacity-0 group-hover/conversation:opacity-100",
                        )}
                      >
                        {isStreaming ? (
                          <span className="flex h-6 w-6 items-center justify-center" title="Generating...">
                            <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                          </span>
                        ) : (
                          <>
                            <span
                              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                startRename(conversation.id, conversation.title);
                              }}
                              role="button"
                              tabIndex={-1}
                              title="Rename"
                            >
                              <PenLine className="h-3 w-3" />
                            </span>
                            <span
                              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                duplicateMutation.mutate(conversation.id);
                              }}
                              role="button"
                              tabIndex={-1}
                              title="Duplicate"
                            >
                              <Copy className="h-3 w-3" />
                            </span>
                            <span
                              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDeletingId(conversation.id);
                              }}
                              role="button"
                              tabIndex={-1}
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
            </div>
          );
        })}
      </div>

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
            onClose={() => {
              setContextMenuId(null);
              setContextMenuPos(null);
            }}
          />
        );
      })()}
    </>
  );
}
