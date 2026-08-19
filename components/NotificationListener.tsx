"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

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
  createdAt: string;
}

type ElectronNotificationBridge = {
  sendNotification: (payload: { title: string; body: string }) => Promise<void>;
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

  const showUserNotification = useCallback((notification: UserNotification) => {
    if (!hasPermission.current) return;

    const targetUrl = `/chat/${notification.conversationId}`;
    const electronApi = (window as Window & {
      electronAPI?: ElectronNotificationBridge;
    }).electronAPI;

    if (electronApi) {
      void electronApi.sendNotification({
        title: notification.title,
        body: notification.body,
      });
      return;
    }

    const options: NotificationOptions & { tag?: string } = {
      body: notification.body,
      icon: "/RemiAI.png",
      tag: `user-notification-${notification.id}`,
      requireInteraction: notification.requireInteraction,
      data: { targetUrl },
    };

    // Prefer the service-worker notification API when available so installed
    // PWAs can display the notification through their registered worker.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready
        .then((registration) => registration.showNotification(notification.title, options))
        .catch(() => {
          try {
            const native = new Notification(notification.title, options);
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
      const native = new Notification(notification.title, options);
      native.onclick = () => {
        window.focus();
        window.location.href = targetUrl;
        native.close();
      };
    } catch {
      // Notification may fail in restricted browser contexts.
    }
  }, []);

  const showNotification = useCallback(
    (task: TaskEvent["task"]) => {
      // Skip if already notified
      if (notifiedIds.has(task.id)) return;
      notifiedIds.add(task.id);

      if (!hasPermission.current) return;

      const isSuccess = task.status === "completed";
      const title = isSuccess
        ? "✅ Scheduled Task Complete"
        : "❌ Scheduled Task Failed";
      const body = isSuccess
        ? task.task.length > 120
          ? `${task.task.slice(0, 120)}...`
          : task.task
        : `"${task.task.slice(0, 80)}" — ${task.error ?? "Unknown error"}`;

      try {
        const notif = new Notification(title, {
          body,
          icon: "/RemiAI.png",
          tag: `scheduled-task-${task.id}`,
          requireInteraction: true,
        });

        notif.onclick = () => {
          window.focus();
          window.location.href = `/chat/${task.conversationId}`;
          notif.close();
        };

        setTimeout(() => notif.close(), 15_000);
      } catch {
        // Notification may fail in some contexts
      }
    },
    [],
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
      if (!hasPermission.current || run.status === "waiting") return;
      const title = run.status === "completed"
        ? `✅ ${run.name} complete`
        : run.status === "cancelled"
          ? `⏹ ${run.name} stopped`
          : `❌ ${run.name} failed`;
      const body = run.status === "completed"
        ? run.task.slice(0, 140)
        : `${run.task.slice(0, 90)} — ${run.error ?? "Needs attention"}`;
      try {
        const notification = new Notification(title, {
          body,
          icon: "/RemiAI.png",
          tag: `automation-run-${run.id}`,
          requireInteraction: true,
        });
        notification.onclick = () => {
          window.focus();
          window.location.href = `/chat/${run.conversationId}`;
          notification.close();
        };
        setTimeout(() => notification.close(), 15_000);
      } catch {
        // Browser notifications may be unavailable in some contexts.
      }
    },
    [],
  );

  useEffect(() => {
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
  }, [queryClient, showAutomationNotification, showUserNotification]);

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

            try {
              const notif = new Notification(title, {
                body,
                icon: "/RemiAI.png",
                tag: `scheduled-task-${task.id}`,
                requireInteraction: true,
              });
              notif.onclick = () => {
                window.focus();
                window.location.href = `/chat/${task.conversationId}`;
                notif.close();
              };
              setTimeout(() => notif.close(), 15_000);
            } catch {
              // Notification may fail
            }
          }
        }
      }
    } catch {
      // Poll failures are non-critical
    }
  }, [queryClient]);

  useEffect(() => {
    // Request notification permission
    requestNotificationPermission().then((granted) => {
      hasPermission.current = granted;
    });

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
  }, [queryClient, requestNotificationPermission, showNotification, pollForCompletedTasks]);

  return null;
}
