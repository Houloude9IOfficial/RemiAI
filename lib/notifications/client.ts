export type PushSetupResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "not-configured" | "failed" };

type ElectronNotificationApi = {
  isNotificationSupported?: () => Promise<boolean>;
  sendNotification: (payload: {
    title: string;
    body: string;
    url?: string;
    requireInteraction?: boolean;
  }) => Promise<boolean>;
};

export function getElectronNotificationApi(): ElectronNotificationApi | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { electronAPI?: ElectronNotificationApi }).electronAPI ?? null;
}

export function isElectronNotificationAvailable(): boolean {
  return getElectronNotificationApi() !== null;
}

export async function isElectronNotificationSupported(): Promise<boolean> {
  const api = getElectronNotificationApi();
  if (!api) return false;
  if (!api.isNotificationSupported) return true;
  try {
    return await api.isNotificationSupported();
  } catch {
    return false;
  }
}

export async function sendElectronTestNotification(): Promise<boolean> {
  const api = getElectronNotificationApi();
  if (!api) return false;
  try {
    const result = await api.sendNotification({
      title: "RemiAI test notification",
      body: "Native Electron notifications are working on this Mac.",
      url: "/settings/profile",
    });
    return result !== false;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers are not supported");

  // Register on every enable attempt and bypass the HTTP cache so an older
  // PWA worker cannot leave push events unhandled after an app deployment.
  const registration = await navigator.serviceWorker.register("/sw.js", {
    updateViaCache: "none",
  });
  await registration.update().catch(() => undefined);
  return navigator.serviceWorker.ready;
}

export async function getPushStatus(): Promise<{
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  electron: boolean;
}> {
  if (typeof window === "undefined") {
    return { configured: false, permission: "unsupported", subscribed: false, electron: false };
  }

  if (isElectronNotificationAvailable()) {
    const supported = await isElectronNotificationSupported();
    return {
      configured: supported,
      permission: supported ? "granted" : "unsupported",
      subscribed: supported,
      electron: true,
    };
  }

  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return { configured: false, permission: "unsupported", subscribed: false, electron: false };
  }

  const response = await fetch("/api/notifications/push", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to read notification settings");
  const data = await response.json() as { configured: boolean };
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = registration
    ? await registration.pushManager.getSubscription()
    : null;
  return {
    configured: data.configured === true,
    permission: Notification.permission,
    subscribed: subscription !== null,
    electron: false,
  };
}

export async function enableWebPushNotifications(
  requestPermission = true,
): Promise<PushSetupResult> {
  if (isElectronNotificationAvailable()) {
    return (await isElectronNotificationSupported())
      ? { ok: true }
      : { ok: false, reason: "unsupported" };
  }

  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    const statusResponse = await fetch("/api/notifications/push", { cache: "no-store" });
    if (!statusResponse.ok) return { ok: false, reason: "failed" };
    const status = await statusResponse.json() as { configured: boolean; publicKey: string | null };
    if (!status.configured || !status.publicKey) return { ok: false, reason: "not-configured" };

    let permission = Notification.permission;
    if (permission === "default" && requestPermission) {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return { ok: false, reason: "denied" };

    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(status.publicKey) as BufferSource,
      });
    }

    const response = await fetch("/api/notifications/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) return { ok: false, reason: "failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function disableWebPushNotifications(): Promise<boolean> {
  // Electron notifications are local OS notifications, not a browser push
  // subscription. There is no Web Push registration to remove here.
  if (isElectronNotificationAvailable()) return true;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = registration
      ? await registration.pushManager.getSubscription()
      : null;
    if (!subscription) return true;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await fetch("/api/notifications/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    return true;
  } catch {
    return false;
  }
}
