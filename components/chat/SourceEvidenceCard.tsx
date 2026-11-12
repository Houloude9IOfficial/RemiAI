"use client";

import { useId, useState } from "react";
import { Download, FileDiff } from "lucide-react";
import { cn } from "@/lib/utils";

import type { CitationRef } from "@/lib/chat/citations";
import { AnimatedDisclosure } from "./AnimatedDisclosure";
import { FileChangeDigest, type FileChangeSummary } from "./ToolActivity";

/** Favicons previewed inside the collapsed chip. */
const CHIP_FAVICON_COUNT = 3;

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconFor(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (!host) return "";
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch {
    return "";
  }
}

/**
 * Rounded favicon for a source URL. Falls back to the domain's first letter
 * when the favicon can't be loaded (offline hosts, odd TLDs, …).
 */
function SourceFavicon({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = faviconFor(url);

  if (!src || failed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-secondary text-[8px] font-bold uppercase text-primary",
          className,
        )}
        aria-hidden="true"
      >
        {domainOf(url).charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny favicon from a dynamic third-party URL; next/image needs remote-pattern config for no benefit
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full bg-background object-contain", className)}
      aria-hidden="true"
    />
  );
}

/** Overlapping favicon stack — the ChatGPT-style visual anchor of the chip. */
function FaviconStack({
  sources,
  className,
  ringClassName,
}: {
  sources: CitationRef[];
  className?: string;
  ringClassName?: string;
}) {
  return (
    <span className="flex items-center">
      {sources.slice(0, CHIP_FAVICON_COUNT).map((source, index) => (
        <SourceFavicon
          key={`${source.url}-${index}`}
          url={source.url}
          className={cn(className, index > 0 && "-ml-1.5", ringClassName)}
        />
      ))}
    </span>
  );
}

export function ResponseDetails({
  sources,
  changes,
  conversationId,
}: {
  sources: CitationRef[];
  changes: FileChangeSummary[];
  conversationId?: number;
}) {
  const id = useId();
  const [open, setOpen] = useState<"sources" | "changes" | null>(null);
  if (sources.length === 0 && changes.length === 0) return null;

  const chip = "inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/55 bg-muted/20 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-muted";
  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2">
        {sources.length > 0 && (
          <button type="button" aria-expanded={open === "sources"} aria-controls={`${id}-sources`}
            onClick={() => setOpen(open === "sources" ? null : "sources")} className={chip}>
            <FaviconStack sources={sources} className="size-4" ringClassName="ring-2 ring-background" />
            Sources <span className="tabular-nums">{sources.length}</span>
          </button>
        )}
        {changes.length > 0 && (
          <button type="button" aria-expanded={open === "changes"} aria-controls={`${id}-changes`}
            onClick={() => setOpen(open === "changes" ? null : "changes")} className={chip}>
            <FileDiff className="size-3.5" aria-hidden="true" />
            Changes <span className="tabular-nums">{changes.length}</span>
          </button>
        )}
      </div>
      <AnimatedDisclosure id={`${id}-sources`} open={open === "sources" && sources.length > 0}>
        <section aria-label="Research sources" className="mt-2 rounded-lg border border-border/50 text-sm">
          {conversationId != null && (
            <div className="flex justify-end border-b border-border/50 px-3 py-1.5">
              <a href={`/api/conversations/${conversationId}/research-report`}
                download={`remi-research-${conversationId}.md`}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Download className="size-3.5" aria-hidden="true" /> Export research report
              </a>
            </div>
          )}
          <ul tabIndex={0} aria-label="Source list" className="max-h-[min(50dvh,20rem)] space-y-1 overflow-y-auto overscroll-contain p-2">
            {sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" title={source.url}
                  className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-primary hover:bg-muted/60">
                  <SourceFavicon url={source.url} className="size-4" />
                  <span className="min-w-0 break-words">{source.title || domainOf(source.url)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </AnimatedDisclosure>
      <AnimatedDisclosure id={`${id}-changes`} open={open === "changes" && changes.length > 0}>
        <FileChangeDigest changes={changes} />
      </AnimatedDisclosure>
    </div>
  );
}
