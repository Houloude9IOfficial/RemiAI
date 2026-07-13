"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useChatMessage } from "./ChatMessageContext";
import {
  CheckCircle2,
  HelpCircle,
  Send,
  MessageSquareText,
  ChevronDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Question {
  id: string;
  question: string;
  options: string[];
  allowCustom: boolean;
}

interface QuestionsData {
  type: "questions";
  title: string | null;
  count: number;
  questions: Question[];
  instruction: string;
}

// ---------------------------------------------------------------------------
// QuestionsCard — detects `type: "questions"` in tool output and renders
// an interactive card where users can select options and submit answers.
// ---------------------------------------------------------------------------

export function QuestionsCard({ data }: { data: unknown }) {
  // Only render for questions data
  if (!data || typeof data !== "object") return null;

  const qd = data as Record<string, unknown>;
  if (qd.type !== "questions") return null;

  const questionsData = qd as unknown as QuestionsData;
  if (!Array.isArray(questionsData.questions)) return null;

  return <QuestionsForm data={questionsData} />;
}

// ---------------------------------------------------------------------------
// Internal form component
// ---------------------------------------------------------------------------

function QuestionsForm({ data }: { data: QuestionsData }) {
  const { sendMessage } = useChatMessage();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const formRef = useRef<HTMLDivElement>(null);

  const { title, questions } = data;

  // Track which questions have been answered
  const answeredCount = questions.filter((q) => {
    const answer = answers[q.id];
    if (!answer) return false;
    if (answer === "__custom__") {
      const custom = customTexts[q.id]?.trim();
      return custom && custom.length > 0;
    }
    return true;
  }).length;

  const allAnswered = answeredCount === questions.length;

  const handleSelectOption = useCallback(
    (questionId: string, option: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: option }));
    },
    [],
  );

  const handleCustomChange = useCallback(
    (questionId: string, value: string) => {
      setCustomTexts((prev) => ({ ...prev, [questionId]: value }));
      // Auto-select the custom option when user types
      if (value.trim()) {
        setAnswers((prev) => {
          if (prev[questionId] !== "__custom__") {
            return { ...prev, [questionId]: "__custom__" };
          }
          return prev;
        });
      }
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (!allAnswered) return;

    // Build a nicely formatted answer string
    const lines: string[] = [];
    if (title) {
      lines.push(`## ${title}`);
      lines.push("");
    }

    for (const q of questions) {
      const answer = answers[q.id];
      let answerText = "";
      if (answer === "__custom__") {
        answerText = customTexts[q.id]?.trim() ?? "";
      } else {
        answerText = answer;
      }
      lines.push(`**${q.question}**`);
      lines.push(answerText);
      lines.push("");
    }

    const message = lines.join("\n").trim();
    setSubmitted(true);
    sendMessage(message);
  }, [answers, customTexts, questions, title, allAnswered, sendMessage]);

  // Auto-scroll into view when the card appears
  useEffect(() => {
    const timer = setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  if (submitted) {
    return (
      <div className="overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-medium">Answers submitted!</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Your answers have been sent. The AI will process them and continue.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={formRef}
      className="overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-background to-muted/20 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/40 px-4 py-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <HelpCircle className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-sm font-medium">
          {title ?? "Questions"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {answeredCount}/{questions.length} answered
        </span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted transition-colors"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* Expanded body */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-4 p-4">
            {questions.map((q, idx) => {
              const selected = answers[q.id];
              const isCustom = selected === "__custom__";

              return (
                <div
                  key={q.id}
                  className="rounded-lg border border-border/30 bg-muted/20 p-3.5 transition-all duration-200"
                >
                  {/* Question text */}
                  <div className="mb-2.5 flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/10 text-[10px] font-bold text-muted-foreground">
                      {idx + 1}
                    </span>
                    <p className="text-sm font-medium leading-snug">
                      {q.question}
                    </p>
                  </div>

                  {/* Options */}
                  <div className="flex flex-col gap-1.5">
                    {q.options.map((option) => {
                      const isSelected = selected === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => handleSelectOption(q.id, option)}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-all duration-150",
                            isSelected
                              ? "border-primary/50 bg-primary/5 text-foreground shadow-sm"
                              : "border-border/40 bg-background/50 text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground hover:shadow-sm",
                          )}
                        >
                          {/* Radio indicator */}
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
                              isSelected
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/30 group-hover:border-muted-foreground/50",
                            )}
                          >
                            {isSelected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                          <span className="flex-1">{option}</span>
                          {isSelected && (
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
                          )}
                        </button>
                      );
                    })}

                    {/* Custom answer option */}
                    {q.allowCustom && (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectOption(q.id, "__custom__")
                          }
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-all duration-150",
                            isCustom
                              ? "border-primary/50 bg-primary/[0.03] text-foreground shadow-sm"
                              : "border-dashed border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
                              isCustom
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {isCustom && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                          <span className="flex-1">Custom answer...</span>
                          <MessageSquareText className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                        </button>

                        {/* Custom text input (visible when custom is selected) */}
                        <div
                          className={cn(
                            "grid transition-[grid-template-rows] duration-200 ease-out",
                            isCustom
                              ? "grid-rows-[1fr]"
                              : "grid-rows-[0fr]",
                          )}
                        >
                          <div className="overflow-hidden">
                            <textarea
                              value={customTexts[q.id] ?? ""}
                              onChange={(e) =>
                                handleCustomChange(q.id, e.target.value)
                              }
                              placeholder="Type your custom answer here..."
                              rows={2}
                              className="mt-1.5 w-full resize-none rounded-md border border-border/40 bg-background px-2.5 py-1.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Submit button */}
          <div className="border-t border-border/30 px-4 py-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!allAnswered}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200",
                allAnswered
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]"
                  : "cursor-not-allowed bg-muted text-muted-foreground/50",
              )}
            >
              <Send className="h-3.5 w-3.5" />
              {allAnswered
                ? "Send answers"
                : `Answer all questions first (${answeredCount}/${questions.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
