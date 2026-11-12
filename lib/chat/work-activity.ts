import { isReasoningUIPart, type ReasoningUIPart, type UIMessage } from "ai";

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
