"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHANGE_EVENT = "remiai:sidebar-preference";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useSidebarPreference(key: string, fallback: string) {
  const getSnapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback((next: string) => {
    try {
      localStorage.setItem(key, next);
    } catch {
      // The sidebar still works when local storage is unavailable.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [key]);

  return [value, setValue] as const;
}
