"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  enableWebPushNotifications,
  getElectronNotificationApi,
  isElectronNotificationSupported,
} from "@/lib/notifications/client";
import { useAuth } from "@/components/auth/AuthProvider";

interface TaskEvent {
  type: "scheduled_task_completed";
  task: {
    id: number;
    conversationId: number;
    triggerAt: string;
    task: string;
    status: string;
    result: string | null;
    error: string | null;
    completedAt: string | null;
  };
}

interface UserNotification {
  id: string;
  conversationId: number;
  title: string;
  body: string;
  requireInteraction: boolean;
  url: string;
  createdAt: string;
}

type ElectronNotificationBridge = {
  sendNotification: (payload: { title: string; body: string; url?: string; requireInteraction?: boolean }) => Promise<boolean>;
};

/**
 * Track which task IDs we've already shown notifications for.
 */
const notifiedIds = new Set<number>();

/**
 * Component that connects to the scheduled tasks SSE endpoint and shows
 * native desktop notifications when tasks complete.
 *
 * Also polls for newly completed tasks as a fallback (checks every 30s)
 * in case the SSE event was missed (e.g. page was loading).
 *
 * Renders nothing visible — just handles side effects.
 */
export function NotificationListener() {
  const queryClient = useQueryClient();
  const { account } = useAuth();
  const permissionRequested = useRef(false);
  const hasPermission = useRef(false);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    if (permissionRequested.current) return false;

    permissionRequested.current = true;
    const result = await Notification.requestPermission();
    return result === "granted";
  }, []);

  const showNativeNotification = useCallback((input: {
    title: string;
    body: string;
    url: string;
    requireInteraction?: boolean;
    tag?: string;
  }) => {
    if (!hasPermission.current) return;

    const electronApi = (window as Window & {
      electronAPI?: ElectronNotificationBridge;
    }).electronAPI;
    if (electronApi) {
      void electronApi.sendNotification({
        title: input.title,
        body: input.body,
        url: input.url,
        requireInteraction: input.requireInteraction,
      });
      return;
    }

    const targetUrl = input.url;

    const options: NotificationOptions & { tag?: string } = {
      body: input.body,
      icon: "/RemiAI.png",
      tag: input.tag ?? "remiai-notification",
      requireInteraction: input.requireInteraction ?? false,
      data: { targetUrl },
    };

    // Prefer the service-worker notification API when available so installed
    // PWAs can display the notification through their registered worker.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready
        .then((registration) => registration.showNotification(input.title, options))
        .catch(() => {
          try {
            const native = new Notification(input.title, options);
            native.onclick = () => {
              window.focus();
              window.location.href = targetUrl;
              native.close();
            };
          } catch {
            // Notification may fail in restricted browser contexts.
          }
        });
      return;
    }

    try {
      const native = new Notification(input.title, options);
      native.onclick = () => {
        window.focus();
        window.location.href = targetUrl;
        native.close();
      };
    } catch {
      // Notification may fail in restricted browser contexts.
    }
  }, []);

  const showUserNotification = useCallback((notification: UserNotification) => {
    showNativeNotification({
      title: notification.title,
      body: notification.body,
      url: notification.url || `/chat/${notification.conversationId}`,
      requireInteraction: notification.requireInteraction,
      tag: `user-notification-${notification.id}`,
    });
  }, [showNativeNotification]);

  const showNotification = useCallback(
    (task: TaskEvent["task"]) => {
      // Skip if already notified
      if (notifiedIds.has(task.id)) return;
      notifiedIds.add(task.id);

      const isSuccess = task.status === "completed";
      const title = isSuccess
        ? "✅ Scheduled Task Complete"
        : "❌ Scheduled Task Failed";
      const body = isSuccess
        ? task.task.length > 120
          ? `${task.task.slice(0, 120)}...`
          : task.task
        : `"${task.task.slice(0, 80)}" — ${task.error ?? "Unknown error"}`;
      showNativeNotification({
        title,
        body,
        url: `/chat/${task.conversationId}`,
        requireInteraction: true,
        tag: `scheduled-task-${task.id}`,
      });
    },
    [showNativeNotification],
  );

  const showAutomationNotification = useCallback(
    (run: {
      id: number;
      conversationId: number;
      kind: string;
      name: string;
      task: string;
      status: string;
      result: string | null;
      error: string | null;
    }) => {
      if (run.status === "waiting") return;
      const title = run.status === "completed"
        ? `✅ ${run.name} complete`
        : run.status === "cancelled"
          ? `⏹ ${run.name} stopped`
          : `❌ ${run.name} failed`;
      const body = run.status === "completed"
        ? run.task.slice(0, 140)
        : `${run.task.slice(0, 90)} — ${run.error ?? "Needs attention"}`;
      showNativeNotification({
        title,
        body,
        url: `/chat/${run.conversationId}`,
        requireInteraction: true,
        tag: `automation-run-${run.id}`,
      });
    },
    [showNativeNotification],
  );

  useEffect(() => {
    // AuthProvider resolves asynchronously. Do not open the SSE stream before
    // the session cookie is available, otherwise the initial 401 can leave
    // this notification channel disconnected for the rest of the session.
    if (!account) return;

    const eventSource = new EventSource("/api/notifications/stream");
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          run?: Parameters<typeof showAutomationNotification>[0];
          notification?: UserNotification;
        };
        if (data.type === "connected") return;
        if (data.notification) {
          showUserNotification(data.notification);
        }
        if (data.run) {
          queryClient.invalidateQueries({ queryKey: ["automation-runs"] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          showAutomationNotification(data.run);
        }
      } catch {
        // Ignore malformed notification events.
      }
    };
    return () => eventSource.close();
  }, [account, queryClient, showAutomationNotification, showUserNotification]);

  /**
   * Poll for newly completed tasks as a fallback.
   */
  const pollForCompletedTasks = useCallback(async () => {
    try {
      // Only fetch tasks completed within the last 60 seconds to avoid
      // showing stale notifications on page refresh.
      const completedAfter = new Date(Date.now() - 60_000).toISOString();
      const res = await fetch(
        `/api/scheduled-tasks?status=completed&limit=10&completedAfter=${encodeURIComponent(completedAfter)}`,
      );
      const data = await res.json() as { tasks: TaskEvent["task"][]; count: number };
      if (!data?.tasks?.length) return;

      for (const task of data.tasks) {
        if (!notifiedIds.has(task.id)) {
          notifiedIds.add(task.id);

          // Invalidate queries so UI updates
          queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });

          if (hasPermission.current) {
            const isSuccess = task.status === "completed";
            const title = isSuccess
              ? "✅ Scheduled Task Complete"
              : "❌ Scheduled Task Failed";
            const body = isSuccess
              ? task.task.length > 120
                ? `${task.task.slice(0, 120)}...`
                : task.task
              : `"${task.task.slice(0, 80)}" — ${task.error ?? "Unknown error"}`;

            showNativeNotification({
              title,
              body,
              url: `/chat/${task.conversationId}`,
              requireInteraction: true,
              tag: `scheduled-task-${task.id}`,
            });
          }
        }
      }
    } catch {
      // Poll failures are non-critical
    }
  }, [queryClient, showNativeNotification]);

  useEffect(() => {
    if (!account) return;

    // Electron uses native OS notifications through the main process. Do not
    // ask Chromium for Web Notification permission or attempt Web Push there.
    const electronApi = getElectronNotificationApi();
    if (electronApi) {
      void isElectronNotificationSupported().then((supported) => {
        hasPermission.current = supported;
      });
    } else {
      requestNotificationPermission().then((granted) => {
        hasPermission.current = granted;
        if (granted) {
        // Keep the existing automatic permission flow, but also register this
        // browser/PWA with the VPS so notifications work after the page closes.
          void enableWebPushNotifications(false);
        }
      });
    }

    // Connect to SSE endpoint
    const eventSource = new EventSource("/api/scheduled-tasks/events");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TaskEvent | { type: "connected" };

        if (data.type === "connected") {
          // On first SSE connection, poll for any tasks we might have missed
          pollForCompletedTasks();
          return;
        }

        if (data.type === "scheduled_task_completed") {
          queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          showNotification(data.task);
        }
      } catch {
        // Malformed data — ignore
      }
    };

    eventSource.onerror = () => {
      // Connection lost — the browser will auto-reconnect
    };

    // Polling fallback: check every 30s for completed tasks (catches SSE gaps)
    const pollInterval = setInterval(pollForCompletedTasks, 30_000);

    return () => {
      eventSource.close();
      clearInterval(pollInterval);
    };
  }, [account, queryClient, requestNotificationPermission, showNotification, pollForCompletedTasks]);

  return null;
}
