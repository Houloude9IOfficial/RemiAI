"use client";

import { useCallback, useEffect, useState } from "react";
import { useSidebar } from "./SidebarContext";
import { useNewChat } from "@/lib/hooks/use-new-chat";
import { ShortcutsContext } from "./shortcuts-context";
import { ShortcutsDialog } from "./ShortcutsModal";

const DESKTOP_MEDIA = "(min-width: 768px)";

/**
 * Global keyboard shortcuts provider.
 *
 *   ⌘/Ctrl + O  →  new chat (⌘/Ctrl+N is reserved by browsers and can't be
 *                  intercepted reliably, so we use O instead)
 *   ⌘/Ctrl + S  →  toggle sidebar (collapses/expands on desktop,
 *                  opens/closes the drawer on mobile)
 *   ⌘/Ctrl + /  →  show the keyboard shortcuts dialog
 *
 * All three combos carry a modifier key, so they never collide with normal
 * typing — the handlers run even while the chat input is focused.
 */
export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const { toggleDesktopSidebar, toggleMobileSidebar } = useSidebar();
  const newChat = useNewChat();
  // `mutate` is memoized by TanStack Query (stable), so aliasing it lets the
  // listener below be registered exactly once.
  const createNewChat = newChat.mutate;

  const openShortcuts = useCallback(() => setIsShortcutsOpen(true), []);
  const closeShortcuts = useCallback(() => setIsShortcutsOpen(false), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Ignore auto-repeat so holding ⌘/Ctrl+N can't spawn a burst of chats
      if (e.repeat) return;

      const key = e.key.toLowerCase();

      if (key === "o") {
        // Prevent the browser's "open file" default where possible
        e.preventDefault();
        createNewChat();
      } else if (key === "s") {
        // Prevent the browser's "save page" default
        e.preventDefault();
        const isDesktop =
          typeof window !== "undefined" &&
          window.matchMedia(DESKTOP_MEDIA).matches;
        if (isDesktop) {
          toggleDesktopSidebar();
        } else {
          toggleMobileSidebar();
        }
      } else if (key === "/" || key === "?") {
        e.preventDefault();
        setIsShortcutsOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createNewChat, toggleDesktopSidebar, toggleMobileSidebar]);

  return (
    <ShortcutsContext.Provider
      value={{
        isShortcutsOpen,
        openShortcuts,
        closeShortcuts,
      }}
    >
      {children}
      <ShortcutsDialog />
    </ShortcutsContext.Provider>
  );
}
