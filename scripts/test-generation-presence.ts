import assert from "node:assert/strict";
import {
  abandonGenerationPresence,
  beginGenerationPresence,
  completeGenerationPresence,
  completionNotificationPreview,
} from "../lib/chat/generation-presence";

const response = "# Release notes\n\nA **plain** [summary](https://example.test) with `code` and a list:\n- first point\n- second point";
const notification = completionNotificationPreview({
  conversationId: 42,
  title: "Project notes",
  responseText: response,
});

assert.equal(notification.title, "Release notes");
assert.equal(notification.body, "A plain summary with code and a list: first point second point");
assert.equal(notification.url, "/chat/42");
const longNotification = completionNotificationPreview({
  conversationId: 42,
  title: "Project notes",
  responseText: "a".repeat(101),
});
assert.equal(longNotification.title, "Project notes");
assert.equal(longNotification.body.length, 100);

// A chat can have stale hidden presence after navigating away. A new request
// made while the chat is visible must replace that state before it completes.
async function testVisibleGenerationOverridesStalePresence() {
  const conversationId = 987_654_321;
  beginGenerationPresence(conversationId, "hidden-generation", false);
  abandonGenerationPresence(conversationId, "hidden-generation");
  beginGenerationPresence(conversationId, "visible-generation", true);
  assert.equal(
    await completeGenerationPresence({
      conversationId,
      generationId: "visible-generation",
      responseText: "Watched response",
    }),
    "visible",
  );
}

testVisibleGenerationOverridesStalePresence()
  .then(() => console.log("✅ Background completion notification formatting tests passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
