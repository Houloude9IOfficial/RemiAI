import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/auth/service";
import {
  getWebPushPublicKey,
  removePushSubscription,
  savePushSubscription,
  type PushSubscriptionInput,
} from "@/lib/notifications/web-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const account = await getCurrentAccount();
  if (!account) return unauthorized();
  return NextResponse.json({
    configured: getWebPushPublicKey() !== null,
    publicKey: getWebPushPublicKey(),
  });
}

export async function POST(req: Request) {
  const account = await getCurrentAccount();
  if (!account) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subscription = body as Partial<PushSubscriptionInput>;
  if (
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint.startsWith("https://") ||
    !subscription.keys ||
    typeof subscription.keys.p256dh !== "string" ||
    typeof subscription.keys.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  try {
    await savePushSubscription(
      subscription as PushSubscriptionInput,
      req.headers.get("user-agent"),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[notifications] Failed to save push subscription:", error);
    return NextResponse.json({ error: "Failed to save push subscription" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const account = await getCurrentAccount();
  if (!account) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const endpoint = (body as { endpoint?: unknown }).endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid push endpoint" }, { status: 400 });
  }

  await removePushSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
