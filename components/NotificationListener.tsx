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
      const data = await res.json() as { tasks: any[]; count: number };
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
