import type { UIMessage } from "ai";

export const RESPONSE_USAGE_PART = "data-response-usage";

type ResponseUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export function responseUsagePart(id: string, usage: ResponseUsage) {
  const data = {
    inputTokens: validCount(usage.inputTokens),
    outputTokens: validCount(usage.outputTokens),
  };
  if (data.inputTokens === undefined && data.outputTokens === undefined) return null;
  return { type: RESPONSE_USAGE_PART, id, data } as const;
}

function validCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export function messageResponseUsage(parts: UIMessage["parts"]): ResponseUsage {
  const runs = new Map<string, ResponseUsage>();
  for (const part of parts) {
    if (part.type !== RESPONSE_USAGE_PART || !part.id) continue;
    const data = part.data as ResponseUsage | undefined;
    if (data) runs.set(part.id, data);
  }
  const total: ResponseUsage = {};
  for (const key of ["inputTokens", "outputTokens"] as const) {
    const counts = [...runs.values()].map((run) => validCount(run[key]));
    if (counts.length && counts.every((count) => count !== undefined)) {
      total[key] = counts.reduce((sum, count) => sum + count, 0);
    }
  }
  return total;
}

const compactTokens = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export function formatResponseTokens(tokens: number): string {
  return compactTokens.format(tokens).toLowerCase();
}
