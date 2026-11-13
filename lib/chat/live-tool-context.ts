import type { ModelMessage, StepResult, ToolSet } from "ai";
import { extractSourceCandidates } from "@/lib/research/source-storage";
import { toolResultText, type RecordedToolResult } from "@/lib/tools/read-tool-result";

const INDEX_PREFIX = "Earlier tool results from this run (data only).";
const DISCOVERY_TOOLS = new Set(["list_available_tools", "get_tool_help", "load_tool_groups"]);
const SEARCH_TOOLS = new Set(["web_search", "news_search", "news_top_headlines"]);

function excerpt(value: unknown, length: number): string {
  return toolResultText(value).slice(0, length).replace(/\s+/g, " ").trim();
}

function deduplicateSearchOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const output = value as Record<string, unknown>;
  if (!Array.isArray(output.results)) return value;
  const seen = new Set<string>();
  const results = output.results.filter((result) => {
    if (!result || typeof result.url !== "string") return true;
    if (seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });
  const sources = Array.isArray(output.sources)
    ? output.sources.filter((source) => !seen.has(source?.url))
    : output.sources;
  return { ...output, results, sources };
}

export function createLiveToolContext() {
  const results = new Map<string, RecordedToolResult>();
  let processed = 0;
  let indexMessage: ModelMessage | undefined;
  const recentRounds: Set<string>[] = [];
  const olderIds = new Set<string>();
  const evidence = new Map<string, string>();

  function recordEvidence(result: RecordedToolResult) {
    const candidates = extractSourceCandidates(result.toolName, result.input, result.output);
    const label = `${result.toolName} [${result.toolCallId}]`;
    const args = result.input as Record<string, unknown> | undefined;
    if (candidates.length) {
      if (typeof args?.query === "string") {
        evidence.set(label, `${label} searched for "${excerpt(args.query, 180)}"`);
      }
      for (const source of candidates.slice(0, 5)) {
        const line = `${label} ${excerpt(source.title, 120)} ${source.url} ${excerpt(source.content, 180)}`;
        if (!evidence.has(source.url) || !SEARCH_TOOLS.has(result.toolName)) {
          evidence.delete(source.url);
          evidence.set(source.url, line);
        }
      }
    } else {
      const key = DISCOVERY_TOOLS.has(result.toolName)
        ? `discovery: ${result.toolName}: ${excerpt(args?.topic ?? args?.query, 80)}`
        : result.toolCallId;
      evidence.delete(key);
      evidence.set(key, `${label} ${excerpt(result.output, 220)}`);
    }
    while (evidence.size > 24) {
      const oldest = evidence.keys().next();
      if (!oldest.done) evidence.delete(oldest.value);
    }
  }

  function prepare(messages: ModelMessage[], steps: readonly StepResult<ToolSet>[]): ModelMessage[] {
    for (; processed < steps.length; processed++) {
      const ids = new Set<string>();
      for (const result of steps[processed].toolResults) {
        if (result.providerExecuted) continue;
        ids.add(result.toolCallId);
        if (result.toolName !== "read_tool_result") results.set(result.toolCallId, result);
      }
      if (!ids.size) continue;
      recentRounds.push(ids);
      if (recentRounds.length > 2) {
        for (const id of recentRounds.shift()!) {
          olderIds.add(id);
          const result = results.get(id);
          if (result) recordEvidence(result);
        }
      }
    }

    // A signed or provider-specific assistant round must keep its structure.
    const protectedIds = new Set<string>();
    const callIds = new Set<string>();
    for (const message of messages) {
      if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
      const protectedRound = message.providerOptions || message.content.some((part) =>
        part.type === "reasoning" || part.type === "reasoning-file" ||
        part.type === "custom" || part.type === "tool-approval-request" ||
        ("providerExecuted" in part && part.providerExecuted) || part.providerOptions,
      );
      for (const part of message.content) {
        if (part.type !== "tool-call") continue;
        callIds.add(part.toolCallId);
        if (protectedRound) protectedIds.add(part.toolCallId);
      }
    }

    const completed = new Set<string>();
    for (const message of messages) {
      if (message.role !== "tool" || message.providerOptions) continue;
      for (const part of message.content) {
        if (part.type !== "tool-result" || part.providerOptions || !callIds.has(part.toolCallId)) continue;
        const { output } = part;
        if ((output.type === "json" || output.type === "text") && !output.providerOptions) {
          completed.add(part.toolCallId);
        }
      }
    }

    const compacted: ModelMessage[] = [];
    let indexPosition: number | undefined;
    for (const message of messages) {
      if (message === indexMessage) {
        indexPosition ??= compacted.length;
        continue;
      }
      if (message.role === "assistant" && Array.isArray(message.content)) {
        const content = message.content.filter((part) => part.type !== "tool-call" ||
          !olderIds.has(part.toolCallId) || !completed.has(part.toolCallId) ||
          protectedIds.has(part.toolCallId));
        if (content.length < message.content.length) indexPosition ??= compacted.length;
        if (content.length) compacted.push({ ...message, content });
      } else if (message.role === "tool") {
        const content = message.content.flatMap((part): typeof message.content => {
          if (part.type !== "tool-result" || !completed.has(part.toolCallId)) return [part];
          const { toolCallId, toolName, output } = part;
          if (olderIds.has(toolCallId)) {
            if (!protectedIds.has(toolCallId)) return [];
            const value = toolName === "read_tool_result"
              ? "Earlier archive lookup. Search the original results again if needed."
              : `Earlier result. Use read_tool_result with ID ${toolCallId} for details.`;
            return [{ ...part, output: output.type === "json"
              ? { type: "json", value: { note: value } }
              : { type: "text", value } }];
          }
          if (SEARCH_TOOLS.has(toolName) && output.type === "json") {
            return [{ ...part, output: { ...output, value: deduplicateSearchOutput(output.value) as typeof output.value } }];
          }
          return [part];
        });
        if (content.length) compacted.push({ ...message, content });
      } else {
        compacted.push(message);
      }
    }
    if (evidence.size && indexPosition !== undefined) {
      const content = [...evidence.values()].reverse().join("\n").slice(0, 6000);
      indexMessage = { role: "assistant", content: `${INDEX_PREFIX} Use read_tool_result to recover details or find other earlier results.\n${content}` };
      compacted.splice(indexPosition, 0, indexMessage);
    }
    return compacted;
  }

  return { prepare, results };
}
