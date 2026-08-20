"use client";

import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { preferencesApi } from "@/lib/api/preferences";
import { useTheme } from "@/components/ThemeProvider";
import { useAppearancePreview } from "@/components/AppearancePreviewProvider";
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
 *
 * An unsaved "preview" accent (set from the profile form) is layered on top:
 * it applies immediately, while the localStorage cache always tracks the
 * *saved* value so a preview never leaks into the pre-paint script.
 */
export function AccentColorProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const { preview } = useAppearancePreview();
  const { data, isLoading } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });

  const savedAccentId = data?.accentColor ?? "";
  const previewAccent = preview.accentColor;
  const hoverAccent = preview.accentHover;
  const accentId =
    hoverAccent !== null
      ? hoverAccent
      : previewAccent !== null
        ? previewAccent
        : savedAccentId;
  const theme: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    // Wait for the server-side preference to load. Until then, keep whatever
    // the pre-paint script applied from the localStorage cache — otherwise
    // the cached accent would be wiped and flash back to default on every
    // page load.
    if (isLoading) return;

    // Cache the SAVED accent (not the preview) for the pre-paint script.
    const savedLight = accentVarsFor(savedAccentId, "light");
    const savedDark = accentVarsFor(savedAccentId, "dark");

    try {
      if (savedLight) {
        localStorage.setItem(ACCENT_CACHE_LIGHT, JSON.stringify(savedLight));
      } else {
        localStorage.removeItem(ACCENT_CACHE_LIGHT);
      }
      if (savedDark) {
        localStorage.setItem(ACCENT_CACHE_DARK, JSON.stringify(savedDark));
      } else {
        localStorage.removeItem(ACCENT_CACHE_DARK);
      }
    } catch {
      // localStorage may be unavailable (private browsing, etc.) — ignore.
    }

    // Apply the effective accent (preview if present, otherwise saved).
    const light = accentVarsFor(accentId, "light");
    const dark = accentVarsFor(accentId, "dark");
    applyAccentVars(theme === "dark" ? dark : light);
  }, [savedAccentId, accentId, theme, isLoading]);

  return <>{children}</>;
}
