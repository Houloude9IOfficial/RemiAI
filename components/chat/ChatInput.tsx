"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp,
  Square,
  Sparkles,
  ListChecks,
  Paperclip,
  Plus,
  X,
  Code2,
  Hammer,
  Terminal,
  FolderOpen,
  Check,
  Brain,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { TEMPORARY_CHAT_RETENTION_DAYS } from "@/lib/chat/temporary-chat-constants";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FilePickerDialog } from "./FilePickerDialog";
import {
  SlashCommandMenu,
  type SlashLevel,
  type SlashCommandMenuHandle,
} from "./SlashCommandMenu";
import { ChatModelSelector } from "./ChatModelSelector";
import { dispatchSessionFilesChanged } from "@/lib/api/session-files";
import { toast } from "sonner";
import { FileAttachmentPreview, type AttachedFile } from "./FileAttachmentPreview";
import { formatFileSize } from "@/lib/file-types";
import { conversationsApi } from "@/lib/api/conversations";
import { useDemoMode } from "@/components/demo/use-demo-mode";
import { toolsApi } from "@/lib/api/tools";
import {
  downscaleImageFile,
  isDownscalableImage,
} from "@/lib/image-utils";
import {
  CHAT_INPUT_PREFILL_EVENT,
  registerChatInput,
  unregisterChatInput,
} from "@/lib/chat-input-registry";
import type { ChatStatus } from "ai";
import {
  normalizeQualityPolicy,
  type QualityPolicy,
} from "@/lib/chat/quality-policy";

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

/**
 * Small removable capability chip shown in the composer bar ("X to clear").
 * Mode chips are real per-conversation toggles; the Code chip is a
 * per-conversation opt-in too — it appears only after the user enables it in
 * that chat via the "+" menu, and clearing it hides it for that chat only.
 * Purely cosmetic — it never changes server-side tool configuration.
 */
