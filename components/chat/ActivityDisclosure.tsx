"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, ChevronDown, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallGroup, summarizeToolActivity } from "./ToolCallGroup";

/**
 * Claude-style collapsed "activity" line. While a message's leading reasoning
 * + tool run streams, this stays open so the user sees progress; once the
 * run finishes it collapses into a single quiet summary — e.g.
 * "Edited session file · 5 calls" — that expands to reveal the reasoning
 * text and the chained tool trace.
 */
export function ActivityDisclosure({
  reasoning,
  toolGroups,
  isStreaming,
  responseStreaming,
}: {
  /** Merged reasoning text (or null when the run had no reasoning phase). */
  reasoning: { text: string; isStreaming: boolean } | null;
  /** Tool parts grouped by their original segment (each renders a trace). */
  toolGroups: Array<{
    parts: Parameters<typeof ToolCallGroup>[0]["parts"];
  }>;
  /** Whether the whole message is still generating. */
  isStreaming: boolean;
  /** Whether the final text answer has started generating. */
  responseStreaming: boolean;
}) {
  const contentId = useId();
  const [open, setOpen] = useState(true);
  const userToggledRef = useRef(false);

  const allParts = toolGroups.flatMap((g) => g.parts);
  const summary = summarizeToolActivity(allParts);
  const hasTools = allParts.length > 0;
  const reasoningStreaming = reasoning?.isStreaming === true;
  const hasQuestions = summary.hasQuestions;

  // Auto-open while the run is working; collapse when the final answer starts
  // or the message completes — unless the user explicitly toggled it.
  const shouldOpen = isStreaming && !responseStreaming;
  const working = shouldOpen || summary.running || reasoningStreaming;

  useEffect(() => {
    if (working && !userToggledRef.current) setOpen(true);
    if (!shouldOpen && !userToggledRef.current && !hasQuestions) setOpen(false);
  }, [working, shouldOpen, hasQuestions]);

  if (!reasoning?.text.trim() && !hasTools) return null;

  const label = working
    ? reasoningStreaming
      ? "Thinking…"
      : summary.running
        ? summary.present
        : "Working…"
    : hasTools
      ? summary.runName ?? summary.past
      : "Reasoning complete";

  const callSuffix =
    hasTools && summary.count > 1 ? ` · ${summary.count} calls` : "";

  return (
    <section className="not-prose w-full" aria-label="Activity">
      <button
        type="button"
        onClick={() => {
          if (working) return;
          userToggledRef.current = true;
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          "group flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground",
          working && "cursor-default",
        )}
      >
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center",
            summary.hasError && !working ? "text-status-danger" : "",
          )}
        >
          {working ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : hasTools ? (
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Brain className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-sm leading-6",
            working && "animate-pulse",
          )}
        >
          {label}
          {callSuffix}
        </span>
        <ChevronDown
          className={cn(
            "ml-0.5 h-4 w-4 shrink-0 transition-transform duration-200 group-hover:opacity-100",
            open ? "rotate-180 opacity-100" : "opacity-0",
            working && "hidden",
          )}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={contentId}
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 flex flex-col gap-1.5">
              {reasoning?.text.trim() && (
                <div className="border-l border-border/70 pl-3 text-sm leading-6 text-muted-foreground">
                  <MarkdownRenderer
                    content={reasoning.text}
                    isStreaming={reasoning.isStreaming}
                    className="text-sm leading-6 [&_.markdown-body]:text-sm"
                  />
                </div>
              )}
              {toolGroups.map((group, idx) => (
                <ToolCallGroup key={`trace-${idx}`} parts={group.parts} headerless />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
