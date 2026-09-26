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
  // This request's visibility is more current than a value retained from a
  // previous visit to the chat. In particular, a user can return to a chat
  // and start a response before the page's visibility effect has completed
  // its POST; retaining that old `false` incorrectly treats the new response
  // as backgrounded and sends a completion notification while it is watched.
  // Server-initiated continuations deliberately pass `false`, so they retain
  // their background-notification behavior.
  presence.visibility.set(conversationId, initiallyVisible);
  presence.active.set(conversationId, {
    id: generationId,
    backgrounded: !initiallyVisible,
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
  const lines = input.responseText.replace(/\r\n?/g, "\n").split("\n");
  const headingIndex = lines.findIndex((line) => /^\s{0,3}#{1,6}\s+\S/.test(line));
  const heading = headingIndex < 0 ? "" : plainNotificationText(lines[headingIndex]);
  if (headingIndex >= 0) lines.splice(headingIndex, 1);
  return {
    conversationId: input.conversationId,
    title: heading || input.title,
    body: plainNotificationText(lines.join("\n")).slice(0, 100),
    url: `/chat/${input.conversationId}`,
  };
}

/** Turn a Markdown response into a compact native-notification preview. */
function plainNotificationText(markdown: string): string {
  return markdown
    // Retain useful labels, not URLs or formatting syntax.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*\n?|```$/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:[-*+] |\d+[.)] )/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*(?:\|?\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
    .replace(/[~*_]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
}): Promise<"not-active" | "visible" | "missing-conversation" | "sent"> {
  const active = presence.active.get(input.conversationId);
  if (!active || active.id !== input.generationId) return "not-active";
  presence.active.delete(input.conversationId);
  if (!active.backgrounded) return "visible";

  const conversation = await db
    .select({ title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .get();
  if (!conversation) return "missing-conversation";

  publishUserNotification(completionNotificationPreview({
    conversationId: input.conversationId,
    title: conversation.title,
    responseText: input.responseText,
  }));
  return "sent";
}

/** Notify an absent user when a background generation needs intervention. */
export async function failGenerationPresence(input: {
  conversationId: number;
  generationId: string;
  reason: string;
}): Promise<"not-active" | "visible" | "missing-conversation" | "sent"> {
  const active = presence.active.get(input.conversationId);
  if (!active || active.id !== input.generationId) return "not-active";
  presence.active.delete(input.conversationId);
  if (!active.backgrounded) return "visible";

  const conversation = await db
    .select({ title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .get();
  if (!conversation) return "missing-conversation";

  publishUserNotification({
    conversationId: input.conversationId,
    title: `${conversation.title} needs attention`,
    body: plainNotificationText(input.reason).slice(0, 100),
    url: `/chat/${input.conversationId}`,
    requireInteraction: true,
  });
  return "sent";
}
