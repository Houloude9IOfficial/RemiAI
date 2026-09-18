import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import {
  messageContainsQuestions,
  shouldPromotePlanToGoal,
  isChatMode,
} from "../lib/chat/mode-transition";
import {
  INSTANT_INSTRUCTIONS,
  INSTANT_MAX_OUTPUT_TOKENS,
  INSTANT_MAX_RETRIES,
  INSTANT_MAX_TOOL_CALLS,
  instantMessageWindow,
  instantToolNames,
  pickInstantTools,
} from "../lib/chat/instant-mode";

const questionMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    {
      type: "tool-ask_questions",
      toolCallId: "call-1",
      output: { type: "questions", questions: [{ id: "stack" }] },
    },
  ],
} as unknown as UIMessage;

const legacyQuestionMessage = {
  id: "assistant-2",
  role: "assistant",
  parts: [
    {
      type: "tool-invocation",
      toolInvocation: {
        toolName: "ask_questions",
        toolCallId: "call-2",
        result: { type: "questions", questions: [{ id: "scope" }] },
      },
    },
  ],
} as unknown as UIMessage;

const answerMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Use Next.js and SQLite." }],
} as UIMessage;

assert.equal(messageContainsQuestions(questionMessage), true);
assert.equal(messageContainsQuestions(legacyQuestionMessage), true);
assert.equal(
  shouldPromotePlanToGoal("plan", [questionMessage, answerMessage]),
  true,
);
assert.equal(
  shouldPromotePlanToGoal("goal", [questionMessage, answerMessage]),
  false,
);
assert.equal(
  shouldPromotePlanToGoal("instant", [questionMessage, answerMessage]),
  false,
);
assert.equal(
  shouldPromotePlanToGoal("plan", [legacyQuestionMessage, answerMessage]),
  true,
);
assert.equal(
  shouldPromotePlanToGoal("plan", [
    { ...questionMessage, parts: [{ type: "text", text: "No questions" }] } as unknown as UIMessage,
    answerMessage,
  ]),
  false,
);

assert.equal(isChatMode("instant"), true);
assert.equal(isChatMode("turbo"), false);

const instantHistory = instantMessageWindow([
  { id: "old-user", role: "user", parts: [{ type: "text", text: "Old" }] },
  { id: "old-assistant", role: "assistant", parts: [{ type: "text", text: "Old answer" }] },
  { id: "user-1", role: "user", parts: [{ type: "text", text: "Question" }] },
  { id: "assistant-1", role: "assistant", parts: [{ type: "text", text: "Answer" }] },
  { id: "user-2", role: "user", parts: [{ type: "text", text: "Follow-up" }] },
] as UIMessage[]);
assert.deepEqual(instantHistory.map((message) => message.id), ["user-1", "assistant-1", "user-2"]);
assert.deepEqual(instantToolNames(false), ["web_search", "web_fetch"]);
assert.deepEqual(instantToolNames(true), ["web_search", "web_fetch", "search_memories"]);
assert.equal(INSTANT_MAX_OUTPUT_TOKENS, 2_048);
assert.equal(INSTANT_MAX_RETRIES, 1);
assert.equal(INSTANT_MAX_TOOL_CALLS, 15);
assert.deepEqual(
  Object.keys(pickInstantTools({ web_search: {}, web_fetch: {}, search_memories: {}, write_file: {} }, true)),
  ["web_search", "web_fetch", "search_memories"],
);
assert.match(INSTANT_INSTRUCTIONS, /Answer immediately and concisely/);

console.log("✅ Mode transition tests passed.");
