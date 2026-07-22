"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useChatMessage } from "./ChatMessageContext";
import { cn } from "@/lib/utils";
import { ArrowRight, Lightbulb, SendHorizonal } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Suggestion {
  text: string;
}

interface SuggestionsData {
  type: "suggestions";
  count: number;
  suggestions: Suggestion[];
}

// ---------------------------------------------------------------------------
// FollowupSuggestions — detects `type: "suggestions"` in tool output and
// renders clickable chips that, when clicked, send the suggestion as a new
// user message.
// ---------------------------------------------------------------------------

export function FollowupSuggestions({ data }: { data: unknown }) {
  // Only render for suggestions data
  if (!data || typeof data !== "object") return null;

  const sd = data as Record<string, unknown>;
  if (sd.type !== "suggestions") return null;

  const suggestionsData = sd as unknown as SuggestionsData;
  if (!Array.isArray(suggestionsData.suggestions)) return null;

  return <SuggestionsForm data={suggestionsData} />;
}

// ---------------------------------------------------------------------------
// Internal form component
// ---------------------------------------------------------------------------

function SuggestionsForm({ data }: { data: SuggestionsData }) {
  const { sendMessage } = useChatMessage();
  const [clickedIndex, setClickedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { suggestions } = data;

  const handleClick = useCallback(
    (index: number, text: string) => {
      if (clickedIndex !== null) return; // Already clicked one
      setClickedIndex(index);
      sendMessage(text);
    },
    [clickedIndex, sendMessage],
  );

  // Auto-scroll into view when the card appears
  useEffect(() => {
    const timer = setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 to-background shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/30 px-3.5 py-2.5">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
          <Lightbulb className="h-3 w-3 text-amber-600 dark:text-amber-400" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          Follow up
        </span>
        {clickedIndex === null && (
          <span className="ml-auto text-[10px] text-muted-foreground/50">
            {suggestions.length} suggestion{suggestions.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Suggestions */}
      <div className="flex flex-col gap-1.5 p-3">
        {suggestions.map((suggestion, idx) => {
          const isClicked = clickedIndex === idx;
          const isDisabled = clickedIndex !== null && !isClicked;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleClick(idx, suggestion.text)}
              disabled={isDisabled}
              className={cn(
                "group relative flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs leading-relaxed transition-all duration-200",
                isClicked
                  ? "border-primary/40 bg-primary/5 text-foreground shadow-sm"
                  : isDisabled
                    ? "border-border/20 bg-muted/10 text-muted-foreground/40 cursor-default"
                    : "border-border/40 bg-background/60 text-muted-foreground hover:border-primary/30 hover:bg-primary/[0.03] hover:text-foreground hover:shadow-sm cursor-pointer",
              )}
            >
              {/* Icon */}
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
                  isClicked
                    ? "bg-primary/10 text-primary"
                    : isDisabled
                      ? "bg-muted-foreground/5 text-muted-foreground/30"
                      : "bg-muted-foreground/10 text-muted-foreground/50 group-hover:bg-primary/10 group-hover:text-primary",
                )}
              >
                {isClicked ? (
                  <SendHorizonal className="h-3 w-3" />
                ) : (
                  <ArrowRight className="h-3 w-3" />
                )}
              </span>

              {/* Text */}
              <span className="flex-1 pt-0.5">{suggestion.text}</span>

              {/* Clicked indicator */}
              {isClicked && (
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                  Sent
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
