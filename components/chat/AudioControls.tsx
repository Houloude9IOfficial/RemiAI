// ── Audio Controls — Chat Header ────────────────────────────────────
// Premium audio controls: mute/unmute toggle, expandable volume slider,
// voice on/off indicator, and ambient sound visualizer.
// ────────────────────────────────────────────────────────────────────

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Volume2,
  VolumeX,
  Volume1,
  Radio,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────

interface AudioControlsProps {
  /** Ambient sound volume 0–1 */
  ambientVolume: number;
  /** Is ambient sound currently playing? */
  ambientPlaying: boolean;
  /** Is ambient sound muted? */
  ambientMuted: boolean;
  /** TTS currently speaking? */
  ttsSpeaking: boolean;
  /** TTS volume 0–1 */
  ttsVolume: number;
  /** Is TTS muted? */
  ttsMuted: boolean;
  /** TTS engine ('system' | 'elevenlabs') */
  ttsEngine: "system" | "elevenlabs";
  /** Callbacks */
  onAmbientVolumeChange: (v: number) => void;
  onAmbientToggleMute: () => void;
  onTtsVolumeChange: (v: number) => void;
  onTtsToggleMute: () => void;
  onTtsEngineChange: (e: "system" | "elevenlabs") => void;
}

// ── Ambient Waveform Visualizer ─────────────────────────────────────

function AmbientIndicator({
  isPlaying,
  isMuted,
}: {
  isPlaying: boolean;
  isMuted: boolean;
}) {
  return (
    <div className="relative flex items-center gap-[2px]">
      {[1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className={cn(
            "w-[2px] rounded-full",
            isPlaying && !isMuted
              ? "bg-primary/60"
              : "bg-muted-foreground/20",
          )}
          animate={
            isPlaying && !isMuted
              ? {
                  height: [4, 12, 8, 14, 6, 4],
                  transition: {
                    duration: 0.8 + i * 0.15,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.1,
                  },
                }
              : {
                  height: 4,
                }
          }
          style={{ height: 4 }}
        />
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function AudioControls({
  ambientVolume,
  ambientPlaying,
  ambientMuted,
  ttsSpeaking,
  ttsVolume,
  ttsMuted,
  ttsEngine,
  onAmbientVolumeChange,
  onAmbientToggleMute,
  onTtsVolumeChange,
  onTtsToggleMute,
  onTtsEngineChange,
}: AudioControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setExpanded(false);
      }
    };
    // Delay registering to avoid the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [expanded]);

  const anyActive = ambientPlaying || ttsSpeaking;
  const anyMuted = ambientMuted && ttsMuted;

  // Determine the overall icon
  const MainIcon = anyMuted ? VolumeX : ambientPlaying ? Radio : Volume2;

  const handleMainClick = useCallback(() => {
    if (expanded) {
      onAmbientToggleMute();
    } else {
      setExpanded(true);
      requestAnimationFrame(() => sliderRef.current?.focus());
    }
  }, [expanded, onAmbientToggleMute]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
    >
      <AnimatePresence mode="popLayout">
        {expanded && (
          <motion.div
            key="controls"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex items-center gap-1.5 overflow-hidden"
          >
            {/* Ambient volume slider */}
            <div className="flex items-center gap-1 pl-1">
              <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Amb
              </span>
              <input
                ref={sliderRef}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={ambientMuted ? 0 : ambientVolume}
                onChange={(e) => {
                  onAmbientVolumeChange(Number(e.target.value));
                  if (ambientMuted && Number(e.target.value) > 0) {
                    onAmbientToggleMute();
                  }
                }}
                className={cn(
                  "h-1 w-16 cursor-pointer appearance-none rounded-full bg-muted-foreground/20",
                  "accent-primary",
                  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125",
                  "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-sm",
                )}
                aria-label="Ambient volume"
              />
            </div>

            {/* TTS volume slider */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Voice
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={ttsMuted ? 0 : ttsVolume}
                onChange={(e) => {
                  onTtsVolumeChange(Number(e.target.value));
                  if (ttsMuted && Number(e.target.value) > 0) {
                    onTtsToggleMute();
                  }
                }}
                className={cn(
                  "h-1 w-16 cursor-pointer appearance-none rounded-full bg-muted-foreground/20",
                  "accent-primary",
                  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125",
                  "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-sm",
                )}
                aria-label="Voice volume"
              />
            </div>

            {/* TTS Engine toggle */}
            <button
              type="button"
              onClick={() =>
                onTtsEngineChange(
                  ttsEngine === "system" ? "elevenlabs" : "system",
                )
              }
              className={cn(
                "flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] font-medium uppercase tracking-wider transition-all duration-150",
                ttsEngine === "elevenlabs"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground/50 hover:text-muted-foreground",
              )}
              title={
                ttsEngine === "elevenlabs"
                  ? "Using ElevenLabs AI voice"
                  : "Using system voice"
              }
            >
              {ttsEngine === "elevenlabs" ? (
                <Sparkles className="h-2.5 w-2.5" />
              ) : (
                <Radio className="h-2.5 w-2.5" />
              )}
              <span>{ttsEngine === "elevenlabs" ? "AI" : "Sys"}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main toggle button */}
      <button
        type="button"
        onClick={handleMainClick}
        onMouseEnter={() => {
          if (!expanded) {
            setExpanded(true);
            requestAnimationFrame(() => sliderRef.current?.focus());
          }
        }}
        className={cn(
          "relative flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200",
          anyActive && !anyMuted && "text-primary",
          !anyActive && "text-muted-foreground hover:text-foreground hover:bg-muted",
          anyMuted && "text-muted-foreground/40 hover:text-muted-foreground",
          expanded && "bg-muted",
        )}
        title={anyMuted ? "Unmute audio" : expanded ? "Mute audio" : "Audio controls"}
        aria-label={anyMuted ? "Unmute audio" : expanded ? "Mute audio" : "Open audio controls"}
      >
        <div className="relative flex items-center justify-center">
          {/* Ambient indicator behind icon */}
          {ambientPlaying && !ambientMuted && (
            <div className="absolute inset-0 flex items-center justify-center">
              <AmbientIndicator isPlaying={true} isMuted={false} />
            </div>
          )}
          {/* Icon */}
          <motion.div
            key={anyMuted ? "muted" : anyActive ? "active" : "idle"}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {ttsSpeaking && !ttsMuted ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MainIcon className="h-3.5 w-3.5" />
            )}
          </motion.div>
        </div>
      </button>
    </div>
  );
}
