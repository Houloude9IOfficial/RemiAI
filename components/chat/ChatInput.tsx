"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp,
  Square,
  Target,
  Sparkles,
  Paperclip,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FilePickerDialog } from "./FilePickerDialog";
import { toast } from "sonner";
import { FileAttachmentPreview, type AttachedFile } from "./FileAttachmentPreview";
import { formatFileSize } from "@/lib/file-types";
import type { ChatStatus } from "ai";

const LINE_HEIGHT = 24;
const MAX_LINES = 3;
const MAX_HEIGHT = LINE_HEIGHT * MAX_LINES;
const MAX_ATTACHMENTS = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export function ChatInput({
  conversationId,
  status,
  disabled,
  agentic,
  onAgenticChange,
  onSend,
  onStop,
}: {
  conversationId: number;
  status: ChatStatus;
  disabled?: boolean;
  agentic?: boolean;
  onAgenticChange?: (value: boolean) => void;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const isStreaming = status === "streaming" || status === "submitted";

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

  /** Add files to the attachment list and start uploading in a single batch */
  const addFiles = useCallback(
    (newFiles: File[]) => {
      // Validate count
      if (attachedFiles.length + newFiles.length > MAX_ATTACHMENTS) {
        return;
      }

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

      if (valid.length === 0) return;

      const attached: AttachedFile[] = valid.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        mimeType: f.type || "application/octet-stream",
        size: f.size,
        status: "pending" as const,
      }));

      setAttachedFiles((prev) => [...prev, ...attached]);

      // Upload all files in a single batch request
      uploadBatch(attached);
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
  // Paste handler (Ctrl+V for clipboard images/files)
  // -----------------------------------------------------------------------

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);
      const fileItems = items.filter((item) => item.kind === "file");
      const pastedText = e.clipboardData.getData("text");

      if (fileItems.length > 0) {
        // Extract files from clipboard
        const files: File[] = [];
        for (const item of fileItems) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }

        if (files.length > 0) {
          e.preventDefault(); // prevent binary garbage in textarea

          // If there's also text content, insert it manually
          if (pastedText) {
            const el = inputRef.current;
            if (el) {
              const start = el.selectionStart ?? text.length;
              const end = el.selectionEnd ?? text.length;
              const before = text.slice(0, start);
              const after = text.slice(end);
              const newText = before + pastedText + after;
              setText(newText);
              requestAnimationFrame(() => {
                el.focus();
                const newCursor = start + pastedText.length;
                el.setSelectionRange(newCursor, newCursor);
                resize();
              });
            }
          }

          // Add files to attachments
          addFiles(files);
        }
      }
    },
    [addFiles, text],
  );

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const submit = useCallback(() => {
    if (disabled) return;

    const uploadedFiles = attachedFiles.filter((f) => f.status === "uploaded");
    const hasAttachments = uploadedFiles.length > 0;

    if (hasAttachments) {
      // Build message text with file references
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
        requestAnimationFrame(resize);
      }
    } else if (text.trim()) {
      onSend(text.trim());
      setText("");
      requestAnimationFrame(resize);
    }
  }, [disabled, attachedFiles, text, onSend, resize]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="relative border-none p-8">
      <div className="pointer-events-none absolute inset-x-0 -top-6 z-10 h-6 bg-gradient-to-b from-transparent to-background backdrop-blur-[1px]" />

      <div
        className="relative"
        onDragEnter={handleDragEnter}
      >
        {/* Hidden native file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.json,.js,.ts,.py,.html,.css,.md,.xml,.zip,.yaml,.yml,.toml,.log"
          className="hidden"
          onChange={handleFileInputChange}
          aria-hidden="true"
        />

        {/* File attachments preview chips */}
        <AnimatePresence>
          {attachedFiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <FileAttachmentPreview
                files={attachedFiles}
                onRemove={removeFile}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main input area */}
        <div
          className={cn(
            "relative flex items-end bg-background gap-2 rounded-2xl border p-2 transition-all duration-200",
            isDragging && "border-primary/50 bg-primary/[0.02]",
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* File picker dialog (directory browsing) */}
          <FilePickerDialog
            open={fileDialogOpen}
            onOpenChange={setFileDialogOpen}
            onSelect={handleFileSelect}
          />

          {agentic && !isStreaming && (
            <AnimatePresence>
              <motion.div
                className="absolute bottom-full left-0 right-0 mb-1.5 flex items-center gap-1.5 px-1 z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "flex-1" }}
                  exit={{ width: 0 }}
                  transition={{ duration: 0.5 }}
                  className="h-0.5 rounded-full bg-gradient-to-r from-primary/40 via-primary/60 to-primary/40"
                />
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-[10px] font-medium tracking-wide text-primary/70"
                >
                  Goal mode — AI will work autonomously
                </motion.span>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "flex-1" }}
                  exit={{ width: 0 }}
                  transition={{ duration: 0.5 }}
                  className="h-0.5 rounded-full bg-gradient-to-r from-primary/40 via-primary/60 to-primary/40"
                />
              </motion.div>
            </AnimatePresence>
          )}

          <div className="flex min-h-10 flex-1 items-center">
            <Textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                disabled
                  ? "Pick a model to start chatting"
                  : "Message Remi..."
              }
              disabled={disabled}
              className="!bg-transparent dark:!bg-transparent max-h-[72px] min-h-0 resize-none border-none py-0 leading-6 shadow-none focus-visible:ring-0"
              rows={1}
            />
          </div>

          {/* File attachment buttons */}
          {!isStreaming && (
            <>

              {/* Upload files from your computer */}
              <button
                type="button"
                onClick={openFilePicker}
                disabled={disabled}
                className={cn(
                  "flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all duration-200",
                  "border-border/60 bg-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                  disabled && "opacity-40 pointer-events-none",
                )}
                title="Upload a file from your computer"
              >
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Attach</span>
              </button>

              {/* Browse files from configured directories */}
              <button
                type="button"
                onClick={() => setFileDialogOpen(true)}
                disabled={disabled}
                className={cn(
                  "flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all duration-200",
                  "border-border/60 bg-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                  disabled && "opacity-40 pointer-events-none",
                )}
                title="Attach a file from your directories"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">File</span>
              </button>
            </>
          )}

          {!isStreaming && onAgenticChange && (
            <button
              type="button"
              onClick={() => onAgenticChange(!agentic)}
              disabled={disabled}
              className={cn(
                "group relative flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-medium transition-all duration-200",
                agentic
                  ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                  : "border-border/60 bg-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                disabled && "opacity-40 pointer-events-none",
              )}
              title={
                agentic
                  ? "Goal mode active — AI will work autonomously until complete"
                  : "Toggle Goal mode for autonomous multi-step tasks"
              }
            >
              {agentic ? (
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              ) : (
                <Target className="h-3.5 w-3.5" />
              )}
              <span>Goal</span>
              {agentic && (
                <span className="absolute -inset-0.5 rounded-lg bg-primary/10 blur-sm -z-10" />
              )}
            </button>
          )}

          {isStreaming ? (
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={onStop}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0"
              disabled={disabled || (!text.trim() && attachedFiles.length === 0)}
              onClick={submit}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Drag & drop overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={cn(
                "absolute inset-0 z-50 flex items-center justify-center",
                "rounded-2xl border-2 border-dashed border-primary/40",
                "bg-background/85 backdrop-blur-sm",
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center gap-2">
                {/* <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Upload className="h-6 w-6 text-primary/60" />
                </div> */}
                <p className="text-sm font-medium text-foreground/80">
                  Drop files here
                </p>
                {/* <p className="text-xs text-muted-foreground/50">
                  Images, documents, and more
                </p> */}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
