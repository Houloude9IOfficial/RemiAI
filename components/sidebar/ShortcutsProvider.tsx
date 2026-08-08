"use client";

import { useCallback, useEffect, useState } from "react";
import { useSidebar } from "./SidebarContext";
import { useNewChat } from "@/lib/hooks/use-new-chat";
import { focusChatInput } from "@/lib/chat-input-registry";
import { ShortcutsContext } from "./shortcuts-context";
import { ShortcutsDialog } from "./ShortcutsModal";

const DESKTOP_MEDIA = "(min-width: 768px)";

/**
 * Global keyboard shortcuts provider.
 *
 *   /            →  focus the chat input (unless already typing elsewhere
 *                   or a dialog is open)
 *   ⌘/Ctrl + O  →  new chat (⌘/Ctrl+N is reserved by browsers and can't be
 *                  intercepted reliably, so we use O instead)
 *   ⌘/Ctrl + S  →  toggle sidebar (collapses/expands on desktop,
 *                  opens/closes the drawer on mobile)
 *   ⌘/Ctrl + /  →  show the keyboard shortcuts dialog
 *
 * The three modifier combos never collide with normal typing — they run even
 * while the chat input is focused. The bare "/" is ignored while the user is
 * typing in any editable field so it still works as a literal character.
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
      // "/" (no modifiers) → focus the chat input. Skip when the user is
      // already typing in an editable field (input, textarea, select,
      // contenteditable) or when a dialog is open.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === "/") {
        if (e.repeat) return;
        const target = e.target as HTMLElement | null;
        const isEditable = !!target &&
          (target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target.isContentEditable);
        const dialogOpen =
          document.querySelector('[role="dialog"]') !== null;
        if (!isEditable && !dialogOpen) {
          e.preventDefault();
          focusChatInput();
          return;
        }
      }

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
