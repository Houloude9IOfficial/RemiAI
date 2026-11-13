import assert from "node:assert/strict";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { streamText, stepCountIs, tool, type ModelMessage, type StepResult, type ToolSet } from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { z } from "zod";
import { createLiveToolContext } from "../lib/chat/live-tool-context";
import { buildReadToolResultTool } from "../lib/tools/read-tool-result";
import { extractWebPageText } from "../lib/tools/web-fetch";
import { estimateTokenCount } from "../lib/utils";

const earlyUrl = "https://example.org/original-study";
const earlyFact = "The original trial enrolled 371 people.";
const page = "<nav>Navigation noise</nav><script>" + "var payload = 'unused';".repeat(900) +
  "</script><title>Original trial</title><main><p>" + earlyFact +
  '</p><a href="/appendix#results">Appendix &amp; data</a></main>';
const parsedPage = extractWebPageText(page, earlyUrl);
assert.equal(parsedPage.title, "Original trial");
assert.equal(parsedPage.text, earlyFact + "\nAppendix & data");
assert.deepEqual(parsedPage.links, ["https://example.org/appendix"]);

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const call = (toolName: string, toolCallId: string, input: object): LanguageModelV4StreamPart =>
  ({ type: "tool-call", toolName, toolCallId, input: JSON.stringify(input) });

async function replay(optimize: boolean) {
  const context = createLiveToolContext();
  const list = tool({ inputSchema: z.object({}), execute: async () => ({ catalog: "tool description ".repeat(500) }) });
  const search = tool({
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      const result = { title: query, url: earlyUrl, description: "Original trial evidence." };
      return { query, results: [result, result], sources: [{ url: earlyUrl, title: query, id: 1 }] };
    },
  });
  const fetch = tool({
    inputSchema: z.object({ url: z.string() }),
    execute: async ({ url }) => ({
      url,
      title: parsedPage.title,
      content: optimize ? parsedPage.text : page,
      ...(url === earlyUrl ? { detail: "primary enrollment record" } : {}),
    }),
  });
  const archive = buildReadToolResultTool(context.results);
  const tools = {
    list_available_tools: list,
    web_search: search,
    web_fetch: fetch,
    read_tool_result: archive,
    unrelated: tool({ description: "Unrelated schema ".repeat(100), inputSchema: z.object({}) }),
  };
  let total = 0;
  let calls = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt, tools }) => {
      const step = calls++;
      const serialized = JSON.stringify(prompt);
      total += estimateTokenCount(serialized + JSON.stringify(tools));
      const callIds = new Set<string>();
      for (const message of prompt) {
        if (!Array.isArray(message.content)) continue;
        for (const part of message.content) {
          if (part.type === "tool-call") callIds.add(part.toolCallId);
          if (part.type === "tool-result") assert.ok(callIds.delete(part.toolCallId), part.toolCallId);
        }
      }
      assert.equal(callIds.size, 0);
      if (step > 5) assert.equal(serialized.split("LIVE ANSWER").length - 1, 1);
      const parts: LanguageModelV4StreamPart[] = [];
      if (step === 0) parts.push(call("list_available_tools", "discovery", {}));
      else if (step === 1) parts.push(call("web_fetch", "early-fetch", { url: earlyUrl }));
      else if (step < 28) {
        parts.push(call("web_search", `search-a-${step}`, { query: `trial ${step}` }));
        parts.push(call("web_search", `search-b-${step}`, { query: `evidence ${step}` }));
        parts.push(call("web_fetch", `fetch-${step}`, { url: `https://example.org/${step}` }));
      } else if (step === 28) {
        if (optimize) {
          assert.ok(!serialized.includes("primary enrollment record"));
          parts.push(call("read_tool_result", "reopen", { toolCallId: "early-fetch" }));
        } else {
          parts.push(call("web_search", "last-search", { query: "last search" }));
        }
      } else {
        assert.ok(serialized.includes("primary enrollment record"));
        parts.push({ type: "text-start", id: "answer" },
          { type: "text-delta", id: "answer", delta: `${earlyFact} [Original study](${earlyUrl})` },
          { type: "text-end", id: "answer" });
      }
      parts.push({ type: "finish", finishReason: { unified: step === 29 ? "stop" : "tool-calls", raw: undefined }, usage });
      return { stream: convertArrayToReadableStream(parts) };
    },
  });
  const result = streamText({
    model, tools, prompt: "Research the original trial.", stopWhen: stepCountIs(30),
    prepareStep: ({ messages, steps }) => {
      const delivered = steps.length === 5 ? [...messages, { role: "user" as const, content: "LIVE ANSWER" }] : messages;
      return {
        messages: optimize ? context.prepare(delivered, steps) : delivered,
        activeTools: optimize
          ? ["list_available_tools", "web_search", "web_fetch", "read_tool_result"]
          : Object.keys(tools) as (keyof typeof tools)[],
      };
    },
  });
  await result.consumeStream();
  assert.equal(calls, 30);
  assert.ok((await result.text).includes(earlyUrl));
  if (optimize) {
    const firstSearch = context.results.get("search-a-2")?.output;
    assert.equal((firstSearch as { results: unknown[] }).results.length, 2);
    const lookup = await archive.execute!({ query: "primary enrollment", offset: 0, limit: 100 }, {
      toolCallId: "lookup-test", messages: [], context: {},
    });
    assert.ok("matches" in lookup && lookup.matches?.some((match) => match.toolCallId === "early-fetch"));
    const firstPage = await archive.execute!({ toolCallId: "early-fetch", offset: 0, limit: 20 }, {
      toolCallId: "page-test", messages: [], context: {},
    });
    assert.ok("nextOffset" in firstPage && firstPage.nextOffset === 20);
  }
  return total;
}

