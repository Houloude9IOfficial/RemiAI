"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "@/components/sidebar/SidebarContext";
import { ModelPicker } from "./ModelPicker";
import { cn } from "@/lib/utils";

interface MobileChatHeaderProps {
  title: string;
  providerId: number | null;
  modelId: string | null;
  onModelChange: (providerId: number, modelId: string) => void;
  actions?: React.ReactNode;
}

export function MobileChatHeader({
  title,
  providerId,
  modelId,
  onModelChange,
  actions,
}: MobileChatHeaderProps) {
  const { toggleMobileSidebar } = useSidebar();

  return (
    <div className="flex items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur supports-[padding-top:env(safe-area-inset-top)]:pt-[calc(0.5rem+env(safe-area-inset-top))] md:hidden">
      <button
        type="button"
        onClick={toggleMobileSidebar}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-foreground">
        {title}
      </span>

      <div className="flex shrink-0 items-center gap-0.5">
        {actions}
        <ModelPicker
          providerId={providerId}
          modelId={modelId}
          onChange={onModelChange}
        />
      </div>
    </div>
  );
}

export function DesktopChatHeader({
  title,
  providerId,
  modelId,
  onModelChange,
  extra,
  actions,
}: MobileChatHeaderProps & { extra?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-20 hidden items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur md:flex">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium tracking-tight text-foreground">
          {title}
        </span>
        {extra}
      </div>
      <div className={cn("flex shrink-0 items-center gap-1")}>
        {actions}
        <ModelPicker
          providerId={providerId}
          modelId={modelId}
          onChange={onModelChange}
        />
      </div>
    </div>
  );
}
