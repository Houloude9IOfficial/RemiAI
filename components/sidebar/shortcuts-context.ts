"use client";

import { createContext, useContext } from "react";

interface ShortcutsContextValue {
  isShortcutsOpen: boolean;
  openShortcuts: () => void;
  closeShortcuts: () => void;
}

export const ShortcutsContext = createContext<ShortcutsContextValue | null>(
  null,
);

export function useShortcuts(): ShortcutsContextValue {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) {
    throw new Error("useShortcuts must be used within a ShortcutsProvider");
  }
  return ctx;
}
