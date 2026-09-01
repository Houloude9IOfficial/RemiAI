"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cable,
  ChevronLeft,
  FileText,
  ChevronRight,
  FolderOpen,
  Globe,
  Hammer,
  ListChecks,
  Loader2,
  MessageSquare,
  Plug,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mcpServersApi, type McpServer } from "@/lib/api/mcp-servers";
import { toolsApi } from "@/lib/api/tools";
import type { ChatMode } from "./ChatInput";

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/**
 * The slash menu walks through levels: `/command` → pick a server → pick a
 * tool (or "all"). The command word stays in the composer until the final
 * marker is inserted, so cancelling never leaves half-typed text behind.
 */
export type SlashLevel =
  | { kind: "command" }
  | { kind: "mcp-servers" }
  | { kind: "mcp-tools"; server: McpServer }
  | { kind: "tools" };

export interface SlashCommandMenuProps {
  open: boolean;
  level: SlashLevel | null;
  /** Live filter text — what the user has typed after the command word. */
  query: string;
  /** True when attached to the large first-message composer — its focused
      border is primary-tinted, so the popup should match. */
  large?: boolean;
  /** Close the whole menu (no text change). */
  onClose: () => void;
  /** Move to another level (server → tools, tools → back, etc.). */
  onNavigate: (level: SlashLevel) => void;
  /** Insert a final marker, replacing the typed `/command …` text. */
  onInsert: (text: string) => void;
  /** Open the file picker (the `/file` command). */
  onFile: () => void;
  /** Switch the conversation mode (the `/plan`, `/build`, … commands). */
  onMode: (mode: ChatMode) => void;
}

export interface SlashCommandMenuHandle {
  move: (delta: 1 | -1) => void;
  /** Run the highlighted item (Enter / Tab). No-op when the list is empty. */
  activate: () => void;
  /** Go back a level (Escape) — closes at the top level. */
  back: () => void;
  getItemCount: () => number;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

type CommandId =
  | "mcp"
  | "tool"
  | "file"
  | "canvas"
  | "visual"
  | "document"
  | "browser"
  | "automate"
  | "run"
  | "execute"
  | "code"
  | "schedule"
  | "reminder"
  | "todo"
  | "todos"
  | "routine"
  | "research"
  | "search"
  | "plan"
  | "build"
  | "goal"
  | "chat";

const COMMANDS: Array<{
  id: CommandId;
  trigger: string;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "mcp",
    trigger: "mcp",
    label: "MCP server",
    description: "Tag an MCP server — or one of its specific tools",
    icon: Plug,
  },
  {
    id: "tool",
    trigger: "tool",
    label: "Tool",
    description: "Tag a tool the AI should use for this request",
    icon: Wrench,
  },
  {
    id: "file",
    trigger: "file",
    label: "File reference",
    description: "Tag a file or folder from your directories",
    icon: FolderOpen,
  },
  {
    id: "canvas",
    trigger: "canvas",
    label: "Canvas",
    description: "Build an interactive web project in Canvas",
    icon: Hammer,
  },
  {
    id: "document",
    trigger: "document",
    label: "Document",
    description: "Read and work with a document such as PDF or DOCX",
    icon: FileText,
  },
  {
    id: "visual",
    trigger: "visual",
    label: "Visual",
    description: "Create a chart, graph, diagram, or other visual",
    icon: Sparkles,
  },
  {
    id: "browser",
    trigger: "browser",
    label: "Browser",
    description: "Use browser automation to interact with a website",
    icon: Globe,
  },
  {
    id: "automate",
    trigger: "automate",
    label: "Automate",
    description: "Automate browser or web interactions",
    icon: Globe,
  },
  {
    id: "run",
    trigger: "run",
    label: "Run code",
    description: "Run commands or code in the configured environment",
    icon: Hammer,
  },
  {
    id: "execute",
    trigger: "execute",
    label: "Execute code",
    description: "Execute a script or code snippet",
    icon: Hammer,
  },
  {
    id: "code",
    trigger: "code",
    label: "Code execution",
    description: "Use the code execution tools",
    icon: Wrench,
  },
  {
    id: "schedule",
    trigger: "schedule",
    label: "Schedule",
    description: "Schedule a task or notification",
    icon: ListChecks,
  },
  {
    id: "reminder",
    trigger: "reminder",
    label: "Reminder",
    description: "Set a reminder or scheduled notification",
    icon: ListChecks,
  },
  {
    id: "todo",
    trigger: "todo",
    label: "Todo",
    description: "Create or manage a task list",
    icon: ListChecks,
  },
  {
    id: "todos",
    trigger: "todos",
    label: "Todos",
    description: "Create or manage a task list",
    icon: ListChecks,
  },
  {
    id: "routine",
    trigger: "routine",
    label: "Routine",
    description: "Create or run a reusable routine",
    icon: Sparkles,
  },
  {
    id: "research",
    trigger: "research",
    label: "Research",
    description: "Research a topic using web search",
    icon: Globe,
  },
  {
    id: "search",
    trigger: "search",
    label: "Search",
    description: "Search the web for current information",
    icon: Globe,
  },
  {
    id: "plan",
    trigger: "plan",
    label: "Plan mode",
    description: "Read-only planning — no file writes",
    icon: ListChecks,
  },
  {
    id: "build",
    trigger: "build",
    label: "Build mode",
    description: "Change files and run checks",
    icon: Hammer,
  },
  {
    id: "goal",
    trigger: "goal",
    label: "Goal mode",
    description: "Work autonomously until the goal is complete",
    icon: Sparkles,
  },
  {
    id: "chat",
    trigger: "chat",
    label: "Chat mode",
    description: "Direct answers with minimal overhead",
    icon: MessageSquare,
  },
];

