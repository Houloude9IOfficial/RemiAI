"use client";

import { useEffect, useRef, useState } from "react";

/** Roughly how long the unwrite phase, then the write phase, should take. */
const PHASE_MS = 260;
const TICK_MS = 20;

export type TypewriterTitle = {
  /** What to render right now — animates towards the `title` argument. */
  text: string;
  /** True while the unwrite/write animation is running. */
  animating: boolean;
};

/**
 * Animates a title change: the current title is unwritten character by
 * character, then the new one is typed out — instead of the sidebar title
 * snapping to its new value when the background titler replaces the fallback.
 *
 * - The first render is NOT animated (nothing to unwrite).
 * - Each phase is capped in duration, so a long title never becomes a crawl.
 * - Changing the title mid-animation restarts from the partially written text.
 * - `prefers-reduced-motion: reduce` skips straight to the new title.
 */
export function useTypewriterTitle(title: string): TypewriterTitle {
  const [text, setText] = useState(title);
  const [animating, setAnimating] = useState(false);
  const textRef = useRef(title);

  useEffect(() => {
    const reduceMotion =
      typeof window === "undefined" ||
      !window.matchMedia ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const from = textRef.current;
    if (reduceMotion || from === title) {
      textRef.current = title;
      setText(title);
      setAnimating(false);
      return;
    }

    const ticksPerPhase = PHASE_MS / TICK_MS;
    const unwriteStep = Math.max(1, Math.ceil(from.length / ticksPerPhase));
    const writeStep = Math.max(1, Math.ceil(title.length / ticksPerPhase));
    let current = from;
    let phase: "unwrite" | "write" = "unwrite";
    setAnimating(true);

    const timer = window.setInterval(() => {
      if (phase === "unwrite") {
        current = current.slice(0, Math.max(0, current.length - unwriteStep));
        if (current.length === 0) phase = "write";
      } else {
        current = title.slice(0, Math.min(title.length, current.length + writeStep));
      }
      textRef.current = current;
      setText(current);
      if (current === title) {
        window.clearInterval(timer);
        setAnimating(false);
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [title]);

  return { text, animating };
}
