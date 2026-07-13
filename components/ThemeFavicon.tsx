"use client";

import { useTheme } from "@/components/ThemeProvider";
import { useEffect, useRef } from "react";

/**
 * Dynamically swaps the favicon <link> elements based on the app's resolved
 * theme (light/dark). This ensures the favicon follows the app's theme toggle
 * rather than the OS-level prefers-color-scheme media query.
 *
 * In light mode: uses the dark-on-light logo (e.g. favicon.ico, favicon-32x32.png)
 * In dark mode:  uses the light-on-dark logo (e.g. favicon-Light.ico, favicon-32x32-Light.png)
 */
export function ThemeFavicon() {
  const { resolvedTheme } = useTheme();
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!resolvedTheme) return;
    // Avoid re-applying the same theme
    if (appliedRef.current === resolvedTheme) return;
    appliedRef.current = resolvedTheme;

    const isDark = resolvedTheme === "dark";

    // Update all <link rel="icon"> elements
    const links = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"]',
    );
    links.forEach((link) => {
      const href = link.getAttribute("href") ?? "";
      if (href.includes("favicon")) {
        if (isDark && !href.includes("Light")) {
          // Switch to light variant
          link.href = href.replace(
            /favicon(-(\d+x\d+))?\.(png|ico)/,
            "favicon$1-Light.$3",
          );
        } else if (!isDark && href.includes("Light")) {
          // Switch back to dark variant
          link.href = href.replace(/-Light/, "");
        }
      }
    });
  }, [resolvedTheme]);

  // This component only manipulates the DOM, no visible UI
  return null;
}