const MODE_BY_COMMAND: Partial<Record<CommandId, ChatMode>> = {
  plan: "plan",
  build: "build",
  goal: "goal",
  chat: "chat",
};

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

type MenuItem =
  | { type: "command"; command: (typeof COMMANDS)[number] }
  | { type: "server"; server: McpServer }
  | { type: "mcp-all"; server: McpServer }
  | { type: "mcp-tool"; server: McpServer; tool: string }
  | { type: "tool"; tool: string; group: string; description: string; enabled: boolean };

interface ListState {
  items: MenuItem[];
  title: string;
  placeholder: string;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SlashCommandMenu = forwardRef<
  SlashCommandMenuHandle,
  SlashCommandMenuProps
>(function SlashCommandMenu(
  { open, level, query, large = false, onClose, onNavigate, onInsert, onFile, onMode },
  ref,
) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset the highlight whenever the list identity or the filter changes
  // (the React-recommended "adjust state during render" pattern).
  const listKey = `${open}-${level?.kind ?? "none"}-${
    level?.kind === "mcp-tools" ? level.server.id : ""
  }-${query}`;
  const [prevListKey, setPrevListKey] = useState(listKey);
  if (listKey !== prevListKey) {
    setPrevListKey(listKey);
    setSelected(0);
  }

  const q = query.toLowerCase().trim();

  // MCP servers — only fetched while a server picker is active.
  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: mcpServersApi.list,
    enabled:
      open &&
      (level?.kind === "mcp-servers" || level?.kind === "mcp-tools"),
  });

  // A server's tools — requires a live connection probe (same endpoint the
  // Settings > MCP page uses to test a server).
  const mcpTest = useQuery({
    queryKey: [
      "mcp-servers",
      level?.kind === "mcp-tools" ? level.server.id : null,
      "tools",
    ],
    queryFn: () =>
      mcpServersApi.test(
        (level as Extract<SlashLevel, { kind: "mcp-tools" }>).server.id,
      ),
    enabled: open && level?.kind === "mcp-tools",
  });

  // Tool catalog — for the `/tool` picker (reuses the composer's cache).
  const { data: catalog = [] } = useQuery({
    queryKey: ["tool-configs"],
    queryFn: toolsApi.list,
    enabled: open && level?.kind === "tools",
  });

  const catalogTools = useMemo(() => {
    const out: {
      tool: string;
      group: string;
      description: string;
      enabled: boolean;
    }[] = [];
    for (const def of catalog) {
      for (const name of def.toolNames) {
        out.push({
          tool: name,
          group: def.name,
          description: def.description,
          enabled: def.config.enabled,
        });
      }
    }
    return out;
  }, [catalog]);

  // -------------------------------------------------------------------------
  // Build the current list
  // -------------------------------------------------------------------------

  const list = useMemo<ListState>(() => {
    if (!level) return { items: [], title: "", placeholder: "" };

    if (level.kind === "command") {
      const items = COMMANDS.filter((c) =>
        c.trigger.includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
      ).map((command) => ({ type: "command" as const, command }));
      return {
        items,
        title: "Commands",
        placeholder: `No command matches “/${query}”`,
      };
    }

    if (level.kind === "mcp-servers") {
      const items = servers
        .filter((s) => !q || s.name.toLowerCase().includes(q))
        .map((server) => ({ type: "server" as const, server }));
      return {
        items,
        title: "Tag an MCP server",
        placeholder: serversLoading
          ? "Loading servers…"
          : servers.length === 0
            ? "No MCP servers configured — add one in Settings > MCP"
            : `No server matches “${query}”`,
        loading: serversLoading,
      };
    }

    if (level.kind === "mcp-tools") {
      const server = level.server;
      const toolNames = mcpTest.data?.ok ? (mcpTest.data.toolNames ?? []) : [];
      const items: MenuItem[] = [
        { type: "mcp-all", server },
        ...toolNames
          .filter((t) => !q || t.toLowerCase().includes(q))
          .map((tool) => ({ type: "mcp-tool" as const, server, tool })),
      ];
      return {
        items,
        title: server.name,
        placeholder: mcpTest.isLoading
          ? "Connecting to server…"
          : !mcpTest.data?.ok
            ? `Couldn't connect: ${mcpTest.data?.error ?? "unknown error"}`
            : toolNames.length === 0
              ? "This server exposes no tools"
              : `No tool matches “${query}”`,
        loading: mcpTest.isLoading,
      };
    }

    // tools — pick a built-in/integration tool to tag
    const items = catalogTools
      .filter(
        (t) =>
          !q ||
          t.tool.toLowerCase().includes(q) ||
          t.group.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      )
      .map((t) => ({
        type: "tool" as const,
        tool: t.tool,
        group: t.group,
        description: t.description,
        enabled: t.enabled,
      }));
    return {
      items,
      title: "Tag a tool to use",
      placeholder: catalogTools.length === 0
        ? "No tools available"
        : `No tool matches “${query}”`,
    };
  }, [level, q, query, servers, serversLoading, mcpTest, catalogTools]);

  const { items, title, placeholder, loading } = list;

  // Keep the highlighted row visible while navigating with the keyboard —
  // arrow keys move the selection, this scrolls the list to follow it.
  // Scrolls only the list container (never the page).
  useEffect(() => {
    if (!open || items.length === 0) return;
    const container = listRef.current;
    const row = container?.children[selected] as HTMLElement | undefined;
    if (!container || !row) return;
    const rowRect = row.getBoundingClientRect();
    const boxRect = container.getBoundingClientRect();
    if (rowRect.top < boxRect.top) {
      container.scrollTop -= boxRect.top - rowRect.top;
    } else if (rowRect.bottom > boxRect.bottom) {
      container.scrollTop += rowRect.bottom - boxRect.bottom;
    }
  }, [open, selected, items.length]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const run = (item: MenuItem) => {
    switch (item.type) {
      case "command":
        if (item.command.id === "file") {
          onFile();
          return;
        }
        if (
          item.command.id === "canvas" ||
          item.command.id === "visual" ||
          item.command.id === "document" ||
          item.command.id === "browser" ||
          item.command.id === "automate" ||
          item.command.id === "run" ||
          item.command.id === "execute" ||
          item.command.id === "code" ||
          item.command.id === "schedule" ||
          item.command.id === "reminder" ||
          item.command.id === "todo" ||
          item.command.id === "todos" ||
          item.command.id === "routine" ||
          item.command.id === "research" ||
          item.command.id === "search"
        ) {
          onInsert(`/${item.command.trigger} `);
          return;
        }
        const mode = MODE_BY_COMMAND[item.command.id];
        if (mode) {
          onMode(mode);
          return;
        }
        onNavigate(
          item.command.id === "mcp"
            ? { kind: "mcp-servers" }
            : { kind: "tools" },
        );
        return;
      case "server":
        onNavigate({ kind: "mcp-tools", server: item.server });
        return;
      case "mcp-all":
        onInsert(`@mcp ${item.server.name} `);
        return;
      case "mcp-tool":
        onInsert(`@mcp ${item.server.name} ${item.tool} `);
        return;
      case "tool":
        onInsert(`@tool ${item.tool} `);
        return;
    }
  };

  const back = () => {
    if (!level || level.kind === "command") {
      onClose();
      return;
    }
    if (level.kind === "mcp-tools") {
      onNavigate({ kind: "mcp-servers" });
      return;
    }
    onNavigate({ kind: "command" });
  };

  // Keep the latest values reachable from the imperative handle. Synced in an
  // effect (not during render) so the keydown handlers always see fresh data.
  const itemsRef = useRef(items);
  const selectedRef = useRef(selected);
  const runRef = useRef(run);
  const backRef = useRef(back);
  useEffect(() => {
    itemsRef.current = items;
    selectedRef.current = selected;
    runRef.current = run;
    backRef.current = back;
  });

  useImperativeHandle(ref, () => ({
    move: (delta) => {
      const len = itemsRef.current.length;
      if (len === 0) return;
      setSelected((s) => (s + delta + len) % len);
    },
    activate: () => {
      const item = itemsRef.current[selectedRef.current];
      if (item) runRef.current(item);
    },
    back: () => backRef.current(),
    getItemCount: () => itemsRef.current.length,
  }));

  const isSubLevel = level !== null && level.kind !== "command";

  return (
    <AnimatePresence>
      {open && level !== null && (
        // -left/-right-px pushes the popup out over the composer's 1px side
        // borders so the two sheets share the exact same width and their
        // border lines run continuously into each other.
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.99 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className={cn(
            "absolute -left-px -right-px bottom-full z-50 overflow-hidden rounded-t-3xl border border-b-0 bg-surface-1",
            // The large (first-message) composer tints its border on focus —
            // track the same focus state (via the parent `group`) so the popup
            // and the input read as one unit, and both drop the tint together
            // when the input loses focus.
            large
              ? "border-border/70 group-focus-within:border-primary/60"
              : "border-border/70",
          )}
        >
          {/* Header — level title + back */}
          <div className="flex items-center gap-1 border-b border-border/50 px-2 py-1.5">
            {isSubLevel && (
              <button
                type="button"
                onClick={back}
                aria-label="Back"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="truncate px-1 text-[11px] font-medium text-muted-foreground">
              {title}
            </span>
            <span className="ml-auto hidden items-center gap-1.5 pr-1 text-[10px] text-muted-foreground/60 min-[430px]:flex">
              <kbd className="rounded border border-border/40 px-1 font-mono">↑↓</kbd>
              move
              <kbd className="rounded border border-border/40 px-1 font-mono">→</kbd>
              drill
              <kbd className="rounded border border-border/40 px-1 font-mono">←</kbd>
              back
              <kbd className="rounded border border-border/40 px-1 font-mono">esc</kbd>
              {isSubLevel ? "back" : "close"}
            </span>
          </div>

          {/* List */}
          <div ref={listRef} className="max-h-72 overflow-y-auto p-1 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                {placeholder}
              </div>
            ) : items.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground/50">
                {placeholder}
              </div>
            ) : (
              items.map((item, idx) => {
                const isSelected = idx === selected;
                return (
                  <div
                    key={keyFor(item)}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors",
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/80 hover:bg-muted/50",
                    )}
                    onClick={() => run(item)}
                    onMouseEnter={() => setSelected(idx)}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        isSelected
                          ? "bg-primary/15 text-primary"
                          : "bg-muted/60 text-muted-foreground",
                      )}
                    >
                      <IconFor item={item} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {TitleFor(item)}
                        {item.type === "tool" && !item.enabled && (
                          <span className="ml-1.5 align-middle text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/50">
                            disabled
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground/70">
                        {SubtitleFor(item)}
                      </span>
                    </span>
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        isSelected ? "text-primary/70" : "text-muted-foreground/30",
                      )}
                    />
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

function keyFor(item: MenuItem): string {
  switch (item.type) {
    case "command":
      return `cmd-${item.command.id}`;
    case "server":
      return `srv-${item.server.id}`;
    case "mcp-all":
      return `mcp-all-${item.server.id}`;
    case "mcp-tool":
      return `mcp-tool-${item.server.id}-${item.tool}`;
    case "tool":
      return `tool-${item.tool}`;
  }
}

function IconFor({
  item,
  className,
}: {
  item: MenuItem;
  className?: string;
}) {
  switch (item.type) {
    case "command":
      return <item.command.icon className={className} />;
    case "server":
      return item.server.transport === "http" ? (
        <Globe className={className} />
      ) : (
        <Cable className={className} />
      );
    case "mcp-all":
      return <Plug className={className} />;
    case "mcp-tool":
    case "tool":
      return <Wrench className={className} />;
  }
}

function TitleFor(item: MenuItem): string {
  switch (item.type) {
    case "command":
      return `/${item.command.trigger} — ${item.command.label}`;
    case "server":
      return item.server.name;
    case "mcp-all":
      return "All tools";
    case "mcp-tool":
      return item.tool;
    case "tool":
      return item.tool;
  }
}

function SubtitleFor(item: MenuItem): string {
  switch (item.type) {
    case "command":
      return item.command.description;
    case "server":
      return item.server.transport === "http"
        ? "HTTP server"
        : `stdio · ${item.server.command ?? "…"}`;
    case "mcp-all":
      return `Use every tool from “${item.server.name}”`;
    case "mcp-tool":
      return `Use “${item.server.name}__${item.tool}”`;
    case "tool":
      return item.description;
  }
}
