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
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import type { ReasoningUIPart, UIMessage, UIMessageChunk } from "ai";
import type { RunTrace } from "@/lib/observability/run-trace";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { RESPONSE_USAGE_PART } from "./response-usage";
import { REQUEST_DURATION_PART } from "./request-duration";
import { latestWorkActivity, WORK_ACTIVITY_PART, type WorkActivityPart } from "./work-activity";


const PERSIST_INTERVAL_MS = 2000;

export async function periodicallyPersistMessages(
  conversationId: number,
  originalMessages: UIMessage[],
  chunkStream: ReadableStream<UIMessageChunk>,
  onStreamEnd?: () => Promise<void>,
  trace?: RunTrace,
  // Injectable for tests (mirrors `history-reconstruction.ts`); defaults to
  // the app singleton so production callers pass nothing extra.
  database?: BetterSQLite3Database<typeof schema>,
): Promise<void> {
  const persistDb = database ?? db;
  const reader = chunkStream.getReader();

  // Track the current assistant message being built
  let messageId = "";
  const parts: UIMessage["parts"] = [];
  const textById = new Map<string, number>(); // text/reasoning chunk ID → index in parts
  const toolById = new Map<string, number>(); // toolCallId → index in parts
  // Tool-call ID → tool name. Populated by tool-input-start / -available;
  // used to create a part if an output/error chunk ever arrives without a
  // preceding input chunk (defensive — the UI would otherwise lose the call).
  const toolNameById = new Map<string, string>();

  let lastPersistTime = Date.now();

  async function persistSnapshot() {
    const persistStartedAt = performance.now();
    const snapshot: UIMessage = {
      id: messageId,
      role: "assistant",
      // Activity-aware turns keep a record of tools interrupted before their
      // arguments arrived. Older stream callers still drop incomplete parts.
      parts: latestWorkActivity(parts)
        ? parts
        : parts.filter((part) => !("state" in part && part.state === "input-streaming")),
    };

    // Persist the assistant message (upsert — updates parts if already exists)
    persistDb.transaction((tx) => {
      const last = tx.select({ orderIndex: messages.orderIndex }).from(messages)
        .where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.orderIndex)).get();
      tx
        .insert(messages)
        .values({
          uiId: snapshot.id,
          conversationId,
          role: snapshot.role,
          parts: snapshot.parts as Record<string, unknown>[],
          orderIndex: (last?.orderIndex ?? -1) + 1,
        })
        .onConflictDoUpdate({
          target: [messages.conversationId, messages.uiId],
          set: {
            parts: sql`excluded.parts`,
          },
        }).run();
    });

    trace?.dbQuery("persist_assistant_snapshot", persistStartedAt, {
      partCount: parts.length,
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
      if (messageId && (
        (chunk.type === WORK_ACTIVITY_PART && (chunk as WorkActivityPart).data.status === "running") ||
        Date.now() - lastPersistTime >= PERSIST_INTERVAL_MS
      )) {
        await persistSnapshot();
      }
    }
  } catch (err) {
    trace?.event("persistence.error", {
      category: err instanceof Error ? err.name : "UnknownError",
    });
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
      case WORK_ACTIVITY_PART: {
        const activity = chunk as unknown as WorkActivityPart;
        const index = parts.findIndex((part) =>
          part.type === WORK_ACTIVITY_PART && part.id === activity.id,
        );
        if (index < 0) parts.push(activity);
        else parts[index] = activity;
        break;
      }

      case RESPONSE_USAGE_PART: {
        const usage = { type: RESPONSE_USAGE_PART, id: chunk.id, data: chunk.data } as UIMessage["parts"][number];
        const index = parts.findIndex((part) => part.type === RESPONSE_USAGE_PART && part.id === chunk.id);
        if (index < 0) parts.push(usage);
        else parts[index] = usage;
        break;
      }

      case REQUEST_DURATION_PART:
        parts.push({ type: REQUEST_DURATION_PART, data: chunk.data } as UIMessage["parts"][number]);
        break;

      case "start":
        messageId = (chunk.messageId as string) || messageId;
        if (!parts.length) {
          const previous = originalMessages.at(-1);
          if (previous?.role === "assistant" && previous.id === messageId) {
            parts.push(...structuredClone(previous.parts));
            parts.forEach((part, index) => {
              if ("toolCallId" in part && typeof part.toolCallId === "string") toolById.set(part.toolCallId, index);
            });
          }
        }
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
          providerMetadata: chunk.providerMetadata as ReasoningUIPart["providerMetadata"],
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
        if (toolById.has(toolCallId)) break;
        const toolName = chunk.toolName as string;
        toolNameById.set(toolCallId, toolName);
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
        const toolName = chunk.toolName as string;
        toolNameById.set(toolCallId, toolName);
        const part: Record<string, unknown> = {
          type: `tool-${toolName}`,
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
        const toolName = (chunk.toolName as string) ?? toolNameById.get(toolCallId);
        toolNameById.set(toolCallId, toolName);
        if (idx != null) {
          const part = parts[idx] as Record<string, unknown>;
          part.state = "output-error";
          part.errorText = chunk.errorText;
          if (chunk.providerMetadata != null)
            part.resultProviderMetadata = chunk.providerMetadata;
        } else if (toolName) {
          // Invalid/errored tool calls can surface without a preceding
          // tool-input-start — never drop the call from the persisted message.
          const part: Record<string, unknown> = {
            type: `tool-${toolName}`,
            toolCallId,
            state: "output-error",
            input: chunk.input,
            errorText: chunk.errorText,
          };
          if (chunk.providerMetadata != null)
            part.resultProviderMetadata = chunk.providerMetadata;
          parts.push(part as never);
          toolById.set(toolCallId, parts.length - 1);
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
        } else {
          // Defensive: if the output arrives without a recorded input chunk
          // (e.g. a resumed/replayed stream), keep the call visible anyway.
          const toolName = toolNameById.get(toolCallId);
          const part: Record<string, unknown> = {
            type: `tool-${toolName ?? "unknown"}`,
            toolCallId,
            state: "output-available",
            output: chunk.output,
          };
          if (chunk.preliminary != null) part.preliminary = chunk.preliminary;
          if (chunk.providerMetadata != null)
            part.resultProviderMetadata = chunk.providerMetadata;
          parts.push(part as never);
          toolById.set(toolCallId, parts.length - 1);
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
        } else {
          const toolName = toolNameById.get(toolCallId);
          const part: Record<string, unknown> = {
            type: `tool-${toolName ?? "unknown"}`,
            toolCallId,
            state: "output-error",
            errorText: chunk.errorText,
          };
          if (chunk.providerMetadata != null)
            part.resultProviderMetadata = chunk.providerMetadata;
          parts.push(part as never);
          toolById.set(toolCallId, parts.length - 1);
        }
        break;
      }

      case "tool-output-denied": {
        const toolCallId = chunk.toolCallId as string;
        const idx = toolById.get(toolCallId);
        if (idx != null) {
          (parts[idx] as Record<string, unknown>).state = "output-denied";
        } else {
          const toolName = toolNameById.get(toolCallId);
          const part: Record<string, unknown> = {
            type: `tool-${toolName ?? "unknown"}`,
            toolCallId,
            state: "output-denied",
          };
          parts.push(part as never);
          toolById.set(toolCallId, parts.length - 1);
        }
        break;
      }

      case "source-url":
      case "source-document":
      case "file": {
        const { type, ...fields } = chunk;
        parts.push({ ...fields, type } as UIMessage["parts"][number]);
        break;
      }

      case "start-step":
        parts.push({ type: "step-start" as const });
        break;

      case "finish-step":
        // Clear active text/reasoning parts at step boundaries
        textById.clear();
        break;

    }
  }
}
