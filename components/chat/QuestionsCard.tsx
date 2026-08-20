"use client";

import { HelpCircle } from "lucide-react";
import type { QuestionsData } from "@/lib/chat/questions";

/**
 * QuestionsCard — compact in-chat record of an `ask_questions` tool call.
 *
 * The interactive answer form lives in the "active" panel above the composer
 * (ActiveQuestionsPanel); this card is just the historical record showing the
 * AI asked the user questions. The user's formatted answers appear as the
 * following user message in the transcript.
 */
export function QuestionsCard({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") return null;

  const qd = data as Record<string, unknown>;
  if (qd.type !== "questions") return null;

  const questionsData = qd as unknown as QuestionsData;
  if (!Array.isArray(questionsData.questions)) return null;

  const count = questionsData.questions.length;
  const title = questionsData.title;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-surface-2/50 px-2.5 py-2">
      <HelpCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">
        Asked {count} question{count === 1 ? "" : "s"}
        {title ? ` · ${title}` : ""}
      </span>
    </div>
  );
}
