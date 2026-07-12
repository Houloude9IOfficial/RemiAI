"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square, Target, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";

export function ChatInput({
  status,
  disabled,
  agentic,
  onAgenticChange,
  onSend,
  onStop,
}: {
  status: ChatStatus;
  disabled?: boolean;
  agentic?: boolean;
  onAgenticChange?: (value: boolean) => void;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = status === "streaming" || status === "submitted";

  // Auto-focus input on mount and whenever it becomes enabled
  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="relative border-none p-8">

      {/* Subtle indicator bar when goal mode is active */}
      {agentic && !isStreaming && (
        <AnimatePresence>
          <motion.div
            className="mt-1.5 flex items-center gap-1.5 px-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 'flex-1' }}
              exit={{ width: 0 }}
              transition={{ duration: 0.5 }}
              className="h-0.5 rounded-full bg-gradient-to-r from-primary/40 via-primary/60 to-primary/40"
            />
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="text-[10px] font-medium tracking-wide text-primary/70"
            >
              Goal mode — AI will work autonomously
            </motion.span>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 'flex-1' }}
              exit={{ width: 0 }}
              transition={{ duration: 0.5 }}
              className="h-0.5 rounded-full bg-gradient-to-r from-primary/40 via-primary/60 to-primary/40"
            />
          </motion.div>
        </AnimatePresence>
      )}
      {/* Fade-blur gradient at the top so chat content fades smoothly into the input area */}
      <div className="pointer-events-none absolute inset-x-0 -top-6 z-10 h-6 bg-gradient-to-b from-transparent to-background backdrop-blur-[1px]" />
      <div className="flex items-end bg-background gap-2 rounded-2xl border p-2">
        <Textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? "Pick a model to start chatting" : "Message Remi..."}
          disabled={disabled}
          className="min-h-9 resize-none bg-background border-none shadow-none focus-visible:ring-0"
          rows={1}
        />

        {/* Goal mode toggle */}
        {!isStreaming && onAgenticChange && (
          <button
            type="button"
            onClick={() => onAgenticChange(!agentic)}
            disabled={disabled}
            className={cn(
              "group relative flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all duration-200",
              agentic
                ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                : "border-border/60 bg-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
              disabled && "opacity-40 pointer-events-none",
            )}
            title={agentic ? "Goal mode active — AI will work autonomously until complete" : "Toggle Goal mode for autonomous multi-step tasks"}
          >
            {agentic ? (
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Target className="h-3.5 w-3.5" />
            )}
            <span>Goal</span>
            {/* Glow ring when active */}
            {agentic && (
              <span className="absolute -inset-0.5 rounded-lg bg-primary/10 blur-sm -z-10" />
            )}
          </button>
        )}

        {isStreaming ? (
          <Button type="button" size="icon" className="h-8 w-8 shrink-0" onClick={onStop}>
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={disabled || !text.trim()}
            onClick={submit}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
