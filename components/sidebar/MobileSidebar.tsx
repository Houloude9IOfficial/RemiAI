"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Pen, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useNewChat } from "@/lib/hooks/use-new-chat";
import { ConversationList } from "./ConversationList";
import { ProjectsSection } from "./ProjectsSection";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AboutModal } from "./AboutModal";
import { UpdateChecker } from "./UpdateChecker";
import { ShortcutsTrigger } from "./ShortcutsModal";
import { SidebarProfile } from "./SidebarProfile";
import { SidebarExploreMenu, SidebarSearchButton } from "./SidebarExploreMenu";
import { useSidebar } from "./SidebarContext";
import { PullToRefresh } from "@/components/PullToRefresh";

export function MobileSidebar() {
  const { isMobileSidebarOpen: isOpen, closeMobileSidebar: onClose } = useSidebar();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);
  const newChatMutation = useNewChat(onClose);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setDemo(data.demo === true))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  return (
    <>
      <div
        ref={overlayRef}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-all duration-300 md:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={cn(
          "surface-1 fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden border-r border-sidebar-border transition-transform duration-300 ease-out md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <div aria-label="RemiAI">
            <img src="/RemiAI.png" alt="RemiAI" className="block h-6 w-auto dark:hidden" />
            <img src="/RemiAI-Light.png" alt="RemiAI" className="hidden h-6 w-auto dark:block" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1 px-3 pb-2">
          <Button
            type="button"
            onClick={() => newChatMutation.mutate()}
            disabled={newChatMutation.isPending}
            className="h-auto min-h-9 w-full justify-start gap-2 rounded-xl bg-sidebar-accent/55 px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Pen className="h-4 w-4" />
            New chat
          </Button>
          <SidebarExploreMenu onNavigate={onClose} />
          <SidebarSearchButton onOpen={onClose} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <PullToRefresh
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["sidebar-conversations"] })}
            className="min-h-0 flex-1 overflow-x-hidden px-2 py-1 text-sm text-sidebar-foreground/80"
          >
            <ProjectsSection />
            <ConversationList />
          </PullToRefresh>

          <nav className="flex shrink-0 flex-col gap-1 border-t border-sidebar-border px-3 py-2">
            {!demo && (
              <Link
                href="/settings/profile"
                onClick={onClose}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/72 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <Settings2 className="h-4 w-4" />
                Settings
              </Link>
            )}
            <div className="mt-1 border-t border-sidebar-border pt-2">
              <SidebarProfile />
            </div>
            <div className="flex items-center justify-between px-1 py-0.5">
              <div className="flex items-center gap-0.5">
                <ShortcutsTrigger className="h-7 w-7" />
                <AboutModal />
                <UpdateChecker className="h-7 w-7" />
              </div>
              <ThemeToggle />
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
