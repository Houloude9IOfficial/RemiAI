"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Brain, BarChart3, FolderOpen, Pen, Plug, Settings2, User, Wrench, Bot, Eye } from "lucide-react";
import { conversationsApi } from "@/lib/api/conversations";
import { ConversationList } from "./ConversationList";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AboutModal } from "./AboutModal";

const settingsLinks = [
  { href: "/settings/customize", label: "Customize", icon: User },
  { href: "/settings/tools", label: "Tools", icon: Wrench },
  { href: "/settings/memories", label: "Memories", icon: Brain },
  { href: "/settings/directories", label: "Directories", icon: FolderOpen },
  { href: "/settings/providers", label: "Models & Providers", icon: Settings2 },
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
      router.push(`/chat/${conversation.id}`);
    },
  });

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
        {/* <div className="px-2 py-1 text-xs uppercase tracking-wide">Chats</div> */}
        <ConversationList />
      </div>

      <nav className="flex flex-col gap-0.5 border-t px-2 py-2">
        {settingsLinks.map(({ href, label, icon: Icon }) => (
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
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <AboutModal />
          <ThemeToggle />
        </div>
      </nav>
    </aside>
  );
}
