"use client";

import { Brain, Timer } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TEMPORARY_CHAT_RETENTION_DAYS } from "@/lib/chat/temporary-chat-constants";
import { cn } from "@/lib/utils";

/**
 * ChatGPT-style personalization dropdown for a conversation: a per-chat
 * Memory switch (off = the AI sees no saved memories and cannot save any) and
 * a Temporary-chat switch (hacky/temporary look + auto-delete after the
 * retention period). The two are fully independent.
 */
export function ChatPersonalizationMenu({
  isTemporary,
  memoryEnabled,
  onTemporaryChange,
  onMemoryChange,
}: {
  isTemporary: boolean;
  memoryEnabled: boolean;
  onTemporaryChange: (value: boolean) => void;
  onMemoryChange: (value: boolean) => void;
}) {
  const label = isTemporary
    ? "Temporary"
    : memoryEnabled
      ? "Memory on"
      : "Memory off";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          isTemporary &&
            "border-dashed border-status-warning/50 bg-status-warning/[0.08] text-foreground",
        )}
        title="Personalization — memory and temporary chat settings"
        aria-label="Personalization"
      >
        {isTemporary ? (
          <Timer className="h-3.5 w-3.5 text-status-warning" />
        ) : (
          <Brain className={cn("h-3.5 w-3.5", memoryEnabled ? "text-primary" : "text-muted-foreground")} />
        )}
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Personalization</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={memoryEnabled}
            onCheckedChange={(checked) => onMemoryChange(checked === true)}
          >
            <Brain className="h-4 w-4" />
            <span>
              <span className="block">Memory</span>
              <span className="block text-[10px] font-normal text-muted-foreground">
                {memoryEnabled
                  ? "Remembers you across conversations"
                  : "Disabled. No memory, profile, preferences, or file access"}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={isTemporary}
            onCheckedChange={(checked) => onTemporaryChange(checked === true)}
          >
            <Timer className="h-4 w-4" />
            <span>
              <span className="block">Temporary chat</span>
              <span className="block text-[10px] font-normal text-muted-foreground">
                {isTemporary
                  ? `Deleted after ${TEMPORARY_CHAT_RETENTION_DAYS} days of inactivity`
                  : `Make this chat temporary. Deleted after ${TEMPORARY_CHAT_RETENTION_DAYS} days`}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
