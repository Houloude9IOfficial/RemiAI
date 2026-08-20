/**
 * Test for the Ollama reasoning fix.
 *
 * Ollama's OpenAI-compatible endpoint streams reasoning as
 * `choices[0].delta.reasoning` with empty `content`. The @ai-sdk/openai chat
 * provider drops that field entirely (it only reads `delta.content`,
 * `delta.tool_calls`, `delta.annotations`), so no SDK middleware can ever see
 * the reasoning — which is why users only ever got the generic "Thinking..."
 * state. The fix lives in `lib/providers/compat.ts`: its SSE patcher folds
 * `delta.reasoning` into `delta.content` wrapped in `<think>...</think>`, and
 * the existing `extractReasoningMiddleware` then converts that into real AI
 * SDK reasoning parts.
 *
 * This test drives `createCompatFetch` with a fake fetch that emits the exact
 * chunk sequence Ollama produces and asserts:
 *   - reasoning deltas become `<think>`-wrapped content,
 *   - the `<think>` block closes exactly once, when text starts,
 *   - text is preserved after the closing tag,
 *   - nothing is modified when the option is off (pass-through).
 */
import { createCompatFetch } from "../lib/providers/compat";

// ── Fake SSE response ─────────────────────────────────────────────────

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function dataLine(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** The exact shape Ollama streams for a reasoning model. */
function ollamaReasoningChunks(): string[] {
  return [
    dataLine({ choices: [{ delta: { content: "", reasoning: "The" } }] }),
    dataLine({ choices: [{ delta: { content: "", reasoning: " user" } }] }),
    dataLine({ choices: [{ delta: { content: "", reasoning: " said hi" } }] }),
    // transition to the actual answer:
    dataLine({ choices: [{ delta: { content: "Hello!", reasoning: "" } }] }),
    dataLine({ choices: [{ delta: { content: " How can I help?" } }] }),
    dataLine({
      choices: [{ delta: { content: "" }, finish_reason: "stop" }],
    }),
    "data: [DONE]\n\n",
  ];
}

// ── Assertions ────────────────────────────────────────────────────────

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures += 1;
  }
}

function collectContents(response: Response): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const contents: string[] = [];
    const flush = () => {
      for (const line of buffer.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]" || !data) continue;
        try {
          const parsed = JSON.parse(data);
          for (const choice of parsed.choices ?? []) {
            if (choice?.delta?.content != null) {
              contents.push(String(choice.delta.content));
            }
          }
        } catch {
          // ignore
        }
      }
    };
    (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        flush();
        buffer = "";
      }
      resolve(contents);
    })().catch(reject);
  });
}

async function run() {
  // ── With conversion enabled (Ollama path) ──────────────────────────
  const baseFetch = async () => sseResponse(ollamaReasoningChunks());
  const compatFetch = createCompatFetch(baseFetch as typeof fetch, {
    convertReasoningToThink: true,
  });
  const response = await compatFetch("http://example.test/v1/chat/completions", {
    method: "POST",
  });
  const contents = await collectContents(response);

  const joined = contents.join("");
  const thinkCount = (joined.match(/<think>/g) ?? []).length;
  const closeThinkCount = (joined.match(/<\/think>/g) ?? []).length;

  assert(
    contents[0] === "<think>The",
    `first reasoning delta opens <think> ("${contents[0]}")`,
  );
  assert(
    contents[1] === " user",
    `intermediate reasoning deltas keep the block open ("${contents[1]}")`,
  );
  assert(
    contents[3] === "</think>Hello!",
    `text start closes the block exactly once ("${contents[3]}")`,
  );
  assert(
    contents[4] === " How can I help?",
    `following text passes through unchanged ("${contents[4]}")`,
  );
  assert(thinkCount === 1, `<think> opened exactly once (got ${thinkCount})`);
  assert(closeThinkCount === 1, `</think> closed exactly once (got ${closeThinkCount})`);
  assert(
    joined.endsWith("Hello! How can I help?"),
    `final text preserved after closing tag ("${joined}")`,
  );

  // ── Pass-through when the option is off ────────────────────────────
  const plainFetch = async () => sseResponse(ollamaReasoningChunks());
  const plainCompat = createCompatFetch(plainFetch as typeof fetch);
  const plainResponse = await plainCompat("http://example.test/v1/chat/completions", {
    method: "POST",
  });
  const plainContents = await collectContents(plainResponse);
  assert(
    plainContents.join("").includes("reasoning") === false &&
      plainContents[0] === "" &&
      plainContents[1] === "",
    `without the option, reasoning is not folded into content`,
  );

  // ── reasoning_content variant (DeepSeek / some Groq models) ───────
  const deepseekChunks = [
    dataLine({ choices: [{ delta: { content: "", reasoning_content: "Let" } }] }),
    dataLine({ choices: [{ delta: { content: "", reasoning_content: " me check" } }] }),
    dataLine({ choices: [{ delta: { content: "The answer is 42.", reasoning_content: "" } }] }),
    "data: [DONE]\n\n",
  ];
  const dsFetch = async () => sseResponse(deepseekChunks);
  const dsCompat = createCompatFetch(dsFetch as typeof fetch, {
    convertReasoningToThink: true,
  });
  const dsResponse = await dsCompat("http://example.test/v1/chat/completions", {
    method: "POST",
  });
  const dsContents = await collectContents(dsResponse);
  const dsJoined = dsContents.join("");
  assert(
    dsJoined === "<think>Let me check</think>The answer is 42.",
    `reasoning_content folded into <think> content ("${dsJoined}")`,
  );
  assert(
    dsContents.length === 3 && !JSON.stringify(dsContents).includes("reasoning"),
    `reasoning_content field removed from the stream`,
  );

  // ── tool_calls index patching still works ──────────────────────────
  const toolFetch = async () =>
    sseResponse([
      dataLine({
        choices: [{ delta: { tool_calls: [{ id: "call_1", function: { name: "f", arguments: "{}" } }] } }],
      }),
      "data: [DONE]\n\n",
    ]);
  const toolCompat = createCompatFetch(toolFetch as typeof fetch);
  const toolResponse = await toolCompat("http://example.test/v1/chat/completions", {
    method: "POST",
  });
  const reader = toolResponse.body!.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  const toolLine = raw
    .split("\n")
    .find((line) => line.startsWith("data: ") && !line.includes("DONE"));
  const toolParsed = JSON.parse(toolLine!.slice(6));
  assert(
    toolParsed.choices[0].delta.tool_calls[0].index === 0,
    `tool_calls still get an index patched in (got ${toolParsed.choices[0].delta.tool_calls[0].index})`,
  );

  if (failures > 0) {
    console.error(`\n❌ ${failures} assertion${failures === 1 ? "" : "s"} failed.`);
    process.exit(1);
  }
  console.log("\n✅ All Ollama reasoning SSE conversion tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
