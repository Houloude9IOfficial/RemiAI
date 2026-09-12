"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, MessageSquarePlus, Moon, PanelLeft, Search, Settings2, Sparkles, Sun, Wrench, X } from "lucide-react";
import { conversationsApi } from "@/lib/api/conversations";
import { focusChatInput } from "@/lib/chat-input-registry";
import { useNewChat } from "@/lib/hooks/use-new-chat";
import { useSidebar } from "./SidebarContext";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

type PaletteItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  run: () => void;
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toggleDesktopSidebar } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const newChat = useNewChat(onClose);
  const temporaryChat = useNewChat(onClose, { temporary: true });
  const { data: conversations = [] } = useQuery({ queryKey: ["conversations"], queryFn: conversationsApi.list, enabled: open });

  const commands = useMemo<PaletteItem[]>(() => [
    { label: "New chat", icon: MessageSquarePlus, shortcut: "⌘ O", run: () => newChat.mutate() },
    { label: "Search conversations", icon: Search, shortcut: "/", run: () => { onClose(); focusChatInput(); } },
    { label: "Focus chat input", icon: ArrowRight, shortcut: "/", run: () => { onClose(); focusChatInput(); } },
    { label: "Toggle sidebar", icon: PanelLeft, shortcut: "⌘ S", run: () => { toggleDesktopSidebar(); onClose(); } },
    { label: "Open Files", icon: FileText, run: () => { router.push("/files"); onClose(); } },
    { label: "Open Models", icon: Settings2, run: () => { router.push("/settings/providers"); onClose(); } },
    { label: "Open Memories", icon: Sparkles, run: () => { router.push("/settings/memories"); onClose(); } },
    { label: "Open Tools", icon: Wrench, run: () => { router.push("/settings/tools"); onClose(); } },
    { label: "Open Settings", icon: Settings2, run: () => { router.push("/settings/profile"); onClose(); } },
    { label: theme === "dark" ? "Use light theme" : "Use dark theme", icon: theme === "dark" ? Sun : Moon, run: () => { setTheme(theme === "dark" ? "light" : "dark"); onClose(); } },
    { label: "Start temporary chat", icon: MessageSquarePlus, run: () => temporaryChat.mutate() },
  ], [newChat, onClose, router, theme, setTheme, temporaryChat, toggleDesktopSidebar]);

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = commands.filter((item) => !normalized || item.label.toLowerCase().includes(normalized));
    const chats: PaletteItem[] = conversations.filter((conversation) => !normalized || conversation.title.toLowerCase().includes(normalized)).slice(0, 5).map((conversation) => ({
      label: conversation.title,
      icon: MessageSquarePlus,
      run: () => { router.push(`/chat/${conversation.id}`); onClose(); },
    }));
    return [...filtered, ...chats];
  }, [commands, conversations, onClose, query, router]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, Math.max(items.length - 1, 0))); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
      if (event.key === "Enter") { event.preventDefault(); items[active]?.run(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, items, onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/10 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-lg overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-floating">
        <div className="flex items-center gap-2 border-b border-border/45 px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} placeholder="Search commands and conversations" className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
          <button type="button" onClick={onClose} aria-label="Close command palette" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {items.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matching commands or conversations.</p> : items.map((item, index) => {
            const Icon = item.icon;
            return <button key={`${item.label}-${index}`} type="button" onClick={item.run} onMouseEnter={() => setActive(index)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm", index === active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{item.label}</span>{"shortcut" in item && item.shortcut && <kbd className="text-[11px] text-muted-foreground">{item.shortcut}</kbd>}</button>;
          })}
        </div>
      </div>
    </div>
  );
}
