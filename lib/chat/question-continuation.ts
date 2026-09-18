import { pendingQuestionSubmissions, questionRuns, submissionMessage, type QuestionDatabase } from "./question-delivery";

const scheduled = new Set<number>();

/** The chat route's per-conversation guard arbitrates simultaneous dispatches. */
export function continuePendingQuestionAnswers(
  database: QuestionDatabase, url: string, headers: Headers, conversationId: number,
  startRequest?: (request: Request) => Promise<Response>,
): Promise<void> | undefined {
  if (questionRuns.has(conversationId) || scheduled.has(conversationId)) return;
  const pending = pendingQuestionSubmissions(database, conversationId, true);
  if (!pending.length) return;
  const target = new URL("/api/chat", url);
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  requestHeaders.delete("content-length");
  scheduled.add(conversationId);
  // Start after the current stream's persistence and cleanup have finished.
  const task = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      scheduled.delete(conversationId);
      void (async () => {
        // Stop may have arrived after scheduling, but before this timer.
        if (questionRuns.has(conversationId) || !pendingQuestionSubmissions(database, conversationId, true).length) return;
        const start = startRequest ?? (await import("@/app/api/chat/route")).POST;
        const response = await start(new Request(target, {
          method: "POST", headers: requestHeaders,
          body: JSON.stringify({ conversationId, questionContinuation: true, messages: [submissionMessage(pending[0])] }),
        }));
        // Keep generation running even when the original browser has navigated away.
        if (response.body) await response.body.pipeTo(new WritableStream());
      })().then(resolve, reject);
    }, 0);
  });
  void task.catch((error) => console.error("[questions] Continuation failed:", error));
  return task;
}
