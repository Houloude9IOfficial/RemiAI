"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square } from "lucide-react";
import type { ChatStatus } from "ai";

export function ChatInput({
  status,
  disabled,
  onSend,
  onStop,
}: {
  status: ChatStatus;
  disabled?: boolean;
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
