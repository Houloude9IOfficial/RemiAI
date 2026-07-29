"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useSidebar } from "@/components/sidebar/SidebarContext";

/**
 * Global mobile page header with hamburger toggle.
 * Shows on all pages on mobile (< md breakpoint).
 * Hidden on the chat page because MobileChatHeader handles it there.
 */
export function GlobalMobileHeader() {
  const pathname = usePathname();
  const { toggleMobileSidebar, isMobileSidebarOpen } = useSidebar();

  // On the chat page, the MobileChatHeader handles navigation
  if (pathname.startsWith("/chat/")) {
    return null;
  }

  // Only render on mobile
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2.5 bg-background/95 backdrop-blur supports-[padding-top:env(safe-area-inset-top)]:pt-[calc(0.625rem+env(safe-area-inset-top))] md:hidden">
      <button
        type="button"
        onClick={toggleMobileSidebar}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all duration-150"
        aria-label={isMobileSidebarOpen ? "Close menu" : "Open menu"}
      >
        <Menu className="h-5 w-5" />
      </button>

      <span className="flex-1 truncate text-sm font-medium text-foreground">
        RemiAI
      </span>

      <div className="shrink-0" />
    </div>
  );
}
