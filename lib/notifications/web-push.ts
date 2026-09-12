import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  requireInteraction?: boolean;
  tag?: string;
  /** Display even when an active SSE client is visible (used by test sends). */
  showWhenVisible?: boolean;
};

const ACCOUNT_ID = 1;

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function getWebPushPublicKey(): string | null {
  return getVapidConfig()?.publicKey ?? null;
}

function configureWebPush(): boolean {
  const config = getVapidConfig();
  if (!config) return false;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

export async function savePushSubscription(
  subscription: PushSubscriptionInput,
  userAgent?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(pushSubscriptions)
    .values({
      accountId: ACCOUNT_ID,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent?.slice(0, 500) ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        accountId: ACCOUNT_ID,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent?.slice(0, 500) ?? null,
        updatedAt: now,
      },
    })
    .run();
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

/**
 * Send a push to every registered browser/PWA for the local account.
 * Delivery is intentionally best-effort: a missing VAPID configuration or a
 * provider failure must never fail an AI run or a notification tool call.
 */
export async function sendWebPush(payload: PushPayload): Promise<number> {
  if (!configureWebPush()) return 0;

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.accountId, ACCOUNT_ID))
    .all();

  let delivered = 0;
  await Promise.all(
    subscriptions.map(async (row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify(payload),
          { TTL: 60 * 60 },
        );
        delivered += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        // 404/410 means the browser revoked or expired the subscription.
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(row.endpoint).catch(() => undefined);
        } else {
          console.warn(
            "[notifications] Web Push delivery failed:",
            error instanceof Error ? error.message : error,
          );
        }
      }
    }),
  );
  return delivered;
}
