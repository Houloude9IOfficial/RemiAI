"use client";

import type { OrbState } from "thinking-orbs";
import { cn } from "@/lib/utils";
import { ChatStatusOrb } from "./ChatStatusOrb";

/**
 * Polished "AI is working" indicator.
 *
 * - `variant="pill"`   — a standalone chip with a subtle surface + border,
 *   used when a message has no content to render yet.
 * - `variant="inline"` — compact icon + label, used beneath streaming content.
 *
 * The orb has separately tuned states for waiting and active generation.
 */
export function GeneratingIndicator({
  label = "Thinking…",
  state = "working",
  variant = "inline",
  className,
}: {
  label?: string | null;
  state?: OrbState;
  variant?: "pill" | "inline";
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label ?? "Thinking"}
      className={cn(
        "inline-flex items-center mt-5",
        label && "gap-2.5",
        variant === "pill" &&
          // "rounded-full border border-border/60 bg-surface-2/60 py-1.5 pl-2 pr-3.5",
        className,
      )}
    >
      <ChatStatusOrb state={state} />

      {label && (
        <span className="generating-text-shimmer text-xs font-medium tracking-wide">
          {label}
        </span>
      )}
    </div>
  );
}
