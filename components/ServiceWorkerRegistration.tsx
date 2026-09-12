"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for PWA installability.
 * Only runs in the browser (not SSR) and only if the browser supports SW.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch(() => {
        // Registration failed silently — PWA install just won't be available
      });
  }, []);

  return null;
}
