"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { conversationsApi } from "@/lib/api/conversations";
import { toast } from "sonner";

export function ConversationList() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: conversationsApi.list,
  });

  // Rename state
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Single delete confirmation
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Batch select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

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
    if (selectedIds.size === conversations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(conversations.map((c) => c.id)));
    }
  }, [conversations, selectedIds]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  if (conversations.length === 0) {
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
                  selectedIds.size === conversations.length
                    ? "Deselect all"
                    : "Select all"
                }
              >
                {selectedIds.size === conversations.length ? (
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
                Delete
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
        {conversations.map((conversation) => {
          const isActive = pathname === `/chat/${conversation.id}`;
          const isSelected = selectedIds.has(conversation.id);

          return (
            <div
              key={conversation.id}
              className={cn(
                "group/conversation relative flex items-center rounded-md px-2 py-1.5 text-sm",
                isActive && !selectMode
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                selectMode && isSelected && "bg-primary/10",
                selectMode && "cursor-pointer",
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
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    onClick={cancelRename}
                    tabIndex={-1}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </form>
              ) : selectMode ? (
                /* ---- Select mode: checkbox + title ---- */
                <>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground">
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
                /* ---- Normal link view ---- */
                <>
                  <Link
                    href={`/chat/${conversation.id}`}
                    className="flex-1 truncate"
                  >
                    {conversation.title}
                  </Link>

                  {/* Hover actions */}
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/conversation:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        startRename(conversation.id, conversation.title);
                      }}
                      title="Rename"
                    >
                      <PenLine className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        duplicateMutation.mutate(conversation.id);
                      }}
                      title="Duplicate"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        setDeletingId(conversation.id);
                      }}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
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
    </>
  );
}
