"use client";

import { useEffect, useState } from "react";
import { X, Loader2, AlertCircle, ImageIcon, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { getFileTypeInfo, formatFileSize } from "@/lib/file-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttachedFile {
  id: string;
  file: File;
  url?: string;
  mimeType: string;
  size: number;
  status: "pending" | "uploading" | "uploaded" | "error";
  error?: string;
  /** Upload progress 0-100, set while status is "uploading" */
  progress?: number;
}

interface FileAttachmentPreviewProps {
  files: AttachedFile[];
  onRemove: (id: string) => void;
}

/** Max image thumbnails shown inline before collapsing the rest into a "+N" tile */
const MAX_VISIBLE_IMAGES = 5;

// Fallback name for clipboard files that may have empty names
function displayName(file: File): string {
  if (file.name) return file.name;
  if (file.type.startsWith("image/")) return "Screenshot";
  return "Clipboard file";
}

// ---------------------------------------------------------------------------
// Image thumbnail
// ---------------------------------------------------------------------------

function ImageThumb({
  file,
  onRemove,
}: {
  file: AttachedFile;
  onRemove: (id: string) => void;
}) {
  const isUploading = file.status === "uploading";
  const isError = file.status === "error";

  // Show the thumbnail straight from the already-in-memory File (an object
  // URL) instead of fetching it back from the server — the file was just
  // selected locally, so a round-trip to /api/chat/*/session-files would be
  // pure waste (and would load full quality for a 56px thumb).
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear a stale object URL when the attachment disappears
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(file.file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file.file]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      layout
      className={cn(
        "group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-1",
        isError
          ? "ring-destructive/50"
          : "ring-black/[0.06] dark:ring-white/10",
      )}
    >
      {objectUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl}
          alt={displayName(file.file)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/50">
          <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
        </div>
      )}

      {/* Status overlays */}
      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/[0.08]">
          <AlertCircle className="h-4 w-4 text-destructive/70" />
        </div>
      )}

      {/* Remove button — revealed on hover (always visible on touch) */}
      <button
        type="button"
        onClick={() => onRemove(file.id)}
        className={cn(
          "absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full",
          "bg-background/90 text-muted-foreground shadow-sm ring-1 ring-black/[0.08]",
          "opacity-0 transition-all duration-150",
          "hover:bg-background hover:text-foreground active:scale-90",
          "group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100",
        )}
        aria-label={`Remove ${displayName(file.file)}`}
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Overflow tile ("+N more" / collapse)
// ---------------------------------------------------------------------------

function MoreTile({
  count,
  expanded,
  onClick,
}: {
  count: number;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.9, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      layout
      onClick={onClick}
      className={cn(
        "flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg",
        "border border-dashed bg-muted/30 text-muted-foreground/70",
        "transition-all duration-150 hover:bg-muted/60 hover:text-foreground active:scale-95",
      )}
      aria-label={
        expanded
          ? "Show fewer attachments"
          : `Show ${count} more attachments`
      }
    >
      {expanded ? (
        <>
          <ChevronUp className="h-4 w-4" />
          <span className="text-[9px] font-medium">Less</span>
        </>
      ) : (
        <>
          <span className="text-xs font-semibold tabular-nums">+{count}</span>
          <span className="text-[9px] font-medium">More</span>
        </>
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Card (non-image files)
// ---------------------------------------------------------------------------

function AttachmentCard({
  file,
  onRemove,
}: {
  file: AttachedFile;
  onRemove: (id: string) => void;
}) {
  const isImg = file.mimeType.startsWith("image/");
  const { icon: TypeIcon, color: typeColor, bg: typeBg } = getFileTypeInfo(file.mimeType);
  const isUploading = file.status === "uploading";
  const isError = file.status === "error";
  const isPending = file.status === "pending";
  const isUploaded = file.status === "uploaded";

  // Show the thumbnail straight from the already-in-memory File (an object
  // URL) instead of fetching it back from the server — the file was just
  // selected locally and is either being uploaded or already there, so a
  // second round-trip to /api/chat/*/session-files is pure waste (and would
  // load full quality for a 44px thumb).
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImg || !file.file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear a stale object URL when the attachment stops being an image
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(file.file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [isImg, file.file]);

  return (
    <motion.div
      initial={{ opacity: 1, scale: 1, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1, y: 6 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      layout
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs transition-all duration-200",
        isError && "border-destructive/40 bg-destructive/[0.04]",
        isUploading && "border-primary/25 bg-primary/[0.03]",
        isUploaded && "border-border/60 bg-card",
        isPending && "border-border/40 bg-muted/20",
      )}
    >
      {/* Thumbnail or icon */}
      {isImg && objectUrl ? (
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/[0.06]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={objectUrl}
            alt={displayName(file.file)}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
            isError
              ? "bg-destructive/[0.08]"
              : isUploading
                ? "bg-primary/[0.06]"
                : typeBg,
          )}
        >
          {isUploading ? (
            <div className="relative flex h-full w-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
              {file.progress !== undefined && file.progress > 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-muted-foreground/60">
                  {file.progress}%
                </span>
              )}
            </div>
          ) : isError ? (
            <AlertCircle className="h-5 w-5 text-destructive/60" />
          ) : (
            <TypeIcon className={cn("h-5 w-5", typeColor)} />
          )}
        </div>
      )}

      {/* File info + progress */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="max-w-[160px] truncate text-xs font-medium text-foreground/90">
            {displayName(file.file)}
          </span>
          {/* {isUploaded && (
            <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
              Ready
            </span>
          )} */}
        </div>
        <span className="text-[10px] text-muted-foreground/50">
          {isUploading && file.progress !== undefined
            ? `Uploading ${file.progress}%`
            : isPending
              ? "Preparing..."
              : isError
                ? file.error ?? "Upload failed"
                : formatFileSize(file.size)}
        </span>

        {/* Progress bar */}
        {isUploading && file.progress !== undefined && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${file.progress}%` }}
              className="h-full rounded-full bg-gradient-to-r from-primary/50 to-primary"
            />
          </div>
        )}
      </div>

      {/* Remove button — always visible, subtle */}
      <button
        type="button"
        onClick={() => onRemove(file.id)}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-150",
          "text-muted-foreground/40 hover:text-muted-foreground/80 hover:bg-muted-foreground/10",
          "active:scale-90",
        )}
        aria-label={`Remove ${displayName(file.file)}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileAttachmentPreview({ files, onRemove }: FileAttachmentPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  if (files.length === 0) return null;

  const images = files.filter((f) => f.mimeType.startsWith("image/"));
  const others = files.filter((f) => !f.mimeType.startsWith("image/"));

  const hiddenCount = images.length - MAX_VISIBLE_IMAGES;
  const showOverflow = !expanded && hiddenCount > 0;
  const visibleImages = showOverflow
    ? images.slice(0, MAX_VISIBLE_IMAGES)
    : images;

  return (
    <div className="flex flex-wrap items-center gap-2.5 px-1 pb-3">
      {visibleImages.map((file) => (
        <ImageThumb key={file.id} file={file} onRemove={onRemove} />
      ))}

      {showOverflow && (
        <MoreTile
          count={hiddenCount}
          expanded={false}
          onClick={() => setExpanded(true)}
        />
      )}

      {expanded && hiddenCount > 0 && (
        <MoreTile
          count={hiddenCount}
          expanded
          onClick={() => setExpanded(false)}
        />
      )}

      {others.map((file) => (
        <AttachmentCard key={file.id} file={file} onRemove={onRemove} />
      ))}
    </div>
  );
}
