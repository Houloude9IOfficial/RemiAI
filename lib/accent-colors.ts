/**
 * Accent color presets — the configurable brand color used across the UI
 * (buttons, highlights, focus rings, sidebar accents, etc.).
 *
 * The accent is implemented as a set of CSS custom-property overrides on
 * `<html>` (via inline styles) that shadow the default tokens defined in
 * `app/globals.css` (`--primary`, `--ring`, `--sidebar-primary`, ...).
 *
 * Each preset defines two shades, mirroring the existing theme setup in
 * globals.css: a stronger, deeper shade for light mode and a lighter tint
 * for dark mode (dark backgrounds need brighter accents to stand out).
 */

export interface AccentPreset {
  id: string;
  label: string;
  /** Strong shade used in light mode. */
  light: string;
  /** Lighter tint used in dark mode. */
  dark: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "blue", label: "Blue", light: "#2563eb", dark: "#60a5fa" },
  { id: "indigo", label: "Indigo", light: "#4f46e5", dark: "#818cf8" },
  { id: "violet", label: "Violet", light: "#7c3aed", dark: "#a78bfa" },
  { id: "purple", label: "Purple", light: "#9333ea", dark: "#c084fc" },
  { id: "fuchsia", label: "Fuchsia", light: "#c026d3", dark: "#e879f9" },
  { id: "pink", label: "Pink", light: "#db2777", dark: "#f472b6" },
  { id: "rose", label: "Rose", light: "#e11d48", dark: "#fb7185" },
  { id: "red", label: "Red", light: "#dc2626", dark: "#f87171" },
  { id: "orange", label: "Orange", light: "#c2410c", dark: "#fb923c" },
  { id: "amber", label: "Amber", light: "#b45309", dark: "#fbbf24" },
  { id: "lime", label: "Lime", light: "#4d7c0f", dark: "#a3e635" },
  { id: "green", label: "Green", light: "#16a34a", dark: "#4ade80" },
  { id: "emerald", label: "Emerald", light: "#059669", dark: "#34d399" },
  { id: "teal", label: "Teal", light: "#0d9488", dark: "#2dd4bf" },
  { id: "cyan", label: "Cyan", light: "#0e7490", dark: "#22d3ee" },
];

/** Text-on-accent foreground, matching globals.css defaults. */
const ACCENT_LIGHT_FOREGROUND = "#ffffff";
const ACCENT_DARK_FOREGROUND = "#18181b";

/**
 * The CSS custom properties the accent color overrides.
 * (Inline styles on <html> take precedence over the :root / .dark rules.)
 */
export const ACCENT_VARS = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
  "--border-focus",
] as const;

export type AccentVarSet = Partial<Record<(typeof ACCENT_VARS)[number], string>>;

export function getAccentPreset(id: string): AccentPreset | undefined {
  return ACCENT_PRESETS.find((p) => p.id === id);
}

/**
 * Resolve the CSS variable overrides for an accent preset in a given theme.
 * Returns null for an empty/unknown id (the app's default accent).
 */
export function accentVarsFor(
  id: string,
  theme: "light" | "dark",
): AccentVarSet | null {
  const preset = getAccentPreset(id);
  if (!preset) return null;

  const primary = theme === "dark" ? preset.dark : preset.light;
  const foreground =
    theme === "dark" ? ACCENT_DARK_FOREGROUND : ACCENT_LIGHT_FOREGROUND;

  return {
    "--primary": primary,
    "--primary-foreground": foreground,
    "--ring": primary,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": foreground,
    "--sidebar-ring": primary,
    "--border-focus": `color-mix(in oklab, ${primary} 62%, white)`,
  };
}

/**
 * Apply (or clear) accent variable overrides on <html>.
 * Client-side only — called from the AccentColorProvider effect.
 */
export function applyAccentVars(vars: AccentVarSet | null): void {
  const el = document.documentElement;
  if (!vars) {
    for (const name of ACCENT_VARS) el.style.removeProperty(name);
    return;
  }
  for (const [name, value] of Object.entries(vars)) {
    el.style.setProperty(name, value);
  }
}
