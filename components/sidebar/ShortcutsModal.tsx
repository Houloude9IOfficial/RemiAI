"use client";

import {
  MessageSquarePlus,
  MessageCircle,
  PanelLeft,
  Keyboard,
  Command,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePlatform } from "@/lib/hooks/use-platform";
import { useShortcuts } from "./shortcuts-context";
import { cn } from "@/lib/utils";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-md border border-border bg-muted px-1.5 font-mono text-[11px] font-semibold text-foreground shadow-[0_1px_0_rgba(0,0,0,0.08)] dark:border-border/60 dark:bg-muted/60 dark:shadow-none">
      {children}
    </kbd>
  );
}

/** Windows logo — shown as the modifier key on Windows. */
function WindowsLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 88 88"
      className={cn("h-3 w-3", className)}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M0 12.402 35.687 7.551 35.687 41.998 0 42.006zM39.594 6.979 88 0 88 41.99 39.594 42.005zM0 45.994 35.687 46.002 35.687 80.449 0 75.598zM39.594 46.0 88 46.0 88 88 39.594 81.021z" />
    </svg>
  );
}

/** Device-appropriate modifier key: ⌘ on Mac, Windows logo on Windows, Ctrl elsewhere. */
function ModKey() {
  const { platform } = usePlatform();

  if (platform === "mac") return <span>⌘</span>;
  if (platform === "windows") return <WindowsLogo />;
  return <span>Ctrl</span>;
}

// ── Dialog ────────────────────────────────────────────────────────────────

export function ShortcutsDialog() {
  const { isShortcutsOpen, closeShortcuts } = useShortcuts();
  const { platform } = usePlatform();

  const platformLabel =
    platform === "mac"
      ? "macOS"
      : platform === "windows"
        ? "Windows"
        : "Linux";

  const shortcuts = [
    {
      icon: MessageCircle,
      label: "Focus chat input",
      keys: (
        <>
          <Kbd>/</Kbd>
        </>
      ),
    },
    {
      icon: MessageSquarePlus,
      label: "New chat",
      keys: (
        <>
          <Kbd>
            <ModKey />
          </Kbd>
          <Kbd>O</Kbd>
        </>
      ),
    },
    {
      icon: PanelLeft,
      label: "Toggle sidebar",
      keys: (
        <>
          <Kbd>
            <ModKey />
          </Kbd>
          <Kbd>S</Kbd>
        </>
      ),
    },
    {
      icon: Keyboard,
      label: "Show keyboard shortcuts",
      keys: (
        <>
          <Kbd>
            <ModKey />
          </Kbd>
          <Kbd>/</Kbd>
        </>
      ),
    },
  ];

  return (
    <Dialog
      open={isShortcutsOpen}
      onOpenChange={(open) => {
        if (!open) closeShortcuts();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <Command className="h-3.5 w-3.5" />
            Showing shortcuts for {platformLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1 py-1">
          {shortcuts.map(({ icon: Icon, label, keys }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
            >
              <div className="flex min-w-0 items-center gap-2.5 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate text-foreground">{label}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">{keys}</div>
            </div>
          ))}
        </div>

        <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
          Press <Kbd>Esc</Kbd> to close this dialog.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ── Trigger button ────────────────────────────────────────────────────────

interface ShortcutsTriggerProps {
  className?: string;
}

export function ShortcutsTrigger({ className }: ShortcutsTriggerProps) {
  const { openShortcuts } = useShortcuts();

  return (
    <button
      type="button"
      onClick={openShortcuts}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts"
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors",
        className,
      )}
    >
      <Keyboard className="h-4 w-4" />
    </button>
  );
}
