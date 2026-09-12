"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

interface SidebarContextValue {
  isMobileSidebarOpen: boolean;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleMobileSidebar: () => void;
  isDesktopSidebarCollapsed: boolean;
  setDesktopSidebarCollapsed: (collapsed: boolean) => void;
  toggleDesktopSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const hydratedRef = useRef(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const setDesktopSidebarCollapsed = useCallback((collapsed: boolean) => {
    setIsDesktopCollapsed(collapsed);
  }, []);
  const toggleDesktopSidebar = useCallback(
    () => setIsDesktopCollapsed((v) => !v),
    [],
  );

  useEffect(() => {
    try {
      queueMicrotask(() => {
        try {
          const stored = localStorage.getItem("desktopSidebarCollapsed");
          hydratedRef.current = true;
          if (stored === "true") setIsDesktopCollapsed(true);
        } catch {
          // localStorage unavailable
        }
      });
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(
        "desktopSidebarCollapsed",
        String(isDesktopCollapsed),
      );
    } catch {
      // localStorage unavailable
    }
  }, [isDesktopCollapsed]);

  return (
    <SidebarContext.Provider
      value={{
        isMobileSidebarOpen: isOpen,
        openMobileSidebar: open,
        closeMobileSidebar: close,
        toggleMobileSidebar: toggle,
        isDesktopSidebarCollapsed: isDesktopCollapsed,
        setDesktopSidebarCollapsed,
        toggleDesktopSidebar,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}
