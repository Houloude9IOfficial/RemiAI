// Smoke test: does prepareStep + activeTools expose newly enabled tools to the
// model in a LATER STEP of the SAME stream?
//
// Standalone contract check for the dynamic tool-group loading feature
// (lib/chat/tool-groups.ts + app/api/chat/route.ts). Run manually with:
//   node scripts/smoke-dynamic-tools.mjs
// It does not need a real provider or the app DB — only the installed AI SDK.
//
// Scenario:
//  - Full tool set registered: { read_file, write_file, load_tool_groups }
//  - Initial activeTools = ["read_file", "load_tool_groups"] (write_file hidden)
//  - Step 1: model calls load_tool_groups({ groups: ["fs_write"] })
//  - prepareStep: simulates a DB read that picks up fs_write → write_file now active
//  - Step 2: model calls write_file (must be registered NOW)
//  - Step 3: model finishes with text
//
// If the SDK fixed the tool set per stream, step 2 would NOT see write_file
// and the run would fail. If activeTools filtering per step works, step 2's
// provider call includes write_file.

import { streamText, jsonSchema, stepCountIs } from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";

const inputSchema = (properties) =>
  jsonSchema({ type: "object", properties, additionalProperties: false });

const TOOLS = {
  read_file: {
    type: "function",
    description: "Read a file",
    inputSchema: inputSchema({ path: { type: "string" } }),
    execute: async ({ path }) => `contents of ${path}`,
  },
  write_file: {
    type: "function",
    description: "Write a file",
    inputSchema: inputSchema({
      path: { type: "string" },
      content: { type: "string" },
    }),
    execute: async ({ path }) => `wrote ${path}`,
  },
  load_tool_groups: {
    type: "function",
    description: "Enable tool groups",
    inputSchema: inputSchema({
      groups: { type: "array", items: { type: "string" } },
    }),
    execute: async ({ groups }) => `enabled ${groups.join(",")}`,
  },
};

// What the model returns on each LLM call (in order).
function streamWithToolCall(toolName, args) {
  return {
    stream: convertArrayToReadableStream([
      {
        type: "tool-call",
        toolCallId: `call-${toolName}`,
        toolName,
        input: JSON.stringify(args),
      },
      {
        type: "finish",
        finishReason: "tool-calls",
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]),
  };
}

const callSequences = [
  streamWithToolCall("load_tool_groups", { groups: ["fs_write"] }),
  streamWithToolCall("write_file", { path: "a.txt", content: "hi" }),
  {
    stream: convertArrayToReadableStream([
      { type: "text-delta", delta: "done." },
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]),
  },
];

const model = new MockLanguageModelV4({
  doStream: callSequences,
});

let enabledGroups = new Set();
const initialActive = ["read_file", "load_tool_groups"];

const result = streamText({
  model,
  prompt: "write a file",
  tools: TOOLS,
  activeTools: initialActive,
  stopWhen: stepCountIs(10), // let the loop run
  prepareStep: async () => {
    // Simulate the route's prepareStep: recompute active tools from state
    // (in the real app this is a DB read of the tool_groups column).
    const active = new Set(initialActive);
    for (const g of enabledGroups) {
      if (g === "fs_write") {
        active.add("write_file");
      }
    }
    return { activeTools: [...active] };
  },
});

// Simulate the DB write the real load_tool_groups tool performs: mark the
// group as enabled so the NEXT prepareStep picks it up.
const realExecute = TOOLS.load_tool_groups.execute;
TOOLS.load_tool_groups.execute = async (args) => {
  const out = await realExecute(args);
  if (Array.isArray(args?.groups)) enabledGroups = new Set(args.groups);
  return out;
};

const text = await result.text;
const calls = await result.toolCalls;
const providerCalls = model.doStreamCalls;

console.log("=== final text:", JSON.stringify(text));
console.log(
  "=== tool calls executed:",
  calls.map((c) => `${c.toolName}(${JSON.stringify(c.input)})`),
);
console.log("=== provider call count:", providerCalls.length);
providerCalls.forEach((call, i) => {
  const names = (call.tools ?? []).map((t) => t.name);
  console.log(`  step ${i + 1} tools sent to provider: [${names.join(", ")}]`);
});

// Check the property we care about:
const step2Names =
  providerCalls[1]?.tools?.map((t) => t.name) ?? [];
const ok = step2Names.includes("write_file") && providerCalls.length === 3;
console.log(
  ok
    ? "\nPASS: write_file was visible to the model in step 2 of the SAME stream"
    : "\nFAIL: write_file was NOT exposed mid-stream",
);
process.exit(ok ? 0 : 1);
