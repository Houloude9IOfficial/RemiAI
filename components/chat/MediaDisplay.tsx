"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ImageIcon, Play, Film, FileWarning } from "lucide-react";
import { ImagePreview } from "./ImagePreview";

interface MediaDisplayProps {
  /** The tool output object — expected to have type, dataUrl, url, filename, mimeType, size */
  data: Record<string, unknown>;
}

export function MediaDisplay({ data }: MediaDisplayProps) {
  const type = data.type as string | undefined;
  const dataUrl = data.dataUrl as string | undefined;
  const url = data.url as string | undefined;
  const filename = data.filename as string | undefined;
  const mimeType = data.mimeType as string | undefined;
  const size = data.size as number | undefined;
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [useUrlFallback, setUseUrlFallback] = useState(false);

  // Reset fallback state when data changes (new media result)
  useEffect(() => {
    setUseUrlFallback(false);
    setHasError(false);
    setIsLoading(true);
  }, [data.dataUrl, data.url]);

  // If dataUrl is present but fails to load (e.g. truncated by tool result
  // truncation), fall back to the server-served URL so the image still displays.
  const src = useUrlFallback || !dataUrl ? url : dataUrl;

  if (hasError) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-destructive/5 p-3 text-xs text-muted-foreground">
        <FileWarning className="h-4 w-4 shrink-0 text-destructive" />
        <span>
          Failed to load media: {filename ?? "unknown file"}
          {size !== undefined && ` (${formatSize(size)})`}
        </span>
      </div>
    );
  }

  // Images
  if (type === "image") {
    if (!src) {
      return <MissingInfo />;
    }

    return (
      <div className="relative overflow-hidden rounded-md">
        <ImagePreview
          src={src}
          url={url}
          alt={filename ?? "Image"}
          filename={filename}
          imgClassName={cn(
            "max-h-[75vh] w-full object-contain transition-opacity duration-300",
            isLoading && "opacity-0",
          )}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            // If dataUrl failed (likely truncated by tool result truncation),
            // fall back to the server URL before showing an error.
            if (dataUrl && url && !useUrlFallback) {
              setUseUrlFallback(true);
            } else {
              setHasError(true);
            }
          }}
        />
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/30 backdrop-blur-[1px]">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 animate-pulse text-blue-500/60" />
              <span className="text-xs font-medium text-blue-600/60 dark:text-blue-400/60">
                Analyzing image…
              </span>
            </div>
            {/* Scanning bar */}
            <div className="h-1 w-24 overflow-hidden rounded-full bg-blue-500/10">
              <div className="h-full w-full origin-left animate-[scan-progress_2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Videos
  if (type === "video") {
    if (!src) {
      return <MissingInfo />;
    }

    return (
      <div className="overflow-hidden rounded-md border border-border/50">
        <div className="relative">
          <video
            src={src}
            controls
            preload="metadata"
            className="max-h-[75vh] w-full bg-black"
            onLoadedData={() => setIsLoading(false)}
            onError={() => {
              if (dataUrl && url && !useUrlFallback) {
                setUseUrlFallback(true);
              } else {
                setHasError(true);
              }
            }}
          >
            Your browser does not support the video element.
          </video>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Film className="h-8 w-8 animate-pulse text-white/60" />
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-border/30 bg-muted/50 px-3 py-1.5 text-[10px] text-muted-foreground">
          <Play className="h-3 w-3" />
          <span className="font-medium">{filename}</span>
          {size !== undefined && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>{formatSize(size)}</span>
            </>
          )}
          {mimeType && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>{mimeType}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  // Unknown type — fall back to showing as JSON
  return null;
}

function MissingInfo() {
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
      <FileWarning className="h-4 w-4 shrink-0" />
      Media file info is incomplete — no data URL or server URL available.
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
