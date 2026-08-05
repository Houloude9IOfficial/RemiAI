"use client";

import type { UIMessage } from "ai";
import { type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { preferencesApi } from "@/lib/api/preferences";
import { MessageBubble } from "./MessageBubble";
import { ChatMessageProvider } from "./ChatMessageContext";
import { GeneratingIndicator } from "./GeneratingIndicator";
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
  iconClass: string; // icon color, e.g. "text-sky-600"
  chipClass: string; // tinted chip behind the icon, e.g. "bg-sky-500/10"
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: FileText,
    label: "Summarize a document",
    prompt:
      "Summarize the most relevant file in my current workspace and list key takeaways.",
    iconClass: "text-sky-600",
    chipClass: "bg-sky-500/10",
  },
  {
    icon: Search,
    label: "Search codebase for TODOs",
    prompt: "Search my codebase for TODOs and group them by file with short action suggestions.",
    iconClass: "text-amber-600",
    chipClass: "bg-amber-500/10",
  },
  {
    icon: Code,
    label: "Generate a React component",
    prompt:
      "Write a reusable React component with TypeScript and Tailwind CSS.",
    iconClass: "text-emerald-600",
    chipClass: "bg-emerald-500/10",
  },
  {
    icon: WandSparkles,
    label: "Propose an implementation plan",
    prompt:
      "Review this project and propose a concise implementation plan with clear steps and risks.",
    iconClass: "text-violet-600",
    chipClass: "bg-violet-500/10",
  },
];

// ── Component ────────────────────────────────────────────────────────

export function MessageList({
  messages,
  status,
  onSend,
  onAiStart,
  isAiStarting,
  onRegenerate,
}: {
  messages: UIMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
  onSend?: (text: string) => void;
  onAiStart?: () => void;
  isAiStarting?: boolean;
  /** Called with a message id to regenerate it (deleting messages after it). */
  onRegenerate?: (messageId: string) => void;
}) {
  const { data: prefs } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
    staleTime: 300_000,
  });

  const preferredName = (prefs?.preferredName ?? "").trim();
  const headline = preferredName
  ? `What are you working on, <a className="font-semibold underline" href="/settings/profile">${preferredName}</a>?`
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

        {/* Outer element is a <div>, not a <p>, because the headline
            renders a nested <p dangerouslySetInnerHTML> (it may contain an
            <a> link). <p> inside <p> is invalid HTML and breaks hydration. */}
        <div className="relative max-w-2xl text-center text-3xl font-semibold tracking-tight text-foreground/90 md:text-[2rem]">
          <p dangerouslySetInnerHTML={{ __html: headline }} />
        </div>

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
                <div
                  className={`mb-2 inline-flex h-6 w-6 items-center justify-center rounded-md`}
                >
                  <Icon className={`h-4.5 w-4.5 ${action.iconClass}`} />
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
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 md:px-6">
          <div className="flex flex-col gap-5 md:gap-6">
            {messages.map((message, idx) => {
              return (
                <div key={message.id} className="animate-fade-in">
                  <MessageBubble
                    message={message}
                    isStreaming={
                      idx === messages.length - 1 && status === "streaming"
                    }
                    onRegenerate={onRegenerate}
                    messagesAfter={messages.length - idx - 1}
                  />
                </div>
              );
            })}

            {isWaiting && (
              <div className="flex justify-start animate-fade-in">
                <GeneratingIndicator label="Thinking" />
              </div>
            )}

            {/* Spacer — room for the next stream without oversized empty chrome */}
            <div className="h-28 shrink-0 md:h-36" />
          </div>
        </div>
      </div>
    </ChatMessageProvider>
  );
}