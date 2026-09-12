// ── Talk Circle — voice state indicator ─────────────────────────────
// A large animated circle that reflects the voice state:
//   idle:      slow, subtle breathing pulse
//   listening: calm breathing with a soft outer ring
//   thinking:  gentle glow pulse
//   speaking:  visible energy ripples
//
// Only transform/opacity are animated — never SVG geometry attributes
// (animating `d`/`x1`/`y1` makes framer-motion emit `undefined` into the
// DOM and spams the console). Honours prefers-reduced-motion.
// ────────────────────────────────────────────────────────────────────

"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type CircleState = "idle" | "listening" | "thinking" | "speaking";

interface TalkCircleProps {
  state: CircleState;
  isMuted?: boolean;
  pressed?: boolean;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  className?: string;
}

const SIZE = 168;

// ── Gentle, shared easings ──────────────────────────────────────────

const BREATH = { duration: 3.2, repeat: Infinity, ease: "easeInOut" } as const;

// ── Ripple ring for the speaking state ──────────────────────────────

function RippleRing({ delay }: { delay: number }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full border border-primary/25"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: [0, 0.35, 0], scale: [0.94, 1.18, 1.34] }}
      transition={{ duration: 2.6, repeat: Infinity, delay, ease: "easeOut" }}
    />
  );
}

// ── Microphone icon ─────────────────────────────────────────────────
// Geometry is static; the capsule just breathes.

function MicIcon({ state }: { state: CircleState }) {
  const reduceMotion = useReducedMotion();

  const capsuleScale =
    reduceMotion || state === "idle" ? 1 : state === "speaking" ? [1, 1.1, 0.97, 1.06, 1] : [1, 1.035, 1];
  const capsuleDuration = state === "speaking" ? 1.1 : 2.6;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-9 w-9"
      aria-hidden="true"
    >
      <motion.g
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={{ scaleY: capsuleScale }}
        transition={{ duration: capsuleDuration, repeat: Infinity, ease: "easeInOut" }}
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      </motion.g>

      <motion.path
        d="M19 10v2a7 7 0 0 1-14 0v-2"
        animate={{
          opacity: reduceMotion ? 1 : state === "thinking" ? [0.55, 1, 0.55] : 1,
        }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />

      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="9" y1="22" x2="15" y2="22" />
    </svg>
  );
}

// ── State label ─────────────────────────────────────────────────────

const STATE_LABELS: Record<CircleState, string> = {
  idle: "Voice mode",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

// ── Main component ──────────────────────────────────────────────────

export function TalkCircle({
  state,
  isMuted,
  pressed,
  onClick,
  onPointerDown,
  onPointerUp,
  className,
}: TalkCircleProps) {
  const reduceMotion = useReducedMotion();

  // ── Circle motion per state ────────────────────────────────────
  const circleAnimation = (() => {
    if (reduceMotion) return { scale: 1 };
    switch (state) {
      case "speaking":
        return {
          scale: [1, 1.045, 0.99, 1.03, 1],
          transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" as const },
        };
      case "listening":
        return {
          scale: pressed ? [1, 1.035, 0.995, 1.02, 1] : [1, 1.02, 1],
          transition: {
            duration: pressed ? 1.6 : 2.6,
            repeat: Infinity,
            ease: "easeInOut" as const,
          },
        };
      case "thinking":
        return {
          scale: [1, 1.015, 1],
          transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" as const },
        };
      default:
        return { scale: [1, 1.015, 1], transition: BREATH };
    }
  })();

  const glowAnimation = (() => {
    if (reduceMotion) {
      return { scale: 1, opacity: state === "idle" ? 0.35 : 0.7 };
    }
    return {
      scale: state === "speaking" ? [1, 1.16, 1] : state === "idle" ? [1, 1.05, 1] : [1, 1.1, 1],
      opacity: state === "idle" ? [0.25, 0.4, 0.25] : [0.55, 0.8, 0.55],
      transition: {
        duration: state === "speaking" ? 2.2 : 3.4,
        repeat: Infinity,
        ease: "easeInOut" as const,
      },
    };
  })();

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: SIZE, height: SIZE }}
    >
      {/* Soft glow behind the circle */}
      <motion.div
        className="pointer-events-none absolute rounded-full bg-primary/10 blur-3xl"
        style={{ width: SIZE * 1.5, height: SIZE * 1.5 }}
        animate={glowAnimation}
      />

      {/* Energy ripples while the assistant speaks */}
      <AnimatePresence>
        {state === "speaking" && !isMuted && !reduceMotion && (
          <>
            <RippleRing delay={0} />
            <RippleRing delay={0.85} />
            <RippleRing delay={1.7} />
          </>
        )}
      </AnimatePresence>

      {/* Outer ring — doubles as the listening indicator */}
      <motion.div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full border",
          state === "idle" ? "border-border/40" : "border-primary/20",
        )}
        animate={{
          opacity: reduceMotion ? 0.6 : state === "idle" ? [0.35, 0.6, 0.35] : [0.6, 1, 0.6],
          scale: reduceMotion ? 1 : state === "listening" ? [1, 1.03, 1] : 1,
        }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main circle (button) */}
      <motion.button
        type="button"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={
          state === "speaking"
            ? "Interrupt the assistant"
            : state === "listening"
              ? "Pause listening"
              : "Start listening"
        }
        animate={circleAnimation}
        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
        className={cn(
          "relative z-10 flex select-none items-center justify-center rounded-full border transition-colors duration-500",
          "h-40 w-40",
          state === "idle" && "border-border/50 bg-background",
          state === "listening" && (pressed
            ? "border-primary/50 bg-primary/[0.08]"
            : "border-primary/35 bg-primary/[0.05]"),
          state === "thinking" && "border-primary/30 bg-primary/[0.04]",
          state === "speaking" && "border-primary/40 bg-primary/[0.06]",
          isMuted && "border-border/25 bg-muted/30",
          pressed ? "cursor-grabbing" : "cursor-pointer",
        )}
      >
        {/* Inner ring — static, just tints with the state */}
        <div
          className={cn(
            "pointer-events-none absolute inset-3 rounded-full border",
            state === "idle" ? "border-border/25" : "border-primary/15",
          )}
        />

        <div
          className={cn(
            "transition-colors duration-500",
            isMuted && "text-muted-foreground/25",
            !isMuted && state === "idle" && "text-muted-foreground/50",
            !isMuted && state === "thinking" && "text-primary/70",
            !isMuted && (state === "listening" || state === "speaking") && "text-primary",
          )}
        >
          <MicIcon state={state} />
        </div>
      </motion.button>

      {/* State label */}
      <p
        className={cn(
          "pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.16em] transition-colors duration-500",
          state === "idle" ? "text-muted-foreground/40" : "text-primary/70",
        )}
      >
        {STATE_LABELS[state]}
      </p>
    </div>
  );
}
