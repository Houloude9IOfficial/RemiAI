"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isUpdateAvailable,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_STORAGE_KEY,
  type CachedUpdateCheck,
  type LatestRelease,
} from "@/lib/updates";
import packagejson from "../../package.json";

const CURRENT_VERSION = (packagejson as { version?: string }).version ?? "0.0.0";

/**
 * Checks the GitHub releases API for a newer RemiAI version.
 *
 * - On mount, reuses the localStorage cache when the last check was under 6
 *   hours ago (so the icon appears instantly on subsequent visits), otherwise
 *   fetches `/api/updates`.
 * - While mounted, re-checks every 6 hours.
 * - `updateAvailable` is true only when the latest release is strictly newer
 *   than the bundled `package.json` version.
 */
export function useUpdateChecker() {
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checked, setChecked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNow = useCallback(async () => {
    try {
      const res = await fetch("/api/updates", { cache: "no-store" });
      if (!res.ok) throw new Error(`Update check failed (${res.status})`);
      const data = (await res.json()) as LatestRelease;
      setRelease(data);
      setUpdateAvailable(isUpdateAvailable(CURRENT_VERSION, data.version));

      // Persist so the next mount within 6h can render instantly offline.
      try {
        const cache: CachedUpdateCheck = {
          lastCheckedAt: Date.now(),
          release: data,
        };
        localStorage.setItem(UPDATE_CHECK_STORAGE_KEY, JSON.stringify(cache));
      } catch {
        // localStorage unavailable — ignore
      }
    } catch {
      // GitHub unreachable / API error — leave state as-is, retry next tick.
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    // Re-check every 6 hours while the app is open.
    timerRef.current = setInterval(() => void checkNow(), UPDATE_CHECK_INTERVAL_MS);

    // Hydrate from the localStorage cache on a deferred tick: setState inside
    // the effect body is flagged by react-hooks/set-state-in-effect, and the
    // deferral also avoids SSR hydration mismatches (the cache is client-only).
    const hydrateId = setTimeout(() => {
      let lastCheckedAt = 0;
      let cachedRelease: LatestRelease | null = null;
      try {
        const raw = localStorage.getItem(UPDATE_CHECK_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CachedUpdateCheck;
          lastCheckedAt = parsed.lastCheckedAt ?? 0;
          cachedRelease = parsed.release ?? null;
        }
      } catch {
        // Corrupt cache — ignore and fetch fresh.
      }

      if (cachedRelease && Date.now() - lastCheckedAt < UPDATE_CHECK_INTERVAL_MS) {
        setRelease(cachedRelease);
        setUpdateAvailable(isUpdateAvailable(CURRENT_VERSION, cachedRelease.version));
        setChecked(true);
      } else {
        void checkNow();
      }
    }, 0);

    return () => {
      clearTimeout(hydrateId);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [checkNow]);

  return { release, updateAvailable, checked, checkNow, currentVersion: CURRENT_VERSION };
}
