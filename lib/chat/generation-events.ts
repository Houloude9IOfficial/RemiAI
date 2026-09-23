/**
 * Server-side generation lifecycle event bus.
 *
 * The bus keeps one authoritative in-memory descriptor per conversation with an
 * active (or recovering) generation and publishes a lightweight event whenever
 * that descriptor changes. `/api/chat/streams/events` turns the snapshot +
 * incremental events into server-sent events, so clients no longer have to poll
 * `/api/chat/streams` and `/api/chat/:id/stream/status` on a timer.
 *
 * Producers:
 * - `stream-registry` publishes `running` on register and `completed` / `failed`
 *   / `stopped` when a stream ends or is explicitly removed.
 * - `generation-runs` publishes durable lifecycle transitions (`running`,
 *   `continuing`, `completed`, `failed`, `stopped`, `needs_attention`).
 *
 * State lives on `globalThis` for the same reason other server registries do:
 * route bundles and Fast Refresh may load this module more than once, but every
 * copy must share one set of subscribers and descriptors.
 */

export type GenerationStatus =
  | "running"
  | "continuing"
  | "completed"
  | "failed"
  | "stopped"
  | "needs_attention";

export type GenerationDescriptor = {
  /** Conversation this generation belongs to. */
  conversationId: number;
  /** Replayable registry stream id, or null before the stream is registered. */
  streamId: string | null;
  /** Assistant message the generation is writing into, when known. */
  assistantMessageId: string | null;
  status: GenerationStatus;
};

export type GenerationEvent =
  | { type: "snapshot"; generations: GenerationDescriptor[] }
  | { type: "generation"; generation: GenerationDescriptor };

/** Statuses after which the generation is finished and must be removed. */
const TERMINAL_STATUSES: ReadonlySet<GenerationStatus> = new Set([
  "completed",
  "failed",
  "stopped",
  "needs_attention",
]);

export function isGenerationActive(status: GenerationStatus): boolean {
  return !TERMINAL_STATUSES.has(status);
}

type Subscriber = (event: GenerationEvent) => void;

const shared = globalThis as typeof globalThis & {
  remiGenerationDescriptors?: Map<number, GenerationDescriptor>;
  remiGenerationSubscribers?: Set<Subscriber>;
};
const descriptors = shared.remiGenerationDescriptors ??= new Map();
const subscribers = shared.remiGenerationSubscribers ??= new Set();

/** Subscribe to lifecycle changes. Returns an unsubscribe function. */
export function subscribeGenerationEvents(callback: Subscriber): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Every currently active or recovering generation, in connection order. */
export function generationSnapshot(): GenerationDescriptor[] {
  return [...descriptors.values()].map((descriptor) => ({ ...descriptor }));
}

/**
 * Merge a lifecycle change into the stored descriptor and notify subscribers.
 *
 * Partial updates keep the previously known `streamId` / `assistantMessageId`
 * so a durable transition (which only knows the run id) never erases the data
 * a client needs to reconnect. Terminal statuses publish once and then remove
 * the descriptor so subsequent snapshots no longer list it.
 */
export function publishGenerationUpdate(input: {
  conversationId: number;
  status: GenerationStatus;
  streamId?: string | null;
  assistantMessageId?: string | null;
}): GenerationDescriptor {
  const previous = descriptors.get(input.conversationId);
  const descriptor: GenerationDescriptor = {
    conversationId: input.conversationId,
    streamId: input.streamId !== undefined ? input.streamId : previous?.streamId ?? null,
    assistantMessageId:
      input.assistantMessageId !== undefined
        ? input.assistantMessageId
        : previous?.assistantMessageId ?? null,
    status: input.status,
  };

  // A late terminal event must not clear a newer generation that already took
  // over this conversation (e.g. a stream replacement or server continuation).
  if (
    !isGenerationActive(descriptor.status) &&
    input.streamId &&
    previous?.streamId &&
    previous.streamId !== input.streamId
  ) {
    return previous;
  }

  if (isGenerationActive(descriptor.status)) {
    descriptors.set(descriptor.conversationId, descriptor);
  } else {
    descriptors.delete(descriptor.conversationId);
  }

  const event: GenerationEvent = { type: "generation", generation: descriptor };
  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      subscribers.delete(subscriber);
    }
  }
  return descriptor;
}
