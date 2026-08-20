/**
 * Background color presets — the configurable canvas palette used across the
 * UI (page background, cards, popovers, sidebar, and elevated surfaces).
 *
 * Like the accent color, the background is implemented as a set of CSS
 * custom-property overrides on `<html>` (via inline styles) that shadow the
 * default tokens defined in `app/globals.css`.
 *
 * The overridden properties are intentionally disjoint from the accent
 * overrides (`--primary`, `--ring`, `--sidebar-primary`, ...) in
 * `lib/accent-colors.ts`, so a background preset and an accent preset can be
 * combined freely without either one overwriting the other.
 *
 * `""` (empty id) means the app's built-in default background — surfaced in
 * the UI as "Default" — so only the non-default presets live in this list.
 */

/**
 * The CSS custom properties a background preset may override. These are the
 * "canvas" tokens only — background surfaces, their hairlines, and inputs.
 * Text/foreground tokens are left untouched so contrast stays intact.
 */
export const BACKGROUND_VARS = [
  "--background",
  "--card",
  "--popover",
  "--surface-1",
  "--surface-2",
  "--surface-3",
  "--sidebar",
  "--sidebar-border",
  "--border",
  "--input",
] as const;

export type BackgroundVarSet = Partial<
  Record<(typeof BACKGROUND_VARS)[number], string>
>;

export interface BackgroundPreset {
  id: string;
  label: string;
  /** Light-mode variable overrides. */
  light: BackgroundVarSet;
  /** Dark-mode variable overrides. */
  dark: BackgroundVarSet;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "solar",
    label: "Solar",
    light: {
      "--background": "oklch(0.97 0.014 92)",
      "--card": "oklch(0.985 0.01 92)",
      "--popover": "oklch(0.985 0.01 92)",
      "--surface-1": "oklch(0.985 0.011 92)",
      "--surface-2": "oklch(0.965 0.014 92)",
      "--surface-3": "oklch(0.94 0.017 90)",
      "--sidebar": "oklch(0.955 0.015 92)",
      "--sidebar-border": "oklch(0.885 0.022 90)",
      "--border": "oklch(0.885 0.02 90)",
      "--input": "oklch(0.92 0.018 90)",
    },
    dark: {
      "--background": "oklch(0.20 0.013 80)",
      "--card": "oklch(0.235 0.014 80)",
      "--popover": "oklch(0.235 0.014 80)",
      "--surface-1": "oklch(0.225 0.013 80)",
      "--surface-2": "oklch(0.25 0.015 80)",
      "--surface-3": "oklch(0.28 0.016 80)",
      "--sidebar": "oklch(0.21 0.013 80)",
      "--sidebar-border": "oklch(0.40 0.015 80 / 0.5)",
      "--border": "oklch(0.40 0.015 80 / 0.5)",
      "--input": "oklch(0.33 0.014 80 / 0.65)",
    },
  },
  {
    id: "slate",
    label: "Slate",
    light: {
      "--background": "oklch(0.975 0.002 250)",
      "--card": "oklch(0.99 0.002 250)",
      "--popover": "oklch(0.99 0.002 250)",
      "--surface-1": "oklch(0.985 0.002 250)",
      "--surface-2": "oklch(0.97 0.003 250)",
      "--surface-3": "oklch(0.95 0.004 250)",
      "--sidebar": "oklch(0.965 0.003 250)",
      "--sidebar-border": "oklch(0.885 0.004 250)",
      "--border": "oklch(0.89 0.004 250)",
      "--input": "oklch(0.925 0.004 250)",
    },
    dark: {
      "--background": "oklch(0.19 0.004 250)",
      "--card": "oklch(0.225 0.005 250)",
      "--popover": "oklch(0.225 0.005 250)",
      "--surface-1": "oklch(0.215 0.005 250)",
      "--surface-2": "oklch(0.24 0.005 250)",
      "--surface-3": "oklch(0.27 0.006 250)",
      "--sidebar": "oklch(0.205 0.004 250)",
      "--sidebar-border": "oklch(0.38 0.006 250 / 0.5)",
      "--border": "oklch(0.38 0.006 250 / 0.5)",
      "--input": "oklch(0.31 0.005 250 / 0.65)",
    },
  },
];

export function getBackgroundPreset(id: string): BackgroundPreset | undefined {
  return BACKGROUND_PRESETS.find((p) => p.id === id);
}

/**
 * Resolve the CSS variable overrides for a background preset in a theme.
 * Returns null for an empty/unknown id (the app's default background).
 */
export function backgroundVarsFor(
  id: string,
  theme: "light" | "dark",
): BackgroundVarSet | null {
  const preset = getBackgroundPreset(id);
  if (!preset) return null;
  return theme === "dark" ? preset.dark : preset.light;
}

/**
 * Apply (or clear) background variable overrides on <html>.
 * Client-side only — called from the BackgroundColorProvider effect.
 */
export function applyBackgroundVars(vars: BackgroundVarSet | null): void {
  const el = document.documentElement;
  if (!vars) {
    for (const name of BACKGROUND_VARS) el.style.removeProperty(name);
    return;
  }
  for (const [name, value] of Object.entries(vars)) {
    el.style.setProperty(name, value);
  }
}