function CapabilityChip({
  icon: Icon,
  label,
  title,
  onClear,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  title?: string;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 py-0.5 pl-2 pr-1 text-[11px] font-medium text-foreground/80"
    >
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      {label}
      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        aria-label={`Remove ${label}`}
        className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
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

/**
 * localStorage key for per-conversation Code-chip opt-in state. Value is a
 * map of { [conversationId]: true } — a conversation shows the Code chip only
 * when it has an explicit `true` entry, so every fresh chat starts clean.
 */
const CODE_CHIP_KEY = "remi-code-per-session";

export type ChatMode = "chat" | "goal" | "plan" | "build";

function qualityPolicyLabel(policy: QualityPolicy): string {
  const normalized = normalizeQualityPolicy(policy);
  if (normalized === "minimal") return "Minimal";
  if (normalized === "low") return "Low";
  if (normalized === "high") return "High";
  return "Medium";
}

export function ChatInput({
  conversationId,
  status,
  disabled,
  mode,
  onModeChange,
  qualityPolicy = "medium",
  onQualityPolicyChange,
  providerId,
  modelId,
  onModelChange,
  onSend,
  onStop,
  isTemporary,
  memoryEnabled,
  onTemporaryChange,
  onMemoryChange,
  large,
}: {
  conversationId: number;
  status: ChatStatus;
  disabled?: boolean;
  mode?: ChatMode;
  onModeChange?: (value: ChatMode) => void;
  qualityPolicy?: QualityPolicy;
  onQualityPolicyChange?: (value: QualityPolicy) => void;
  providerId?: number | null;
  modelId?: string | null;
  onModelChange?: (providerId: number, modelId: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Temporary-chat flag + per-chat memory switch (fully independent). */
  isTemporary?: boolean;
  memoryEnabled?: boolean;
  onTemporaryChange?: (value: boolean) => void;
  onMemoryChange?: (value: boolean) => void;
  /** Larger, centered "new chat" composer (code-editor style). */
  large?: boolean;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Highlight the composer border only while the textarea itself is focused.
  // Using focus-within would light it up for toolbar buttons too (e.g. the
  // dropdown triggers keep focus after their menus close), which isn't wanted.
  const [inputFocused, setInputFocused] = useState(false);

  // -----------------------------------------------------------------------
  // Slash-command menu (/mcp, /tool, /file, mode commands)
  // -----------------------------------------------------------------------
  const [slashLevel, setSlashLevel] = useState<SlashLevel | null>(null);
  const [slashQuery, setSlashQuery] = useState("");
  // Index of the "/" that started the active command token — the menu
  // replaces everything from here up to the cursor when a marker is inserted.
  const slashAnchorRef = useRef(-1);
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const [bashMode, setBashMode] = useState<"sandboxed" | "full">("sandboxed");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // Per-conversation "Code" chip opt-in. Fresh sessions NEVER show the chip
  // automatically (even when code execution is enabled in Settings) — the
  // user turns it on per conversation via the "+" menu. Purely cosmetic — it
  // never changes the server-side tool configuration.
  const [codeChipOn, setCodeChipOn] = useState(false);
  const router = useRouter();
  const demo = useDemoMode();

  const isStreaming = status === "streaming" || status === "submitted";
  // Reasoning-effort policy, normalized so legacy stored values (fast,
  // balanced, quality, selected) behave like their modern equivalents.
  const activeQualityPolicy = normalizeQualityPolicy(qualityPolicy);

  // Real availability of the code-execution tool (enabled in Settings > Tools).
  // Read-only here — enabling it happens in Settings.
  const { data: toolConfigs } = useQuery({
    queryKey: ["tool-configs"],
    queryFn: toolsApi.list,
    staleTime: 60_000,
  });

  const codeExecutionOn = !demo && !!toolConfigs?.find((t) => t.id === "code_execution")?.config.enabled;

  // Hydrate this conversation's chip preference after mount (avoids SSR
  // mismatch — the initial render always starts with the chip hidden).
  const hydratedRef = useRef(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CODE_CHIP_KEY);
      if (stored) {
        const map: unknown = JSON.parse(stored);
        if (map && typeof map === "object") {
          const enabled = (map as Record<string, unknown>)[String(conversationId)];
          // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration sync from localStorage (matches AppSidebar pattern)
          setCodeChipOn(enabled === true);
        }
      }
    } catch {
      // localStorage unavailable
    }
    hydratedRef.current = true;
  }, [conversationId]);

  // Persist this conversation's preference (skipped until hydration ran, so
  // the mount-time read is never clobbered by the initial `false`).
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      const stored = localStorage.getItem(CODE_CHIP_KEY);
      const map: Record<string, boolean> = stored ? JSON.parse(stored) : {};
      if (codeChipOn) map[String(conversationId)] = true;
      else delete map[String(conversationId)];
      localStorage.setItem(CODE_CHIP_KEY, JSON.stringify(map));
    } catch {
      // localStorage unavailable
    }
  }, [codeChipOn, conversationId]);

  useEffect(() => {
    conversationsApi.get(conversationId)
      .then(({ conversation }) => setBashMode(conversation.bashMode ?? "sandboxed"))
      .catch(() => {});
  }, [conversationId]);

  /** Set the per-conversation Bash tier (Safe = sandboxed, Full = device-wide). */
  const setBashModeValue = useCallback(
    (next: "sandboxed" | "full") => {
      if (next === bashMode) return;
      setBashMode(next);
      conversationsApi.update(conversationId, { bashMode: next }).catch(() => {
        setBashMode(bashMode);
        toast.error("Couldn't update Bash access mode");
      });
    },
    [bashMode, conversationId],
  );

  // Active capability chips shown in the bar (mode toggle + code status).
  // The Code chip is a per-conversation opt-in: it appears only once the user
  // enables it via the "+" menu for THIS conversation.
  const hasModeChip = !!onModeChange && mode !== "chat";
  const codeChipVisible = codeExecutionOn && codeChipOn;
  const hasChips = hasModeChip || codeChipVisible;

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

  // Auto-resize textarea (stable identity so callbacks can depend on it)
  const resize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  // Build history can request a safe continuation without sending anything.
  // Append to existing text rather than silently replacing a user's draft.
  useEffect(() => {
    const onPrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: unknown }>).detail;
      const prefill = detail?.text;
      if (typeof prefill !== "string" || !prefill.trim()) return;
      setText((previous) =>
        previous.trim() ? `${previous.trim()}\n\n${prefill.trim()}` : prefill.trim(),
      );
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        resize();
      });
    };
    window.addEventListener(CHAT_INPUT_PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(CHAT_INPUT_PREFILL_EVENT, onPrefill);
  }, [resize]);

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
    [text, resize],
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
    [text, resize],
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
  // Slash commands
  // -----------------------------------------------------------------------

  const closeSlashMenu = useCallback(() => {
    setSlashLevel(null);
    setSlashQuery("");
    slashAnchorRef.current = -1;
  }, []);

  /**
   * Re-run slash detection after text/cursor changes. Typing a `/` at the
   * start of a word opens the command menu; on sub-levels (server/tool
   * pickers) whatever follows the command word filters the list.
   */
  const updateSlashDetection = useCallback(
    (value: string, pos: number) => {
      let start = pos;
      while (
        start > 0 &&
        value[start - 1] !== " " &&
        value[start - 1] !== "\n"
      ) {
        start--;
      }
      const token = value.slice(start, pos);

      if (!slashLevel) {
        if (token.startsWith("/")) {
          slashAnchorRef.current = start;
          setSlashLevel({ kind: "command" });
          setSlashQuery(token.slice(1));
        }
        return;
      }

      if (slashLevel.kind === "command") {
        if (token.startsWith("/") && start === slashAnchorRef.current) {
          setSlashQuery(token.slice(1));
        } else {
          closeSlashMenu();
        }
        return;
      }

      // Sub-level: filter by everything after the command word.
      const rest = value.slice(slashAnchorRef.current);
      const sp = rest.indexOf(" ");
      setSlashQuery(sp === -1 ? "" : rest.slice(sp + 1).trim());
    },
    [slashLevel, closeSlashMenu],
  );

  /**
   * Move between menu levels. Entering any sub-level normalizes the composer
   * to just the command word (`/mcp postgres` → `/mcp `) with the cursor after
   * the space, so whatever the user types next filters that level's list. The
   * picked server is carried in the level, not in the text.
   */
  const handleSlashNavigate = useCallback(
    (level: SlashLevel) => {
      const el = inputRef.current;
      const anchor = slashAnchorRef.current;
      // Backing out to the command list leaves the composer untouched.
      if (el && anchor >= 0 && level.kind !== "command") {
        const commandWord = level.kind === "tools" ? "tool" : "mcp";
        const next = `${el.value.slice(0, anchor)}/${commandWord} `;
        setText(next);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(next.length, next.length);
          resize();
        });
      }
      setSlashLevel(level);
      setSlashQuery("");
    },
    [resize],
  );

  /** Replace the typed `/command …` region with a final marker. */
  const applySlashInsert = useCallback(
    (marker: string) => {
      const el = inputRef.current;
      const anchor = slashAnchorRef.current;
      const cursor = el?.selectionStart ?? 0;
      setText((prev) => {
        if (anchor < 0) {
          return prev.trim() ? `${prev.trim()} ${marker}` : marker;
        }
        const end = Math.max(cursor, anchor);
        return `${prev.slice(0, anchor)}${marker}${prev.slice(end)}`;
      });
      closeSlashMenu();
      requestAnimationFrame(() => {
        if (el && anchor >= 0) {
          el.focus();
          el.setSelectionRange(anchor + marker.length, anchor + marker.length);
        }
        resize();
      });
    },
    [closeSlashMenu, resize],
  );

  /** `/plan` / `/build` / `/goal` / `/chat` — switch mode, drop the token. */
  const applySlashMode = useCallback(
    (mode: ChatMode) => {
      const el = inputRef.current;
      const anchor = slashAnchorRef.current;
      const cursor = el?.selectionStart ?? 0;
      setText((prev) => {
        if (anchor < 0) return prev;
        return `${prev.slice(0, anchor)}${prev.slice(Math.max(cursor, anchor))}`;
      });
      closeSlashMenu();
      onModeChange?.(mode);
      requestAnimationFrame(() => {
        el?.focus();
        resize();
      });
    },
    [closeSlashMenu, onModeChange, resize],
  );

  /** `/file` — clear the token and open the directory/file picker. */
  const openFilePickerFromSlash = useCallback(() => {
    const el = inputRef.current;
    const anchor = slashAnchorRef.current;
    const cursor = el?.selectionStart ?? 0;
    setText((prev) => {
      if (anchor < 0) return prev;
      return `${prev.slice(0, anchor)}${prev.slice(Math.max(cursor, anchor))}`;
    });
    closeSlashMenu();
    setFileDialogOpen(true);
  }, [closeSlashMenu]);

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

    closeSlashMenu();

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
  }, [disabled, isStreaming, attachedFiles, text, onSend, resize, closeSlashMenu]);

  /** Text change — keep the composer state and slash-command detection in sync. */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const pos = e.target.selectionStart ?? value.length;
      setText(value);
      updateSlashDetection(value, pos);
    },
    [updateSlashDetection],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashLevel) {
        // While a slash menu is open the arrows/enter/tab/escape drive it.
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            slashMenuRef.current?.move(1);
            return;
          case "ArrowUp":
            e.preventDefault();
            slashMenuRef.current?.move(-1);
            return;
          case "ArrowRight":
            // Drill into the highlighted item (command → server → tool).
            e.preventDefault();
            slashMenuRef.current?.activate();
            return;
          case "ArrowLeft":
            // Step back to the previous section.
            e.preventDefault();
            slashMenuRef.current?.back();
            return;
          case "Escape":
            e.preventDefault();
            slashMenuRef.current?.back();
            return;
          case "Tab":
            e.preventDefault();
            slashMenuRef.current?.activate();
            return;
          case "Enter":
            e.preventDefault();
            if (isStreaming) return;
            if (
              slashLevel.kind === "command" &&
              (slashMenuRef.current?.getItemCount() ?? 0) === 0
            ) {
              // No matching command — treat Enter as a normal send.
              closeSlashMenu();
              submit();
            } else {
              slashMenuRef.current?.activate();
            }
            return;
        }
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming) submit();
      }
    },
    [slashLevel, isStreaming, submit, closeSlashMenu],
  );

  // -----------------------------------------------------------------------
  // Render — ChatGPT-style dock: same column width as messages, toolbar row
  // -----------------------------------------------------------------------

  const sendBtn = large ? "h-10 w-10" : "h-8 w-8";

  return (
    <div
      className={cn(
        "relative mx-auto w-full px-4 pb-3 pt-1 md:px-6",
        large ? "max-w-2xl" : "max-w-3xl",
      )}
    >
      {/* The composer sits below the message list; do not paint a fade over
          the status row or the last message. */}

      <div className="relative z-10" onDragEnter={handleDragEnter}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.json,.js,.ts,.py,.html,.css,.md,.xml,.zip,.yaml,.yml,.toml,.log"
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
            {/* {mode === "build" && (
              <div className="mb-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-1 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/75">Definition of done</span>
                <span>inspect</span>
                <span aria-hidden="true">→</span>
                <span>change</span>
                <span aria-hidden="true">→</span>
                <span>test/build</span>
                <span aria-hidden="true">→</span>
                <span>report</span>
              </div>
            )} */}

        {/* Always rendered — hiding this row while streaming would shrink the
            composer and shift the box up ~22px on every send, then drop it
            back down when the response finishes. Dimmed (not removed) while
            streaming so the input box never changes size or position. */}
        <div
          className={cn(
            "mb-1.5 flex items-center gap-2 px-1 text-[11px] text-muted-foreground transition-opacity duration-200",
            isStreaming && "opacity-50",
          )}
        >
          <span className="font-medium text-foreground/80">
            {mode === "goal"
              ? "Goal mode"
              : mode === "plan"
                ? "Plan mode"
                : mode === "build"
                  ? "Build mode"
                  : "Chat mode"}
          </span>
          {isTemporary && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1 font-medium text-status-warning">
                <Timer className="h-3 w-3" />
                Temporary
              </span>
            </>
          )}
          {/* <span aria-hidden="true">·</span>
          <span>
            {mode === "goal"
              ? "Autonomous multi-step work until the goal is complete"
              : mode === "plan"
                ? "Read-only planning; file writes stay disabled"
                : mode === "build"
                  ? "Change files, run checks, and report what was verified"
                  : "Direct answer with minimal overhead"}
          </span> */}
          {!demo && onQualityPolicyChange && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {qualityPolicyLabel(activeQualityPolicy)}
                {activeQualityPolicy === "high" && " · Deep reasoning"}
              </span>
            </>
          )}
        </div>

        <div
          className={cn(
            // While the slash menu is attached above, square the composer's
            // top corners so the two sheets look like one unit.
            "group relative flex flex-col border border-border/70 bg-surface-1 transition-colors duration-200",
            slashLevel ? "rounded-b-3xl" : "rounded-3xl",
            // large && inputFocused && "border-primary/60", uncomment to border the composer when focused
            isDragging && "border-primary/45 bg-primary/[0.03]",
            isStreaming && "opacity-95",
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Slash-command popup — anchored flush to the composer so it sits
              on top of the mode/status row, with only its top corners rounded */}
          <SlashCommandMenu
            ref={slashMenuRef}
            open={!!slashLevel && !isStreaming && !disabled}
            level={slashLevel}
            query={slashQuery}
            large={large}
            onClose={closeSlashMenu}
            onNavigate={handleSlashNavigate}
            onInsert={applySlashInsert}
            onFile={openFilePickerFromSlash}
            onMode={applySlashMode}
          />

          {/* Active capability chips — removable inline "X to clear" pattern */}
          {hasChips && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3">
              {hasModeChip && (
                <CapabilityChip
                  icon={mode === "goal" ? Sparkles : mode === "build" ? Hammer : ListChecks}
                  label={
                    mode === "goal"
                      ? "Goal mode"
                      : mode === "build"
                        ? "Build mode"
                        : "Plan mode"
                  }
                  title={
                    mode === "goal"
                      ? "Goal mode — works until the task is complete"
                      : mode === "build"
                        ? "Build mode — changes files and runs checks"
                        : "Plan mode — plans without writing files"
                  }
                  disabled={disabled || isStreaming}
                  onClear={() => onModeChange?.("chat")}
                />
              )}
              {codeChipVisible && (
                <CapabilityChip
                  icon={Code2}
                  label="Code"
                  title="Code execution is on for this conversation — the access tier is set with the Safe/Full control"
                  onClear={() => setCodeChipOn(false)}
                />
              )}
            </div>
          )}

          <div className={hasChips ? (large ? "px-2 pt-2" : "px-3.5 pt-2") : large ? "px-2 pt-4" : "px-3.5 pt-3"}>
            <Textarea
              ref={inputRef}
              value={text}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={
                disabled
                  ? "Pick a model to start chatting"
                  : isStreaming
                    ? "Remi is responding…"
                    : isTemporary
                      ? "Temporary chat"
                      : // `large` is only set by EmptyChatState (the first-message
                        // composer); the docked composer for follow-up messages
                        // gets a plainer prompt with a slash-command hint.
                        large
                        ? "How can I help you today?"
                        : "Write a message or / for commands"
              }
              disabled={disabled}
              className={cn(
                "max-h-40 resize-none border-none bg-transparent! py-0 leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent!",
                large ? "min-h-10 text-[17px]" : "min-h-[1px]",
              )}
              rows={1}
            />
          </div>

          {/* Toolbar — capability menu, Bash permission, send */}
          <div
            className={cn(
              "flex items-center gap-1",
              large ? "px-3 pb-3 pt-2" : "px-2 pb-2 pt-1.5",
            )}
          >
            {/* "+" — attach / mode / capability menu */}
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger
                type="button"
                title="Add photos, files, or capabilities"
                disabled={disabled || isStreaming}
                className={cn(
                  "flex cursor-pointer items-center justify-center rounded-full border border-border/60 transition-colors hover:bg-muted hover:text-foreground",
                  large ? "h-9 w-9" : "h-8 w-8",
                  (disabled || isStreaming) && "pointer-events-none opacity-40",
                )}
                aria-label="Add photos, files, or capabilities"
              >
                {/* rotate plus on dropdown open */}
                <Plus
                  className={cn(
                    "h-4 w-4 transition-all",
                    dropdownOpen && "rotate-45",
                  )}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" sideOffset={6} className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Attach files for context</DropdownMenuLabel>
                  <DropdownMenuItem onClick={openFilePicker}>
                    <Paperclip className="h-4 w-4" />
                    Add photos &amp; files
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFileDialogOpen(true)}>
                    <FolderOpen className="h-4 w-4" />
                    Directories / files context
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                {onModeChange && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Mode · How Remi should work</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={mode === "build"}
                        onCheckedChange={(checked) => onModeChange(checked ? "build" : "chat")}
                      >
                        <Hammer className="h-4 w-4" />
                        <span>
                          <span className="block">Build mode</span>
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            Change files and run checks
                          </span>
                        </span>
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={mode === "goal"}
                        onCheckedChange={(checked) => onModeChange(checked ? "goal" : "chat")}
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>
                          <span className="block">Goal mode</span>
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            Works autonomously until finish
                          </span>
                        </span>
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={mode === "plan"}
                        onCheckedChange={(checked) => onModeChange(checked ? "plan" : "chat")}
                      >
                        <ListChecks className="h-4 w-4" />
                        <span>
                          <span className="block">Plan mode</span>
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            Read and plan without writing files
                          </span>
                        </span>
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuGroup>
                  </>
                )}

                {!demo && onQualityPolicyChange && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Reasoning effort</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={activeQualityPolicy === "minimal"}
                        onCheckedChange={(checked) => checked && onQualityPolicyChange("minimal")}
                      >
                        <span>
                          <span className="block">Minimal</span>
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            Least reasoning · fastest response
                          </span>
                        </span>
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={activeQualityPolicy === "low"}
                        onCheckedChange={(checked) => checked && onQualityPolicyChange("low")}
                      >
                        <span>
                          <span className="block">Low</span>
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            Light reasoning · quick responses
                          </span>
                        </span>
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={activeQualityPolicy === "medium"}
                        onCheckedChange={(checked) => checked && onQualityPolicyChange("medium")}
                      >
                        <span>
                          <span className="block">
                            Medium
                            {/* <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                              Recommended
                            </span> */}
                          </span>
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            Balanced for most tasks
                          </span>
                        </span>
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={activeQualityPolicy === "high"}
                        onCheckedChange={(checked) => checked && onQualityPolicyChange("high")}
                      >
                        <span>
                          <span className="block">High</span>
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            Deep reasoning · slower · may cost more
                          </span>
                        </span>
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuGroup>
                  </>
                )}

                {!demo && (onTemporaryChange || onMemoryChange) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Chat settings</DropdownMenuLabel>
                      {onMemoryChange && (
                        <DropdownMenuCheckboxItem
                          checked={memoryEnabled !== false}
                          onCheckedChange={(checked) => onMemoryChange(checked === true)}
                        >
                          <Brain className="h-4 w-4" />
                          <span>
                            <span className="block">Memory</span>
                            <span className="block text-[10px] font-normal text-muted-foreground">
                              {memoryEnabled === false
                                ? "Off — fully isolated: no memory, profile, preferences, or file access"
                                : "Remembers you across conversations"}
                            </span>
                          </span>
                        </DropdownMenuCheckboxItem>
                      )}
                      {onTemporaryChange && (
                        <DropdownMenuCheckboxItem
                          checked={isTemporary === true}
                          onCheckedChange={(checked) => onTemporaryChange(checked === true)}
                        >
                          <Timer className="h-4 w-4" />
                          <span>
                            <span className="block">Temporary chat</span>
                            <span className="block text-[10px] font-normal text-muted-foreground">
                              {isTemporary === true
                                ? `Deleted after ${TEMPORARY_CHAT_RETENTION_DAYS} days of inactivity`
                                : "Make this chat temporary"}
                            </span>
                          </span>
                        </DropdownMenuCheckboxItem>
                      )}
                    </DropdownMenuGroup>
                  </>
                )}

                <DropdownMenuSeparator />
                {!demo && <DropdownMenuGroup>
                  <DropdownMenuLabel>Extra capabilities</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      if (codeExecutionOn) {
                        // Per-conversation opt-in — this conversation only.
                        setCodeChipOn((on) => !on);
                      } else {
                        router.push("/settings/tools");
                      }
                    }}
                  >
                    <Code2 className="h-4 w-4" />
                    Code
                    <span className="ml-auto flex items-center">
                      {codeExecutionOn ? (
                        codeChipOn ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            Off for this chat
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Set up</span>
                      )}
                    </span>
                  </DropdownMenuItem>
                  {/* Bash access tier — one toggle between the two real
                      permission levels (Safe = sandboxed to permitted
                      directories, Full = device-wide). Shows the current
                      tier; clicking switches to the other. Disabled when
                      code execution is off. */}
                  <DropdownMenuItem
                    onClick={() => {
                      if (codeExecutionOn) {
                        setBashModeValue(bashMode === "sandboxed" ? "full" : "sandboxed");
                      } else {
                        router.push("/settings/tools");
                      }
                    }}
                  >
                    <Terminal className="h-4 w-4" />
                    Bash: {codeExecutionOn ? (bashMode === "full" ? "Full" : "Safe") : "Safe"}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {codeExecutionOn
                        ? (bashMode === "full" ? "Switch to Safe" : "Switch to Full")
                        : "Set up"}
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Model selector — Cursor/Claude-style, right of the "+". It is
                the only place to switch models now (header pickers were
                removed), so it stays enabled even when the rest of the input
                is disabled — only mid-stream is it locked. */}
            {onModelChange && (
              <ChatModelSelector
                providerId={providerId ?? null}
                modelId={modelId ?? null}
                onChange={onModelChange}
                disabled={isStreaming}
                large={large}
              />
            )}

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
