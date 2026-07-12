"use client";

import { useState } from "react";
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
  const isStreaming = status === "streaming" || status === "submitted";

  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="border-t p-4">
      <div className="flex items-end gap-2 rounded-2xl border bg-background p-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? "Pick a model to start chatting" : "Message RemiAI..."}
          disabled={disabled}
          className="min-h-9 resize-none border-none shadow-none focus-visible:ring-0"
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
