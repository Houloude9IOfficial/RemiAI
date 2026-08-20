/**
 * Creates a wrapped `fetch` function that patches streaming Chat Completions
 * responses from providers that deviate from the OpenAI wire format.
 *
 * Two patches are applied to SSE `data: ...` lines:
 *
 * 1. `tool_calls` index — some OpenAI-compatible endpoints (e.g. Gemini, some
 *    Ollama models) omit the required `index` field on individual `tool_calls`
 *    items within streaming deltas, which causes the AI SDK's Zod validation
 *    to reject the chunk.
 *
 * 2. reasoning → `<think>` content (optional, enabled via
 *    `convertReasoningToThink`). Reasoning models served through OpenAI-
 *    compatible endpoints stream their thinking in a `reasoning` field on the
 *    delta (Ollama, OpenRouter) or `reasoning_content` (DeepSeek, some Groq /
 *    Together / Fireworks models) while keeping `content` empty. The
 *    `@ai-sdk/openai` chat provider silently drops those fields, so the
 *    reasoning never reaches the UI. This patcher folds the reasoning text
 *    into `delta.content` wrapped in `<think>...</think>` so the SDK's
 *    `extractReasoningMiddleware` can turn it into proper reasoning parts
 *    (and strip the tags from the final text). Responses without a reasoning
 *    field pass through unchanged.
 */
export interface CompatFetchOptions {
  /** Fold reasoning delta fields into `delta.content` wrapped in `<think>` tags. */
  convertReasoningToThink?: boolean;
}

export function createCompatFetch(
  baseFetch: typeof fetch = globalThis.fetch,
  options: CompatFetchOptions = {},
): typeof fetch {
  return async function compatFetch(input, init) {
    const response = await baseFetch(input, init);

    // Only patch streaming JSON responses from chat completions endpoints
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get("content-type")?.includes("text/event-stream")
    ) {
      return response;
    }

    const patchedBody = patchSSEStream(response.body, options);

    return new Response(patchedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

interface PatchState {
  /** Whether a `<think>` block has been opened and not yet closed. */
  inThink: boolean;
}

function patchSSEStream(
  body: ReadableStream<Uint8Array>,
  options: CompatFetchOptions,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const state: PatchState = { inThink: false };

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const patched = patchLine(line, state, options);
            controller.enqueue(encoder.encode(patched + "\n"));
          }
        }

        // Process remaining buffer
        if (buffer) {
          controller.enqueue(encoder.encode(patchLine(buffer, state, options) + "\n"));
        }

        controller.close();
        reader.releaseLock();
      } catch (err) {
        controller.error(err);
        reader.releaseLock();
      }
    },
  });
}

function patchLine(line: string, state: PatchState, options: CompatFetchOptions): string {
  if (!line.startsWith("data: ")) return line;

  const data = line.slice(6).trim();

  // Skip non-JSON lines (like "data: [DONE]")
  if (data === "[DONE]" || !data) return line;

  try {
    const parsed = JSON.parse(data);

    // Only patch if this is a chat completion chunk with choices
    const choices = parsed.choices;
    if (!Array.isArray(choices)) return line;

    let needsPatch = false;

    for (const choice of choices) {
      const delta = choice?.delta;
      if (delta == null || typeof delta !== "object") continue;

      // Patch 1: missing tool_calls index
      const toolCalls = delta.tool_calls;
      if (Array.isArray(toolCalls)) {
        for (let i = 0; i < toolCalls.length; i++) {
          if (toolCalls[i].index === undefined) {
            toolCalls[i].index = i;
            needsPatch = true;
          }
        }
      }

      // Patch 2: fold reasoning deltas into <think>-wrapped content.
      // Different OpenAI-compatible endpoints use different field names:
      // `reasoning` (Ollama, OpenRouter) or `reasoning_content` (DeepSeek,
      // some Groq / Together / Fireworks models).
      if (options.convertReasoningToThink) {
        const reasoning =
          typeof delta.reasoning === "string"
            ? delta.reasoning
            : typeof delta.reasoning_content === "string"
              ? delta.reasoning_content
              : "";
        const content = delta.content;
        const hasReasoning = reasoning.length > 0;
        const hasContent = typeof content === "string" && content.length > 0;

        if (hasReasoning) {
          let nextContent = "";
          if (!state.inThink) {
            nextContent += "<think>";
            state.inThink = true;
          }
          nextContent += reasoning;
          if (hasContent) {
            // reasoning and text arrived in the same chunk — close the block
            nextContent += "</think>" + content;
            state.inThink = false;
          }
          delta.content = nextContent;
          delete delta.reasoning;
          delete delta.reasoning_content;
          needsPatch = true;
        } else if (hasContent && state.inThink) {
          // first text after reasoning — close the block
          delta.content = "</think>" + content;
          state.inThink = false;
          needsPatch = true;
        }

        // Close an open block if the stream signals the end of a completion
        if (choice.finish_reason != null && state.inThink) {
          delta.content = (delta.content ?? "") + "</think>";
          state.inThink = false;
          needsPatch = true;
        }
      }
    }

    if (!needsPatch) return line;

    return `data: ${JSON.stringify(parsed)}`;
  } catch {
    // If it's not valid JSON, pass through unchanged
    return line;
  }
}
