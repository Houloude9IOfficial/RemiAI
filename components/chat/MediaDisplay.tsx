"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ImageIcon, Play, Film, FileWarning } from "lucide-react";

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
    const src = dataUrl ?? url;
    if (!src) {
      return <MissingInfo />;
    }

    return (
      <div className="group relative overflow-hidden rounded-md border border-border/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={filename ?? "Image"}
          className={cn(
            "max-h-[75vh] w-full object-contain transition-opacity duration-300",
            isLoading && "opacity-0",
          )}
          onLoad={() => setIsLoading(false)}
          onError={() => setHasError(true)}
          loading="lazy"
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
            <ImageIcon className="h-6 w-6 animate-pulse text-muted-foreground/50" />
          </div>
        )}
        {/* Footer overlay */}
        <div className="flex items-center gap-2 border-t border-border/30 bg-muted/50 px-3 py-1.5 text-[10px] text-muted-foreground">
          <ImageIcon className="h-3 w-3" />
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

  // Videos
  if (type === "video") {
    const src = dataUrl ?? url;
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
            onError={() => setHasError(true)}
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
