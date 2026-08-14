"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp,
  Square,
  Sparkles,
  ListChecks,
  Paperclip,
  Upload,
  MessageCircle,
  FolderOpen,
  Laptop,
  CircleDot,
  GitCommitHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FilePickerDialog } from "./FilePickerDialog";
import { dispatchSessionFilesChanged } from "@/lib/api/session-files";
import { toast } from "sonner";
import { FileAttachmentPreview, type AttachedFile } from "./FileAttachmentPreview";
import { formatFileSize } from "@/lib/file-types";
import { conversationsApi } from "@/lib/api/conversations";
import {
  downscaleImageFile,
  isDownscalableImage,
} from "@/lib/image-utils";
import {
  registerChatInput,
  unregisterChatInput,
} from "@/lib/chat-input-registry";
import type { ChatStatus } from "ai";
import packagejson from "../../package.json";

interface PackageJson {
  name: string;
  version: string;
  author: string | { name?: string; email?: string };
  license: string;
  description?: string;
  repository?: { url?: string };
}

const packageJson = packagejson as PackageJson;

/** Generate a descriptive filename for clipboard items that lack one. */
function getClipboardFileName(file: File): string {
  if (file.name) return file.name;

  // Clipboard screenshots (macOS Cmd+Shift+4, Windows Win+Shift+S) often
  // have an empty name AND empty type — default to PNG for this common case.
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const type = file.type;

  if (!type) {
    // No MIME type info and no name — almost certainly a clipboard screenshot
    return `Screenshot-${ts}.png`;
  }

  if (type.startsWith("image/")) {
    const extMap: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    const ext = extMap[type] || ".png";
    return `Screenshot-${ts}${ext}`;
  }

  return `Clipboard-${ts}`;
}

/**
 * Extract File objects from clipboard items, giving them proper names if
 * missing (e.g. screenshots).
 */
function getClipboardFiles(fileItems: DataTransferItem[]): File[] {
  const files: File[] = [];
  for (const item of fileItems) {
    const rawFile = item.getAsFile();
    if (!rawFile) continue;

    const name = getClipboardFileName(rawFile);
    // File objects from clipboard are immutable — create a new one with
    // a proper name so the upload API and preview display correctly.
    files.push(
      name !== rawFile.name
        ? new File([rawFile], name, { type: rawFile.type || "image/png" })
        : rawFile,
    );
  }
  return files;
}

const LINE_HEIGHT = 24;
const MAX_LINES = 3;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;
// Must stay in sync with the server's MAX_FILES_PER_REQUEST
// (app/api/chat/upload/route.ts).
const MAX_ATTACHMENTS = 25;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
/**
 * Pasting plain text longer than this would balloon the composer (and the
 * message payload) — instead it is attached automatically as a .txt file.
 */
const MAX_PASTE_TEXT_CHARS = 10_000;

export type ChatMode = "chat" | "goal" | "plan";

