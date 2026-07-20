"use client";

import { X, Loader2, AlertCircle } from "lucide-react";
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

// Fallback name for clipboard files that may have empty names
function displayName(file: File): string {
  if (file.name) return file.name;
  if (file.type.startsWith("image/")) return "Screenshot";
  return "Clipboard file";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileAttachmentPreview({ files, onRemove }: FileAttachmentPreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2.5 px-1 pb-3">
      {files.map((file) => {
        const isImg = file.mimeType.startsWith("image/");
        const { icon: TypeIcon, color: typeColor, bg: typeBg } = getFileTypeInfo(file.mimeType);
        const isUploading = file.status === "uploading";
        const isError = file.status === "error";
        const isPending = file.status === "pending";
        const isUploaded = file.status === "uploaded";

        return (
          <motion.div
            key={file.id}
            initial={{ opacity: 1, scale: 1, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1, y: 6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            layout
            className={cn(
              "group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs shadow-sm transition-all duration-200",
              "hover:shadow-md",
              isError && "border-destructive/40 bg-destructive/[0.04]",
              isUploading && "border-primary/25 bg-primary/[0.03]",
              isUploaded && "border-border/60 bg-card",
              isPending && "border-border/40 bg-muted/20",
            )}
          >
            {/* Thumbnail or icon */}
            {isImg && isUploaded && file.url ? (
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/[0.06]">            {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.url}
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
                {isUploaded && (
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                    Ready
                  </span>
                )}
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
                    // transition={{ duration: 0.2, ease: "easeOut" }}
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
      })}
    </div>
  );
}

