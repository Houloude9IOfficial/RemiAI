"use client";

import { Download, ExternalLink, Link2 } from "lucide-react";

type SourceItem = {
  id?: number;
  url: string;
  title?: string;
  /** Position in the message's citation order — matches the inline chips. */
  number?: number;
  status?: "available" | "partial" | "failed";
  qualityScore?: number;
  freshnessStatus?: "fresh" | "stale" | "unknown";
};

function statusLabel(status: SourceItem["status"]): string {
  if (status === "failed") return "failed";
  if (status === "partial") return "partial";
  return "retrieved";
}

export function SourceEvidenceCard({
  data,
  conversationId,
}: {
  data: unknown;
  conversationId?: number;
}) {
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

  return (
    <section
      aria-label="Research sources"
      className="overflow-hidden rounded-xl border border-border/60 bg-muted/[0.22] hidden"
    >
      <div className="flex items-center gap-2 border-b border-border/50 px-3.5 py-2.5">
        <Link2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sources
        </h3>
        <span className="text-[11px] text-muted-foreground/70">
          {sources.length} retrieved
        </span>
        {conversationId && (
          <a
            href={`/api/conversations/${conversationId}/research-report`}
            download={`remi-research-${conversationId}.md`}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Export research report"
            title="Export Markdown report"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            Export
          </a>
        )}
      </div>
      <ul className="divide-y divide-border/40">
        {sources.slice(0, 12).map((source, index) => {
          const title = source.title?.trim() || source.url;
          const status = source.status ?? "available";
          return (
            <li key={`${source.id ?? source.url}-${index}`} className="px-3.5 py-2.5">
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold tabular-nums text-primary"
                  aria-hidden="true"
                >
                  {source.number ?? index + 1}
                </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
                >
                  <span className="line-clamp-2">{title}</span>
                </a>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="max-w-[75%] truncate">{source.url}</span>
                {source.freshnessStatus && source.freshnessStatus !== "unknown" && (
                  <span className="text-muted-foreground">
                    {source.freshnessStatus}
                  </span>
                )}
                <span
                  className={
                    status === "failed"
                      ? "text-destructive"
                      : status === "partial"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                  }
                >
                  {statusLabel(status)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {sources.length > 12 && (
        <p className="border-t border-border/40 px-3.5 py-2 text-[11px] text-muted-foreground">
          +{sources.length - 12} more sources are available in the conversation context.
        </p>
      )}
    </section>
  );
}
