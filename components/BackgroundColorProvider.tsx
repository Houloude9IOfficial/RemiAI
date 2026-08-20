"use client";

import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { preferencesApi } from "@/lib/api/preferences";
import { useTheme } from "@/components/ThemeProvider";
import { useAppearancePreview } from "@/components/AppearancePreviewProvider";
import {
  backgroundVarsFor,
  applyBackgroundVars,
} from "@/lib/background-colors";

/**
 * Cached per-theme var sets, written to localStorage so the inline script in
 * layout.tsx can re-apply the background palette before first paint.
 */
const BACKGROUND_CACHE_LIGHT = "remi-background-light";
const BACKGROUND_CACHE_DARK = "remi-background-dark";

/**
 * Applies the user's configured background palette (from profile preferences)
 * to the whole app by overriding the canvas CSS custom properties on <html>.
 * Re-applies whenever the background changes or the light/dark theme flips.
 * Uses a disjoint set of variables from AccentColorProvider, so the two
 * never overwrite each other.
 *
 * An unsaved "preview" background (set from the profile form) is layered on
 * top: it applies immediately, while the localStorage cache always tracks the
 * *saved* value so a preview never leaks into the pre-paint script.
 */
export function BackgroundColorProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const { preview } = useAppearancePreview();
  const { data, isLoading } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });

  const savedBackgroundId = data?.backgroundColor ?? "";
  const previewBackground = preview.backgroundColor;
  const hoverBackground = preview.backgroundHover;
  const backgroundId =
    hoverBackground !== null
      ? hoverBackground
      : previewBackground !== null
        ? previewBackground
        : savedBackgroundId;
  const theme: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    // Wait for the server-side preference to load. Until then, keep whatever
    // the pre-paint script applied from the localStorage cache — otherwise
    // the cached background would be wiped and flash back to default.
    if (isLoading) return;

    // Cache the SAVED background (not the preview) for the pre-paint script.
    const savedLight = backgroundVarsFor(savedBackgroundId, "light");
    const savedDark = backgroundVarsFor(savedBackgroundId, "dark");

    try {
      if (savedLight) {
        localStorage.setItem(BACKGROUND_CACHE_LIGHT, JSON.stringify(savedLight));
      } else {
        localStorage.removeItem(BACKGROUND_CACHE_LIGHT);
      }
      if (savedDark) {
        localStorage.setItem(BACKGROUND_CACHE_DARK, JSON.stringify(savedDark));
      } else {
        localStorage.removeItem(BACKGROUND_CACHE_DARK);
      }
    } catch {
      // localStorage may be unavailable (private browsing, etc.) — ignore.
    }

    // Apply the effective background (preview if present, otherwise saved).
    const light = backgroundVarsFor(backgroundId, "light");
    const dark = backgroundVarsFor(backgroundId, "dark");
    applyBackgroundVars(theme === "dark" ? dark : light);
  }, [savedBackgroundId, backgroundId, theme, isLoading]);

  return <>{children}</>;
}
