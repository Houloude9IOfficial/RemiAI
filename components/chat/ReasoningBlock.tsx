"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";

/**
 * A Nexus-inspired reasoning disclosure for reasoning text supplied by the
 * provider. This component never invents reasoning; an empty part renders
 * nothing and unsupported providers never create a part in the first place.
 *
 * Multi-step runs emit one reasoning phase per step, so `isStreaming` toggles
 * off while tools run between steps. Instead of measuring one continuous
 * window (which would include tool-call gaps), the elapsed time of every
 * reasoning phase is accumulated and the label reports their TOTAL.
 *
 * The disclosure animates open/closed with a smooth height + opacity
 * transition driven by framer-motion.
 */
export function ReasoningBlock({
  text,
  isStreaming = false,
  messageStreaming = false,
  responseStreaming = false,
}: {
  text: string;
  isStreaming?: boolean;
  /** Whether the whole message is still generating (keeps the block open across tool gaps). */
  messageStreaming?: boolean;
  /** Whether the final text answer has started generating (collapses the block immediately). */
  responseStreaming?: boolean;
}) {
  const contentId = useId();
  const [open, setOpen] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const phaseStartRef = useRef<number | null>(null);
  const previousStreamingRef = useRef(false);
  const finalizedRef = useRef(false);

  useEffect(() => {
    const wasStreaming = previousStreamingRef.current;
    previousStreamingRef.current = isStreaming;

    // A reasoning phase started — begin timing it and open the block. If a
    // final answer already collapsed the block (e.g. text followed by another
    // reasoning phase in an agentic run), let it re-open and finalize again.
    if (!wasStreaming && isStreaming && phaseStartRef.current == null) {
      phaseStartRef.current = Date.now();
      finalizedRef.current = false;
      setFinalized(false);
      setDurationSeconds(null);
      setOpen(true);
    }

    // A reasoning phase ended — fold its elapsed time into the total. The
    // block stays open (messageStreaming is still true during tool gaps).
    if (wasStreaming && !isStreaming && phaseStartRef.current != null) {
      accumulatedMsRef.current += Date.now() - phaseStartRef.current;
      phaseStartRef.current = null;
    }

    const finalize = () => {
      if (phaseStartRef.current != null) {
        accumulatedMsRef.current += Date.now() - phaseStartRef.current;
        phaseStartRef.current = null;
      }
      if (accumulatedMsRef.current > 0) {
        setDurationSeconds(
          Math.max(1, Math.round(accumulatedMsRef.current / 1000)),
        );
      }
      finalizedRef.current = true;
      setFinalized(true);
      setOpen(false);
    };

    // The final response started generating — reasoning is over, so finalize
    // the accumulated duration and collapse the block the moment the answer
    // begins streaming instead of keeping it open (and labeled "Reasoning...")
    // through the whole response.
    if (responseStreaming && !finalizedRef.current) {
      finalize();
    }

    // The whole message finished (or aborted) — finalize exactly once.
    if (!messageStreaming && !finalizedRef.current) {
      finalize();
    }
  }, [isStreaming, messageStreaming, responseStreaming]);

  if (!text.trim()) return null;

  // While the run is still generating (including tool gaps between reasoning
  // phases) keep the live "Reasoning..." label; once the reasoning is done
  // (final answer streaming or message complete) the final total takes over.
  const label =
    !finalized && messageStreaming
      ? "Reasoning..."
      : durationSeconds != null
        ? `Reasoned for ${durationSeconds} ${durationSeconds === 1 ? "second" : "seconds"}`
        : "Reasoning complete";

  return (
    <section
      className="not-prose w-full"
      data-streaming={isStreaming ? "true" : "false"}
      aria-label="Model reasoning"
    >
      <button
        type="button"
        onClick={() => !isStreaming && setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          "group flex cursor-pointer items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground",
          isStreaming && "cursor-default",
        )}
      >
        <Brain className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span
          className={cn(
            "text-sm leading-6",
            isStreaming && "animate-pulse",
          )}
        >
          {label}
        </span>
        <ChevronDown
          className={cn(
            "ml-0.5 h-4 w-4 opacity-0 transition-all group-hover:opacity-100",
            open && "rotate-180 opacity-100",
            isStreaming && "hidden",
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
            <div className="mt-2 border-l border-border/70 pl-3 text-sm leading-6 text-muted-foreground">
              <MarkdownRenderer
                content={text}
                isStreaming={isStreaming}
                className="text-sm leading-6 [&_.markdown-body]:text-sm"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
