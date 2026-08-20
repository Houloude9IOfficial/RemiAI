"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Brain, BarChart3, Files, FolderOpen, Pen, Plug, Settings2, Wrench, Bot, Eye, Terminal, Gamepad2, Clock, ChevronUp, Shield, Radio, Webhook, PanelLeftClose, PanelLeftOpen, Plus, Sparkles } from "lucide-react";
import { useNewChat } from "@/lib/hooks/use-new-chat";
import { ConversationList } from "./ConversationList";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SidebarProfile } from "./SidebarProfile";
import { AboutModal } from "./AboutModal";
import { UpdateChecker } from "./UpdateChecker";
import { ShortcutsTrigger } from "./ShortcutsModal";
import { useSidebar } from "./SidebarContext";

// Condensed top-level navigation. Secondary/admin destinations (models &
// providers, games, talk, routines, MCP, webhooks, scheduled tasks, file
// watcher, backup, usage) live under the "More" expander — every item stays
// reachable in at most two clicks.
const primaryLinks = [
  { href: "/settings/providers", label: "Models & Providers", icon: Settings2 },
  { href: "/files", label: "Files", icon: Files },
  { href: "/settings/tools", label: "Tools", icon: Wrench },
  { href: "/settings/memories", label: "Memories", icon: Brain },
];

const moreLinks = [
  { href: "/settings/tasks", label: "Agent Tasks", icon: Bot },
  { href: "/settings/directories", label: "Directories", icon: FolderOpen },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/talk", label: "Talk", icon: Radio },
  { href: "/settings/routines", label: "Routines", icon: Terminal },
  { href: "/settings/skills", label: "Skills", icon: Sparkles },
  { href: "/settings/mcp", label: "MCP Servers", icon: Plug },
  { href: "/settings/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/settings/scheduled-tasks", label: "Scheduled Tasks", icon: Clock },
  { href: "/settings/watcher", label: "File Watcher", icon: Eye },
  { href: "/settings/backup", label: "Backup", icon: Shield },
  { href: "/settings/usage", label: "Usage", icon: BarChart3 },
];

export function AppSidebar() {
  // Hide on mobile — MobileSidebar takes over
  return <DesktopSidebar />;
}

function DesktopSidebar() {
  const pathname = usePathname();
  const { isDesktopSidebarCollapsed, toggleDesktopSidebar } = useSidebar();

  const newChatMutation = useNewChat();

  const [extraExpanded, setExtraExpanded] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebarExtraExpanded");
      if (stored === "true") {
        setExtraExpanded(true);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem("sidebarExtraExpanded", String(extraExpanded));
    } catch {
      // localStorage unavailable
    }
  }, [extraExpanded]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: isDesktopSidebarCollapsed ? 60 : 272 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="hidden md:flex h-full shrink-0 flex-col border-r border-sidebar-border surface-1"
    >
      <div
        className={cn(
          "flex items-center py-3",
          isDesktopSidebarCollapsed ? "justify-center px-2" : "justify-between px-3",
        )}
      >
        <button
          type="button"
          onClick={() => newChatMutation.mutate()}
          disabled={newChatMutation.isPending}
          className={cn(
            "flex items-center rounded-lg disabled:opacity-50 transition-colors cursor-pointer",
            isDesktopSidebarCollapsed
              ? ""
              : "gap-2 px-1.5 py-1 hover:bg-sidebar-accent",
          )}
          title="New chat"
          aria-label="New chat"
        >
          {isDesktopSidebarCollapsed ? (
            <></>
          ) : (
            <>
              <img
                src="/RemiAI.png"
                alt="RemiAI"
                className="block h-7 w-auto dark:hidden"
              />
              <img
                src="/RemiAI-Light.png"
                alt="RemiAI"
                className="hidden h-7 w-auto dark:block"
              />
            </>
          )}
        </button>

        {isDesktopSidebarCollapsed ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 cursor-pointer"
            onClick={toggleDesktopSidebar}
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex items-center gap-1">
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
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 cursor-pointer"
              onClick={toggleDesktopSidebar}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isDesktopSidebarCollapsed ? (
        <div className="flex flex-1 flex-col items-center gap-1.5 px-1.5 pt-2 pb-2">
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
          {primaryLinks.slice(0, 4).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                pathname.startsWith(href) && "bg-sidebar-accent text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </Link>
          ))}

          <div className="mt-auto flex flex-col items-center gap-2 border-t border-sidebar-border pt-3">
            <UpdateChecker />
            <SidebarProfile collapsed />
            {/* <ThemeToggle /> */}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-2 pb-1 text-sm text-sidebar-foreground/80 custom-scrollbar">
            <ConversationList />
          </div>

          <nav className="flex flex-col gap-0.5 border-t border-sidebar-border px-2 py-2.5">

            {/* More — expands secondary/admin links */}
            <button
              type="button"
              onClick={() => setExtraExpanded((v) => !v)}
              aria-expanded={extraExpanded}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.25 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150",
                extraExpanded && "text-sidebar-foreground/80",
              )}
            >
              <ChevronUp
                className={cn(
                  "h-4 w-4 transition-transform duration-500",
                  extraExpanded && "rotate-180",
                )}
              />
              <span>{extraExpanded ? "Less" : `More (${moreLinks.length})`}</span>
            </button>

            {/* Primary links — always visible */}
            {primaryLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.25 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors duration-150",
                  pathname.startsWith(href) && "bg-sidebar-accent text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}

            {/* More links — collapsible */}
            <div
              className={cn(
                "overflow-hidden transition-all duration-150 ease-in-out",
                extraExpanded
                  ? "max-h-150 opacity-100"
                  : "max-h-0 opacity-100",
              )}
            >
              <div className="flex flex-col gap-0.5 pt-0.5">
                {moreLinks.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.25 text-sm text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors duration-150",
                      pathname.startsWith(href) && "bg-sidebar-accent text-sidebar-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Profile badge */}
            <div className="mt-2 border-t border-sidebar-border pt-2">
              <SidebarProfile />
            </div>
            <div className="mt-1 flex items-center justify-between px-2.5 py-1.5">
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
