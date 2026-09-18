import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import {
  applyConversationTitleUpdate,
  type Conversation,
} from "@/lib/api/conversations";
import {
  hasFuzzyMemoryHintOverlap,
  MEMORY_HINT_MAX_WORDS,
  shouldRetrieveFuzzyMemoryHints,
} from "@/lib/chat/memories";
import {
  conversationTitleEventBus,
  emitConversationTitleUpdated,
} from "@/lib/chat/title-events";
import { canApplyAutoTitle, needsGeneratedTitle } from "@/lib/chat/title-generator";

const conversation = (id: number, title: string): Conversation => ({
  id,
  title,
  providerId: 1,
  modelId: "test",
  mode: "chat",
  qualityPolicy: "medium",
  bashMode: "sandboxed",
  requestMode: "sandboxed",
  isTemporary: false,
  memoryEnabled: true,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const client = new QueryClient();
client.setQueryData(["conversation", 7], { conversation: conversation(7, "New chat"), messages: [] });
client.setQueryData(["conversations"], [conversation(7, "New chat"), conversation(8, "Keep me")]);
applyConversationTitleUpdate(client, 7, "Fuzzy Memory Design", "2026-01-02T00:00:00.000Z");
assert.equal(client.getQueryData<{ conversation: Conversation }>(["conversation", 7])?.conversation.title, "Fuzzy Memory Design");
assert.equal(client.getQueryData<Conversation[]>(["conversations"])?.[0]?.title, "Fuzzy Memory Design");
assert.equal(client.getQueryData<Conversation[]>(["conversations"])?.[1]?.title, "Keep me");

let emittedTitle = "";
const unsubscribe = conversationTitleEventBus.onUpdated((payload) => {
  if (payload.conversationId === 7) emittedTitle = payload.title;
});
emitConversationTitleUpdated(7, "Fuzzy Memory Design", "2026-01-02T00:00:00.000Z");
unsubscribe();
assert.equal(emittedTitle, "Fuzzy Memory Design");
assert.equal(canApplyAutoTitle("First request", "First request"), true);
assert.equal(canApplyAutoTitle("A manual title", "First request"), false);
assert.equal(needsGeneratedTitle("New chat", "First request"), true);
assert.equal(needsGeneratedTitle("First request", "First request"), true);
assert.equal(needsGeneratedTitle("A manual title", "First request"), false);

assert.equal(hasFuzzyMemoryHintOverlap("Help me plan travle", "The user plans travel frequently."), true);
assert.equal(hasFuzzyMemoryHintOverlap("My budget is 2500", "The user's travel budget is 2500."), true);
assert.equal(hasFuzzyMemoryHintOverlap("2500", "The user's travel budget is 2500."), false);
assert.equal(hasFuzzyMemoryHintOverlap("Explain quantum physics", "The user enjoys gardening."), false);
assert.equal(shouldRetrieveFuzzyMemoryHints("word ".repeat(MEMORY_HINT_MAX_WORDS)), true);
assert.equal(shouldRetrieveFuzzyMemoryHints("word ".repeat(MEMORY_HINT_MAX_WORDS + 1)), false);
assert.equal(shouldRetrieveFuzzyMemoryHints("My travel plans", false), false);

console.log("✓ Live title cache updates and bounded fuzzy memory hints work as expected");
