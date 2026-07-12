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
import { PenLine, Trash2, Check, X, Loader2 } from "lucide-react";
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

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  if (conversations.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground/70">
        No conversations yet
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {conversations.map((conversation) => {
          const isActive = pathname === `/chat/${conversation.id}`;

          return (
            <div
              key={conversation.id}
              className={cn(
                "group/conversation relative flex items-center rounded-md px-2 py-1.5 text-sm",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
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

      {/* Delete confirmation dialog */}
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
    </>
  );
}
