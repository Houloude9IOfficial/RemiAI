"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  ImageIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────

interface ImagePreviewProps {
  /** Resolved image source — a data URL or an HTTP(S) URL. */
  src: string;
  /** Canonical URL — used for open-in-new-tab and the copy-URL fallback.
   *  Prefer the server URL over a data URL when both exist. */
  url?: string;
  /** Alt text for the image. */
  alt: string;
  /** Filename shown in the preview (derived from `src` when omitted). */
  filename?: string;
  /** Classes for the outer wrapper element. */
  className?: string;
  /** Classes for the <img> element. */
  imgClassName?: string;
  /** Called when the image finishes loading. */
  onLoad?: () => void;
  /** Called when the image fails to load. */
  onError?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

/** Best-effort filename from a URL or data URL (no extension guarantee). */
function filenameFromUrl(src: string): string {
  try {
    const withoutQuery = src.split("?")[0].split("#")[0];
    if (withoutQuery.startsWith("data:")) return "image";
    const seg = withoutQuery.split("/").pop();
    if (seg) return decodeURIComponent(seg);
    return "image";
  } catch {
    return "image";
  }
}

function extensionForMime(mime: string): string {
  const known = EXTENSION_BY_MIME[mime?.toLowerCase()];
  if (known) return known;
  const fallback = mime?.startsWith("image/")
    ? mime.slice(6).replace(/[^a-z0-9]/gi, "")
    : "";
  return fallback || "png";
}

/** Ensure a download filename ends with an extension matching the blob. */
function withExtension(name: string, mime: string): string {
  if (/\.\w{1,5}$/.test(name)) return name;
  return `${name || "image"}.${extensionForMime(mime)}`;
}

// ─── Component ────────────────────────────────────────────────────────

/**
 * Renders an inline image preview that opens a lightbox on click. The
 * lightbox shows the image large, its filename (name + extension), and
 * always-visible controls to download it, copy it to the clipboard, or open
 * it in a new tab. Used by every image surface in chat (tool media results,
 * uploaded attachments, markdown-inline images) so behavior is identical.
 */
export function ImagePreview({
  src,
  url,
  alt,
  filename,
  className,
  imgClassName,
  onLoad,
  onError,
}: ImagePreviewProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const openUrl = url ?? src;
  const fileName = filename || filenameFromUrl(src);

  // Labeled pill buttons in the lightbox toolbar — theme-aware so the
  // viewer works on both light and dark backgrounds.
  const pillBtnClass = cn(
    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-95",
    "border-zinc-900/10 bg-zinc-900/5 text-zinc-900 hover:bg-zinc-900/10 hover:text-zinc-950",
    "dark:border-white/15 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10 dark:hover:text-white",
  );

  const handleDownload = async () => {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("Fetch failed");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = withExtension(fileName, blob.type);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success("Image downloaded");
    } catch {
      // Cross-origin fetch is blocked — open the image so the user can save
      // it via the browser's context menu instead of silently doing nothing.
      window.open(openUrl, "_blank", "noopener,noreferrer");
      toast.info("Opened image — use the browser menu to save it");
    }
  };

  const handleCopy = async () => {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("Fetch failed");
      const blob = await res.blob();
      const item = new ClipboardItem({ [blob.type || "image/png"]: blob });
      await navigator.clipboard.write([item]);
      setCopied(true);
      toast.success("Image copied to clipboard");
    } catch {
      // ClipboardItem unsupported or cross-origin fetch blocked — copy the
      // URL. Resolve relative paths (/api/chat/...) against the current
      // origin so the copied link works from localhost, an IP, or a domain.
      try {
        const absoluteUrl = new URL(openUrl, window.location.origin).toString();
        await navigator.clipboard.writeText(absoluteUrl);
        setCopied(true);
        toast.success("Image URL copied to clipboard");
      } catch {
        toast.error("Could not copy image");
      }
    }
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      {/* Inline preview — click opens the lightbox.
          NOTE: this wrapper is a <span>, not a <div>: markdown-to-jsx wraps
          images in a <p>, and a <div> inside <p> is invalid HTML (React
          hydration error). A span with inline-block display renders
          identically and is legal inside <p>. */}
      <span
        className={cn(
          "group relative inline-block max-w-full overflow-hidden",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onClick={() => setOpen(true)}
          onLoad={onLoad}
          onError={onError}
          title="Open preview"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={cn("block cursor-pointer", imgClassName)}
        />
      </span>

      {/* Lightbox — fullscreen, ChatGPT-style: image centered on a dark
          stage with a slim toolbar (filename + download/copy/open/close). */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-0 left-0 flex h-dvh w-full max-w-none -translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-[#f5f5f5] p-0 text-zinc-900 ring-0 sm:max-w-none dark:bg-[#171717] dark:text-white"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{fileName}</DialogTitle>

          {/* Slim top toolbar */}
          <div className="flex shrink-0 items-center gap-1.5 px-4 py-3">
            <ImageIcon className="h-4 w-4 shrink-0 text-zinc-400 dark:text-white/50" />
            <span className="min-w-0 flex-1 truncate pl-1 text-sm font-medium text-zinc-900 dark:text-white/90">
              {fileName}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handleDownload}
                aria-label="Download image"
                title="Download image"
                className={pillBtnClass}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? "Image copied" : "Copy image"}
                title={copied ? "Copied!" : "Copy image"}
                className={pillBtnClass}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied!" : "Copy"}
              </button>
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open image in new tab"
                title="Open in new tab"
                className={pillBtnClass}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
              <span className="mx-1 h-5 w-px bg-zinc-900/15 dark:bg-white/15" />
              <DialogClose
                render={
                  <button
                    type="button"
                    aria-label="Close preview"
                    title="Close preview"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-900/10 hover:text-zinc-900 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                  />
                }
              >
                <XIcon className="h-4 w-4" />
              </DialogClose>
            </div>
          </div>

          {/* Image stage — clicking the background (outside the image)
              closes the lightbox */}
          <div
            className="flex min-h-0 flex-1 cursor-default items-center justify-center overflow-hidden px-6 pb-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
