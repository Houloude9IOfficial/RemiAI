import { isReasoningUIPart, isTextUIPart, isToolUIPart, type ReasoningUIPart, type UIMessage } from "ai";

export const WORK_ACTIVITY_PART = "data-work-activity";
export const WORK_SUMMARY_METADATA = { remiai: { workSummary: true } };

export type WorkStatus = "running" | "continuing" | "completed" | "failed" | "interrupted" | "cancelled";

export type WorkActivityState = {
  runId: string;
  startedAt: number;
  status: WorkStatus;
  endedAt?: number;
  message?: string;
};

export type WorkActivityPart = {
  type: typeof WORK_ACTIVITY_PART;
  id: string;
  data: WorkActivityState;
};

export function isWorkActivityPart(part: UIMessage["parts"][number]): part is WorkActivityPart {
  if (part.type !== WORK_ACTIVITY_PART || typeof part.id !== "string") return false;
  const data = part.data as Partial<WorkActivityState> | null;
  return typeof data?.runId === "string" &&
    typeof data.startedAt === "number" && Number.isFinite(data.startedAt) &&
    ["running", "continuing", "completed", "failed", "interrupted", "cancelled"].includes(data.status ?? "");
}

export function latestWorkActivity(parts: UIMessage["parts"]) {
  return parts.findLast(isWorkActivityPart);
}

export function isActiveWork(status: WorkStatus) {
  return status === "running" || status === "continuing";
}

export function isWorkSummary(part: UIMessage["parts"][number]): part is ReasoningUIPart {
  return isReasoningUIPart(part) && part.providerMetadata?.remiai?.workSummary === true;
}

// Some providers emit progress narration as ordinary text before a tool call.
const progressNarration = /^(?:(?:now )?I have (?:the data|enough information)[.!]\s+)?(?:let me|I(?:['’]ll| will)|I(?:['’]m| am) going to) (?:dig deeper|look|check|search|inspect|read|review|verify|fetch|gather|create|generate|build|run|test|update|write|compare|continue)\b[^.!?]*[.!]?$/i;

export function partitionWorkText(parts: UIMessage["parts"]) {
  const answerParts: UIMessage["parts"] = [];
  const activityParts: UIMessage["parts"] = [];
  let toolFollows = false;

  // Only move standalone narration followed by a tool in the same step.
  // Final answers, questions and mixed prose stay in the response.
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (isToolUIPart(part)) toolFollows = true;
    else if (part.type === "step-start" || isWorkActivityPart(part)) toolFollows = false;

    if (toolFollows && isTextUIPart(part) && progressNarration.test(part.text.trim())) {
      activityParts.push({
        type: "reasoning",
        text: part.text,
        providerMetadata: WORK_SUMMARY_METADATA,
      });
    } else {
      answerParts.push(part);
      activityParts.push(part);
    }
  }

  return { answerParts: answerParts.reverse(), activityParts: activityParts.reverse() };
}

/** Legacy providers wrote raw reasoning parts before summaries were marked. */
export function visibleChatParts(parts: UIMessage["parts"]) {
  return parts.filter((part) =>
    part.type !== "reasoning-file" && (part.type !== "reasoning" || isWorkSummary(part)),
  );
}

/** The registry replays one attempt. Keep any history from previous attempts. */
export function workReplayPrefix(parts: UIMessage["parts"], streamId: string) {
  const replayIndex = parts.findIndex((part) => isWorkActivityPart(part) && part.id === streamId);
  if (replayIndex >= 0) return parts.slice(0, replayIndex);
  return latestWorkActivity(parts) ? parts : [];
}

/** Seed the SDK's last assistant explicitly so a fresh replay cannot inherit a different reply. */
export function prepareWorkReplay(messages: UIMessage[], assistantId: string, streamId: string): UIMessage[] {
  const index = messages.findIndex((message) => message.id === assistantId && message.role === "assistant");
  if (index < 0) return [...messages, { id: assistantId, role: "assistant", parts: [] }];
  const assistant = messages[index];
  return [
    ...messages.slice(0, index),
    { ...assistant, parts: workReplayPrefix(assistant.parts, streamId) },
  ];
}
