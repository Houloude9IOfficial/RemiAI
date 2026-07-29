"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Brain,
  BarChart3,
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
  X,
} from "lucide-react";
import { conversationsApi } from "@/lib/api/conversations";
import { ConversationList } from "./ConversationList";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AboutModal } from "./AboutModal";
import { SidebarProfile } from "./SidebarProfile";
import { useSidebar } from "./SidebarContext";
import { PullToRefresh } from "@/components/PullToRefresh";

const primaryLinks = [
  { href: "/talk", label: "Talk", icon: Radio },
  { href: "/settings/providers", label: "Models & Providers", icon: Settings2 },
  { href: "/settings/directories", label: "Directories", icon: FolderOpen },
  { href: "/games", label: "Games", icon: Gamepad2 },
];

const extraLinks = [
  { href: "/settings/tools", label: "Tools", icon: Wrench },
  { href: "/settings/memories", label: "Memories", icon: Brain },
  { href: "/settings/routines", label: "Routines", icon: Terminal },
  { href: "/settings/mcp", label: "MCP Servers", icon: Plug },
  { href: "/settings/tasks", label: "Agent Tasks", icon: Bot },
  { href: "/settings/scheduled-tasks", label: "Scheduled Tasks", icon: Clock },
  { href: "/settings/watcher", label: "File Watcher", icon: Eye },
  { href: "/settings/backup", label: "Backup", icon: Shield },
  { href: "/settings/usage", label: "Usage", icon: BarChart3 },
  { href: "/settings/profile", label: "Profile", icon: User },
];

export function MobileSidebar() {
  const { isMobileSidebarOpen: isOpen, closeMobileSidebar: onClose } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);

  const newChatMutation = useMutation({
    mutationFn: () => {
      const lastModel = globalThis.localStorage?.getItem("lastModel");
      let providerId: number | undefined;
      let modelId: string | undefined;
      if (lastModel) {
        try {
          const parsed = JSON.parse(lastModel);
          if (typeof parsed.providerId === "number") providerId = parsed.providerId;
          if (typeof parsed.modelId === "string") modelId = parsed.modelId;
        } catch {
          // Ignore
        }
      }
      return conversationsApi.create(
        providerId && modelId ? { providerId, modelId } : undefined,
      );
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push(`/chat/${conversation.id}`);
      onClose();
    },
    onError: () => {
      conversationsApi.create().then((conversation) => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        router.push(`/chat/${conversation.id}`);
        onClose();
      });
    },
  });

  const [extraExpanded, setExtraExpanded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebarExtraExpanded");
      if (stored === "true") setExtraExpanded(true);
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
          "fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-background border-r overflow-hidden transition-transform duration-300 ease-out md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b">
          <button
            type="button"
            onClick={() => newChatMutation.mutate()}
            disabled={newChatMutation.isPending}
            className="flex items-center gap-2 disabled:opacity-50"
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
              className="h-7 w-7"
              disabled={newChatMutation.isPending}
              onClick={() => newChatMutation.mutate()}
            >
              <Pen className="h-4 w-4" />
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
        <PullToRefresh
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["conversations"] })}
          className="flex-1 px-2 py-2 text-sm text-muted-foreground"
        >
          <ConversationList />

          {/* Navigation links */}
          <nav className="flex flex-col gap-0.5 border-t mt-4 pt-3">
            {/* Primary links */}
            {primaryLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150",
                  pathname.startsWith(href) && "bg-muted text-foreground",
                )}
                onClick={onClose}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}

            {/* Collapse toggle */}
            <button
              type="button"
              onClick={() => setExtraExpanded((v) => !v)}
              aria-expanded={extraExpanded}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors duration-150",
                extraExpanded && "text-muted-foreground",
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
                extraExpanded ? "max-h-600 opacity-100" : "max-h-0 opacity-100",
              )}
            >
              <div className="flex flex-col gap-0.5 pt-0.5">
                {extraLinks.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150",
                      pathname.startsWith(href) && "bg-muted text-foreground",
                    )}
                    onClick={onClose}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Profile */}
            <div className="mt-1 border-t pt-1.5">
              <SidebarProfile />
            </div>

            <div className="flex items-center justify-between px-1 py-1">
              <AboutModal />
              <ThemeToggle />
            </div>
          </nav>
        </PullToRefresh>
      </div>
    </>
  );
}
