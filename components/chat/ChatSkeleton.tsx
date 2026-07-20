"use client";

import { cn } from "@/lib/utils";

// ── Deterministic width presets ─────────────────────────────────────

const SKELETON_WIDTHS = [
  "55%", "70%", "45%", "80%",
  "60%", "50%", "75%", "40%",
  "65%", "55%", "85%", "48%",
];

const LINE_WIDTHS = [
  ["100%", "85%", "60%"],
  ["100%", "90%", "45%"],
  ["100%", "75%", "55%"],
  ["100%", "95%", "50%"],
  ["100%", "80%", "65%"],
  ["100%", "88%", "42%"],
];

// ── Sub-components ──────────────────────────────────────────────────

function ShimmerSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md bg-muted/40 animate-skeleton-shimmer", className)}
      {...props}
    />
  );
}

function MessageSkeleton({ align = "left", index = 0 }: { align?: "left" | "right"; index?: number }) {
  const isRight = align === "right";
  const width = SKELETON_WIDTHS[index % SKELETON_WIDTHS.length];
  const lines = LINE_WIDTHS[index % LINE_WIDTHS.length];

  return (
    <div className={cn("flex gap-3", isRight ? "justify-end" : "justify-start")}>
      {/* Avatar placeholder (only for assistant messages) */}
      {!isRight && (
        <div className="mt-1 shrink-0">
          <div className="h-6 w-6 rounded-full bg-muted/40" />
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-2",
          isRight ? "items-end" : "items-start",
        )}
        style={{ maxWidth: "75%" }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2">
          <ShimmerSkeleton className="h-3 w-12 rounded" />
          <ShimmerSkeleton className="h-2.5 w-10 rounded" />
        </div>

        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isRight ? "bg-muted/30" : "bg-muted/20",
          )}
          style={{ width }}
        >
          <div className="flex flex-col gap-2">
            {lines.map((lineWidth, i) => (
              <ShimmerSkeleton key={i} className="h-3 rounded" style={{ width: lineWidth }} />
            ))}
          </div>
        </div>
      </div>

      {/* Spacer for user messages */}
      {isRight && <div className="shrink-0 w-6" />}
    </div>
  );
}

// ── Public component ───────────────────────────────────────────────

export function ChatSkeleton({
  showHeader = true,
  messageCount = 4,
  showInput = true,
  className,
}: {
  showHeader?: boolean;
  messageCount?: number;
  showInput?: boolean;
  className?: string;
}) {
  // Alternate message alignment: odd = left (assistant), even = right (user)
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    id: i,
    align: (i % 2 === 0 ? "left" : "right") as "left" | "right",
  }));

  return (
    <div className={cn("flex flex-1 flex-col h-full animate-fade-in", className)}>
      {/* ── Header bar skeleton ── */}
      {showHeader && (
        <div className="flex items-center gap-2 border-b px-4 py-2 bg-background/95 backdrop-blur sticky top-0 z-20">
          <ShimmerSkeleton className="h-6 w-6 rounded-md" />
          <ShimmerSkeleton className="h-4 w-48 rounded" />
          <div className="ml-auto">
            <ShimmerSkeleton className="h-8 w-32 rounded-lg" />
          </div>
        </div>
      )}

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              className="opacity-0 animate-fade-in"
              style={{
                animationDelay: `${idx * 120}ms`,
                animationFillMode: "forwards",
              }}
            >
              <MessageSkeleton align={msg.align} index={idx} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Input area skeleton ── */}
      {showInput && (
        <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur border-t border-border/20">
          <div className="p-8">
            <div className="flex items-end gap-2 rounded-2xl border border-border/40 p-2 bg-background">
              <div className="flex-1 flex items-center gap-2 px-3 py-2">
                <ShimmerSkeleton className="h-4 w-full rounded" />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <ShimmerSkeleton className="h-8 w-16 rounded-lg" />
                <ShimmerSkeleton className="h-8 w-8 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