export function ChatInput({
  conversationId,
  status,
  disabled,
  mode,
  onModeChange,
  onSend,
  onStop,
  large,
}: {
  conversationId: number;
  status: ChatStatus;
  disabled?: boolean;
  mode?: ChatMode;
  onModeChange?: (value: ChatMode) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Larger, centered "new chat" composer (code-editor style). */
  large?: boolean;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const [appVersion, setAppVersion] = useState(packageJson.version);
  const [bashMode, setBashMode] = useState<"sandboxed" | "full">("sandboxed");

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    try {
      const electronApi = (window as Window & {
        electronAPI?: { getAppInfo?: () => Promise<{ version: string }> };
      }).electronAPI;
      if (electronApi?.getAppInfo) {
        electronApi
          .getAppInfo()
          .then((info) => {
            if (info?.version) {
              setAppVersion(`v${info.version}`);
            }
          })
          .catch(() => {
            // ignore and keep default
          });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    conversationsApi.get(conversationId)
      .then(({ conversation }) => setBashMode(conversation.bashMode ?? "sandboxed"))
      .catch(() => {});
  }, [conversationId]);

  const toggleBashMode = useCallback(() => {
    const next = bashMode === "sandboxed" ? "full" : "sandboxed";
    setBashMode(next);
    conversationsApi.update(conversationId, { bashMode: next }).catch(() => {
      setBashMode(bashMode);
      toast.error("Couldn't update Bash access mode");
    });
  }, [bashMode, conversationId]);

  // Register this textarea so the global "/" shortcut can focus it.
  // Capture the element up front — React nulls refs before effect cleanups
  // run, so `inputRef.current` would be null in the cleanup otherwise.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    registerChatInput(el);
    return () => unregisterChatInput(el);
  }, []);

  // Focus input when not disabled
  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  // Auto-resize textarea
  const resize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  };

  useEffect(() => {
    resize();
  }, [text]);

  // -----------------------------------------------------------------------
  // File selection from dialog
  // -----------------------------------------------------------------------

  const handleFileSelect = useCallback(
    (displayText: string) => {
      const el = inputRef.current;
      const cursorPos = el?.selectionStart ?? text.length;

      // Insert the file marker at cursor position
      const before = text.slice(0, cursorPos);
      const after = text.slice(cursorPos);
      const newText = before + displayText + after;

      setText(newText);
      setFileDialogOpen(false);

      // Restore focus and cursor after insertion
      requestAnimationFrame(() => {
        el?.focus();
        const newCursorPos = cursorPos + displayText.length;
        el?.setSelectionRange(newCursorPos, newCursorPos);
        resize();
      });
    },
    [text],
  );

  // -----------------------------------------------------------------------
  // Local file attachment handling (pick, drop, paste)
  // -----------------------------------------------------------------------

  /** Open the native file picker */
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Upload a batch of files to the server in a single request.
   * All files are appended as "files" in the FormData, and the server
   * returns an array of results matched by filename order.
   */
  const uploadBatch = useCallback(
    (items: AttachedFile[]) => {
      if (items.length === 0) return;

      const itemIds = new Set(items.map((i) => i.id));

      // Mark all as uploading with initial progress
      setAttachedFiles((prev) =>
        prev.map((f) =>
          itemIds.has(f.id)
            ? { ...f, status: "uploading" as const, progress: 0 }
            : f,
        ),
      );

      const formData = new FormData();
      formData.append("conversationId", String(conversationId));
      for (const item of items) {
        formData.append("files", item.file);
      }

      const xhr = new XMLHttpRequest();

      // Track overall upload progress — update all files in the batch with the same %
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setAttachedFiles((prev) =>
            prev.map((f) =>
              itemIds.has(f.id) ? { ...f, progress: pct } : f,
            ),
          );
        }
      });

      // Handle completion
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            const uploadedFiles: { name: string; url: string }[] =
              data.files ?? [];

            setAttachedFiles((prev) =>
              prev.map((f) => {
                if (!itemIds.has(f.id)) return f;
                const match = uploadedFiles.find(
                  (u) => u.name === f.file.name,
                );
                if (match) {
                  return {
                    ...f,
                    status: "uploaded" as const,
                    url: match.url,
                  };
                }
                return {
                  ...f,
                  status: "error" as const,
                  error: "Upload failed — file not returned",
                };
              }),
            );

            // Uploads are saved into the session sandbox — let an open session
            // files panel know so it refreshes and shows them automatically.
            dispatchSessionFilesChanged();
          } catch {
            setAttachedFiles((prev) =>
              prev.map((f) =>
                itemIds.has(f.id)
                  ? {
                      ...f,
                      status: "error" as const,
                      error: "Invalid server response",
                    }
                  : f,
              ),
            );
          }
        } else {
          // Server returned an error
          try {
            const data = JSON.parse(xhr.responseText);
            const errorMsg = data.error ?? `Upload failed (${xhr.status})`;
            setAttachedFiles((prev) =>
              prev.map((f) =>
                itemIds.has(f.id)
                  ? { ...f, status: "error" as const, error: errorMsg }
                  : f,
              ),
            );
          } catch {
            setAttachedFiles((prev) =>
              prev.map((f) =>
                itemIds.has(f.id)
                  ? {
                      ...f,
                      status: "error" as const,
                      error: `Upload failed (${xhr.status})`,
                    }
                  : f,
              ),
            );
          }
        }
      });

      // Handle network error
      xhr.addEventListener("error", () => {
        setAttachedFiles((prev) =>
          prev.map((f) =>
            itemIds.has(f.id)
              ? { ...f, status: "error" as const, error: "Network error" }
              : f,
          ),
        );
      });

      // Handle abort
      xhr.addEventListener("abort", () => {
        setAttachedFiles((prev) =>
          prev.map((f) =>
            itemIds.has(f.id)
              ? { ...f, status: "error" as const, error: "Upload cancelled" }
              : f,
          ),
        );
      });

      xhr.open(
        "POST",
        `/api/chat/upload?conversationId=${conversationId}`,
      );
      xhr.send(formData);
    },
    [conversationId],
  );

  /**
   * Add files to the attachment list and start uploading in a single batch.
   * Returns the attachments actually added (or undefined if none were), so
   * callers can reference them (e.g. for an undo action).
   */
  const addFiles = useCallback(
    (newFiles: File[]): AttachedFile[] | undefined => {
      // Validate each file — show a toast for oversized files
      const oversized: File[] = [];
      const valid = newFiles.filter((f) => {
        if (f.size > MAX_FILE_SIZE) {
          oversized.push(f);
          return false;
        }
        if (f.size === 0) return false;
        return true;
      });

      // Show toast for each oversized file
      for (const file of oversized) {
        toast.error(
          `"${file.name}" is ${formatFileSize(file.size)} — exceeds the 20 MB limit`,
        );
      }

      if (valid.length === 0) return undefined;

      // Enforce the per-batch cap by ADDING what fits and telling the user
      // what was dropped — a pick of 12+ photos must never fail silently or
      // discard the whole selection.
      const remaining = Math.max(0, MAX_ATTACHMENTS - attachedFiles.length);
      const accepted = valid.slice(0, remaining);
      const dropped = valid.length - accepted.length;

      if (accepted.length === 0) {
        toast.error(
          `You can attach up to ${MAX_ATTACHMENTS} files per message.`,
        );
        return undefined;
      }

      if (dropped > 0) {
        toast.warning(
          `Added ${accepted.length} of ${valid.length} files — the limit is ${MAX_ATTACHMENTS} attachments per message.`,
          { duration: 6000 },
        );
      }

      const attached: AttachedFile[] = accepted.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        mimeType: f.type || "application/octet-stream",
        size: f.size,
        status: "pending" as const,
      }));

      setAttachedFiles((prev) => [...prev, ...attached]);

      // Downscale images in the background (keeps upload bandwidth, sandbox
      // storage, and the base64 model payload small), then upload the whole
      // batch in one request. Cards show "Preparing…" meanwhile. Processed
      // one at a time so a dozen large photos don't decode into memory all
      // at once on a phone.
      void (async () => {
        const ready: AttachedFile[] = [];
        for (const a of attached) {
          if (!isDownscalableImage(a.mimeType)) {
            ready.push(a);
            continue;
          }
          const downscaled = await downscaleImageFile(a.file);
          if (downscaled === a.file) {
            ready.push(a);
            continue;
          }
          const updated: AttachedFile = {
            ...a,
            file: downscaled,
            mimeType: downscaled.type,
            size: downscaled.size,
          };
          // Swap the preview/send source to the compressed file.
          setAttachedFiles((prev) =>
            prev.map((f) => (f.id === a.id ? updated : f)),
          );
          ready.push(updated);
        }
        uploadBatch(ready);
      })();

      return attached;
    },
    [attachedFiles.length, uploadBatch],
  );

  /** Handle file selection from native picker */
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      addFiles(Array.from(fileList));
      // Reset so the same file can be selected again
      e.target.value = "";
    },
    [addFiles],
  );

  /** Remove an attached file */
  const removeFile = useCallback((id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /**
   * Insert text at the current cursor position, restoring focus and the
   * cursor afterwards. Used for non-file clipboard text.
   */
  const insertAtCursor = useCallback(
    (textToInsert: string) => {
      const el = inputRef.current;
      if (!el) return;
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const before = text.slice(0, start);
      const after = text.slice(end);
      const newText = before + textToInsert + after;
      setText(newText);
      requestAnimationFrame(() => {
        el.focus();
        const newCursor = start + textToInsert.length;
        el.setSelectionRange(newCursor, newCursor);
        resize();
      });
    },
    [text],
  );

  // -----------------------------------------------------------------------
  // Drag & drop handlers
  // -----------------------------------------------------------------------

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    [addFiles],
  );

  // -----------------------------------------------------------------------
  // Paste handler (Ctrl+V / Cmd+V for clipboard images/files)
  // -----------------------------------------------------------------------

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);
      const fileItems = items.filter((item) => item.kind === "file");
      const pastedText = e.clipboardData.getData("text");

      // Oversized text would break the composer and bloat the message — attach
      // it as a .txt file instead of inserting it into the textarea.
      if (pastedText.length > MAX_PASTE_TEXT_CHARS) {
        e.preventDefault();

        const ts = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const textFile = new File([pastedText], `Pasted-${ts}.txt`, {
          type: "text/plain",
        });

        // Keep any clipboard files (e.g. images) that came along too.
        const files = [textFile, ...getClipboardFiles(fileItems)];

        const attached = addFiles(files);
        const textAttached =
          attached?.some((f) => f.file === textFile) ?? false;

        // If the text file couldn't be attached (e.g. the 10-attachment limit
        // is reached), fall back to inserting it inline rather than silently
        // dropping the user's paste.
        if (!textAttached) {
          insertAtCursor(pastedText);
        }

        toast(
          `Pasted text was too long (${pastedText.length.toLocaleString()} chars) — attached as a file instead.`,
          {
            duration: 6000,
            action: textAttached && attached
              ? {
                  label: "Undo",
                  onClick: () => {
                    for (const f of attached) removeFile(f.id);
                  },
                }
              : undefined,
          },
        );
        return;
      }

      if (fileItems.length > 0) {
        const files = getClipboardFiles(fileItems);

        if (files.length > 0) {
          e.preventDefault(); // prevent binary garbage in textarea

          // Notify the user that a clipboard image was detected
          if (files.length === 1 && files[0].type.startsWith("image/")) {
            // toast.success("Screenshot detected — attaching...", {
            //   duration: 2000,
            // });
            // Better commented out now.
          }

          // If there's also text content, insert it manually
          if (pastedText) {
            insertAtCursor(pastedText);
          }

          // Add files to attachments
          addFiles(files);
        }
      }
    },
    [addFiles, insertAtCursor, removeFile],
  );

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const canSend =
    !disabled &&
    !isStreaming &&
    (text.trim().length > 0 || attachedFiles.some((f) => f.status === "uploaded"));

  const submit = useCallback(() => {
    // Never send while a response is in flight — stop is the only action then.
    if (disabled || isStreaming) return;

    const uploadedFiles = attachedFiles.filter((f) => f.status === "uploaded");
    const hasAttachments = uploadedFiles.length > 0;

    if (hasAttachments) {
      let fileText = "";
      for (const file of uploadedFiles) {
        if (file.url) {
          if (file.mimeType.startsWith("image/")) {
            fileText += `![${file.file.name}](${file.url})\n\n`;
          } else {
            fileText += `[${file.file.name}](${file.url})\n\n`;
          }
        }
      }

      const finalText = text.trim()
        ? `${text.trim()}\n\n${fileText}`.trim()
        : fileText.trim();

      if (finalText) {
        onSend(finalText);
        setText("");
        setAttachedFiles([]);
        requestAnimationFrame(() => {
          resize();
          inputRef.current?.focus();
        });
      }
    } else if (text.trim()) {
      onSend(text.trim());
      setText("");
      requestAnimationFrame(() => {
        resize();
        inputRef.current?.focus();
      });
    }
  }, [disabled, isStreaming, attachedFiles, text, onSend, resize]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming) submit();
      }
    },
    [submit, isStreaming],
  );

  const modeLabel =
    mode === "goal"
      ? "Goal"
      : mode === "plan"
        ? "Plan"
        : "Chat";

  // -----------------------------------------------------------------------
  // Render — ChatGPT-style dock: same column width as messages, toolbar row
  // -----------------------------------------------------------------------

  const iconBtn = large ? "h-9 w-9" : "h-8 w-8";
  const sendBtn = large ? "h-10 w-10" : "h-8 w-8";

  return (
    <div
      className={cn(
        "relative mx-auto w-full px-4 pb-3 pt-1 md:px-6",
        large ? "max-w-2xl" : "max-w-3xl",
      )}
    >
      {/* Fade blend above the box — only needed when docked over messages */}
      {!large && (
        <div className="pointer-events-none absolute inset-x-4 -top-5 z-10 h-5 bg-linear-to-b from-transparent to-background/90 md:inset-x-6" />
      )}

      {/* Compact context row */}
      {attachedFiles.length == 0 && (
        <div className="mb-1.5 hidden items-center gap-2 px-1 text-[11px] text-muted-foreground/70 md:flex">
          {/* <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">Workspace</span>
          <span className="text-border">·</span> */}
          <Laptop className="ml-5 h-3 w-3 shrink-0" />
          <span className="truncate">{modeLabel} mode</span>
          <span className="text-border">·</span>
          <GitCommitHorizontal className="h-3 w-3 shrink-0" />
          <span className="tabular-nums">{appVersion}</span>
        </div>
      )}

      <div className="relative" onDragEnter={handleDragEnter}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.json,.js,.ts,.py,.html,.css,.md,.xml,.zip,.yaml,.yml,.toml,.log"
          className="hidden"
          onChange={handleFileInputChange}
          aria-hidden="true"
        />

        <FilePickerDialog
          open={fileDialogOpen}
          onOpenChange={setFileDialogOpen}
          onSelect={handleFileSelect}
        />

        <AnimatePresence>
          {attachedFiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="mb-2"
            >
              <FileAttachmentPreview
                files={attachedFiles}
                onRemove={removeFile}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* {(mode === "goal" || mode === "plan") && !isStreaming && (
          <div className="mb-1.5 px-1 text-[11px] font-medium text-primary/80">
            {mode === "goal"
              ? "Goal mode — works until the task is complete"
              : "Plan mode — plans without writing files"}
          </div>
        )} */}

        <div
          className={cn(
            "relative flex flex-col rounded-3xl border border-border/70 bg-surface-1 transition-colors duration-200",
            large && "focus-within:border-primary/60",
            isDragging && "border-primary/45 bg-primary/[0.03]",
            isStreaming && "opacity-95",
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className={large ? "px-2 pt-4" : "px-3.5 pt-3"}>
            <Textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                disabled
                  ? "Pick a model to start chatting"
                  : isStreaming
                    ? "Remi is responding…"
                    : "Message Remi..."
              }
              disabled={disabled}
              className={cn(
                "max-h-18 resize-none border-none bg-transparent! py-0 leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent!",
                large ? "min-h-11 text-[17px]" : "min-h-[28px]",
              )}
              rows={1}
            />
          </div>

          {/* Toolbar — ChatGPT-style bottom control row */}
          <div
            className={cn(
              "flex items-center gap-1",
              large ? "px-3 pb-3 pt-2" : "px-2 pb-2 pt-1.5",
            )}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={openFilePicker}
                    disabled={disabled || isStreaming}
                    className={cn(
                      "flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      iconBtn,
                      (disabled || isStreaming) && "pointer-events-none opacity-40",
                    )}
                    aria-label="Upload a file"
                  />
                }
              >
                <Upload className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="top">Upload from computer</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setFileDialogOpen(true)}
                    disabled={disabled || isStreaming}
                    className={cn(
                      "flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      iconBtn,
                      (disabled || isStreaming) && "pointer-events-none opacity-40",
                    )}
                    aria-label="Attach from directories"
                  />
                }
              >
                <Paperclip className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="top">Attach from directories</TooltipContent>
            </Tooltip>

            {onModeChange && (
              <div className="ml-0.5 flex items-center rounded-full border border-border/50 bg-muted/25 p-0.5">
                {(
                  [
                    { id: "chat" as const, icon: MessageCircle, tip: "Chat" },
                    { id: "goal" as const, icon: Sparkles, tip: "Goal" },
                    { id: "plan" as const, icon: ListChecks, tip: "Plan" },
                  ] as const
                ).map(({ id, icon: Icon, tip }) => (
                  <Tooltip key={id}>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => onModeChange(id)}
                          disabled={disabled || isStreaming}
                          className={cn(
                            "flex items-center gap-1 rounded-full font-medium transition-colors",
                            large
                              ? "h-8 px-2.5 text-xs"
                              : "h-7 px-2 text-[11px]",
                            mode === id
                              ? "bg-accent text-foreground transition-colors hover:bg-accent/90"
                              : "text-muted-foreground hover:text-foreground",
                            (disabled || isStreaming) &&
                              "pointer-events-none opacity-40",
                          )}
                        />
                      }
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tip}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top">{tip} mode</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}

            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={toggleBashMode}
                    disabled={disabled || isStreaming}
                    className={cn(
                      // Height matches the mode selector pill exactly: the plan
                      // pill is button h-7/h-8 + p-0.5 (4px), so this needs
                      // h-8/h-9 to line up at 32px / 36px.
                      "ml-1 flex items-center rounded-full border px-2 font-medium transition-colors",
                      large ? "h-9 text-xs" : "h-8 text-[11px]",
                      bashMode === "full" ? "border-status-warning/50 bg-status-warning/10 text-status-warning" : "border-border/50 text-muted-foreground hover:text-foreground",
                      (disabled || isStreaming) && "pointer-events-none opacity-40",
                    )}
                    aria-label={`Bash access: ${bashMode}`}
                  />
                }
              >
                Bash: {bashMode === "full" ? "Full" : "Safe"}
              </TooltipTrigger>
              <TooltipContent side="top">{bashMode === "full" ? "Full device access enabled. Click to return to sandboxed." : "Sandboxed to permitted directories. Click to enable full device access."}</TooltipContent>
            </Tooltip>

            <div className="flex-1" />

            {isStreaming ? (
              <Button
                type="button"
                size="icon"
                className={cn("shrink-0 rounded-full", sendBtn)}
                onClick={onStop}
                aria-label="Stop generating"
              >
                <Square className="h-3 w-3 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className={cn("shrink-0 rounded-full", sendBtn)}
                disabled={!canSend}
                onClick={submit}
                aria-label="Send message"
              >
                <ArrowUp
                  className={large ? "h-5 w-5" : "h-4 w-4"}
                />
              </Button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn(
                "absolute inset-0 z-50 flex items-center justify-center",
                "rounded-3xl border-2 border-dashed border-primary/40",
                "bg-background/85 backdrop-blur-sm",
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <p className="text-sm font-medium text-foreground/80">
                Drop files here
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
