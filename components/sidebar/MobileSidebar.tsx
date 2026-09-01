"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Brain,
  BarChart3,
  Files,
  FolderOpen,
  Pen,
  Plug,
  Settings2,
  User,
  Wrench,
  Bot,
  Eye,
  Terminal,
  Gamepad2,
  Clock,
  ChevronDown,
  ChevronUp,
  Shield,
  Radio,
  Webhook,
  X,
  Sparkles,
  Timer,
} from "lucide-react";
import { useNewChat } from "@/lib/hooks/use-new-chat";
import { ConversationList } from "./ConversationList";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AboutModal } from "./AboutModal";
import { UpdateChecker } from "./UpdateChecker";
import { ShortcutsTrigger } from "./ShortcutsModal";
import { SidebarProfile } from "./SidebarProfile";
import { useSidebar } from "./SidebarContext";
import { PullToRefresh } from "@/components/PullToRefresh";

const primaryLinks = [
  { href: "/talk", label: "Talk", icon: Radio },
  { href: "/files", label: "Files", icon: Files },
  { href: "/settings/providers", label: "Models & Providers", icon: Settings2 },
  { href: "/settings/directories", label: "Directories", icon: FolderOpen },
  { href: "/games", label: "Games", icon: Gamepad2 },
];

const extraLinks = [
  { href: "/settings/tools", label: "Tools", icon: Wrench },
  { href: "/settings/memories", label: "Memories", icon: Brain },
  { href: "/settings/routines", label: "Routines", icon: Terminal },
  { href: "/settings/mcp", label: "MCP Servers", icon: Plug },
  { href: "/settings/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/settings/tasks", label: "Agent Tasks", icon: Bot },
  { href: "/settings/scheduled-tasks", label: "Scheduled Tasks", icon: Clock },
  { href: "/settings/watcher", label: "File Watcher", icon: Eye },
  { href: "/settings/backup", label: "Backup", icon: Shield },
  { href: "/settings/skills", label: "Skills", icon: Sparkles },
  { href: "/settings/usage", label: "Usage", icon: BarChart3 },
  { href: "/settings/profile", label: "Profile", icon: User },
];

export function MobileSidebar() {
  const { isMobileSidebarOpen: isOpen, closeMobileSidebar: onClose } = useSidebar();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);

  const newChatMutation = useNewChat(onClose);
  // Dedicated instance for the "Temporary chat" button (creates temp chats).
  const temporaryChatMutation = useNewChat(onClose, { temporary: true });

  const [extraExpanded, setExtraExpanded] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" }).then((response) => response.json()).then((data) => setDemo(data.demo === true)).catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebarExtraExpanded");
      if (stored === "true") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted UI state after mount to avoid SSR mismatch
        setExtraExpanded(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sidebarExtraExpanded", String(extraExpanded));
    } catch {
      // ignore
    }
  }, [extraExpanded]);

  // Close on route change
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKey);
      // Prevent body scroll
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-all duration-300 md:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-sidebar-border surface-1 overflow-hidden transition-transform duration-300 ease-out md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-3">
          <button
            type="button"
            onClick={() => newChatMutation.mutate()}
            disabled={newChatMutation.isPending}
            className="flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            title="New chat"
          >
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
            <span className="text-sm font-semibold text-foreground">RemiAI</span>
          </button>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 cursor-pointer"
              disabled={newChatMutation.isPending}
              onClick={() => newChatMutation.mutate()}
            >
              <Pen className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 cursor-pointer"
              disabled={temporaryChatMutation.isPending}
              onClick={() => temporaryChatMutation.mutate()}
              title="Temporary chat"
              aria-label="Temporary chat"
            >
              <Timer className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content: conversations + navigation */}
        <div className="flex min-h-0 flex-1 flex-col">
          <PullToRefresh
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["conversations"] })}
            className="min-h-0 flex-1 px-2 py-2 text-sm text-sidebar-foreground/80"
          >
            <ConversationList />
          </PullToRefresh>

          {/* Navigation links */}
          <nav className="flex shrink-0 flex-col gap-0.5 border-t border-sidebar-border px-2 pt-3">
            {/* Primary links */}
            {primaryLinks.filter(({ href }) => !demo && href !== "/files").slice(0, 3).map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.25 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors duration-150",
                  pathname.startsWith(href) && "bg-sidebar-accent text-sidebar-foreground ring-1 ring-sidebar-border",
                )}
                onClick={onClose}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}

            {!demo && <>
            {/* Collapse toggle */}
            <button
              type="button"
              onClick={() => setExtraExpanded((v) => !v)}
              aria-expanded={extraExpanded}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150",
                extraExpanded && "text-sidebar-foreground/80",
              )}
            >
              <ChevronUp
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-500",
                  extraExpanded && "rotate-180",
                )}
              />
              <span>{extraExpanded ? "Less" : `More (${extraLinks.length})`}</span>
            </button>

            {/* Extra links */}
            <div
              className={cn(
                "overflow-hidden transition-all duration-150 ease-in-out",
                extraExpanded ? "max-h-150 opacity-100" : "max-h-0 opacity-100",
              )}
            >
              <div className="flex flex-col gap-0.5 pt-0.5">
                {extraLinks.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.25 text-sm text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors duration-150",
                      pathname.startsWith(href) && "bg-sidebar-accent text-sidebar-foreground ring-1 ring-sidebar-border",
                    )}
                    onClick={onClose}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            </>}

            {/* Profile */}
            <div className="mt-2 border-t border-sidebar-border pt-2">
              <SidebarProfile />
            </div>

            <div className="mt-1 flex items-center justify-between px-2 py-1.5">
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
