"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Polished "AI is working" indicator.
 *
 * - `variant="pill"`   — a standalone chip with a subtle surface + border,
 *   used when a message has no content to render yet.
 * - `variant="inline"` — compact icon + label, used beneath streaming content.
 *
 * The icon is a spinning gradient ring with a soft breathing glow; the label
 * gets a slowly sweeping sheen and a cascading animated ellipsis.
 */
export function GeneratingIndicator({
  label = "Generating response",
  variant = "inline",
  className,
}: {
  label?: string;
  variant?: "pill" | "inline";
  className?: string;
}) {
  // `useId` output contains colons which some SVG renderers dislike in
  // `url(#...)` references — strip them for safety.
  const gradId = useId().replace(/:/g, "");

  return (
    <div
      role="status"
      className={cn(
        "inline-flex items-center gap-2.5 mt-5",
        variant === "pill" &&
          // "rounded-full border border-border/60 bg-surface-2/60 py-1.5 pl-2 pr-3.5",
        className,
      )}
    >
      {/* ── Icon: spinning gradient ring + soft glow ── */}
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        {/* Breathing glow */}
        <span className="absolute inset-0 rounded-full blur-[4px] animate-generating-glow" />
        {/* Spinning ring */}
        <svg
          className="relative h-4 w-4 animate-generating-ring-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke={`url(#${gradId})`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="18 38.5"
          />
        </svg>
      </span>

      {/* ── Label with shimmer sheen + cascading ellipsis ── */}
      <span className="inline-flex items-baseline">
        <span className="generating-text-shimmer text-xs font-medium tracking-wide">
          {label}
        </span>
        {/* Decorative — hidden from screen readers so the status
            announces cleanly as e.g. "Generating response" */}
        <span className="ml-px inline-flex" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="animate-generating-ellipsis text-xs font-medium text-muted-foreground"
              style={{ animationDelay: `${i * 180}ms` }}
            >
              .
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}
