import assert from "node:assert/strict";
import { completionNotificationPreview } from "../lib/chat/generation-presence";

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
console.log("✅ Background completion notification formatting tests passed.");
