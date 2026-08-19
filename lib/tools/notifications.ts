import { z } from "zod";
import { publishUserNotification } from "@/lib/runs/notifications";
import { truncateToolResult } from "@/lib/utils";

/**
 * Send a user-facing notification through the local app notification stream.
 * Delivery is handled by the active web/PWA or Electron client.
 */
export function buildSendNotificationTool(conversationId: number) {
  return {
    description:
      "Send a concise notification to the user through the RemiAI web/PWA or desktop app. Use for important completion notices, reminders, warnings, or results that the user should notice. This is local app delivery and does not send email or SMS.",
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
      });

      return truncateToolResult({
        type: "user_notification_sent",
        notification,
        delivery: "local_app_stream",
        message:
          "Notification sent to active RemiAI web/PWA or desktop app clients. It is not an email or SMS and cannot reach a fully closed app without background Web Push configured.",
      });
    },
  };
}
