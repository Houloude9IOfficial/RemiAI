/**
 * Server-side stream registry for reconnection support.
 *
 * When the AI generates a response, the SSE stream is tee'd and one branch
 * is stored here keyed by conversation ID. If the user navigates away and
 * comes back while generation is still running, they can reconnect to this
 * stream via the GET /api/chat/[id]/stream endpoint.
 */

const activeStreams = new Map<number, ReadableStream<string>>();

export const streamRegistry = {
  register(conversationId: number, stream: ReadableStream<string>) {
    // If there's already a registered stream for this conversation, cancel it
    const existing = activeStreams.get(conversationId);
    if (existing) {
      existing.cancel("Replaced by new stream").catch(() => {});
    }

    // Tee the stream so one branch is served to reconnecting clients
    // while the other is consumed for auto-cleanup detection
    const [clientBranch, cleanupBranch] = stream.tee();
    activeStreams.set(conversationId, clientBranch);

    // Auto-remove when the stream ends or errors (both branches finish)
    cleanupBranch
      .pipeTo(new WritableStream())
      .then(() => activeStreams.delete(conversationId))
      .catch(() => activeStreams.delete(conversationId));
  },

  get(conversationId: number): ReadableStream<string> | null {
    return activeStreams.get(conversationId) ?? null;
  },

  remove(conversationId: number) {
    activeStreams.delete(conversationId);
  },

  has(conversationId: number): boolean {
    return activeStreams.has(conversationId);
  },
};
