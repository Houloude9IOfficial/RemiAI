"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for PWA installability.
 * Only runs in the browser (not SSR) and only if the browser supports SW.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      // Only register in production — dev mode Turbopack HMR conflicts with SW caching
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          // Service worker registered
        })
        .catch(() => {
          // Registration failed silently — PWA install just won't be available
        });
    }
  }, []);

  return null;
}
