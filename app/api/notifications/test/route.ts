import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/auth/service";
import { publishUserNotification } from "@/lib/runs/notifications";
import { sendWebPush } from "@/lib/notifications/web-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notification = publishUserNotification({
    conversationId: 0,
    title: "RemiAI test notification",
    body: "Push notifications are working on this device.",
    requireInteraction: false,
    url: "/settings/profile",
    showWhenVisible: true,
    sendPush: false,
  });
  const delivered = await sendWebPush({
    title: notification.title,
    body: notification.body,
    url: notification.url,
    tag: "remiai-test-notification",
    showWhenVisible: true,
  });
  return NextResponse.json({ ok: true, notification, delivered });
}
