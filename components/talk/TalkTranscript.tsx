// ── Talk Transcript — Animated line-by-line display ─────────────────
// Each spoken sentence fades in below the circle with smooth animation.
// Previous lines fade slightly while maintaining readability.
// Like ChatGPT/Grok talk mode captions.
// ────────────────────────────────────────────────────────────────────

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface TranscriptLine {
  id: string;
  text: string;
  isCurrent: boolean;
}

interface TalkTranscriptProps {
  lines: TranscriptLine[];
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  // Split on sentence endings while keeping the punctuation
  const raw = text.split(/(?<=[.!?])\s+/);
  // Filter out empty strings and trim each sentence
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Sentence entry animation ────────────────────────────────────────

const sentenceVariants = {
  initial: {
    opacity: 0,
    y: 16,
    scale: 0.98,
  },
  enter: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: "easeOut" as const,
    },
  },
  exit: {
    opacity: 0.4,
    y: 0,
    scale: 0.98,
    transition: {
      duration: 0.4,
      ease: "easeOut" as const,
    },
  },
};

// ── Component ───────────────────────────────────────────────────────

export function TalkTranscript({
  lines,
  className,
}: TalkTranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLineCountRef = useRef(0);

  // Auto-scroll to the current line
  useEffect(() => {
    if (lines.length > prevLineCountRef.current) {
      prevLineCountRef.current = lines.length;
      // Small delay to let the animation start
      const timer = setTimeout(() => {
        containerRef.current?.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [lines.length]);

  if (lines.length === 0) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <p className="text-xs text-muted-foreground/30 italic">
          Your conversation will appear here
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col items-center gap-3 overflow-y-auto py-4",
        className,
      )}
      style={{ scrollbarWidth: "none" }}
    >
      <AnimatePresence mode="popLayout">
        {lines.map((line, idx) => (
          <motion.div
            key={line.id}
            layout
            variants={sentenceVariants}
            initial="initial"
            animate={line.isCurrent ? "enter" : "exit"}
            exit="exit"
            className={cn(
              "max-w-lg text-center transition-all duration-500",
              line.isCurrent
                ? "text-foreground"
                : "text-muted-foreground/50",
            )}
          >
            <p
              className={cn(
                "leading-relaxed transition-all duration-500",
                line.isCurrent
                  ? "text-base font-normal"
                  : "text-sm font-light",
              )}
            >
              {line.text}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}


