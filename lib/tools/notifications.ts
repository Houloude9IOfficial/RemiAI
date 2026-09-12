import { z } from "zod";
import { publishUserNotification } from "@/lib/runs/notifications";
import { sendWebPush } from "@/lib/notifications/web-push";
import { truncateToolResult } from "@/lib/utils";

/**
 * Send a user-facing notification through the active app and registered Web
 * Push devices. The push payload opens the originating conversation.
 */
export function buildSendNotificationTool(conversationId: number) {
  return {
    description:
      "Send a concise notification to the user through RemiAI. Use for important completion notices, reminders, warnings, or results the user should notice. The title/body are shown briefly; clicking opens this conversation. Registered Web Push devices can receive it even when the web app is closed. A local Electron app receives it only when connected to this same local RemiAI server; it cannot receive notifications from a separate VPS instance. This is not email or SMS.",
    inputSchema: z.object({
      title: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .describe("Short notification title"),
      body: z
        .string()
        .trim()
        .min(1)
        .max(1_000)
        .describe("Concise notification message"),
      requireInteraction: z
        .boolean()
        .optional()
        .default(false)
        .describe("Keep the notification visible until the user interacts with it; use sparingly"),
    }),
    execute: async ({
      title,
      body,
      requireInteraction,
    }: {
      title: string;
      body: string;
      requireInteraction?: boolean;
    }) => {
      const notification = publishUserNotification({
        conversationId,
        title,
        body,
        requireInteraction: requireInteraction ?? false,
        // Dispatch SSE synchronously above, then await Web Push here so the
        // tool result does not claim delivery when the VPS reached no device.
        sendPush: false,
      });
      const webPushDevicesReached = await sendWebPush({
        title: notification.title,
        body: notification.body,
        url: notification.url,
        requireInteraction: notification.requireInteraction,
        tag: `user-notification-${notification.id}`,
      });

      return truncateToolResult({
        type: "user_notification_sent",
        notification,
        delivery: {
          active_app: "dispatched",
          web_push_devices_reached: webPushDevicesReached,
        },
        message:
          webPushDevicesReached > 0
            ? `Notification dispatched to the active RemiAI app and ${webPushDevicesReached} registered Web Push device${webPushDevicesReached === 1 ? "" : "s"}. The click action opens this conversation. A separate local Electron instance cannot receive notifications from this VPS. It is not email or SMS.`
            : "Notification dispatched to the active RemiAI app, but no registered Web Push device was reached. A separate local Electron instance cannot receive notifications from this VPS. It is not email or SMS.",
      });
    },
  };
}
