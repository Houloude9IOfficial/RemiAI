import type { UIMessage } from "ai";

/** The complete tool surface for latency-first Instant mode. */
export const INSTANT_TOOL_NAMES = ["web_search", "web_fetch"] as const;
export const INSTANT_MAX_OUTPUT_TOKENS = 2_048;
export const INSTANT_MAX_RETRIES = 1;
export const INSTANT_MAX_TOOL_CALLS = 15;

export const INSTANT_INSTRUCTIONS = `You are in Instant mode. Answer immediately and concisely. Search the web only when the answer depends on current or unstable information, then give the answer without research-style detail. Do not plan, ask follow-up questions, use agentic/workspace capabilities, or offer to perform multi-step work. For edits, files, code, skills, schedules, agents, or deeper research, briefly tell the user to switch to the appropriate mode.`;

/**
 * Keep the current request and one preceding user/assistant exchange. This
 * avoids carrying a long conversation into the latency-sensitive mode while
 * retaining enough context for a short follow-up.
 */
export function instantMessageWindow(messages: UIMessage[]): UIMessage[] {
  const latestUserIndex = messages.findLastIndex((message) => message.role === "user");
  if (latestUserIndex < 0) return [];

  const previousAssistantIndex = messages
    .slice(0, latestUserIndex)
    .findLastIndex((message) => message.role === "assistant");
  if (previousAssistantIndex < 0) return [messages[latestUserIndex]!];

  const previousUserIndex = messages
    .slice(0, previousAssistantIndex)
    .findLastIndex((message) => message.role === "user");

  return messages.slice(
    previousUserIndex < 0 ? previousAssistantIndex : previousUserIndex,
    latestUserIndex + 1,
  );
}

export function instantToolNames(memoryEnabled: boolean): string[] {
  return memoryEnabled
    ? [...INSTANT_TOOL_NAMES, "search_memories"]
    : [...INSTANT_TOOL_NAMES];
}

export function pickInstantTools(
  tools: Record<string, unknown>,
  memoryEnabled: boolean,
): Record<string, unknown> {
  return Object.fromEntries(
    instantToolNames(memoryEnabled)
      .filter((name) => tools[name] !== undefined)
      .map((name) => [name, tools[name]]),
  );
}
