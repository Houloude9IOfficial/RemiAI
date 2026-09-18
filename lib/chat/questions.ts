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

export interface QuestionAnswer {
  questionId: string;
  value?: string | string[];
  custom?: string;
  skipped?: boolean;
}

export interface QuestionAnswerSubmission {
  submissionId: string;
  toolCallId: string;
  answers: QuestionAnswer[];
}

/** Validate against the actual tool output, never client-supplied question text. */
export function formatQuestionAnswers(data: QuestionsData, answers: QuestionAnswer[]): string {
  const ids = new Set(data.questions.map((q) => q.id));
  if (ids.size !== data.questions.length || answers.length !== ids.size ||
      new Set(answers.map((a) => a.questionId)).size !== ids.size ||
      answers.some((a) => !ids.has(a.questionId))) {
    throw new Error("Answer or explicitly skip every question.");
  }
  const lines = data.title ? [`## ${data.title}`, ""] : [];
  for (const q of data.questions) {
    const answer = answers.find((a) => a.questionId === q.id)!;
    let text = "Skipped";
    if (!answer.skipped) {
      const custom = answer.custom?.trim();
      if (custom && q.type !== "free_text" && !q.allowCustom) throw new Error("Custom answers are not allowed.");
      const values = Array.isArray(answer.value) ? answer.value : answer.value ? [answer.value] : [];
      if (q.type === "free_text") {
        text = custom || (typeof answer.value === "string" ? answer.value.trim() : "");
      } else {
        if (values.some((v) => !q.options.includes(v)) || new Set(values).size !== values.length ||
            (q.type !== "multi_select" && values.length + (custom ? 1 : 0) > 1)) {
          throw new Error("Invalid answer selection.");
        }
        text = [...values, ...(custom ? [custom] : [])].join(", ");
      }
      if (!text.trim()) throw new Error("Answer or explicitly skip every question.");
    }
    lines.push(`**${q.question}**`, text, "");
  }
  return lines.join("\n").trim();
}

export function findQuestionsById(messages: UIMessage[], id: string): QuestionsData | null {
  let partIndex = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const raw of message.parts ?? []) {
      partIndex += 1;
      if (!raw || typeof raw !== "object") continue;
      const part = raw as unknown as Record<string, unknown>;
      const invocation = part.type === "tool-invocation" ? part.toolInvocation as Record<string, unknown> : part;
      if ((part.type === "tool-ask_questions" || invocation?.toolName === "ask_questions") &&
          (invocation.toolCallId || `questions-${message.id}-${partIndex}`) === id && isQuestionsOutput(invocation.output ?? invocation.result)) {
        return (invocation.output ?? invocation.result) as QuestionsData;
      }
    }
  }
  return null;
}

export function isQuestionsOutput(value: unknown): value is QuestionsData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.type === "questions" && Array.isArray(v.questions);
}

/**
 * Scan the conversation for the newest UNANSWERED `ask_questions` tool output.
 *
 * Structured answer messages resolve their referenced tool-call ID, including
 * answers received during streaming. Ordinary/legacy user replies resolve the
 * preceding set. Persisted markers and server acknowledgements survive reloads.
 *
 * The panel key is the tool call id, so a NEW set of questions remounts the
 * form fresh (answers from a previous set never leak in).
 */
export function findActiveQuestions(messages: UIMessage[], resolvedIds: string[] = []): ActiveQuestions | null {
  const resolved = new Set(resolvedIds);
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part?.type === "data-question-answer") {
        const data = part.data as { toolCallId?: string };
        if (data?.toolCallId) resolved.add(data.toolCallId);
      }
    }
  }
  let current: ActiveQuestions | null = null;
  let partIndex = 0;

  for (const msg of messages) {
    // Any user message answers whatever questions were pending before it.
    if (msg.role === "user") {
      const answerPart = msg.parts?.find((part) => part?.type === "data-question-answer");
      if (!answerPart || ("data" in answerPart && (answerPart.data as { toolCallId?: string })?.toolCallId === current?.id)) current = null;
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
        if (resolved.has(String(toolCallId))) {
          current = null;
          continue;
        }
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
