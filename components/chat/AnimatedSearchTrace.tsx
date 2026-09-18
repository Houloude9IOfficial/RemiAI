"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchTraceEntry } from "@/lib/chat/search-trace";

const STAGGER_MS = 150;

export function searchTraceSummary(entries: SearchTraceEntry[]): string {
  const results = entries.filter((entry) => entry.action === "result").length;
  const opened = entries.length - results;
  const parts: string[] = [];
  if (results) parts.push(`Searched ${results} result${results === 1 ? "" : "s"}`);
  if (opened) parts.push(`opened ${opened} page${opened === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Searched the web";
}

/** A presentation-only, progressively revealed timeline of web activity. */
export function AnimatedSearchTrace({
  entries,
  active,
  showUrls = false,
}: {
  entries: SearchTraceEntry[];
  active: boolean;
  /** Completed traces reveal full URLs when the user expands them. */
  showUrls?: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(() => active ? 0 : entries.length);

  useEffect(() => {
    if (!active) return;
    if (visibleCount >= entries.length) return;
    const timer = window.setTimeout(
      () => setVisibleCount((count) => Math.min(count + 1, entries.length)),
      STAGGER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active, entries.length, visibleCount]);

  // On completion the parent collapses this trace; if the user reopens it,
  // show the full persisted sequence immediately rather than replaying it.
  const visibleEntries = entries.slice(0, active ? visibleCount : entries.length);

  return (
    <div className="mt-2 rounded-lg border border-border/40 bg-muted/[0.16] p-2" aria-label="Search progress">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {active
          ? `Searching. ${visibleEntries.length} result${visibleEntries.length === 1 ? "" : "s"} found.`
          : searchTraceSummary(entries)}
      </p>
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
        <Search className={cn("h-3 w-3", active && "animate-pulse")} aria-hidden="true" />
        <span>{active ? "Searching" : searchTraceSummary(entries)}</span>
      </div>
      {visibleEntries.length > 0 && (
        <ul className="flex flex-col gap-1">
          <AnimatePresence initial={false}>
            {visibleEntries.map((entry) => (
              <motion.li
                key={entry.key}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1"
              >
                <Globe2 className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground/85">{entry.title}</p>
                  <p className="truncate text-[10px] text-muted-foreground" title={entry.url}>
                    {showUrls ? entry.url : entry.domain}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {entry.action === "opened" ? "Opened" : "Found"}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
