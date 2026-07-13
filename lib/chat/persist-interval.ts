/**
 * Reads a UIMessageChunk stream and periodically persists the accumulated
 * message state to the database (every 2 seconds).
 *
 * This ensures that if the page is refreshed while the AI is still
 * generating, the partial response is not lost — the re-loaded conversation
 * will include the partially generated messages.
 *
 * The stream must come from `toUIMessageStream()` (raw UIMessageChunk
 * objects), NOT the SSE-encoded version.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import type { UIMessage, UIMessageChunk } from "ai";

const PERSIST_INTERVAL_MS = 2000;

export async function periodicallyPersistMessages(
  conversationId: number,
  originalMessages: UIMessage[],
  chunkStream: ReadableStream<UIMessageChunk>,
  onStreamEnd?: () => Promise<void>,
): Promise<void> {
  const reader = chunkStream.getReader();

  // Track the current assistant message being built
  let messageId = "";
  const parts: UIMessage["parts"] = [];
  const textById = new Map<string, number>(); // text/reasoning chunk ID → index in parts
  const toolById = new Map<string, number>(); // toolCallId → index in parts

  let lastPersistTime = Date.now();

  async function persistSnapshot() {
    const snapshot: UIMessage = {
      id: messageId,
      role: "assistant",
      parts: parts.slice(),
    };

    // Persist the assistant message (upsert — updates parts if already exists)
    await db
      .insert(messages)
      .values({
        uiId: snapshot.id,
        conversationId,
        role: snapshot.role,
        parts: snapshot.parts as Record<string, unknown>[],
        orderIndex: originalMessages.length,
      })
      .onConflictDoUpdate({
        target: [messages.conversationId, messages.uiId],
        set: {
          parts: sql`excluded.parts`,
        },
      });

    lastPersistTime = Date.now();
  }

  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;

      if (!chunk) continue;

      processChunk(chunk as unknown as Record<string, unknown>);

      // Persist every PERSIST_INTERVAL_MS
      if (messageId && Date.now() - lastPersistTime >= PERSIST_INTERVAL_MS) {
        await persistSnapshot();
      }
    }
  } catch (err) {
    console.error("Periodic persist stream error:", err);
  } finally {
    // Final persist: whether the stream completed cleanly or errored,
    // persist whatever we have accumulated so far.
    if (messageId) {
      await persistSnapshot();
    }
    reader.releaseLock();
    if (onStreamEnd) {
      await onStreamEnd();
    }
  }

  function processChunk(chunk: Record<string, unknown>) {
    const type = chunk.type as string;

    switch (type) {
      case "start":
        messageId = (chunk.messageId as string) || messageId;
        break;

      case "text-start": {
        const id = chunk.id as string;
        parts.push({
          type: "text",
          text: "",
          state: "streaming" as const,
        });
        textById.set(id, parts.length - 1);
        break;
      }

      case "text-delta": {
        const id = chunk.id as string;
        const idx = textById.get(id);
        if (idx != null) {
          const part = parts[idx] as { type: "text"; text: string };
          part.text += (chunk.delta as string) || "";
        }
        break;
      }

      case "text-end": {
        const id = chunk.id as string;
        const idx = textById.get(id);
        if (idx != null) {
          (parts[idx] as Record<string, unknown>).state = "done";
          textById.delete(id);
        }
        break;
      }

      case "reasoning-start": {
        const id = chunk.id as string;
        parts.push({
          type: "reasoning" as const,
          text: "",
          state: "streaming" as const,
        });
        textById.set(id, parts.length - 1);
        break;
      }

      case "reasoning-delta": {
        const id = chunk.id as string;
        const idx = textById.get(id);
        if (idx != null) {
          const part = parts[idx] as { type: "reasoning"; text: string };
          part.text += (chunk.delta as string) || "";
        }
        break;
      }

      case "reasoning-end": {
        const id = chunk.id as string;
        const idx = textById.get(id);
        if (idx != null) {
          (parts[idx] as Record<string, unknown>).state = "done";
          textById.delete(id);
        }
        break;
      }

      case "tool-input-start": {
        const toolCallId = chunk.toolCallId as string;
        const toolName = chunk.toolName as string;
        const part: Record<string, unknown> = {
          type: `tool-${toolName}`,
          toolCallId,
          state: "input-streaming",
          input: undefined,
        };
        if (chunk.providerExecuted != null)
          part.providerExecuted = chunk.providerExecuted;
        if (chunk.title != null) part.title = chunk.title;
        if (chunk.dynamic != null) part.dynamic = chunk.dynamic;

        parts.push(part as never);
        toolById.set(toolCallId, parts.length - 1);
        break;
      }

      case "tool-input-delta": {
        // tool-input-delta doesn't carry the full input, only the text delta
        // of the JSON arguments being streamed. We skip accumulating these
        // for persistence — the "tool-input-available" chunk has the complete input.
        break;
      }

      case "tool-input-available": {
        const toolCallId = chunk.toolCallId as string;
        const idx = toolById.get(toolCallId);
        const part: Record<string, unknown> = {
          type: `tool-${chunk.toolName as string}`,
          toolCallId,
          state: "input-available",
          input: chunk.input,
        };
        if (chunk.providerExecuted != null)
          part.providerExecuted = chunk.providerExecuted;
        if (chunk.title != null) part.title = chunk.title;
        if (chunk.dynamic != null) part.dynamic = chunk.dynamic;
        if (chunk.providerMetadata != null)
          part.callProviderMetadata = chunk.providerMetadata;

        if (idx != null) {
          // Update existing part
          Object.assign(parts[idx], part);
        } else {
          parts.push(part as never);
          toolById.set(toolCallId, parts.length - 1);
        }
        break;
      }

      case "tool-input-error": {
        const toolCallId = chunk.toolCallId as string;
        const idx = toolById.get(toolCallId);
        if (idx != null) {
          const part = parts[idx] as Record<string, unknown>;
          part.state = "output-error";
          part.errorText = chunk.errorText;
          if (chunk.providerMetadata != null)
            part.resultProviderMetadata = chunk.providerMetadata;
        }
        break;
      }

      case "tool-output-available": {
        const toolCallId = chunk.toolCallId as string;
        const idx = toolById.get(toolCallId);
        if (idx != null) {
          const part = parts[idx] as Record<string, unknown>;
          part.state = "output-available";
          part.output = chunk.output;
          if (chunk.preliminary != null) part.preliminary = chunk.preliminary;
          if (chunk.providerMetadata != null)
            part.resultProviderMetadata = chunk.providerMetadata;
        }
        break;
      }

      case "tool-output-error": {
        const toolCallId = chunk.toolCallId as string;
        const idx = toolById.get(toolCallId);
        if (idx != null) {
          const part = parts[idx] as Record<string, unknown>;
          part.state = "output-error";
          part.errorText = chunk.errorText;
          if (chunk.providerMetadata != null)
            part.resultProviderMetadata = chunk.providerMetadata;
        }
        break;
      }

      case "tool-output-denied": {
        const toolCallId = chunk.toolCallId as string;
        const idx = toolById.get(toolCallId);
        if (idx != null) {
          (parts[idx] as Record<string, unknown>).state = "output-denied";
        }
        break;
      }

      case "start-step":
        parts.push({ type: "step-start" as const });
        break;

      case "finish-step":
        // Clear active text/reasoning parts at step boundaries
        textById.clear();
        break;

      case "error":
        console.error("Stream chunk error:", chunk.errorText);
        break;
    }
  }
}
