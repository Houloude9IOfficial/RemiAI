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
 * Component that connects to the scheduled tasks SSE endpoint and shows
 * native desktop notifications when tasks complete.
 *
 * Renders nothing visible — just handles side effects.
 */
export function NotificationListener() {
  const queryClient = useQueryClient();
  const permissionRequested = useRef(false);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return false; // Not in browser
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    if (permissionRequested.current) return false;

    permissionRequested.current = true;
    const result = await Notification.requestPermission();
    return result === "granted";
  }, []);

  const showNotification = useCallback(
    (event: TaskEvent) => {
      const { task } = event;

      // Build notification title and body
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
          requireInteraction: true, // Stays until user interacts
        });

        // When user clicks the notification, open the conversation
        notif.onclick = () => {
          window.focus();
          window.location.href = `/chat/${task.conversationId}`;
          notif.close();
        };

        // Auto-close after 15 seconds
        setTimeout(() => notif.close(), 15_000);
      } catch {
        // Notification may fail in some contexts
      }
    },
    [],
  );

  useEffect(() => {
    // Request permission on mount
    requestNotificationPermission();

    // Connect to SSE endpoint
    const eventSource = new EventSource("/api/scheduled-tasks/events");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TaskEvent | { type: "connected" };

        if (data.type === "connected") {
          return; // Initial keepalive
        }

        if (data.type === "scheduled_task_completed") {
          // Invalidate the scheduled tasks query so the settings page updates
          queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] });

          // Also invalidate conversations query to refresh the list
          queryClient.invalidateQueries({ queryKey: ["conversations"] });

          // Show native notification
          showNotification(data);
        }
      } catch {
        // Malformed data — ignore
      }
    };

    eventSource.onerror = () => {
      // Connection lost — the browser will auto-reconnect
    };

    return () => {
      eventSource.close();
    };
  }, [queryClient, requestNotificationPermission, showNotification]);

  return null; // Nothing visible
}
