import assert from "node:assert/strict";
import {
  isAutomationRunActive,
  AUTOMATION_ACTIVE_STATUSES,
} from "../lib/runs/automation";
import {
  publishAutomationNotification,
  subscribeAutomationNotifications,
} from "../lib/runs/notifications";

for (const status of AUTOMATION_ACTIVE_STATUSES) {
  assert.equal(isAutomationRunActive(status), true);
}
for (const status of ["completed", "partially_completed", "failed", "cancelled"]) {
  assert.equal(isAutomationRunActive(status), false);
}

let received: unknown = null;
const unsubscribe = subscribeAutomationNotifications((event) => {
  received = event;
});
publishAutomationNotification({
  id: 7,
  conversationId: 3,
  kind: "scheduled_task",
  sourceId: 12,
  parentRunId: null,
  name: "Scheduled task",
  task: "Check the service",
  status: "completed",
  attempt: 0,
  maxAttempts: 2,
  checkpoint: null,
  result: "healthy",
  error: null,
  control: "none",
  controlMessage: null,
  metadata: {},
  createdAt: "2026-08-19T00:00:00.000Z",
  startedAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:01:00.000Z",
  completedAt: "2026-08-19T00:01:00.000Z",
  nextRetryAt: null,
});
unsubscribe();
assert.equal((received as { type: string }).type, "automation_run_completed");
assert.equal((received as { run: { conversationId: number } }).run.conversationId, 3);

console.log("\n✅ All durable automation run tests passed.");