function checkProtectedRounds() {
  const context = createLiveToolContext();
  const metadata = { anthropic: { signature: "signed" } };
  const signed: ModelMessage = {
    role: "assistant",
    content: [
      { type: "reasoning", text: "Signed reasoning", providerOptions: metadata },
      { type: "tool-call", toolCallId: "signed", toolName: "web_fetch", input: {} },
      { type: "tool-call", toolCallId: "native", toolName: "native_search", input: {}, providerExecuted: true },
    ],
  };
  const pending: ModelMessage = {
    role: "assistant",
    content: [
      { type: "tool-call", toolCallId: "pending", toolName: "write_file", input: {} },
      { type: "tool-approval-request", approvalId: "approval", toolCallId: "pending" },
    ],
  };
  const signedResult: ModelMessage = {
    role: "tool",
    content: [{
      type: "tool-result", toolCallId: "signed", toolName: "web_fetch",
      output: { type: "text", value: "full signed-round evidence" },
    }],
  };
  const steps = ["signed", "two", "three"].map((toolCallId) => ({
    toolResults: [{ toolName: "web_fetch", toolCallId, input: {}, output: "full signed-round evidence" }],
  })) as StepResult<ToolSet>[];
  const messages = context.prepare([{ role: "user", content: "Research" }, signed, signedResult, pending], steps);
  assert.deepEqual(messages[1], signed);
  assert.deepEqual(messages.at(-1), pending);
  assert.match(JSON.stringify(messages[2]), /read_tool_result/);
  assert.match(JSON.stringify(signedResult), /full signed-round evidence/);
}

async function main() {
  checkProtectedRounds();
  const baseline = await replay(false);
  const optimized = await replay(true);
  const reduction = 1 - optimized / baseline;
  assert.ok(reduction >= 0.6, `Expected at least 60% reduction, got ${reduction}`);
  console.log(`30 steps: ${baseline.toLocaleString()} → ${optimized.toLocaleString()} estimated input tokens (${(reduction * 100).toFixed(1)}% less)`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
