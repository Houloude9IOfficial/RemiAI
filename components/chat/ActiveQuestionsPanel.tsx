"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  MessageSquareText,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuestionsData, QuestionsQuestion } from "@/lib/chat/questions";

const CUSTOM_SENTINEL = "__custom__";

/**
 * Nexus-style "active" questions card rendered above the composer. One
 * question at a time with numbered option rows (single choice auto-advances),
 * an "Other…" custom answer for select questions, free-text textareas, and a
 * footer with navigation + submit. Collapses to a slim pill via the dismiss
 * button; answers submit as a formatted user message.
 */
export function ActiveQuestionsPanel({
  data,
  status,
  onSubmit,
}: {
  data: QuestionsData;
  /** Chat stream status — submit is locked while a response is in flight. */
  status?: string;
  onSubmit: (text: string) => void;
}) {
  const { title, questions } = data;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isBusy = status === "submitted" || status === "streaming";
  const onLast = index >= questions.length - 1;

  const isAnswered = useCallback(
    (q: QuestionsQuestion) => {
      const answer = answers[q.id];
      if (q.type === "free_text") return Boolean(customTexts[q.id]?.trim());
      if (!answer || (Array.isArray(answer) && answer.length === 0)) {
        return false;
      }
      if (answer === CUSTOM_SENTINEL) {
        return Boolean(customTexts[q.id]?.trim());
      }
      return true;
    },
    [answers, customTexts],
  );

  const answeredCount = questions.filter(isAnswered).length;
  const allAnswered = answeredCount === questions.length;
  const remaining = questions.length - answeredCount;

  const selectSingle = useCallback(
    (questionId: string, option: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: option }));
      // Single choice auto-advances to the next question (Nexus behavior) —
      // unless it's the last one, where the footer's Submit takes over.
      if (!onLast) setIndex((i) => i + 1);
    },
    [onLast],
  );

  const toggleOption = useCallback((questionId: string, option: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const next = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option];
      return { ...prev, [questionId]: next };
    });
  }, []);

  const handleCustomChange = useCallback(
    (questionId: string, value: string) => {
      setCustomTexts((prev) => ({ ...prev, [questionId]: value }));
      if (value.trim()) {
        setAnswers((prev) =>
          prev[questionId] === CUSTOM_SENTINEL
            ? prev
            : { ...prev, [questionId]: CUSTOM_SENTINEL },
        );
      }
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (!allAnswered || isBusy) return;

    // Same formatted answer shape the previous in-chat card used, so the
    // persisted user message reads naturally in the transcript.
    const lines: string[] = [];
    if (title) {
      lines.push(`## ${title}`);
      lines.push("");
    }
    for (const q of questions) {
      const answer = answers[q.id];
      let answerText = "";
      if (q.type === "free_text" || answer === CUSTOM_SENTINEL) {
        answerText = customTexts[q.id]?.trim() ?? "";
      } else {
        answerText = Array.isArray(answer) ? answer.join(", ") : (answer ?? "");
      }
      lines.push(`**${q.question}**`);
      lines.push(answerText);
      lines.push("");
    }

    const message = lines.join("\n").trim();
    setSubmitted(true);
    onSubmit(message);
  }, [allAnswered, isBusy, title, questions, answers, customTexts, onSubmit]);

  if (submitted) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-2 md:px-6">
        <div className="overflow-hidden rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">Answers submitted</span>
          </div>
        </div>
      </div>
    );
  }

  // Collapsed — slim pill that reopens the card (Nexus-style dismiss).
  if (collapsed) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-2 md:px-6">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex w-full items-center gap-2 rounded-full border border-border/60 bg-surface-1 px-3.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          aria-label="Open questions"
        >
          <HelpCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            {questions.length} question{questions.length === 1 ? "" : "s"}{" "}
            {remaining > 0 && `· ${remaining} unanswered`}
          </span>
          <span className="shrink-0 font-medium text-primary">Answer</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2 md:px-6">
      <div className="overflow-hidden rounded-3xl border border-border/70 bg-surface-1">
        {/* ── Header ── */}
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1.5">
          <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {title ?? "Questions"}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {answeredCount}/{questions.length} answered
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse questions"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ── Current question (one at a time) ── */}
        <div className="px-4 py-2">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <QuestionView
                question={questions[index]}
                answer={answers[questions[index]?.id]}
                customText={customTexts[questions[index]?.id] ?? ""}
                isCustom={
                  answers[questions[index]?.id] === CUSTOM_SENTINEL
                }
                onSelect={selectSingle}
                onToggle={toggleOption}
                onCustomChange={handleCustomChange}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Footer: navigation + submit ── */}
        <div className="flex items-center gap-2 px-3 pb-3 pt-1">
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {index + 1} of {questions.length}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              aria-label="Previous question"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
              disabled={onLast}
              aria-label="Next question"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered || isBusy}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-150",
              allAnswered && !isBusy
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]"
                : "cursor-not-allowed bg-muted text-muted-foreground/50",
            )}
          >
            <Send className="h-3 w-3" />
            {isBusy
              ? "Waiting for the assistant…"
              : allAnswered
                ? "Send answers"
                : `Answer ${remaining} more`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single question — numbered option rows + Other, or a free-text textarea
// ---------------------------------------------------------------------------

function QuestionView({
  question,
  answer,
  customText,
  isCustom,
  onSelect,
  onToggle,
  onCustomChange,
}: {
  question: QuestionsQuestion;
  answer: string | string[] | undefined;
  customText: string;
  isCustom: boolean;
  onSelect: (questionId: string, option: string) => void;
  onToggle: (questionId: string, option: string) => void;
  onCustomChange: (questionId: string, value: string) => void;
}) {
  const isMulti = question.type === "multi_select";
  const isFreeText = question.type === "free_text";

  return (
    <div className="transition-all">
      <p className="mb-2.5 text-sm font-medium leading-snug">{question.question}</p>

      {isFreeText ? (
        <textarea
          value={customText}
          onChange={(e) => onCustomChange(question.id, e.target.value)}
          placeholder="Type your answer..."
          rows={3}
          className="w-full resize-none rounded-xl border border-border/40 bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:border-primary/50 transition-colors focus:outline-none"
        />
      ) : (
        <div className="flex flex-col gap-0.5">
          {question.options.map((option, optionIndex) => {
            const isSelected = isMulti
              ? Array.isArray(answer) && answer.includes(option)
              : answer === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() =>
                  isMulti
                    ? onToggle(question.id, option)
                    : onSelect(question.id, option)
                }
                className={cn(
                  "flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors hover:bg-muted cursor-pointer",
                  // isSelected && "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm transition-colors",
                    isSelected
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {isMulti ? (
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                  ) : (
                    optionIndex + 1
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm transition-colors",
                    isSelected ? "text-primary" : "text-foreground/85",
                  )}
                >
                  {option}
                </span>
                {!isMulti && isSelected && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            );
          })}

          {/* Custom ("Other…") answer */}
          {question.allowCustom && (
            <div
              className={cn(
                "flex h-10 items-center gap-2.5 rounded-lg px-2.5 transition-colors",
                isCustom ? "bg-muted" : "hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                  isCustom
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              >
                <MessageSquareText className="h-3.5 w-3.5" />
              </span>
              <input
                type="text"
                value={customText}
                placeholder={isMulti ? "Other…" : "Other…"}
                onChange={(e) => onCustomChange(question.id, e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
              {isCustom && !isMulti && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
