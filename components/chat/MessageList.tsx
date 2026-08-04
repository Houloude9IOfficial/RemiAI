"use client";

import type { UIMessage } from "ai";
import { type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { preferencesApi } from "@/lib/api/preferences";
import { MessageBubble } from "./MessageBubble";
import { ChatMessageProvider } from "./ChatMessageContext";
import {
  Loader2,
  Sparkles,
  FileText,
  Code,
  Search,
  WandSparkles,
} from "lucide-react";

// ── Quick action cards ────────────────────────────────────────────────

interface QuickAction {
  icon: ComponentType<{ className?: string }>;
  label: string;
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: FileText,
    label: "Summarize a document",
    prompt:
      "Summarize the most relevant file in my current workspace and list key takeaways.",
  },
  {
    icon: Search,
    label: "Search codebase for TODOs",
    prompt: "Search my codebase for TODOs and group them by file with short action suggestions.",
  },
  {
    icon: Code,
    label: "Generate a React component",
    prompt:
      "Write a reusable React component with TypeScript and Tailwind CSS.",
  },
  {
    icon: WandSparkles,
    label: "Propose an implementation plan",
    prompt:
      "Review this project and propose a concise implementation plan with clear steps and risks.",
  },
];

// ── Component ────────────────────────────────────────────────────────

export function MessageList({
  messages,
  status,
  onSend,
  onAiStart,
  isAiStarting,
}: {
  messages: UIMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
  onSend?: (text: string) => void;
  onAiStart?: () => void;
  isAiStarting?: boolean;
}) {
  const { data: prefs } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
    staleTime: 300_000,
  });

  const preferredName = (prefs?.preferredName ?? "").trim();
  const headline = preferredName
    ? `What are you working on, ${preferredName}?`
    : "What should we do?";

  const lastMessage = messages[messages.length - 1];
  const isWaiting =
    (status === "submitted" || status === "streaming") &&
    (!lastMessage || lastMessage.role === "user");

  if (messages.length === 0 && !isWaiting) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden px-6 pb-18 pt-16 animate-fade-in">
        <div className="relative flex mt-15 h-15 w-15 items-center opacity-0 justify-center rounded-xl border border-border/70 bg-background/50">
          <Sparkles className="h-4 w-4 text-muted-foreground/80" />
        </div>

        <p className="relative max-w-2xl text-center text-3xl font-semibold tracking-tight text-foreground/90 md:text-[2rem]">
          {headline}
        </p>

        <div className="relative grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => onSend?.(action.prompt)}
                className="group rounded-xl border border-border/70 bg-background/40 p-3 text-left transition-all duration-150 hover:border-border hover:bg-accent/40"
              >
                <div className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-md">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                </div>
                <div className="text-sm font-medium text-foreground/90">{action.label}</div>
              </button>
            );
          })}
        </div>

        {onAiStart && (
          <div className="relative mt-1 flex items-center gap-3">
            <div className="h-px flex-1 bg-border/30" />
            <span className="text-xs text-muted-foreground/50">or</span>
            <div className="h-px flex-1 bg-border/30" />
          </div>
        )}
        {onAiStart && (
          <button
            type="button"
            onClick={onAiStart}
            disabled={isAiStarting}
            className="group relative inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-4 py-2 text-sm font-medium text-foreground transition-all duration-150 hover:bg-accent/40 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {isAiStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Remi is thinking...</span>
              </>
            ) : (
              <span>Let Remi start the conversation</span>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <ChatMessageProvider value={{ sendMessage: onSend ?? (() => {}) }}>
      <div className="relative flex flex-1 flex-col">
        <div className="flex flex-1 flex-col p-6">
          <div className="flex flex-col gap-4">
            {messages.map((message, idx) => {
              return (
                <div key={message.id}>
                  <MessageBubble
                    message={message}
                    isStreaming={
                      idx === messages.length - 1 && status === "streaming"
                    }
                  />
                </div>
              );
            })}

            {isWaiting && (
              <div className="flex justify-start animate-fade-in">
                <div className="w-full max-w-[85%] px-4 py-3 text-sm text-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Spacer — massive breathing room for AI response to stream into */}
            <div className="h-64 shrink-0" />
          </div>
        </div>
      </div>
    </ChatMessageProvider>
  );
}
