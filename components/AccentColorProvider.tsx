"use client";

import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { preferencesApi } from "@/lib/api/preferences";
import { useTheme } from "@/components/ThemeProvider";
import {
  accentVarsFor,
  applyAccentVars,
} from "@/lib/accent-colors";

/**
 * Cached per-theme var sets, written to localStorage so the inline script in
 * layout.tsx can re-apply the accent color before first paint (no flash).
 */
const ACCENT_CACHE_LIGHT = "remi-accent-light";
const ACCENT_CACHE_DARK = "remi-accent-dark";

/**
 * Applies the user's configured accent color (from profile preferences) to
 * the whole app by overriding the primary CSS custom properties on <html>.
 * Re-applies whenever the accent changes or the light/dark theme flips.
 */
export function AccentColorProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const { data, isLoading } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });

  const accentId = data?.accentColor ?? "";
  const theme: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    // Wait for the server-side preference to load. Until then, keep whatever
    // the pre-paint script applied from the localStorage cache — otherwise
    // the cached accent would be wiped and flash back to default on every
    // page load.
    if (isLoading) return;

    const light = accentVarsFor(accentId, "light");
    const dark = accentVarsFor(accentId, "dark");

    try {
      if (light) {
        localStorage.setItem(ACCENT_CACHE_LIGHT, JSON.stringify(light));
      } else {
        localStorage.removeItem(ACCENT_CACHE_LIGHT);
      }
      if (dark) {
        localStorage.setItem(ACCENT_CACHE_DARK, JSON.stringify(dark));
      } else {
        localStorage.removeItem(ACCENT_CACHE_DARK);
      }
    } catch {
      // localStorage may be unavailable (private browsing, etc.) — ignore.
    }

    applyAccentVars(theme === "dark" ? dark : light);
  }, [accentId, theme, isLoading]);

  return <>{children}</>;
}
