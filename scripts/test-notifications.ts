import assert from "node:assert/strict";
import {
  publishUserNotification,
  subscribeAutomationNotifications,
} from "../lib/runs/notifications";

let received: unknown = null;
const unsubscribe = subscribeAutomationNotifications((event) => {
  received = event;
});

const notification = publishUserNotification({
  conversationId: 42,
  title: " Build complete ",
  body: "The requested checks passed.",
  requireInteraction: true,
});
unsubscribe();

assert.equal(notification.conversationId, 42);
assert.equal(notification.title, "Build complete");
assert.equal(notification.requireInteraction, true);
assert.equal((received as { type: string }).type, "user_notification");
assert.deepEqual(
  (received as { notification: typeof notification }).notification,
  notification,
);

console.log("\n✅ All user notification tests passed.");
