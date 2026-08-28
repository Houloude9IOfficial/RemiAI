"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";

type SourceItem = {
  id?: number;
  url: string;
  title?: string;
  /** Position in the message's citation order — matches the inline chips. */
  number?: number;
  status?: "available" | "partial" | "failed";
};

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
  sources: SourceItem[];
  className?: string;
  ringClassName?: string;
}) {
  return (
    <span className="flex items-center">
      {sources.slice(0, CHIP_FAVICON_COUNT).map((source, index) => (
        <SourceFavicon
          key={`${source.id ?? source.url}-${index}`}
          url={source.url}
          className={cn(className, index > 0 && "-ml-1.5", ringClassName)}
        />
      ))}
    </span>
  );
}

export function SourceEvidenceCard({
  data,
  conversationId,
}: {
  data: unknown;
  conversationId?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;
  if (!Array.isArray(raw.sources)) return null;

  const sources = raw.sources.filter(
    (item): item is SourceItem =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).url === "string",
  );
  if (sources.length === 0) return null;

  // ── Collapsed: one compact chip — 3 rounded favicons + "Sources · N" ──
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={`Show ${sources.length} research sources`}
        className="inline-flex items-center gap-2 self-start rounded-full border border-border/50 bg-muted/[0.22] py-1 pr-3 pl-1.5 transition-colors hover:bg-muted/40"
      >
        <FaviconStack
          sources={sources}
          className="h-[18px] w-[18px]"
          ringClassName="ring-2 ring-background"
        />
        <span className="text-xs font-medium text-foreground/85">Sources</span>
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
          {sources.length}
        </span>
      </button>
    );
  }

  // ── Expanded: pill rows (favicon + title), header collapses again ──
  return (
    <section
      aria-label="Research sources"
      className="overflow-hidden rounded-xl border border-border/50 bg-muted/[0.22]"
    >
      <button
        type="button"
        onClick={() => setExpanded(false)}
        aria-expanded
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <FaviconStack
          sources={sources}
          className="h-4 w-4"
          ringClassName="ring-2 ring-background"
        />
        <span className="text-xs font-medium text-foreground/85">Sources</span>
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
          {sources.length}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {conversationId && (
            <a
              href={`/api/conversations/${conversationId}/research-report`}
              download={`remi-research-${conversationId}.md`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Export research report"
              title="Export Markdown report"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
          <ChevronDown
            className="h-3.5 w-3.5 rotate-180 text-muted-foreground"
            aria-hidden="true"
          />
        </span>
      </button>

      <ul className="flex flex-col gap-1 border-t border-border/40 p-2">
        {sources.map((source, index) => {
          const title = source.title?.trim() || domainOf(source.url);
          return (
            <li key={`${source.id ?? source.url}-${index}`}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-full py-1.5 pr-3 pl-2 transition-colors"
                title={source.url}
              >
                <SourceFavicon url={source.url} className="h-5 w-5" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-primary/90">
                  {title}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
