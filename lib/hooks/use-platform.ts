"use client";

import { useSyncExternalStore } from "react";

export type Platform = "mac" | "windows" | "linux";

/**
 * Detect the user's platform so shortcut hints can show the right modifier
 * key/icon: ⌘ on macOS, the Windows logo on Windows, Ctrl elsewhere.
 *
 * Uses `useSyncExternalStore` to read the client-only `navigator` value:
 * SSR/hydration renders the neutral "linux" snapshot and the client flips to
 * the real platform after hydration — no effect, no hydration mismatch.
 */
function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.platform || navigator.userAgent;
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  return "linux";
}

const emptySubscribe = () => () => {};

export function usePlatform(): { platform: Platform; isMac: boolean } {
  const platform = useSyncExternalStore(
    emptySubscribe,
    detectPlatform,
    () => "linux" as Platform,
  );
  return { platform, isMac: platform === "mac" };
}
