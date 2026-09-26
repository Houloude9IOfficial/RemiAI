/**
 * Replayable, multi-subscriber server-side chat stream registry.
 *
 * The AI SDK gives `consumeSseStream` a detached copy of the encoded SSE
 * response. We consume that copy exactly once, retain its chunks, and fan
 * them out to every reconnecting viewer. A browser connection is therefore
 * only a subscriber: closing it never cancels the producer.
 */

import { publishGenerationUpdate } from "./generation-events";

type Subscriber = ReadableStreamDefaultController<string>;
type StreamEntry = {
  id: string;
  assistantMessageId: string | null;
  chunks: string[];
  subscribers: Set<Subscriber>;
  reader: ReadableStreamDefaultReader<string>;
  active: boolean;
  /** A newer stream replaced this one; its lifecycle belongs to that stream. */
  replaced: boolean;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

const sharedStreams = globalThis as typeof globalThis & {
  remiActiveStreams?: Map<number, StreamEntry>;
};
const activeStreams = sharedStreams.remiActiveStreams ??= new Map<number, StreamEntry>();
const COMPLETED_REPLAY_TTL_MS = 30_000;

function closeSubscribers(entry: StreamEntry): void {
  for (const subscriber of entry.subscribers) {
    try { subscriber.close(); } catch { /* viewer already disconnected */ }
  }
  entry.subscribers.clear();
}

function errorSubscribers(entry: StreamEntry, error: unknown): void {
  for (const subscriber of entry.subscribers) {
    try { subscriber.error(error); } catch { /* viewer already disconnected */ }
  }
  entry.subscribers.clear();
}

export const streamRegistry = {
  register(
    conversationId: number,
    stream: ReadableStream<string>,
    streamId = crypto.randomUUID(),
    assistantMessageId: string | null = null,
  ): string {
    const existing = activeStreams.get(conversationId);
    if (existing) {
      existing.replaced = true;
      if (existing.cleanupTimer) clearTimeout(existing.cleanupTimer);
      void existing.reader.cancel("Replaced by new stream").catch(() => undefined);
      closeSubscribers(existing);
    }

    const reader = stream.getReader();
    const entry: StreamEntry = {
      id: streamId,
      assistantMessageId,
      chunks: [],
      subscribers: new Set(),
      reader,
      active: true,
      replaced: false,
    };
    activeStreams.set(conversationId, entry);
    publishGenerationUpdate({ conversationId, status: "running", streamId, assistantMessageId });

    const isCurrent = () => activeStreams.get(conversationId) === entry;

    void (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          entry.chunks.push(value);
          for (const subscriber of entry.subscribers) {
            try { subscriber.enqueue(value); }
            catch { entry.subscribers.delete(subscriber); }
          }
        }
        entry.active = false;
        closeSubscribers(entry);
        if (!entry.replaced && isCurrent()) {
          publishGenerationUpdate({ conversationId, status: "completed", streamId: entry.id });
        }
      } catch (error) {
        entry.active = false;
        errorSubscribers(entry, error);
        if (!entry.replaced && isCurrent()) {
          publishGenerationUpdate({ conversationId, status: "failed", streamId: entry.id });
        }
      } finally {
        reader.releaseLock();
        entry.cleanupTimer = setTimeout(() => {
          if (activeStreams.get(conversationId) === entry) activeStreams.delete(conversationId);
        }, COMPLETED_REPLAY_TTL_MS);
        // A retained replay should not keep a CLI/test process alive.
        (entry.cleanupTimer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
      }
    })();

    return streamId;
  },

  /** Return a fresh replay + live subscription for each caller. */
  get(conversationId: number): ReadableStream<string> | null {
    const entry = activeStreams.get(conversationId);
    if (!entry) return null;

    let controllerRef: Subscriber | null = null;
    return new ReadableStream<string>({
      start(controller) {
        controllerRef = controller;
        for (const chunk of entry.chunks) controller.enqueue(chunk);
        if (entry.active) entry.subscribers.add(controller);
        else controller.close();
      },
      cancel() {
        if (controllerRef) entry.subscribers.delete(controllerRef);
      },
    });
  },

  remove(conversationId: number, reason = "Generation stopped") {
    const entry = activeStreams.get(conversationId);
    if (!entry) return;
    activeStreams.delete(conversationId);
    entry.replaced = true;
    if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
    void entry.reader.cancel(reason).catch(() => undefined);
    closeSubscribers(entry);
    publishGenerationUpdate({ conversationId, status: "stopped", streamId: entry.id });
  },

  has(conversationId: number): boolean {
    return activeStreams.get(conversationId)?.active === true;
  },

  id(conversationId: number): string | null {
    return activeStreams.get(conversationId)?.id ?? null;
  },

  activeConversationIds(): number[] {
    return [...activeStreams.entries()]
      .filter(([, entry]) => entry.active)
      .map(([conversationId]) => conversationId);
  },
};
