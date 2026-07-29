"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "@/components/sidebar/SidebarContext";
import { ModelPicker } from "./ModelPicker";

interface MobileChatHeaderProps {
  title: string;
  providerId: number | null;
  modelId: string | null;
  onModelChange: (providerId: number, modelId: string) => void;
}

export function MobileChatHeader({
  title,
  providerId,
  modelId,
  onModelChange,
}: MobileChatHeaderProps) {
  const { toggleMobileSidebar } = useSidebar();

  return (
    <div className="flex items-center gap-2 border-b px-3 py-2.5 bg-background/95 backdrop-blur supports-[padding-top:env(safe-area-inset-top)]:pt-[calc(0.625rem+env(safe-area-inset-top))] md:hidden">
      <button
        type="button"
        onClick={toggleMobileSidebar}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all duration-150"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <span className="flex-1 truncate text-sm font-medium text-foreground">
        {title}
      </span>

      <div className="shrink-0">
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
}: MobileChatHeaderProps & { extra?: React.ReactNode }) {
  return (
    <div className="hidden md:flex items-center gap-2 border-b px-4 py-2 bg-background/95 backdrop-blur sticky top-0 z-20">
      {extra}
      <span className="text-sm font-medium truncate">{title}</span>
      <div className="ml-auto flex items-center gap-2">
        <ModelPicker
          providerId={providerId}
          modelId={modelId}
          onChange={onModelChange}
        />
      </div>
    </div>
  );
}
