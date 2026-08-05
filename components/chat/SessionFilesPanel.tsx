"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  X,
  Download,
  Upload,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Trash2,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Files,
  Archive,
  FileArchive,
  CopyIcon,
  Check,
} from "lucide-react";
import { sessionFilesApi, type SessionFileEntry } from "@/lib/api/session-files";
import {
  extOf,
  fileIconElement,
  formatBytes,
  highlightCode,
  buildTree,
  TEXT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  type TreeNode,
} from "@/lib/session-files/ui-utils";
import { MarkdownRenderer } from "./MarkdownRenderer";

// ── Panel component ────────────────────────────────────────────────────────

export function SessionFilesPanel({
  conversationId,
  onClose,
  focusPath,
}: {
  conversationId: number;
  onClose: () => void;
  /** When set, the panel opens straight to this file in the viewer (from session_present_file). */
  focusPath?: string | null;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SessionFileEntry | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [zipping, setZipping] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["session-files", conversationId],
    queryFn: () => sessionFilesApi.list(conversationId),
    staleTime: 10_000,
  });

  // Auto-open a presented file in the viewer. Uses the React-recommended
  // "adjust state when a prop changes" pattern (setState during render,
  // guarded by a previous-value comparison) instead of an effect, so a
  // refetch of `data` (upload, delete, refresh, AI writing another file)
  // doesn't re-select the presented file and override a file the user
  // manually clicked in the tree — each focusPath fires exactly once.
  const [handledFocus, setHandledFocus] = useState<string | null>(null);
  if (focusPath && focusPath !== handledFocus && data) {
    const target = data.files.find((f) => f.path === focusPath && f.isFile);
    if (target) {
      setHandledFocus(focusPath);
      setSelected(target);
      setConfirmDelete(null);
    }
  }

  const tree = useMemo(
    () => buildTree(data?.files ?? []),
    [data],
  );

  const fileCount = data?.files.filter((f) => f.isFile).length ?? 0;
  const totalSize = data?.files.reduce((sum, f) => sum + f.size, 0) ?? 0;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["session-files", conversationId] });

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await sessionFilesApi.upload(conversationId, file);
      }
      toast.success(
        files.length === 1 ? `Uploaded ${files[0].name}` : `Uploaded ${files.length} files`,
      );
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownloadZip = async () => {
    setZipping(true);
    try {
      // Hit the endpoint once to build the zip server-side, then download.
      const res = await fetch(sessionFilesApi.downloadZipUrl(conversationId));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create zip");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `remi-session-${conversationId}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Downloading session files…");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setZipping(false);
    }
  };

  const handleDelete = async (path: string) => {
    try {
      await sessionFilesApi.remove(conversationId, path);
      toast.success(`Deleted ${path.split("/").pop()}`);
      if (selected?.path === path) setSelected(null);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
    setConfirmDelete(null);
  };

  const toggleDir = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-border/60 bg-muted/[0.25]">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Session Files</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {fileCount > 0
              ? `${fileCount} file${fileCount === 1 ? "" : "s"} · ${formatBytes(totalSize)}`
              : "Private workspace for this chat"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close session files"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={handleDownloadZip}
          disabled={fileCount === 0 || zipping}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
        >
          {zipping ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
          Download all files
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-muted active:scale-[0.98] disabled:opacity-40"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          Upload
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Refresh"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {/* ── Body ── */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {selected ? (
          <FileViewer
            conversationId={conversationId}
            entry={selected}
            onBack={() => setSelected(null)}
            onDelete={() => {
              if (confirmDelete === selected.path) {
                handleDelete(selected.path);
              } else {
                setConfirmDelete(selected.path);
                // auto-reset the confirm state after 3s
                setTimeout(
                  () => setConfirmDelete((c) => (c === selected.path ? null : c)),
                  3000,
                );
              }
            }}
            confirmDelete={confirmDelete === selected.path}
            onCancelDelete={() => setConfirmDelete(null)}
          />
        ) : isLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-xs">Loading session files…</p>
          </div>
        ) : tree.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background">
              <Files className="h-5 w-5 text-muted-foreground/70" />
            </div>
            <div>
              <p className="text-sm font-medium">No session files yet</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Ask the AI to build something — files it creates will appear here,
                ready to view or download as a .zip.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-2">
            {tree.map((node) => (
              <TreeNodeRow
                key={node.path}
                node={node}
                depth={0}
                collapsed={collapsed}
                onToggleDir={toggleDir}
                onSelect={(entry) => setSelected(entry)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tree row ───────────────────────────────────────────────────────────────

function TreeNodeRow({
  node,
  depth,
  collapsed,
  onToggleDir,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggleDir: (path: string) => void;
  onSelect: (entry: SessionFileEntry) => void;
}) {
  const isCollapsed = collapsed.has(node.path);

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          node.isDirectory ? onToggleDir(node.path) : onSelect(node)
        }
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors",
          !node.isDirectory && "hover:bg-muted",
          node.isDirectory && "text-foreground/90",
        )}
      >
        {node.isDirectory ? (
          <>
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            {isCollapsed ? (
              <Folder className="h-4 w-4 shrink-0 text-amber-500/80" />
            ) : (
              <FolderOpen className="h-4 w-4 shrink-0 text-amber-500/80" />
            )}
          </>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {!node.isDirectory &&
          fileIconElement(
            node.name,
            false,
            "h-4 w-4 shrink-0 text-muted-foreground/70",
          )}
        <span className={cn("truncate", !node.isDirectory && "text-foreground/90")}>
          {node.name}
        </span>
        {!node.isDirectory && node.size > 0 && (
          <span className="ml-auto shrink-0 pl-2 text-[10px] tabular-nums text-muted-foreground/60">
            {formatBytes(node.size)}
          </span>
        )}
      </button>
      {node.isDirectory && !isCollapsed && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggleDir={onToggleDir}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── File viewer ────────────────────────────────────────────────────────────

function FileViewer({
  conversationId,
  entry,
  onBack,
  onDelete,
  confirmDelete,
  onCancelDelete,
}: {
  conversationId: number;
  entry: SessionFileEntry;
  onBack: () => void;
  onDelete: () => void;
  confirmDelete: boolean;
  onCancelDelete: () => void;
}) {
  const ext = extOf(entry.name);
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isMarkdown = ext === "md" || ext === "markdown";
  const isText = TEXT_EXTENSIONS.has(ext);
  const canPreview = isImage || isText || isMarkdown;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["session-file-content", conversationId, entry.path],
    queryFn: () => sessionFilesApi.content(conversationId, entry.path),
    enabled: canPreview && !isImage,
    staleTime: 30_000,
  });

  const html = useMemo(
    () => (data && isText && !isMarkdown ? highlightCode(data.content, ext) : ""),
    [data, isText, isMarkdown, ext],
  );

  const [copied, setCopied] = useState(false);

  /**
   * Copy the file's actual content to the clipboard (text/markdown files),
   * falling back to the file URL for binary files where copying raw bytes
   * as text would be useless.
   */
  const handleCopy = async () => {
    try {
      let text: string;
      if (isText || isMarkdown) {
        const res = await sessionFilesApi.content(conversationId, entry.path);
        text = res.content;
        toast.success(
          res.isTruncated
            ? `Copied first 1 MB — file is ${formatBytes(res.totalBytes)}`
            : `Copied ${entry.name} content to clipboard`,
        );
      } else {
        // Binary / no-preview file — copy the URL instead of garbage bytes.
        text = sessionFilesApi.rawUrl(conversationId, entry.path);
        toast.success("Copied file URL to clipboard");
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Viewer header */}
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to file list"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium leading-tight">{entry.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {entry.path} · {formatBytes(entry.size)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy file content"
          title="Copy file content"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <CopyIcon className="h-4 w-4" />
          )}
        </button>
        <a
          href={sessionFilesApi.rawUrl(conversationId, entry.path, true)}
          aria-label="Download file"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onDelete}
          onMouseLeave={confirmDelete ? onCancelDelete : undefined}
          className={cn(
            "flex h-7 shrink-0 items-center justify-center rounded-md transition-all active:scale-95",
            confirmDelete
              ? "w-auto gap-1 bg-destructive px-2 text-[10px] font-medium text-white hover:bg-destructive/90"
              : "w-7 text-muted-foreground hover:bg-muted hover:text-destructive",
          )}
        >
          {confirmDelete ? (
            <>
              <Trash2 className="h-3.5 w-3.5" /> Confirm
            </>
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Viewer body */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {isImage ? (
          <div className="flex items-center justify-center p-4">
            <img
              src={sessionFilesApi.rawUrl(conversationId, entry.path)}
              alt={entry.name}
              className="max-h-[50vh] rounded-lg border border-border/60 bg-background object-contain"
            />
          </div>
        ) : !canPreview ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <FileArchive className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              No preview available for this file type.
            </p>
            <a
              href={sessionFilesApi.rawUrl(conversationId, entry.path, true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-muted active:scale-[0.97]"
            >
              <Download className="h-3.5 w-3.5" />
              Download file
            </a>
          </div>
        ) : isMarkdown && data ? (
          <div className="p-3">
            <MarkdownRenderer content={data.content} />
          </div>
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="p-4 text-xs text-destructive">
            Could not load this file.
          </div>
        ) : (
          <div className="relative">
            <pre className="p-3 text-xs leading-relaxed">
              <code dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
            {data?.isTruncated && (
              <div className="sticky bottom-0 border-t border-border/60 bg-background/90 px-3 py-2 text-center text-[10px] text-muted-foreground backdrop-blur">
                Showing first 1 MB — file is {formatBytes(data.totalBytes)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
