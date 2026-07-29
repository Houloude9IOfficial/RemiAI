"use client";

import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>;
  children: React.ReactNode;
  /** Minimum pull distance in px to trigger refresh. Default 80. */
  threshold?: number;
  /** Max visual pull distance in px. Default 120. */
  maxPull?: number;
  className?: string;
}

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
  maxPull = 120,
  className,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const el = containerRef.current;
      if (!el || isRefreshing) return;
      // Only activate when scrolled to the very top
      if (el.scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = false;
    },
    [isRefreshing],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const el = containerRef.current;
      if (!el || isRefreshing) return;
      // Only activate when at the top
      if (el.scrollTop > 0) {
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;

      if (diff > 0) {
        pullingRef.current = true;
        // Apply resistance: the further you pull, the harder it gets
        const resisted = Math.min(diff * 0.4, maxPull);
        setPullDistance(resisted);
      } else {
        setPullDistance(0);
      }
    },
    [isRefreshing, maxPull],
  );

  const handleTouchEnd = useCallback(
    async (e: React.TouchEvent) => {
      if (!pullingRef.current || isRefreshing) return;

      if (pullDistance >= threshold) {
        // Trigger refresh
        setIsRefreshing(true);
        setPullDistance(threshold); // Hold at threshold during refresh
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        // Snap back
        setPullDistance(0);
      }
      pullingRef.current = false;
    },
    [pullDistance, threshold, isRefreshing, onRefresh],
  );

  const isPastThreshold = pullDistance >= threshold;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-y-auto overscroll-none", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <AnimatePresence>
        {pullDistance > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: Math.min(pullDistance / threshold, 1),
              height: pullDistance,
            }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex items-center justify-center overflow-hidden"
          >
            <div
              className={cn(
                "flex items-center justify-center gap-2 transition-all duration-200",
              )}
            >
              {isRefreshing ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform duration-200",
                    isPastThreshold && "rotate-180",
                  )}
                />
              )}
              <span className="text-xs text-muted-foreground">
                {isRefreshing
                  ? "Refreshing..."
                  : isPastThreshold
                    ? "Release to refresh"
                    : "Pull to refresh"}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content — moves down with pull */}
      <div
        style={{
          transform: `translateY(${isRefreshing ? threshold : pullDistance}px)`,
          transition: pullDistance === 0 && !isRefreshing
            ? "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
