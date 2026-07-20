// ── Talk Circle — Pulsating voice indicator ─────────────────────────
// A large animated circle that responds to voice state:
//   idle:    slow, subtle breathing pulse
//   thinking: faster pulse with ambient glow
//   speaking: vibrant ring with energy waves
// ────────────────────────────────────────────────────────────────────

"use client";

import { motion, AnimatePresence } from "framer-motion";
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

// ── Ripple ring for speaking state ─────────────────────────────────

function RippleRing({ delay }: { delay: number }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full border-2 border-primary/30"
      initial={{ opacity: 0, scale: 1 }}
      animate={{
        opacity: [0, 0.4, 0],
        scale: [1, 1.3, 1.6],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        delay,
        ease: "easeOut",
      }}
    />
  );
}

// ── Microphone icon ────────────────────────────────────────────────

function MicIcon({ state }: { state: CircleState }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8"
    >
      <motion.path
        d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
        animate={
          state === "speaking"
            ? { scaleY: [1, 1.15, 0.95, 1.1, 1] }
            : { scaleY: 1 }
        }
        transition={
          state === "speaking"
            ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
            : {}
        }
      />
      <motion.path
        d="M19 10v2a7 7 0 0 1-14 0v-2"
        animate={
          state === "thinking"
            ? { d: ["M19 10v2a7 7 0 0 1-14 0v-2", "M19 9v2a7 7 0 0 1-14 0v-2"] }
            : { d: "M19 10v2a7 7 0 0 1-14 0v-2" }
        }
        transition={
          state === "thinking"
            ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
            : {}
        }
      />
      <motion.line
        x1="12"
        y1="19"
        x2="12"
        y2="22"
        animate={
          state === "speaking"
            ? { y1: [19, 18.5, 19], y2: [22, 21.5, 22] }
            : { y1: 19, y2: 22 }
        }
        transition={
          state === "speaking"
            ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
            : {}
        }
      />
      <motion.line
        x1="9"
        y1="22"
        x2="15"
        y2="22"
        animate={
          state === "speaking"
            ? { x1: [9, 8, 9], x2: [15, 16, 15] }
            : { x1: 9, x2: 15 }
        }
        transition={
          state === "speaking"
            ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
            : {}
        }
      />
    </svg>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function TalkCircle({
  state,
  isMuted,
  pressed,
  onClick,
  onPointerDown,
  onPointerUp,
  className,
}: TalkCircleProps) {
  // ── Circle animations ──────────────────────────────────────────
  // Note: boxShadow can't use oklch CSS vars (Tailwind 4 style),
  // so we control glow via the separate blur div behind the circle.

  const idleAnimation = {
    scale: 1,
  };

  const listeningAnimation = {
    scale: pressed ? [1, 1.04, 0.98, 1.02, 1] : [1, 1.02, 0.99, 1.01, 1],
    transition: {
      duration: pressed ? 0.6 : 1.2,
      repeat: Infinity,
      ease: "easeInOut" as const,
    },
  };

  const thinkingAnimation = {
    scale: [1, 1.03, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut" as const,
    },
  };

  const speakingAnimation = {
    scale: [1, 1.06, 0.98, 1.04, 1],
    transition: {
      duration: 0.8,
      repeat: Infinity,
      ease: "easeInOut" as const,
    },
  };

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* Ripple rings (only during speaking) */}
      <AnimatePresence>
        {state === "speaking" && !isMuted && (
          <>
            <RippleRing delay={0} />
            <RippleRing delay={0.7} />
            <RippleRing delay={1.4} />
          </>
        )}
      </AnimatePresence>

      {/* Glow behind circle */}
      <motion.div
        className="absolute rounded-full bg-primary/5 blur-3xl"
        style={{ width: 200, height: 200 }}
        animate={{
          scale:
            state === "speaking"
              ? [1, 1.2, 1]
              : state === "listening"
                ? [1, 1.08, 1]
                : 1,
          opacity:
            state === "idle"
              ? 0.5
              : state === "listening"
                ? 0.8
                : state === "thinking"
                  ? 0.7
                  : 0.9,
        }}
        transition={{
          duration:
            state === "speaking"
              ? 1.5
              : state === "listening"
                ? 1.2
                : 2,
          repeat:
            state === "speaking" || state === "listening" ? Infinity : 0,
          ease: "easeInOut",
        }}
      />

      {/* Main circle */}
      <motion.button
        type="button"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className={cn(
          "relative z-10 flex items-center justify-center",
          "rounded-full border-2 transition-colors duration-300",
          state === "idle" && "border-border/40 bg-background",
          state === "listening" && (pressed
            ? "border-primary/50 bg-primary/[0.08]"
            : "border-primary/30 bg-primary/[0.04]"
          ),
          state === "thinking" && "border-primary/30 bg-primary/[0.03]",
          state === "speaking" && "border-primary/40 bg-primary/[0.05]",
          isMuted && "border-border/20 bg-muted/30",
          pressed && "cursor-grabbing",
          !pressed && "cursor-pointer",
          "select-none",
          "active:scale-[0.97] transition-transform duration-150",
        )}
        style={{ width: 160, height: 160 }}
        animate={
          state === "idle"
            ? idleAnimation
            : state === "listening"
              ? listeningAnimation
              : state === "thinking"
                ? thinkingAnimation
                : speakingAnimation
        }
        transition={{
          duration:
            state === "idle"
              ? 3
              : state === "listening"
                ? 1.2
                : state === "thinking"
                  ? 1.5
                  : 0.8,
          repeat:
            state === "idle" ||
            state === "listening" ||
            state === "thinking" ||
            state === "speaking"
              ? Infinity
              : 0,
          ease: "easeInOut",
        }}
      >
        {/* Inner glow ring */}
        <motion.div
          className="absolute inset-2 rounded-full"
          animate={{
            borderWidth: state === "speaking" ? [1, 2, 1] : 1,
            borderColor:
              state === "idle"
                ? "rgba(var(--color-border), 0.3)"
                : "rgba(var(--color-primary), 0.15)",
          }}
          transition={
            state === "speaking"
              ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
              : {}
          }
          style={{ borderStyle: "solid", borderColor: "transparent" }}
        />

        {/* Microphone icon */}
        <motion.div
          className={cn(
            "transition-colors duration-300",
            state === "idle" && "text-muted-foreground/40",
            state === "listening" && "text-primary",
            state === "thinking" && "text-primary/60",
            state === "speaking" && "text-primary",
            isMuted && "text-muted-foreground/20",
          )}
        >
          <MicIcon state={state} />
        </motion.div>
      </motion.button>

      {/* State label below circle */}
      <motion.p
        className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.15em]"
        animate={{
          color:
            state === "idle"
              ? "var(--muted-foreground)"
              : state === "thinking"
                ? "var(--primary)"
                : "var(--primary)",
          opacity: state === "idle" ? 0.4 : 0.7,
        }}
      >
        {state === "idle"
          ? "Voice mode"
          : state === "listening"
            ? "Listening"
            : state === "thinking"
              ? "Thinking"
              : "Speaking"}
      </motion.p>
    </div>
  );
}
