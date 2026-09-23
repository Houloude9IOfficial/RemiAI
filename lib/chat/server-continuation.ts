import type { UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chatGenerationRuns } from "@/db/schema";

const scheduled = new Set<number>();
export const MAX_SERVER_CONTINUATIONS = 3;

/**
 * Start a follow-up turn after a truncated response without relying on a
 * mounted browser. The returned response is drained so all server-side stream
 * branches remain alive even when there are no viewers.
 */
export function continueInterruptedGeneration(input: {
  conversationId: number;
  assistantId: string;
  generationRunId: string;
  continuationCount: number;
  requestUrl: string;
  requestHeaders: Headers;
}): void {
  if (input.continuationCount >= MAX_SERVER_CONTINUATIONS) return;
  if (scheduled.has(input.conversationId)) return;
  scheduled.add(input.conversationId);

  setTimeout(() => {
    void (async () => {
      try {
        const durable = await db.select({ status: chatGenerationRuns.status })
          .from(chatGenerationRuns)
          .where(eq(chatGenerationRuns.id, input.generationRunId))
          .get();
        if (durable?.status === "stopped") return;
        const { POST } = await import("@/app/api/chat/route");
        const target = new URL("/api/chat", input.requestUrl);
        const headers = new Headers(input.requestHeaders);
        headers.set("content-type", "application/json");
        headers.set("x-chat-visible", "false");
        headers.delete("content-length");
        const seed: UIMessage = {
          id: input.assistantId,
          role: "assistant",
          parts: [],
        };
        const response = await POST(new Request(target, {
          method: "POST",
          headers,
          body: JSON.stringify({
            conversationId: input.conversationId,
            messages: [seed],
            continuationCount: input.continuationCount + 1,
            generationRunId: input.generationRunId,
          }),
        }));
        if (!response.ok) {
          throw new Error(`Continuation request failed (${response.status})`);
        }
        if (response.body) await response.body.pipeTo(new WritableStream());
      } catch (error) {
        console.error("[chat] Automatic server continuation failed:", error);
      } finally {
        scheduled.delete(input.conversationId);
      }
    })();
  }, 0);
}
