import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Types — shape of the `ask_questions` tool output as persisted in tool parts
// ---------------------------------------------------------------------------

export interface QuestionsQuestion {
  id: string;
  question: string;
  options: string[];
  allowCustom: boolean;
  type?: "single_select" | "multi_select" | "free_text";
}

export interface QuestionsData {
  type: "questions";
  title: string | null;
  count: number;
  questions: QuestionsQuestion[];
  instruction: string;
}

export interface ActiveQuestions {
  /** Stable id of the tool call that produced the questions (used as a React key). */
  id: string;
  data: QuestionsData;
}

export function isQuestionsOutput(value: unknown): value is QuestionsData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.type === "questions" && Array.isArray(v.questions);
}

/**
 * Scan the conversation for the newest UNANSWERED `ask_questions` tool output.
 *
 * A questions set counts as answered once ANY user message arrives after it —
 * that is the user's answer being sent. This is derived purely from the
 * message list, so it survives reloads: re-opening a conversation never
 * re-shows an already-answered form.
 *
 * The panel key is the tool call id, so a NEW set of questions remounts the
 * form fresh (answers from a previous set never leak in).
 */
export function findActiveQuestions(messages: UIMessage[]): ActiveQuestions | null {
  let current: ActiveQuestions | null = null;
  let partIndex = 0;

  for (const msg of messages) {
    // Any user message answers whatever questions were pending before it.
    if (msg.role === "user") {
      current = null;
      continue;
    }

    for (const rawPart of msg.parts ?? []) {
      partIndex += 1;
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as Record<string, unknown>;

      let toolCallId: unknown;
      let output: unknown;

      // AI SDK v7: `tool-ask_questions` parts
      if (
        typeof part.type === "string" &&
        part.type.startsWith("tool-") &&
        part.type !== "tool-invocation"
      ) {
        if (part.type.slice("tool-".length) !== "ask_questions") continue;
        toolCallId = part.toolCallId;
        output = part.output;
      }
      // Legacy: `tool-invocation` parts
      else if (part.type === "tool-invocation") {
        const inv = part.toolInvocation as Record<string, unknown> | undefined;
        if (!inv || inv.toolName !== "ask_questions") continue;
        toolCallId = inv.toolCallId;
        output = inv.output ?? inv.result;
      } else {
        continue;
      }

      if (isQuestionsOutput(output)) {
        current = {
          id:
            typeof toolCallId === "string" && toolCallId
              ? toolCallId
              : `questions-${msg.id}-${partIndex}`,
          data: output,
        };
      }
    }
  }

  return current;
}
