"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Volume2, VolumeX, Volume1 } from "lucide-react";

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  isSpeaking: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  className?: string;
}

export function VolumeControl({
  volume,
  isMuted,
  isSpeaking,
  onVolumeChange,
  onToggleMute,
  className,
}: VolumeControlProps) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      className={cn("relative flex items-center", className)}
    >
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 96, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <input
              ref={sliderRef}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className={cn(
                "h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-muted-foreground/20",
                "accent-primary",
                " [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125",
                " [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-sm",
              )}
              aria-label="Voice volume"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onMouseEnter={() => {
          if (expanded) {
          } else {
            setExpanded(true);
            // Focus the slider after it appears
            requestAnimationFrame(() => sliderRef.current?.focus());
          }
        }}
        onClick={() => {
          if (expanded) {
            onToggleMute();
          } else {
            setExpanded(true);
            // Focus the slider after it appears
            requestAnimationFrame(() => sliderRef.current?.focus());
          }
        }}
        className={cn(
          "flex h-8 w-8 ml-2 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
          isSpeaking && !isMuted && "text-primary animate-pulse",
          !isSpeaking && "text-muted-foreground hover:text-foreground hover:bg-muted",
          isMuted && "text-muted-foreground/40 hover:text-muted-foreground",
          expanded && "bg-muted",
        )}
        title={isMuted ? "Unmute voice" : expanded ? "Mute" : "Adjust volume"}
        aria-label={isMuted ? "Unmute voice" : expanded ? "Mute voice" : "Adjust voice volume"}
      >
        <VolumeIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
