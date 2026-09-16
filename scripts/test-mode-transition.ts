import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import {
  messageContainsQuestions,
  shouldPromotePlanToGoal,
} from "../lib/chat/mode-transition";

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

console.log("✅ Mode transition tests passed.");
