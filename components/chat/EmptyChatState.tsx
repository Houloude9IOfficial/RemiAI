"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChatStatus } from "ai";
import {
  BarChart3,
  CalendarClock,
  Code2,
  FileText,
  Loader2,
  Search,
  type LucideIcon,
} from "lucide-react";
import { preferencesApi } from "@/lib/api/preferences";
import { ChatInput, type ChatMode } from "./ChatInput";
import type { QualityPolicy } from "@/lib/chat/quality-policy";

const OUTCOME_SUGGESTIONS: Array<{
  label: string;
  prompt: string;
  icon: LucideIcon;
}> = [
  {
    label: "Research a question",
    prompt: "Research this question and give me a grounded answer with sources: ",
    icon: Search,
  },
  {
    label: "Analyze a file",
    prompt: "Analyze the file I attach and summarize the important findings: ",
    icon: BarChart3,
  },
  {
    label: "Build or fix code",
    prompt: "Help me build or fix this code. Inspect the relevant files, make the change, and verify it: ",
    icon: Code2,
  },
  {
    label: "Create a document",
    prompt: "Create a polished document about this topic and save it in this chat: ",
    icon: FileText,
  },
  {
    label: "Schedule an operation",
    prompt: "Schedule this recurring operation and explain when it will run: ",
    icon: CalendarClock,
  },
];

/**
 * Empty conversation state — code-editor style: a headline with a large,
 * centered composer instead of suggestion cards. When the first message is
 * sent, the page swaps this out for the regular messages + docked input; the
 * docked composer fades in at its own position (it never animates this box's
 * size or position).
 */
export function EmptyChatState({
  conversationId,
  status,
  disabled,
  mode,
  onModeChange,
  qualityPolicy,
  onQualityPolicyChange,
  providerId,
  modelId,
  onModelChange,
  onSend,
  onStop,
  onAiStart,
  isAiStarting,
  children,
}: {
  conversationId: number;
  status: ChatStatus;
  disabled?: boolean;
  mode?: ChatMode;
  onModeChange?: (value: ChatMode) => void;
  qualityPolicy?: QualityPolicy;
  onQualityPolicyChange?: (value: QualityPolicy) => void;
  providerId?: number | null;
  modelId?: string | null;
  onModelChange?: (providerId: number, modelId: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onAiStart?: () => void;
  isAiStarting?: boolean;
  /** Extra content rendered below the composer (e.g. error card). */
  children?: ReactNode;
}) {
  const { data: prefs } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
    staleTime: 300_000,
  });

  const showWarning = false;

  const preferredName = (prefs?.preferredName ?? "").trim();
  const headline = preferredName
    ? `What are you up to, <a className="font-semibold underline" href="/settings/profile">${preferredName}</a>?`
    : "What should we do?";
  const isStreaming = status === "submitted" || status === "streaming";

  return (
    /* my-auto (not justify-center) keeps the top of the content reachable if
       it ever exceeds the viewport (e.g. with an error card visible). */
    /* Opacity-only fade: this root fills the scroll container exactly, so a
       translateY entrance would push it past the bottom edge and flash a
       scrollbar. */
    <div className="flex min-h-full w-full flex-col items-center px-6 pb-12 pt-2 animate-fade-in-opacity">
      <div className="my-auto flex w-full flex-col items-center gap-9">
        {/* Headline — outer element is a <div>, not a <p>, because it renders
            a nested <p dangerouslySetInnerHTML> (may contain an <a> link).
            <p> inside <p> is invalid HTML and breaks hydration. */}

        {disabled && !isStreaming && showWarning && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <span>Choose a model before sending a message.</span>
            <a
              href="/settings/providers"
              className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Open model settings
            </a>
          </div>
        )}
        <div className="relative max-w-3xl text-center text-4xl font-semibold tracking-tight text-foreground/90 md:text-[2.75rem] md:leading-[1.15]">
          {/**
           * Reserved mascot slot — when a mascot/illustration exists it can
           * drop in here next to the greeting. Renders nothing today: an
           * empty, zero-size anchor so the layout is already prepared.
           */}
          <div aria-hidden="true" className="pointer-events-none select-none" />
          <p dangerouslySetInnerHTML={{ __html: headline }} />
        </div>

        <div
          className="flex w-full max-w-3xl flex-wrap justify-center gap-2 hidden"
          aria-label="Common outcomes"
        >
          {OUTCOME_SUGGESTIONS.map(({ label, prompt, icon: Icon }) => (
            <button
              key={label}
              type="button"
              disabled={disabled || status === "submitted" || status === "streaming"}
              onClick={() => onSend(prompt)}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border/65 bg-background/70 px-3.5 py-2 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-45"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {/* Big centered composer — stays exactly where it is while typing.
            When the first message is sent the page swaps to the docked
            composer, which fades in at its own position instead of animating
            this box's size or position. */}
        <div className="w-full max-w-2xl">
          <ChatInput
            conversationId={conversationId}
            status={status}
            disabled={disabled}
            mode={mode}
            onModeChange={onModeChange}
            qualityPolicy={qualityPolicy}
            onQualityPolicyChange={onQualityPolicyChange}
            providerId={providerId}
            modelId={modelId}
            onModelChange={onModelChange}
            onSend={onSend}
            onStop={onStop}
            large
          />
        </div>

        {onAiStart && (
          <button
            type="button"
            onClick={onAiStart}
            disabled={isAiStarting || disabled}
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

        {children}
      </div>
    </div>
  );
}
