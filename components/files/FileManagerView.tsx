"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Archive,
  ChevronDown,
  ChevronRight,
  Download,
  FilePlus2,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderInput,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { sessionFilesApi, type SessionFileEntry } from "@/lib/api/session-files";
import {
  buildTree,
  collectFolders,
  fileIconElement,
  formatBytes,
  isImageFile,
  isTextFile,
  type TreeNode,
} from "@/lib/session-files/ui-utils";
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
import { FileEditor } from "./FileEditor";

// ── Types ─────────────────────────────────────────────────────────────────

type DialogState =
  | { type: "new-file" }
  | { type: "new-folder" }
  | { type: "rename"; path: string }
  | { type: "move"; path: string }
  | { type: "delete"; path: string };

function parentPath(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? "" : p.slice(0, idx);
}

function basenameOf(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

// ── Main component ────────────────────────────────────────────────────────

export function FileManagerView({
  conversationId,
  conversationTitle,
  onBack,
  onFilesChanged,
}: {
  conversationId: number;
  conversationTitle: string;
  onBack: () => void;
  onFilesChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [activeDir, setActiveDir] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogNonce, setDialogNonce] = useState(0);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openDialog = (d: DialogState) => {
    setDialogNonce((n) => n + 1);
    setDialog(d);
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["session-files", conversationId],
    queryFn: () => sessionFilesApi.list(conversationId),
    staleTime: 10_000,
  });

  const entries = useMemo(() => data?.files ?? [], [data]);
  const tree = useMemo(() => buildTree(entries), [entries]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.path === selectedPath) ?? null,
    [entries, selectedPath],
  );

  const fileCount = entries.filter((e) => e.isFile).length;
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  const folders = useMemo(() => collectFolders(tree), [tree]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["session-files", conversationId] });

  const notifyChanged = () => {
    invalidate();
    onFilesChanged();
  };

  const textSelection =
    !!selectedEntry && selectedEntry.isFile && isTextFile(selectedEntry.name);

  const contentQuery = useQuery({
    queryKey: ["session-file-content", conversationId, selectedEntry?.path],
    queryFn: () => sessionFilesApi.content(conversationId, selectedEntry!.path),
    enabled: !!textSelection,
    staleTime: 30_000,
  });

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleSave = async (entry: SessionFileEntry, newContent: string) => {
    setSaving(true);
    try {
      await sessionFilesApi.write(conversationId, entry.path, newContent);
      toast.success(`Saved ${entry.name}`);
      queryClient.setQueryData<{ content: string } | undefined>(
        ["session-file-content", conversationId, entry.path],
        (old) => (old ? { ...old, content: newContent } : old),
      );
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await sessionFilesApi.upload(conversationId, file, activeDir || null);
      }
      toast.success(
        files.length === 1
          ? `Uploaded ${files[0].name}${activeDir ? ` to ${activeDir}/` : ""}`
          : `Uploaded ${files.length} files`,
      );
      notifyChanged();
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

  const handleNewFile = async (name: string) => {
    setDialogBusy(true);
    try {
      const target = joinPath(activeDir, name);
      await sessionFilesApi.write(conversationId, target, "");
      notifyChanged();
      setSelectedPath(target);
      setMobileDetailOpen(true);
      setDialog(null);
      toast.success(`Created ${name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setDialogBusy(false);
    }
  };

  const handleNewFolder = async (name: string) => {
    setDialogBusy(true);
    try {
      await sessionFilesApi.mkdir(conversationId, joinPath(activeDir, name));
      notifyChanged();
      setDialog(null);
      toast.success(`Created folder ${name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setDialogBusy(false);
    }
  };

  const handleRename = async (entry: SessionFileEntry, newName: string) => {
    const parent = parentPath(entry.path);
    const to = joinPath(parent, newName);
    if (to === entry.path) {
      setDialog(null);
      return;
    }
    setDialogBusy(true);
    try {
      await sessionFilesApi.move(conversationId, entry.path, to);
      notifyChanged();
      if (selectedPath === entry.path) setSelectedPath(to);
      if (activeDir === entry.path || activeDir.startsWith(`${entry.path}/`)) setActiveDir("");
      setDialog(null);
      toast.success(`Renamed to ${newName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setDialogBusy(false);
    }
  };

  const handleMove = async (entry: SessionFileEntry, destDir: string) => {
    if (destDir === parentPath(entry.path)) {
      setDialog(null);
      return;
    }
    const to = joinPath(destDir, basenameOf(entry.path));
    setDialogBusy(true);
    try {
      await sessionFilesApi.move(conversationId, entry.path, to);
      notifyChanged();
      if (selectedPath === entry.path) setSelectedPath(to);
      if (activeDir === entry.path || activeDir.startsWith(`${entry.path}/`)) setActiveDir("");
      setDialog(null);
      toast.success(`Moved to ${destDir || "root"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    } finally {
      setDialogBusy(false);
    }
  };

  const handleDelete = async (entry: SessionFileEntry) => {
    setDialogBusy(true);
    try {
      await sessionFilesApi.remove(conversationId, entry.path);
      notifyChanged();
      if (selectedPath === entry.path) {
        setSelectedPath(null);
        setMobileDetailOpen(false);
      }
      if (activeDir === entry.path || activeDir.startsWith(`${entry.path}/`)) setActiveDir("");
      setDialog(null);
      toast.success(`Deleted ${basenameOf(entry.path)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDialogBusy(false);
    }
  };

  const toggleDir = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const onRowClick = (node: TreeNode) => {
    if (node.isDirectory) {
      setActiveDir(node.path);
      setSelectedPath(node.path);
      toggleDir(node.path);
    } else {
      setSelectedPath(node.path);
    }
    setMobileDetailOpen(true);
  };

  const closeDetail = () => {
    setSelectedPath(null);
    setMobileDetailOpen(false);
  };

  const dialogEntry =
    dialog && (dialog.type === "rename" || dialog.type === "move" || dialog.type === "delete")
      ? (entries.find((e) => e.path === dialog.path) ?? null)
      : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/[0.25] px-3.5 py-2.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Back to chats"
          className="md:hidden"
        >
          <ArrowLeft />
        </Button>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center text-primary">
          <Files className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{conversationTitle}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {fileCount > 0
              ? `${fileCount} file${fileCount === 1 ? "" : "s"} · ${formatBytes(totalSize)} · chat #${conversationId}`
              : "No files yet in this chat"}
          </p>
        </div>
        <a
          href={`/chat/${conversationId}`}
          className="hidden shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
        >
          Open chat
        </a>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Refresh files"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-2">
        <Button size="sm" variant="outline" onClick={() => openDialog({ type: "new-file" })}>
          <FilePlus2 /> New file
        </Button>
        <Button size="sm" variant="outline" onClick={() => openDialog({ type: "new-folder" })}>
          <FolderPlus /> New folder
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          Upload
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownloadZip}
          disabled={fileCount === 0 || zipping}
        >
          {zipping ? <Loader2 className="animate-spin" /> : <Archive />}
          .zip
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {activeDir && (
            <span className="inline-flex max-w-[40vw] items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground sm:max-w-xs">
              <Folder className="h-3 w-3 shrink-0 text-amber-500/80" />
              <span className="truncate">into {activeDir}/</span>
              <button
                type="button"
                onClick={() => setActiveDir("")}
                aria-label="Clear target folder"
                className="text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <span className="hidden text-[10px] text-muted-foreground/60 md:inline">
            {activeDir ? `Creating/uploading into ${activeDir}/` : "Creating/uploading into root"}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* Tree */}
        <div
          className={cn(
            "shrink-0 overflow-y-auto border-r border-border/60 custom-scrollbar",
            "w-full md:w-64 lg:w-72",
            mobileDetailOpen && "hidden md:block",
          )}
        >
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-xs">Loading files…</p>
            </div>
          ) : tree.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background">
                <Files className="h-5 w-5 text-muted-foreground/70" />
              </div>
              <div>
                <p className="text-sm font-medium">No files yet</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Create a file or folder, or ask the AI in this chat to build something.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-2">
              {tree.map((node) => (
                <TreeRow
                  key={node.path}
                  node={node}
                  depth={0}
                  collapsed={collapsed}
                  activeDir={activeDir}
                  selectedPath={selectedPath}
                  onSelect={onRowClick}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail pane */}
        <div className="hidden min-w-0 flex-1 md:block">
          {selectedEntry && selectedEntry.isFile ? (
            isTextFile(selectedEntry.name) ? (
              contentQuery.isLoading || contentQuery.isError ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
                  {contentQuery.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Could not load this file."
                  )}
                </div>
              ) : (
                <FileEditor
                  key={selectedEntry.path}
                  entry={selectedEntry}
                  initialContent={contentQuery.data?.content ?? ""}
                  saving={saving}
                  deleteConfirm={deleteConfirm}
                  onSave={(v) => handleSave(selectedEntry, v)}
                  onBack={closeDetail}
                  onDownload={() => downloadEntry(conversationId, selectedEntry)}
                  onRename={() => openDialog({ type: "rename", path: selectedEntry.path })}
                  onMove={() => openDialog({ type: "move", path: selectedEntry.path })}
                  onDelete={() => {
                    if (deleteConfirm) {
                      handleDelete(selectedEntry);
                      setDeleteConfirm(false);
                    } else {
                      setDeleteConfirm(true);
                      setTimeout(() => setDeleteConfirm(false), 3000);
                    }
                  }}
                  onCancelDelete={() => setDeleteConfirm(false)}
                />
              )
            ) : (
              <NonTextPreview
                conversationId={conversationId}
                entry={selectedEntry}
                onBack={closeDetail}
                onRename={() => openDialog({ type: "rename", path: selectedEntry.path })}
                onMove={() => openDialog({ type: "move", path: selectedEntry.path })}
                onDelete={() => openDialog({ type: "delete", path: selectedEntry.path })}
              />
            )
          ) : selectedEntry && selectedEntry.isDirectory ? (
            <FolderPane
              entry={selectedEntry}
              entries={entries}
              onNewFile={() => {
                setActiveDir(selectedEntry.path);
                openDialog({ type: "new-file" });
              }}
              onNewFolder={() => {
                setActiveDir(selectedEntry.path);
                openDialog({ type: "new-folder" });
              }}
              onRename={() => openDialog({ type: "rename", path: selectedEntry.path })}
              onMove={() => openDialog({ type: "move", path: selectedEntry.path })}
              onDelete={() => openDialog({ type: "delete", path: selectedEntry.path })}
              onBack={closeDetail}
            />
          ) : (
            <EmptyPane
              fileCount={fileCount}
              totalSize={totalSize}
              onNewFile={() => openDialog({ type: "new-file" })}
              onNewFolder={() => openDialog({ type: "new-folder" })}
            />
          )}
        </div>
      </div>

      {/* Detail pane — mobile */}
      {selectedEntry && (
        <div className={cn("min-h-0 flex-1 md:hidden", !mobileDetailOpen && "hidden")}>
          {selectedEntry.isFile ? (
            isTextFile(selectedEntry.name) ? (
              contentQuery.isLoading || contentQuery.isError ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
                  {contentQuery.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Could not load this file."
                  )}
                </div>
              ) : (
                <FileEditor
                  key={selectedEntry.path}
                  entry={selectedEntry}
                  initialContent={contentQuery.data?.content ?? ""}
                  saving={saving}
                  deleteConfirm={deleteConfirm}
                  onSave={(v) => handleSave(selectedEntry, v)}
                  onBack={closeDetail}
                  onDownload={() => downloadEntry(conversationId, selectedEntry)}
                  onRename={() => openDialog({ type: "rename", path: selectedEntry.path })}
                  onMove={() => openDialog({ type: "move", path: selectedEntry.path })}
                  onDelete={() => {
                    if (deleteConfirm) {
                      handleDelete(selectedEntry);
                      setDeleteConfirm(false);
                    } else {
                      setDeleteConfirm(true);
                      setTimeout(() => setDeleteConfirm(false), 3000);
                    }
                  }}
                  onCancelDelete={() => setDeleteConfirm(false)}
                />
              )
            ) : (
              <NonTextPreview
                conversationId={conversationId}
                entry={selectedEntry}
                onBack={closeDetail}
                onRename={() => openDialog({ type: "rename", path: selectedEntry.path })}
                onMove={() => openDialog({ type: "move", path: selectedEntry.path })}
                onDelete={() => openDialog({ type: "delete", path: selectedEntry.path })}
              />
            )
          ) : (
            <FolderPane
              entry={selectedEntry}
              entries={entries}
              onNewFile={() => {
                setActiveDir(selectedEntry.path);
                openDialog({ type: "new-file" });
              }}
              onNewFolder={() => {
                setActiveDir(selectedEntry.path);
                openDialog({ type: "new-folder" });
              }}
              onRename={() => openDialog({ type: "rename", path: selectedEntry.path })}
              onMove={() => openDialog({ type: "move", path: selectedEntry.path })}
              onDelete={() => openDialog({ type: "delete", path: selectedEntry.path })}
              onBack={closeDetail}
            />
          )}
        </div>
      )}

      {/* ── Dialogs ── */}
      <NamePromptDialog
        key={`new-file-${dialogNonce}`}
        open={dialog?.type === "new-file"}
        title="New file"
        description={activeDir ? `Create a file inside ${activeDir}/` : "Create a file in the root folder"}
        placeholder="e.g. index.html"
        submitLabel="Create file"
        busy={dialogBusy}
        onClose={() => setDialog(null)}
        onSubmit={handleNewFile}
      />
      <NamePromptDialog
        key={`new-folder-${dialogNonce}`}
        open={dialog?.type === "new-folder"}
        title="New folder"
        description={activeDir ? `Create a folder inside ${activeDir}/` : "Create a folder in the root"}
        placeholder="e.g. src"
        submitLabel="Create folder"
        busy={dialogBusy}
        onClose={() => setDialog(null)}
        onSubmit={handleNewFolder}
      />
      {dialog?.type === "rename" && dialogEntry && (
        <NamePromptDialog
          key={`rename-${dialogEntry.path}-${dialogNonce}`}
          open
          title="Rename"
          description={`Rename ${basenameOf(dialogEntry.path)}`}
          initialValue={dialogEntry.name}
          placeholder="New name"
          submitLabel="Rename"
          busy={dialogBusy}
          onClose={() => setDialog(null)}
          onSubmit={(name) => handleRename(dialogEntry, name)}
        />
      )}
      {dialog?.type === "move" && dialogEntry && (
        <MoveDialog
          key={`move-${dialogEntry.path}-${dialogNonce}`}
          open
          entry={dialogEntry}
          folders={folders}
          busy={dialogBusy}
          onClose={() => setDialog(null)}
          onMove={(dest) => handleMove(dialogEntry, dest)}
        />
      )}
      {dialog?.type === "delete" && dialogEntry && (
        <DeleteConfirmDialog
          key={`delete-${dialogEntry.path}-${dialogNonce}`}
          open
          entry={dialogEntry}
          busy={dialogBusy}
          onClose={() => setDialog(null)}
          onConfirm={() => handleDelete(dialogEntry)}
        />
      )}
    </div>
  );
}

function downloadEntry(conversationId: number, entry: SessionFileEntry) {
  const a = document.createElement("a");
  a.href = sessionFilesApi.rawUrl(conversationId, entry.path, true);
  a.download = basenameOf(entry.path);
  a.click();
}

// ── Tree row ──────────────────────────────────────────────────────────────

function TreeRow({
  node,
  depth,
  collapsed,
  activeDir,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  activeDir: string;
  selectedPath: string | null;
  onSelect: (node: TreeNode) => void;
}) {
  const isCollapsed = collapsed.has(node.path);
  const isSelected = selectedPath === node.path;
  const isActive = activeDir === node.path;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node)}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors",
          isSelected ? "bg-muted text-foreground" : "text-foreground/90 hover:bg-muted/60",
          node.isDirectory && !isSelected && "text-foreground/90",
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
          <>
            <span className="w-3.5 shrink-0" />
            {fileIconElement(node.name, false, "h-4 w-4 shrink-0 text-muted-foreground/70")}
          </>
        )}
        <span className="truncate">{node.name}</span>
        {isActive && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" title="Target folder" />}
        {!node.isDirectory && node.size > 0 && (
          <span className="ml-auto shrink-0 pl-2 text-[10px] tabular-nums text-muted-foreground/60">
            {formatBytes(node.size)}
          </span>
        )}
      </button>
      {node.isDirectory && !isCollapsed && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              activeDir={activeDir}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Right-pane views ──────────────────────────────────────────────────────

function EntryHeader({
  entry,
  onBack,
  onRename,
  onMove,
  onDelete,
  extra,
}: {
  entry: SessionFileEntry;
  onBack: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-2">
      <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to file list">
        <ArrowLeft />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight">{entry.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {entry.path} · {formatBytes(entry.size)}
        </p>
      </div>
      {extra}
      <Button variant="ghost" size="icon-sm" onClick={onRename} aria-label="Rename">
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onMove} aria-label="Move">
        <FolderInput />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete" className="hover:text-destructive">
        <Trash2 />
      </Button>
    </div>
  );
}

function NonTextPreview({
  conversationId,
  entry,
  onBack,
  onRename,
  onMove,
  onDelete,
}: {
  conversationId: number;
  entry: SessionFileEntry;
  onBack: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const isImage = isImageFile(entry.name);
  return (
    <div className="flex h-full flex-col">
      <EntryHeader entry={entry} onBack={onBack} onRename={onRename} onMove={onMove} onDelete={onDelete} />
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {isImage ? (
          <div className="flex items-center justify-center p-4">
            <img
              src={sessionFilesApi.rawUrl(conversationId, entry.path)}
              alt={entry.name}
              className="max-h-[55vh] rounded-lg border border-border/60 bg-background object-contain"
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <FileTypeIcon entry={entry} />
            <div>
              <p className="text-sm font-medium">{entry.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatBytes(entry.size)} — no preview available for this file type.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => downloadEntry(conversationId, entry)}>
              <Download /> Download file
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FileTypeIcon({ entry }: { entry: SessionFileEntry }) {
  return <div className="text-muted-foreground/40">{fileIconElement(entry.name, false, "h-10 w-10")}</div>;
}

function FolderPane({
  entry,
  entries,
  onNewFile,
  onNewFolder,
  onRename,
  onMove,
  onDelete,
  onBack,
}: {
  entry: SessionFileEntry;
  entries: SessionFileEntry[];
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const directChildren = entries.filter((e) => parentPath(e.path) === entry.path);
  const subtreeSize = entries
    .filter((e) => e.isFile && (e.path === entry.path || e.path.startsWith(`${entry.path}/`)))
    .reduce((sum, e) => sum + e.size, 0);
  const itemCount = entries.filter((e) => e.path.startsWith(`${entry.path}/`)).length;

  return (
    <div className="flex h-full flex-col">
      <EntryHeader entry={entry} onBack={onBack} onRename={onRename} onMove={onMove} onDelete={onDelete} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background">
          <FolderOpen className="h-6 w-6 text-amber-500/80" />
        </div>
        <div>
          <p className="text-sm font-semibold">{entry.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {directChildren.length} item{directChildren.length === 1 ? "" : "s"} · {itemCount} total ·{" "}
            {formatBytes(subtreeSize)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={onNewFile}>
            <FilePlus2 /> New file here
          </Button>
          <Button size="sm" variant="outline" onClick={onNewFolder}>
            <FolderPlus /> New folder here
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyPane({
  fileCount,
  totalSize,
  onNewFile,
  onNewFolder,
}: {
  fileCount: number;
  totalSize: number;
  onNewFile: () => void;
  onNewFolder: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background">
        <Files className="h-5 w-5 text-muted-foreground/70" />
      </div>
      <div>
        <p className="text-sm font-medium">Select a file to view or edit it</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {fileCount > 0
            ? `${fileCount} file${fileCount === 1 ? "" : "s"} · ${formatBytes(totalSize)}`
            : "Create a file to get started."}
        </p>
      </div>
      {fileCount === 0 && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onNewFile}>
            <FilePlus2 /> New file
          </Button>
          <Button size="sm" variant="outline" onClick={onNewFolder}>
            <FolderPlus /> New folder
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Dialogs ───────────────────────────────────────────────────────────────

function NamePromptDialog({
  open,
  title,
  description,
  initialValue = "",
  placeholder,
  submitLabel,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialValue);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          placeholder={placeholder}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && !busy) onSubmit(name.trim());
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(name.trim())} disabled={!name.trim() || busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  open,
  entry,
  folders,
  busy,
  onClose,
  onMove,
}: {
  open: boolean;
  entry: SessionFileEntry;
  folders: string[];
  busy: boolean;
  onClose: () => void;
  onMove: (destDir: string) => void;
}) {
  const [dest, setDest] = useState<string | null>(null);

  // Exclude the entry itself and its own subtree from the destination list
  const movable = folders.filter(
    (f) => f !== entry.path && !f.startsWith(`${entry.path}/`),
  );
  const currentParent = parentPath(entry.path);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move “{basenameOf(entry.path)}”</DialogTitle>
          <DialogDescription>
            Choose a destination folder. New folders are created from the file tree.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-1.5 custom-scrollbar">
          <button
            type="button"
            onClick={() => setDest("")}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
              dest === "" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            <Folder className="h-4 w-4 shrink-0 text-amber-500/80" />
            <span className="truncate">Root /</span>
            {currentParent === "" && <span className="ml-auto text-[10px] text-muted-foreground/60">current</span>}
          </button>
          {movable.map((folder) => (
            <button
              key={folder}
              type="button"
              onClick={() => setDest(folder)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                dest === folder ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              <Folder className="h-4 w-4 shrink-0 text-amber-500/80" />
              <span className="truncate">{folder}/</span>
              {currentParent === folder && (
                <span className="ml-auto text-[10px] text-muted-foreground/60">current</span>
              )}
            </button>
          ))}
          {movable.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">No other folders available.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => dest !== null && onMove(dest)} disabled={dest === null || busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({
  open,
  entry,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  entry: SessionFileEntry;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{basenameOf(entry.path)}”?</DialogTitle>
          <DialogDescription>
            {entry.isDirectory
              ? `This will permanently delete the folder and everything inside it. This action cannot be undone.`
              : `This will permanently delete the file. This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
