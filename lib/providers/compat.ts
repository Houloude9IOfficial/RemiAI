/**
 * Creates a wrapped `fetch` function that patches streaming Chat Completions
 * responses from providers that omit the required `index` field on individual
 * `tool_calls` items within streaming deltas.
 *
 * Some OpenAI-compatible endpoints (e.g. Gemini, some Ollama models) don't
 * include the `index` property on each tool_call in the streaming delta array,
 * which causes the AI SDK's Zod validation to reject the chunk.
 *
 * This wrapper intercepts SSE `data: ...` lines, parses them, adds the
 * missing `index` field (based on array position), re-serializes, and yields
 * the patched lines into a new `ReadableStream`.
 */
export function createCompatFetch(
  baseFetch: typeof fetch = globalThis.fetch,
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

    const patchedBody = patchSSEStream(response.body);

    return new Response(patchedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

function patchSSEStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

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
            const patched = patchLine(line);
            controller.enqueue(encoder.encode(patched + "\n"));
          }
        }

        // Process remaining buffer
        if (buffer) {
          controller.enqueue(encoder.encode(patchLine(buffer) + "\n"));
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

function patchLine(line: string): string {
  if (!line.startsWith("data: ")) return line;

  const data = line.slice(6).trim();

  // Skip non-JSON lines (like "data: [DONE]")
  if (data === "[DONE]" || !data) return line;

  try {
    const parsed = JSON.parse(data);

    // Only patch if this is a chat completion chunk with tool_calls
    const choices = parsed.choices;
    if (!Array.isArray(choices)) return line;

    let needsPatch = false;
    for (const choice of choices) {
      const toolCalls = choice?.delta?.tool_calls;
      if (!Array.isArray(toolCalls)) continue;

      for (let i = 0; i < toolCalls.length; i++) {
        if (toolCalls[i].index === undefined) {
          toolCalls[i].index = i;
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
