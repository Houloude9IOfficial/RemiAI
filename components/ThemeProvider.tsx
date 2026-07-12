"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme | undefined;
  setTheme: (theme: Theme) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Custom ThemeProvider that replaces next-themes.
 *
 * NOTE: React 19 does not allow <script> tags inside the React component tree
 * during SSR. To avoid that warning, we skip the inline theme-initialisation
 * script entirely and rely on a useEffect to set the theme class after mount.
 * This means there is a brief flash of the unstyled/incorrect theme before
 * React hydrates — acceptable for a local tool. The flash is mitigated by:
 *   1. The <html> tag in layout.tsx has suppressHydrationWarning
 *   2. The <html> tag starts with no 'light' or 'dark' class so the initial
 *      render will be whatever the browser default is (usually light), which
 *      is quickly corrected once the effect runs.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme | undefined>(
    undefined,
  );

  // On mount, read stored theme & apply it immediately
  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    const effective = stored && ["light", "dark", "system"].includes(stored) ? stored : "system";
    setThemeState(effective);

    // Resolve and apply immediately (before the next effect runs)
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const resolved = effective === "system"
      ? (mediaQuery.matches ? "dark" : "light")
      : effective;

    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolved);
    document.documentElement.style.colorScheme = resolved;
    setResolvedTheme(resolved);
  }, []);

  // Listen for system preference changes (only when theme === "system")
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleChange() {
      const t = mediaQuery.matches ? "dark" : "light";
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(t);
      document.documentElement.style.colorScheme = t;
      setResolvedTheme(t);
    }

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem("theme", newTheme);
    setThemeState(newTheme);

    // Immediately apply
    if (newTheme !== "system") {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(newTheme);
      document.documentElement.style.colorScheme = newTheme;
      setResolvedTheme(newTheme);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
