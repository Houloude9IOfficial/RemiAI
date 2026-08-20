"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface AppearancePreview {
  /** Accent id applied by a click ("select") preview, or null when unset. */
  accentColor: string | null;
  /** Background id applied by a click ("select") preview, or null when unset. */
  backgroundColor: string | null;
  /** Accent id applied while a swatch is hovered, or null when unset. */
  accentHover: string | null;
  /** Background id applied while a pill is hovered, or null when unset. */
  backgroundHover: string | null;
}

interface AppearancePreviewContextValue {
  preview: AppearancePreview;
  setAccentPreview: (id: string) => void;
  setBackgroundPreview: (id: string) => void;
  clearPreviews: () => void;
  setAccentHover: (id: string) => void;
  clearAccentHover: () => void;
  setBackgroundHover: (id: string) => void;
  clearBackgroundHover: () => void;
}

const AppearancePreviewContext = createContext<
  AppearancePreviewContextValue | undefined
>(undefined);

/**
 * Holds unsaved "live preview" overrides for the accent and background color.
 *
 * There are two layers:
 *  - a click preview (selecting a swatch applies it until save/leave), and
 *  - a hover preview (hovering a swatch applies it only while hovered).
 *
 * The hover layer sits on top of the click preview, which sits on top of the
 * persisted preferences. The color providers resolve the effective value from
 * these layers so changes apply immediately without saving. When the profile
 * form unmounts it calls `clearPreviews`, reverting to the persisted values.
 */
export function AppearancePreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<AppearancePreview>({
    accentColor: null,
    backgroundColor: null,
    accentHover: null,
    backgroundHover: null,
  });

  const setAccentPreview = useCallback((id: string) => {
    setPreview((p) => ({ ...p, accentColor: id }));
  }, []);

  const setBackgroundPreview = useCallback((id: string) => {
    setPreview((p) => ({ ...p, backgroundColor: id }));
  }, []);

  const setAccentHover = useCallback((id: string) => {
    setPreview((p) => ({ ...p, accentHover: id }));
  }, []);

  const clearAccentHover = useCallback(() => {
    setPreview((p) => ({ ...p, accentHover: null }));
  }, []);

  const setBackgroundHover = useCallback((id: string) => {
    setPreview((p) => ({ ...p, backgroundHover: id }));
  }, []);

  const clearBackgroundHover = useCallback(() => {
    setPreview((p) => ({ ...p, backgroundHover: null }));
  }, []);

  const clearPreviews = useCallback(() => {
    setPreview({
      accentColor: null,
      backgroundColor: null,
      accentHover: null,
      backgroundHover: null,
    });
  }, []);

  const value = useMemo(
    () => ({
      preview,
      setAccentPreview,
      setBackgroundPreview,
      clearPreviews,
      setAccentHover,
      clearAccentHover,
      setBackgroundHover,
      clearBackgroundHover,
    }),
    [
      preview,
      setAccentPreview,
      setBackgroundPreview,
      clearPreviews,
      setAccentHover,
      clearAccentHover,
      setBackgroundHover,
      clearBackgroundHover,
    ],
  );

  return (
    <AppearancePreviewContext.Provider value={value}>
      {children}
    </AppearancePreviewContext.Provider>
  );
}

export function useAppearancePreview(): AppearancePreviewContextValue {
  const ctx = useContext(AppearancePreviewContext);
  if (!ctx) {
    throw new Error(
      "useAppearancePreview must be used within an AppearancePreviewProvider",
    );
  }
  return ctx;
}
