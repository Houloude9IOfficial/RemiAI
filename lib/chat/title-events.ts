import { EventEmitter } from "node:events";

export interface ConversationTitleUpdatedPayload {
  type: "conversation-title-updated";
  conversationId: number;
  title: string;
  updatedAt: string;
}

class ConversationTitleEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  emitUpdated(payload: ConversationTitleUpdatedPayload): void {
    this.emit("conversation-title-updated", payload);
  }

  onUpdated(handler: (payload: ConversationTitleUpdatedPayload) => void): () => void {
    this.on("conversation-title-updated", handler);
    return () => this.off("conversation-title-updated", handler);
  }
}

export const conversationTitleEventBus = new ConversationTitleEventBus();

export function emitConversationTitleUpdated(
  conversationId: number,
  title: string,
  updatedAt: string,
): void {
  conversationTitleEventBus.emitUpdated({
    type: "conversation-title-updated",
    conversationId,
    title,
    updatedAt,
  });
}
