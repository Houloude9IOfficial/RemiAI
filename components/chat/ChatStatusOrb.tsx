"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";

/**
 * The shared, compact progress affordance for chat-only AI activity.
 * Thinking-orbs has dedicated 20px tuning, rather than a scaled-down avatar.
 */
export function ChatStatusOrb({ state }: { state: OrbState }) {
  const { resolvedTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <ThinkingOrb
      state={state}
      size={20}
      theme={resolvedTheme ?? "auto"}
      paused={reduceMotion ?? false}
      aria-hidden="true"
      className="shrink-0"
    />
  );
}
