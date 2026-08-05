"use client";

import {
  ImageIcon,
  Download,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getFileTypeInfo, formatFileSize, mimeTypeFromExtension } from "@/lib/file-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttachedFileCardProps {
  /** The file URL (from /api/chat/uploads/) */
  url: string;
  /** Original filename */
  name: string;
  /** MIME type */
  mimeType: string;
  /** Optional file size */
  size?: number;
  /** Whether the card is inside a user message bubble (affects styling) */
  inUserMessage?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttachedFileCard({
  url,
  name,
  mimeType,
  size,
  inUserMessage,
}: AttachedFileCardProps) {
  const isImage = mimeType.startsWith("image/");

  // Image card — large preview
  if (isImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "group relative block overflow-hidden rounded-xl transition-all duration-200",
          "hover:ring-2 hover:ring-primary/30",
          inUserMessage
            ? "border border-white/20"
            : "border border-border/60 shadow-sm",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          className="max-h-80 w-full object-contain bg-black/5"
          loading="lazy"
        />
        {/* Footer overlay */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-[11px]",
            inUserMessage
              ? "bg-primary-foreground/10 backdrop-blur-sm text-primary-foreground/90"
              : "bg-muted/80 backdrop-blur-sm text-muted-foreground border-t border-border/30",
          )}
        >
          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate font-medium">{name}</span>
          {size !== undefined && (
            <span className="shrink-0 tabular-nums opacity-70">
              {formatFileSize(size)}
            </span>
          )}
          <ExternalLink
            className={cn(
              "h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70",
            )}
          />
        </div>
      </a>
    );
  }

  // File card — icon + info + download
  const { icon: TypeIcon, color: typeColor, bg: typeBg } = getFileTypeInfo(
    mimeType || mimeTypeFromExtension(name),
  );

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all duration-200",
        // "hover:shadow-md hover:border-muted-foreground/20",
        inUserMessage
          ? "border-white/20 bg-primary-foreground/5 text-primary-foreground"
          : "border-border/60 bg-card text-foreground shadow-sm",
      )}
    >
      {/* Icon */}
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", typeBg)}>
        <TypeIcon className={cn("h-5 w-5", typeColor)} />
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xs font-medium">{name}</span>
        <span className="text-[10px] opacity-60">
          {size !== undefined ? formatFileSize(size) : "File"}
        </span>
      </div>

      {/* Download icon */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
          "opacity-0 group-hover:opacity-100",
          inUserMessage
            ? "hover:bg-primary-foreground/10"
            : "hover:bg-muted",
        )}
      >
        <Download className="h-4 w-4" />
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Parser — extract file attachments from message text
// ---------------------------------------------------------------------------

export interface ParsedAttachment {
  url: string;
  name: string;
  mimeType: string;
  /** Inferred from the markdown syntax — images use `![]()`, files use `[]()` */
  isImage: boolean;
}

/**
 * Parse markdown text and extract uploaded file references.
 * Returns the parsed attachments sorted by their order of appearance.
 */
export function parseAttachments(text: string): ParsedAttachment[] {
  const attachments: ParsedAttachment[] = [];
  const seen = new Set<string>();
  const isUploadUrl = (u: string) => u.startsWith("/api/chat/uploads/");

  // Match markdown image syntax: ![name](url)
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(text)) !== null) {
    const url = match[2].trim();
    if (!isUploadUrl(url) || seen.has(url)) continue;
    seen.add(url);
    attachments.push({
      url,
      name: match[1].trim() || "Image",
      mimeType: mimeTypeFromExtension(url),
      isImage: true,
    });
  }

  // Match markdown link syntax: [name](url) — but skip if already matched as image
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(text)) !== null) {
    const url = match[2].trim();
    if (!isUploadUrl(url) || seen.has(url)) continue;
    seen.add(url);
    attachments.push({
      url,
      name: match[1].trim() || url.split("/").pop() || "File",
      mimeType: mimeTypeFromExtension(url),
      isImage: false,
    });
  }

  return attachments;
}

/**
 * Strip markdown image/link syntax for uploaded files from the text,
 * leaving only the user's actual words.
 */
export function stripAttachmentMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(\/api\/chat\/uploads\/[^)]+\)/g, "")
    .replace(/\[([^\]]*)\]\(\/api\/chat\/uploads\/[^)]+\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
