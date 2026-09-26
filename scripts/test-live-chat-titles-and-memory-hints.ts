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
import {
  canApplyAutoTitle,
  needsGeneratedTitle,
  sanitizeTitle,
  titleCandidate,
} from "@/lib/chat/title-generator";

const conversation = (id: number, title: string): Conversation => ({
  id,
  projectId: null,
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

assert.equal(sanitizeTitle("Particle Engine Error Fix"), "Particle Engine Error Fix");
assert.equal(sanitizeTitle("Title: Particle Engine Error Fix"), "Particle Engine Error Fix");
assert.equal(sanitizeTitle("```\nParticle Engine Error Fix\n```"), "Particle Engine Error Fix");
assert.equal(sanitizeTitle("  \"Casual Greeting\"  "), "Casual Greeting");
assert.equal(sanitizeTitle(""), null);
assert.equal(sanitizeTitle("word ".repeat(40)), null);

// Free/multi-model gateways serve models that narrate their reasoning in the
// CONTENT stream and land the title last. A finished reply is read from its
// last line; a length-capped reply is never salvaged (salvaging one produced
// rule text like "- No ending punctuation. Under 60 characters").
assert.equal(titleCandidate("Casual Greeting", "stop"), "Casual Greeting");
assert.equal(
  titleCandidate("We need a 2-6 word title.\n\nThe chat is a greeting.\n\nCasual Greeting", "stop"),
  "Casual Greeting",
);
assert.equal(titleCandidate("We need a 2-6 word title, only the title. The conversation is", "length"), null);
assert.equal(titleCandidate("", "stop"), null);
assert.equal(titleCandidate("\n\n", "stop"), null);

assert.equal(hasFuzzyMemoryHintOverlap("Help me plan travle", "The user plans travel frequently."), true);
assert.equal(hasFuzzyMemoryHintOverlap("My budget is 2500", "The user's travel budget is 2500."), true);
assert.equal(hasFuzzyMemoryHintOverlap("2500", "The user's travel budget is 2500."), false);
assert.equal(hasFuzzyMemoryHintOverlap("Explain quantum physics", "The user enjoys gardening."), false);
assert.equal(shouldRetrieveFuzzyMemoryHints("word ".repeat(MEMORY_HINT_MAX_WORDS)), true);
assert.equal(shouldRetrieveFuzzyMemoryHints("word ".repeat(MEMORY_HINT_MAX_WORDS + 1)), false);
assert.equal(shouldRetrieveFuzzyMemoryHints("My travel plans", false), false);

console.log("✓ Live title cache updates and bounded fuzzy memory hints work as expected");
