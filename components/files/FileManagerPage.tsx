"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileText, Folder, Loader2, Search, MessageSquare, RefreshCw } from "lucide-react";
import Link from "next/link";
import { sessionFilesApi } from "@/lib/api/session-files";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/session-files/ui-utils";
import { Input } from "@/components/ui/input";
import { FileManagerView } from "./FileManagerView";

export function FileManagerPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["session-files-overview"],
    queryFn: () => sessionFilesApi.overview(),
    staleTime: 15_000,
  });

  const conversations = useMemo(() => data?.conversations ?? [], [data]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null); // mobile navigation
  const [query, setQuery] = useState("");
  const [onlyWithFiles, setOnlyWithFiles] = useState(true);

  // Derive a sensible default selection (first chat with files) without
  // needing an effect — the user's explicit choice always wins.
  const defaultSelection =
    conversations.find((c) => c.fileCount > 0) ?? conversations[0] ?? null;
  const effectiveSelectedId = selectedId ?? defaultSelection?.id ?? null;

  const selectedConversation =
    conversations.find((c) => c.id === (openId ?? effectiveSelectedId)) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (onlyWithFiles && c.fileCount === 0) return false;
      if (q && !c.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [conversations, query, onlyWithFiles]);

  const totalFiles = conversations.reduce((s, c) => s + c.fileCount, 0);
  const totalBytes = conversations.reduce((s, c) => s + c.totalSize, 0);

  const handleFilesChanged = () => {
    queryClient.invalidateQueries({ queryKey: ["session-files-overview"] });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/[0.25] px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center text-primary">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight">Files</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${conversations.length} chat${conversations.length === 1 ? "" : "s"} · ${totalFiles} file${totalFiles === 1 ? "" : "s"} · ${formatBytes(totalBytes)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["session-files-overview"] })}
          disabled={isFetching}
          aria-label="Refresh"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* Conversation list */}
        <aside
          className={cn(
            "flex w-full shrink-0 flex-col border-r border-border/60 md:w-72",
            openId !== null && "hidden md:flex",
          )}
        >
          <div className="space-y-2 border-b border-border/60 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats…"
                className="pl-8"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 px-1 text-[11px] text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={onlyWithFiles}
                onChange={(e) => setOnlyWithFiles(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              Only chats with files
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-1.5">
            {isLoading ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-xs">Loading chats…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-5 py-10 text-center">
                <Folder className="h-8 w-8 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">No chats found</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {conversations.length === 0
                      ? "Start a conversation to get its own file workspace."
                      : "Try a different search or toggle the filter."}
                  </p>
                </div>
                {conversations.length === 0 && (
                  <Link
                    href="/chat"
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Start chatting
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {filtered.map((c) => {
                  const active = c.id === (openId ?? effectiveSelectedId);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(c.id);
                        setOpenId(c.id);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          c.fileCount > 0
                            ? "text-primary"
                            : "text-muted-foreground/60",
                        )}
                      >
                        {c.fileCount > 0 ? (
                          <FileText className="h-4 w-4" />
                        ) : (
                          <Folder className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{c.title}</p>
                        <p className="truncate text-[10px] text-muted-foreground/70">
                          {c.fileCount > 0
                            ? `${c.fileCount} file${c.fileCount === 1 ? "" : "s"} · ${formatBytes(c.totalSize)}`
                            : "No files yet"}
                        </p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* File manager */}
        <div
          className={cn(
            "min-w-0 flex-1",
            openId === null && "hidden md:block",
          )}
        >
          {selectedConversation ? (
            <FileManagerView
              key={selectedConversation.id}
              conversationId={selectedConversation.id}
              conversationTitle={selectedConversation.title}
              onBack={() => setOpenId(null)}
              onFilesChanged={handleFilesChanged}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <Folder className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">Select a chat to manage its files</p>
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                Every conversation has its own private file workspace that the AI can read and write.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


