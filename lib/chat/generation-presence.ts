import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { publishUserNotification } from "@/lib/runs/notifications";

type ActiveGeneration = {
  id: string;
  backgrounded: boolean;
};

type PresenceStore = {
  active: Map<number, ActiveGeneration>;
  visibility: Map<number, boolean>;
};

const globalPresence = globalThis as typeof globalThis & {
  remiGenerationPresence?: PresenceStore;
};
const presence: PresenceStore = globalPresence.remiGenerationPresence ??= {
  active: new Map(),
  // A conversation can automatically continue after a question answer. Keep
  // its last known visibility separately so that follow-up generation remains
  // backgrounded after the user has left the chat page.
  visibility: new Map(),
};

export function beginGenerationPresence(
  conversationId: number,
  generationId: string,
  initiallyVisible = true,
): void {
  if (!presence.visibility.has(conversationId)) {
    presence.visibility.set(conversationId, initiallyVisible);
  }
  presence.active.set(conversationId, {
    id: generationId,
    backgrounded: presence.visibility.get(conversationId) === false,
  });
}

export function setConversationGenerationVisibility(
  conversationId: number,
  visible: boolean,
): boolean {
  presence.visibility.set(conversationId, visible);
  const active = presence.active.get(conversationId);
  if (!active) return false;
  active.backgrounded = !visible;
  return true;
}

export function abandonGenerationPresence(conversationId: number, generationId: string): void {
  if (presence.active.get(conversationId)?.id === generationId) {
    presence.active.delete(conversationId);
  }
}

export function completionNotificationPreview(input: {
  conversationId: number;
  title: string;
  responseText: string;
}) {
  return {
    conversationId: input.conversationId,
    title: input.title,
    body: input.responseText.slice(0, 100),
    url: `/chat/${input.conversationId}`,
  };
}

/**
 * Notify only after the final assistant message was persisted. This keeps
 * clicking a completion notification reliable even if the original SSE client
 * disconnected before the last chunks arrived.
 */
export async function completeGenerationPresence(input: {
  conversationId: number;
  generationId: string;
  responseText: string;
}): Promise<void> {
  const active = presence.active.get(input.conversationId);
  if (!active || active.id !== input.generationId) return;
  presence.active.delete(input.conversationId);
  if (!active.backgrounded) return;

  const conversation = await db
    .select({ title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .get();
  if (!conversation) return;

  publishUserNotification(completionNotificationPreview({
    conversationId: input.conversationId,
    title: conversation.title,
    responseText: input.responseText,
  }));
}
