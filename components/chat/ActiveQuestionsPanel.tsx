"use client";

import { useCallback, useRef, useState } from "react";
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
import type { QuestionAnswerSubmission, QuestionsData, QuestionsQuestion } from "@/lib/chat/questions";

const CUSTOM_SENTINEL = "__custom__";

/**
 * Nexus-style "active" questions card rendered above the composer. One
 * question at a time with numbered option rows and explicit Next/Skip actions,
 * an "Other…" custom answer for select questions, free-text textareas, and a
 * footer with navigation + submit. Collapses to a slim pill via the dismiss
 * button; complete answer sets submit independently of the active stream.
 */
export function ActiveQuestionsPanel({
  data,
  toolCallId,
  onSubmit,
}: {
  data: QuestionsData;
  toolCallId: string;
  onSubmit: (submission: QuestionAnswerSubmission) => Promise<void>;
}) {
  const { title, questions } = data;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submissionId = useRef<string | null>(null);
  const submitGuard = useRef(false);
  const onLast = index >= questions.length - 1;

  const isAnswered = useCallback(
    (q: QuestionsQuestion) => {
      const answer = answers[q.id];
      if (q.type === "free_text") return Boolean(customTexts[q.id]?.trim());
      if (q.type === "multi_select") return (Array.isArray(answer) && answer.length > 0) || Boolean(customTexts[q.id]?.trim());
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

  const answeredCount = questions.filter((q) => !skipped[q.id] && isAnswered(q)).length;
  const skippedCount = questions.filter((q) => skipped[q.id]).length;
  const allResolved = questions.every((q) => isAnswered(q) || skipped[q.id]);
  const remaining = questions.length - answeredCount - skippedCount;

  const selectSingle = useCallback(
    (questionId: string, option: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: option }));
      setSkipped((prev) => ({ ...prev, [questionId]: false }));
    },
    [],
  );

  const toggleOption = useCallback((questionId: string, option: string) => {
    setSkipped((prev) => ({ ...prev, [questionId]: false }));
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
      setSkipped((prev) => ({ ...prev, [questionId]: false }));
      setCustomTexts((prev) => ({ ...prev, [questionId]: value }));
      if (value.trim() && questions.find((q) => q.id === questionId)?.type !== "multi_select") {
        setAnswers((prev) =>
          prev[questionId] === CUSTOM_SENTINEL
            ? prev
            : { ...prev, [questionId]: CUSTOM_SENTINEL },
        );
      }
    },
    [questions],
  );

  const handleSubmit = useCallback(async (skipId?: string) => {
    if (submitGuard.current || (!allResolved && !questions.every((q) => isAnswered(q) || skipped[q.id] || q.id === skipId))) return;
    submitGuard.current = true;
    setIsBusy(true);
    setSubmitError(null);
    submissionId.current ??= crypto.randomUUID();
    try {
      await onSubmit({
        submissionId: submissionId.current,
        toolCallId,
        answers: questions.map((q) => {
          if (skipped[q.id] || q.id === skipId) return { questionId: q.id, skipped: true };
          const answer = answers[q.id];
          return {
            questionId: q.id,
            ...(q.type === "multi_select"
              ? { value: Array.isArray(answer) ? answer : [], custom: customTexts[q.id]?.trim() || undefined }
              : q.type === "free_text" || answer === CUSTOM_SENTINEL
              ? { custom: customTexts[q.id]?.trim() }
              : { value: answer }),
          };
        }),
      });
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not send answers. Try again.");
    } finally {
      submitGuard.current = false;
      setIsBusy(false);
    }
  }, [allResolved, questions, isAnswered, skipped, answers, customTexts, onSubmit, toolCallId]);

  const handleSkip = () => {
    const id = questions[index].id;
    setSkipped((prev) => ({ ...prev, [id]: true }));
    if (onLast) void handleSubmit(id);
    else setIndex((i) => i + 1);
  };
  const canProceed = onLast ? allResolved : isAnswered(questions[index]) || skipped[questions[index].id];

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
      <div className="overflow-hidden rounded-3xl border border-border/70 bg-surface-1" aria-busy={isBusy}>
        <fieldset disabled={isBusy} className="min-w-0">
        {/* ── Header ── */}
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1.5">
          <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {title ?? "Questions"}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {answeredCount}/{questions.length} answered
            {skippedCount > 0 && ` · ${skippedCount} skipped`}
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
                  answers[questions[index]?.id] === CUSTOM_SENTINEL ||
                  (questions[index]?.type === "multi_select" && Boolean(customTexts[questions[index]?.id]?.trim()))
                }
                onSelect={selectSingle}
                onToggle={toggleOption}
                onCustomChange={handleCustomChange}
              />
              {skipped[questions[index]?.id] && <p className="mt-2 text-xs text-muted-foreground">Skipped</p>}
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
          <button type="button" onClick={handleSkip} disabled={isBusy}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
            Skip
          </button>
          <button
            type="button"
            onClick={() => onLast ? void handleSubmit() : setIndex((i) => i + 1)}
            disabled={!canProceed || isBusy}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-150",
              canProceed && !isBusy
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]"
                : "cursor-not-allowed bg-muted text-muted-foreground/50",
            )}
          >
            {onLast ? <Send className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {isBusy ? "Sending…" : onLast ? "Send" : "Next"}
          </button>
        </div>
        {submitError && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{submitError}</p>}
        </fieldset>
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
