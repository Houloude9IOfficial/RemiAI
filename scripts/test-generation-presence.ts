import assert from "node:assert/strict";
import { completionNotificationPreview } from "../lib/chat/generation-presence";

const response = "a".repeat(101);
const notification = completionNotificationPreview({
  conversationId: 42,
  title: "Project notes",
  responseText: response,
});

assert.equal(notification.title, "Project notes");
assert.equal(notification.body, response.slice(0, 100));
assert.equal(notification.body.length, 100);
assert.equal(notification.url, "/chat/42");
console.log("✅ Background completion notification formatting tests passed.");
