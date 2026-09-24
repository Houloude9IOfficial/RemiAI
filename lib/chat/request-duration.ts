import type { UIMessage } from "ai";

export const REQUEST_DURATION_PART = "data-request-duration";

export type RequestTiming = {
  durationMs: number;
  completedAt: string | null;
};

export function formatRequestDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatRequestCompletionTime(completedAt: string, todayKey: string): string | null {
  const date = new Date(completedAt);
  if (!Number.isFinite(date.getTime())) return null;

  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (localDateKey(date) === todayKey) return time;
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday} ${time}`;
}

export function messageRequestTiming(parts: UIMessage["parts"]): RequestTiming | null {
  // A server continuation can append to the same assistant message. The last
  // timing part represents the full elapsed time of the latest completed run.
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (part.type !== REQUEST_DURATION_PART) continue;
    const data = (part as { data?: { durationMs?: unknown; completedAt?: unknown } }).data;
    const durationMs = data?.durationMs;
    if (typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0) {
      const completedAt = typeof data?.completedAt === "string" && Number.isFinite(Date.parse(data.completedAt))
        ? data.completedAt
        : null;
      return { durationMs, completedAt };
    }
  }
  return null;
}
