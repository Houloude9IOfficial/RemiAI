"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Brain, BarChart3, FolderOpen, Pen, Plug, Settings2, User, Wrench, Bot, Eye, Terminal, Gamepad2, ChevronDown, ChevronUp } from "lucide-react";
import { conversationsApi } from "@/lib/api/conversations";
import { ConversationList } from "./ConversationList";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AboutModal } from "./AboutModal";

const primaryLinks = [
  { href: "/settings/customize", label: "Customize", icon: User },
  { href: "/settings/tools", label: "Tools", icon: Wrench },
  { href: "/settings/providers", label: "Models & Providers", icon: Settings2 },
  { href: "/settings/directories", label: "Directories", icon: FolderOpen },
  { href: "/games", label: "Games", icon: Gamepad2 },
];

const extraLinks = [
  { href: "/settings/memories", label: "Memories", icon: Brain },
  { href: "/settings/routines", label: "Routines", icon: Terminal },
  { href: "/settings/mcp", label: "MCP Servers", icon: Plug },
  { href: "/settings/tasks", label: "Agent Tasks", icon: Bot },
  { href: "/settings/watcher", label: "File Watcher", icon: Eye },
  { href: "/settings/usage", label: "Usage", icon: BarChart3 },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const newChatMutation = useMutation({
    mutationFn: () => {
      // Use the last-selected model from localStorage, if any
      const lastModel = globalThis.localStorage?.getItem("lastModel");
      let providerId: number | undefined;
      let modelId: string | undefined;
      if (lastModel) {
        try {
          const parsed = JSON.parse(lastModel);
          if (typeof parsed.providerId === "number") providerId = parsed.providerId;
          if (typeof parsed.modelId === "string") modelId = parsed.modelId;
        } catch {
          // Ignore corrupt localStorage value
        }
      }
      return conversationsApi.create(
        providerId && modelId ? { providerId, modelId } : undefined,
      );
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      // Navigate to the new chat — the ConversationPage will show a
      // skeleton while the data is being fetched (but it's usually instant
      // since the server just created it and it's fresh in cache).
      router.push(`/chat/${conversation.id}`);
    },
    onError: () => {
      // Fallback: create a new chat without provider/model and navigate there
      // The page will gracefully handle the empty state
      conversationsApi.create().then((conversation) => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        router.push(`/chat/${conversation.id}`);
      });
    },
  });

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
    <aside className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="flex items-center justify-between px-3 py-3">
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
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={newChatMutation.isPending}
          onClick={() => newChatMutation.mutate()}
        >
          <Pen className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 text-sm text-muted-foreground">
        <ConversationList />
      </div>

      <nav className="flex flex-col gap-0.5 border-t px-2 py-2">
        {/* Collapse toggle — top of all links */}
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

        {/* Primary links — always visible */}
        {primaryLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-150",
              pathname.startsWith(href) && "bg-muted text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}

        {/* Extra links — collapsible */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-500 ease-in-out",
            extraExpanded
              ? "max-h-56 opacity-100 translate-y-0"
              : "max-h-0 opacity-0 -translate-y-1",
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
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <AboutModal />
          <ThemeToggle />
        </div>
      </nav>
    </aside>
  );
}
