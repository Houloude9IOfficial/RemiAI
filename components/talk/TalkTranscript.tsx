// ── Talk Transcript — rolling sentence captions ─────────────────────
// Shows the most recent sentences of the assistant's reply, newest at
// the bottom, ChatGPT talk-mode style.
//
// Keys are absolute sentence indices, so a line keeps its identity as the
// window slides — that's what keeps the animation from re-firing (and the
// text from jumping) on every streaming delta.
// ────────────────────────────────────────────────────────────────────

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TalkTranscriptProps {
  /** The currently streaming assistant reply (markdown already stripped). */
  text: string;
  /** Completed turns, retained so Talk does not discard older captions. */
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  /** The sentence currently being spoken by TTS. */
  activeText?: string;
  className?: string;
}

type TranscriptLine = {
  content: string;
  role: "user" | "assistant";
  active?: boolean;
};

// ── Helpers ─────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Component ───────────────────────────────────────────────────────

export function TalkTranscript({ text, messages = [], activeText, className }: TalkTranscriptProps) {
  if (activeText) {
    return (
      <div className={cn("flex min-h-16 w-full items-center justify-center overflow-hidden", className)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={activeText}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-xl text-center text-base leading-relaxed text-foreground"
          >
            {activeText}
          </motion.p>
        </AnimatePresence>
      </div>
    );
  }

  // The voice surface shows only the sentence currently being spoken. The
  // complete history is retained by the page for the next model request.
  return null;

  const history: TranscriptLine[] = messages.flatMap((message) =>
    splitIntoSentences(message.content).map((content) => ({
      content,
      role: message.role,
    })),
  );
  const active: TranscriptLine[] = splitIntoSentences(text).map((content) => ({
    content,
    role: "assistant" as const,
    active: true,
  }));
  // Once a turn finishes, `messages` already contains the same assistant
  // reply as `text`; don't show that reply twice.
  const completed = text && messages.at(-1)?.role === "assistant"
    && messages.at(-1)?.content === text
    ? history.slice(0, -splitIntoSentences(text).length)
    : history;
  const lines = [...completed, ...active];
  const total = lines.length;
  if (total === 0) return null;

  return (
    <div
      className={cn(
        "flex max-h-64 w-full flex-col items-center justify-end gap-2.5 overflow-y-auto px-2",
        className,
      )}
    >
      {lines.map((line, i) => {
        const isCurrent = activeText
          ? line.role === "assistant" && line.content === activeText
          : i === total - 1 && (line.active || line.role === "assistant");
        return (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "max-w-xl text-center leading-relaxed transition-colors duration-500",
              line.role === "user"
                ? "text-sm text-primary/55"
                : isCurrent
                  ? "text-base text-foreground"
                  : "text-sm text-muted-foreground/45",
            )}
          >
            {line.content}
          </motion.p>
        );
      })}
    </div>
  );
}
