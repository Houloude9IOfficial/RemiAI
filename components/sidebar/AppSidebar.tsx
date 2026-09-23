"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Folder, PanelLeftClose, PanelLeftOpen, Pen, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useNewChat } from "@/lib/hooks/use-new-chat";
import { ConversationList } from "./ConversationList";
import { ProjectsSection } from "./ProjectsSection";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SidebarProfile } from "./SidebarProfile";
import { AboutModal } from "./AboutModal";
import { UpdateChecker } from "./UpdateChecker";
import { ShortcutsTrigger } from "./ShortcutsModal";
import { SidebarExploreMenu, SidebarSearchButton } from "./SidebarExploreMenu";
import { useSidebar } from "./SidebarContext";

export function AppSidebar() {
  return <DesktopSidebar />;
}

function SettingsLink({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/settings/profile"
      title="Settings"
      aria-label="Settings"
      className={cn(
        "flex items-center rounded-lg text-sidebar-foreground/72 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
        collapsed ? "h-8 w-8 justify-center" : "gap-2 px-2.5 py-2 text-sm",
      )}
    >
      <Settings2 className="h-4 w-4 shrink-0" />
      {!collapsed && "Settings"}
    </Link>
  );
}

function DesktopSidebar() {
  const { isDesktopSidebarCollapsed, toggleDesktopSidebar } = useSidebar();
  const newChatMutation = useNewChat();
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setDemo(data.demo === true))
      .catch(() => undefined);
  }, []);

  return (
    <motion.aside
      initial={false}
      animate={{ width: isDesktopSidebarCollapsed ? 56 : 248 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="hidden h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border surface-1 md:flex"
    >
      <div className={cn("flex items-center py-2.5", isDesktopSidebarCollapsed ? "justify-center px-2" : "justify-between px-3")}>
        {!isDesktopSidebarCollapsed && (
          <div className="px-1" aria-label="RemiAI">
            <img src="/RemiAI.png" alt="RemiAI" className="block h-6 w-auto dark:hidden" />
            <img src="/RemiAI-Light.png" alt="RemiAI" className="hidden h-6 w-auto dark:block" />
          </div>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 cursor-pointer"
          onClick={toggleDesktopSidebar}
          title={isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isDesktopSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {isDesktopSidebarCollapsed ? (
        <div className="flex flex-1 flex-col items-center gap-1.5 px-2 pt-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 cursor-pointer"
            disabled={newChatMutation.isPending}
            onClick={() => newChatMutation.mutate()}
            title="New chat"
            aria-label="New chat"
          >
            <Pen className="h-4 w-4" />
          </Button>
          <SidebarExploreMenu collapsed />
          <Link href="/projects" title="Projects" aria-label="Projects" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-sidebar-accent"><Folder className="h-4 w-4" /></Link>
          <SidebarSearchButton collapsed />
          {!demo && <SettingsLink collapsed />}
          <div className="mt-auto flex flex-col items-center gap-2 border-t border-sidebar-border pt-3">
            <UpdateChecker />
            <SidebarProfile collapsed />
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-1 px-3 pb-2">
            <button
              type="button"
              onClick={() => newChatMutation.mutate()}
              disabled={newChatMutation.isPending}
              className="group flex w-full cursor-pointer items-center gap-2 rounded-xl bg-sidebar-accent/55 px-3 py-2 text-left text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent disabled:pointer-events-none disabled:opacity-50"
            >
              <Pen className="new-chat-icon h-4 w-4" />
              <span>New chat</span>
            </button>
            <SidebarExploreMenu />
            <SidebarSearchButton />
          </div>

          <div className="custom-scrollbar flex-1 overflow-x-hidden overflow-y-auto px-2 pb-1 text-sm text-sidebar-foreground/80">
            <ProjectsSection />
            <ConversationList />
          </div>

          <nav className="flex flex-col gap-1 border-t border-sidebar-border px-3 py-2">
            {!demo && <SettingsLink />}
            <div className="mt-1 border-t border-sidebar-border pt-2">
              <SidebarProfile />
            </div>
            <div className="flex items-center justify-between px-1 py-0.5">
              <div className="flex items-center gap-0.5">
                <AboutModal />
                <ShortcutsTrigger className="h-7 w-7" />
                <UpdateChecker />
              </div>
              <ThemeToggle />
            </div>
          </nav>
        </>
      )}
    </motion.aside>
  );
}
