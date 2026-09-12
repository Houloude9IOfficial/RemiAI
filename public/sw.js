// RemiAI Service Worker — PWA installability and background Web Push.

const CACHE_NAME = "remiai-v2";
const STATIC_ASSETS = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "RemiAI";
  const options = {
    body: payload.body || "You have an update from RemiAI.",
    icon: "/RemiAI.png",
    badge: "/favicon-32x32.png",
    tag: payload.tag || "remiai-notification",
    requireInteraction: payload.requireInteraction === true,
    data: {
      targetUrl: payload.url || "/",
      showWhenVisible: payload.showWhenVisible === true,
    },
  };
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // The SSE listener displays notifications immediately while the app is
      // visible. Avoid showing a duplicate Web Push notification in that case.
      const appIsVisible = clients.some((client) => client.visibilityState === "visible");
      if (appIsVisible && payload.showWhenVisible !== true) return undefined;
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.targetUrl || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (new URL(event.request.url).pathname === "/sw.js") {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/").then((response) => response ?? fetch(event.request))
      )
    );
    return;
  }

  // Next.js hashes development and production chunks differently. Do not
  // intercept them at all. Calling respondWith(fetch(...)) here is unnecessary
  // and can throw in Firefox for encoded App Router chunk URLs; leaving the
  // event untouched lets the browser request the asset directly from Next.js.
  if (new URL(event.request.url).pathname.startsWith("/_next/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request))
  );
});
