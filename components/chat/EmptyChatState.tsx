"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChatStatus } from "ai";
import {
  BarChart3,
  Code2,
  FileText,
  Search,
  type LucideIcon,
} from "lucide-react";
import { preferencesApi } from "@/lib/api/preferences";
import { ChatInput, type ChatMode } from "./ChatInput";
import type { QualityPolicy } from "@/lib/chat/quality-policy";
import { Timer } from "lucide-react";
import { TEMPORARY_CHAT_RETENTION_DAYS } from "@/lib/chat/temporary-chat-constants";
import { focusChatInput } from "@/lib/chat-input-registry";
import { ChatStatusOrb } from "./ChatStatusOrb";

const OUTCOME_SUGGESTIONS: Array<{
  label: string;
  prompt: string;
  icon: LucideIcon;
  mode?: ChatMode;
}> = [
  {
    label: "Research a question",
    prompt: "Research the following question thoroughly before answering. Break it into the sub-questions that need answers, then gather information from multiple independent, credible sources for each — don't rely on a single source or your own assumptions where verifiable facts exist. Cross-check claims that conflict between sources and note the discrepancy rather than picking one arbitrarily. Distinguish clearly between what is well-established, what is disputed, and what you're inferring. Cite where each key claim comes from. Once you have enough to answer with confidence, give a direct, well-organized answer up front, followed by the supporting detail and any important caveats or open questions. Question:",
    icon: Search,
    mode: "goal"
  },
  {
    label: "Analyze a file",
    prompt: "Analyze the attached file in full before summarizing anything — read all of it, not just the beginning or a sample, and check for structure, patterns, outliers, and anything that looks off (errors, inconsistencies, missing data, stale content). Identify the most important findings first, ranked by relevance and impact, not just in the order they appear in the file. Where useful, back findings with specific figures, quotes, or excerpts from the file rather than vague generalities. Flag anything ambiguous, incomplete, or that needs a decision from me. Then give a concise summary of the key takeaways, followed by the supporting detail organized by topic.",
    icon: BarChart3,
    mode: "goal"
  },
  {
    label: "Create a document",
    prompt: "Before writing, clarify the audience, purpose, and desired length/format for this document if they aren't already obvious, and make a reasonable assumption explicitly if you proceed without asking. Structure the document with clear sections and headings appropriate to its purpose (report, guide, proposal, etc.), and make sure the argument or information flows logically from section to section rather than reading as disconnected chunks. Write in clear, precise language, avoid filler and unsupported claims, and back up any factual statements you're not certain about by researching them first rather than guessing. Proofread for consistency, tone, and correctness before finalizing. Save the finished document in this chat as a properly formatted file. Topic:",
    icon: FileText,
    mode: "goal"
  },
  {
    label: "Plan & Build",
    prompt: "Inspect the relevant files first and build a full understanding of the existing implementation before proposing anything. Use the `ask_questions` tool for any decision, missing detail, or ambiguity that would materially change the approach, but skip it for anything you can reasonably infer. Once you have enough context, produce an implementation plan covering the files to change or create, the specific changes in each, edge cases and how they're handled, and how the result will be tested and verified. Present the plan and wait for explicit approval before making any changes. On approval, call `switch_mode` to enter code mode, implement exactly what was approved, then verify the result using whatever applies: tests, build, type checks, linters, `canvas_review`, or other available validation. If verification finds issues, fix them and re-verify, repeating until verification is clean, then report the final changes and verification results. Request:",
    icon: Code2,
    mode: "plan",
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
  isTemporary,
  memoryEnabled,
  onTemporaryChange,
  onMemoryChange,
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
  /** Temporary-chat flag + per-chat memory switch (fully independent). */
  isTemporary?: boolean;
  memoryEnabled?: boolean;
  onTemporaryChange?: (value: boolean) => void;
  onMemoryChange?: (value: boolean) => void;
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
  const [activeSuggestion, setActiveSuggestion] = useState<string | null>(null);

  const toggleSuggestion = useCallback(
    (suggestion: (typeof OUTCOME_SUGGESTIONS)[number]) => {
      const isActive = activeSuggestion === suggestion.prompt;
      const previousSuggestion = OUTCOME_SUGGESTIONS.find(
        (item) => item.prompt === activeSuggestion,
      );

      if (isActive) {
        setActiveSuggestion(null);
        if (suggestion.mode) onModeChange?.("chat");
        requestAnimationFrame(focusChatInput);
        return;
      }

      // Suggestions are single-select: selecting a new chip replaces the
      // previous chip instead of stacking multiple long prompts together.
      setActiveSuggestion(suggestion.prompt);
      if (suggestion.mode) {
        onModeChange?.(suggestion.mode);
      } else if (previousSuggestion?.mode) {
        // The previous mode was supplied by the old chip, so remove it when a
        // neutral suggestion replaces that chip.
        onModeChange?.("chat");
      }
      requestAnimationFrame(focusChatInput);
    },
    [activeSuggestion, onModeChange],
  );

  const handleSend = useCallback(
    (message: string) => {
      const selectedText = activeSuggestion ?? "";
      const trimmedMessage = message.trim();
      const combined = selectedText && trimmedMessage
        ? `${selectedText}\n\n${trimmedMessage}`
        : selectedText || trimmedMessage;
      if (!combined) return;
      onSend(combined);
      setActiveSuggestion(null);
    },
    [activeSuggestion, onSend],
  );

  return (
    /* my-auto (not justify-center) keeps the top of the content reachable if
       it ever exceeds the viewport (e.g. with an error card visible). */
    /* Opacity-only fade: this root fills the scroll container exactly, so a
       translateY entrance would push it past the bottom edge and flash a
       scrollbar. */
    <div className="flex min-h-full w-full flex-col items-center px-6 pb-12 pt-2 animate-fade-in-opacity">
      <div className="my-auto -translate-y-6 flex w-full flex-col items-center gap-1 md:-translate-y-10">
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
        {isTemporary ? (
          /* ChatGPT-style temporary-chat empty state — same composer, with a
             hacky/temporary headline instead of the personal greeting. */
          <div className="max-w-3xl text-center">
            <div className="flex items-center justify-center gap-2 text-4xl font-semibold tracking-tight text-foreground/90 md:text-[2.75rem] md:leading-[1.15]">
              <Timer className="h-8 w-8 text-status-warning md:h-10 md:w-10" aria-hidden="true" />
              <h1 className="text-4xl font-semibold tracking-tight text-foreground/90 md:text-[2.75rem] md:leading-[1.15]">
                Temporary chat
              </h1>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              This chat will be deleted after {TEMPORARY_CHAT_RETENTION_DAYS}{" "}
              days of inactivity. When memory is off it&apos;s fully isolated —
              the AI knows nothing about you and can&apos;t access your files.
            </p>
            <button
              type="button"
              onClick={() => onTemporaryChange?.(false)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-status-warning/50 bg-status-warning/[0.06] px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-status-warning/10 hover:text-foreground"
            >
              Make this a normal chat
            </button>
          </div>
        ) : (
          <div className="relative max-w-3xl text-center text-[2.25rem] font-semibold leading-[1.12] tracking-tight text-foreground/90 md:text-[2.75rem] md:leading-[1.12]">
            {/**
             * Reserved mascot slot — when a mascot/illustration exists it can
             * drop in here next to the greeting. Renders nothing today: an
             * empty, zero-size anchor so the layout is already prepared.
             */}
            <div aria-hidden="true" className="pointer-events-none select-none" />
            <p dangerouslySetInnerHTML={{ __html: headline }} />
          </div>
        )}

        <div
          className="mt-2 flex w-full max-w-3xl flex-wrap justify-center gap-2"
          aria-label="Common outcomes"
        >
          {OUTCOME_SUGGESTIONS.map((suggestion) => {
            const { label, prompt, icon: Icon } = suggestion;
            const isActive = activeSuggestion === prompt;
            return (
            <button
              key={label}
              type="button"
              disabled={disabled || status === "submitted" || status === "streaming"}
              onClick={() => toggleSuggestion(suggestion)}
              aria-pressed={isActive}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-45 ${
                isActive
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/65 bg-background/70 text-foreground/80 hover:border-primary/40 hover:bg-primary/[0.05] hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {label}
            </button>
            );
          })}
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
            onSend={handleSend}
            selectedSuggestionCount={activeSuggestion ? 1 : 0}
            onStop={onStop}
            isTemporary={isTemporary}
            memoryEnabled={memoryEnabled}
            onTemporaryChange={onTemporaryChange}
            onMemoryChange={onMemoryChange}
            large
          />
        </div>

        {onAiStart && (
          <button
            type="button"
            onClick={onAiStart}
            disabled={isAiStarting || disabled}
            className="group relative mt-10 inline-flex items-center gap-2 rounded-md border border-border/50 bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-150 hover:bg-accent/40 hover:text-foreground active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {isAiStarting ? (
              <>
                <ChatStatusOrb state="working" />
                <span>Agent thinking…</span>
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
