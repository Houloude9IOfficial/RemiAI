import type { AutomationRunRow } from "./automation";
import { sendWebPush } from "@/lib/notifications/web-push";

function chatUrl(conversationId: number): string {
  return `/chat/${conversationId}`;
}

export type AutomationNotification = {
  type: "automation_run_completed" | "automation_run_failed" | "automation_run_cancelled";
  run: {
    id: number;
    conversationId: number;
    kind: string;
    name: string;
    task: string;
    status: string;
    result: string | null;
    error: string | null;
    completedAt: string | null;
  };
};

export type UserNotification = {
  type: "user_notification";
  notification: {
    id: string;
    conversationId: number;
    title: string;
    body: string;
    requireInteraction: boolean;
    url: string;
    createdAt: string;
  };
};

export type NotificationEvent = AutomationNotification | UserNotification;

type Subscriber = (event: NotificationEvent) => void;
const subscribers = new Set<Subscriber>();

export function subscribeAutomationNotifications(callback: Subscriber): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function publishUserNotification(input: {
  conversationId: number;
  title: string;
  body: string;
  requireInteraction?: boolean;
  url?: string;
  showWhenVisible?: boolean;
  sendPush?: boolean;
}): UserNotification["notification"] {
  const notification = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    title: input.title.trim().slice(0, 120),
    body: input.body.trim().slice(0, 1_000),
    requireInteraction: input.requireInteraction ?? false,
    url: input.url ?? chatUrl(input.conversationId),
    createdAt: new Date().toISOString(),
  };
  const event: UserNotification = { type: "user_notification", notification };
  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      subscribers.delete(subscriber);
    }
  }
  if (input.sendPush !== false) {
    void sendWebPush({
      title: notification.title,
      body: notification.body,
      url: notification.url,
      requireInteraction: notification.requireInteraction,
      tag: `user-notification-${notification.id}`,
      showWhenVisible: input.showWhenVisible,
    }).catch((error) => console.warn("[notifications] Web Push failed:", error));
  }
  return notification;
}

export function publishAutomationNotification(run: AutomationRunRow): void {
  const type = run.status === "completed"
    ? "automation_run_completed"
    : run.status === "cancelled"
      ? "automation_run_cancelled"
      : "automation_run_failed";
  const event: AutomationNotification = {
    type,
    run: {
      id: run.id,
      conversationId: run.conversationId,
      kind: run.kind,
      name: run.name,
      task: run.task,
      status: run.status,
      result: run.result,
      error: run.error,
      completedAt: run.completedAt,
    },
  };
  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      subscribers.delete(subscriber);
    }
  }
}
