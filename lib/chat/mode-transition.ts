import type { UIMessage } from "ai";

export type ChatMode = "chat" | "instant" | "goal" | "plan" | "build";

type QuestionsOutput = { type: "questions"; questions: unknown[] };

function isQuestionsOutput(value: unknown): value is QuestionsOutput {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).type === "questions" &&
      Array.isArray((value as Record<string, unknown>).questions),
  );
}

/** Supports both AI SDK v7 tool parts and the legacy tool-invocation shape. */
export function messageContainsQuestions(message: UIMessage | undefined): boolean {
  if (!message || message.role !== "assistant") return false;

  return (message.parts ?? []).some((rawPart) => {
    if (!rawPart || typeof rawPart !== "object") return false;
    const part = rawPart as Record<string, unknown>;

    if (part.type === "tool-ask_questions") {
      return isQuestionsOutput(part.output);
    }

    if (part.type === "tool-invocation") {
      const invocation = part.toolInvocation;
      if (!invocation || typeof invocation !== "object") return false;
      const record = invocation as Record<string, unknown>;
      return (
        record.toolName === "ask_questions" &&
        isQuestionsOutput(record.output ?? record.result)
      );
    }

    return false;
  });
}

/** A user answer immediately after an ask_questions assistant message. */
export function shouldPromotePlanToGoal(
  mode: string | undefined,
  messages: UIMessage[],
): boolean {
  if (mode !== "plan" || messages.length < 2) return false;
  const last = messages[messages.length - 1];
  const previous = messages[messages.length - 2];
  return last?.role === "user" && messageContainsQuestions(previous);
}

export function isChatMode(value: unknown): value is ChatMode {
  return value === "chat" || value === "instant" || value === "goal" || value === "plan" || value === "build";
}
