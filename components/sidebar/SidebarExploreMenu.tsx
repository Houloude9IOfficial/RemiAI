"use client";

import { useRouter } from "next/navigation";
import { Compass, Gamepad2, Radio, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useShortcuts } from "./shortcuts-context";

const destinations = [
  { href: "/talk", label: "Talk", icon: Radio },
  { href: "/games", label: "Games", icon: Gamepad2 },
];

export function SidebarExploreMenu({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex cursor-pointer items-center rounded-lg text-sidebar-foreground/72 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
          collapsed ? "h-8 w-8 justify-center" : "w-full gap-2 px-2.5 py-2 text-sm",
        )}
        aria-label="Explore"
      >
        <Compass className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1 text-left">Explore</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Explore</DropdownMenuLabel>
          {destinations.map(({ href, label, icon: Icon }) => (
            <DropdownMenuItem
              key={href}
              onClick={() => {
                router.push(href);
                onNavigate?.();
              }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarSearchButton({ collapsed = false, onOpen }: { collapsed?: boolean; onOpen?: () => void }) {
  const { openCommandPalette } = useShortcuts();

  return (
    <button
      type="button"
      onClick={() => {
        openCommandPalette();
        onOpen?.();
      }}
      className={cn(
        "flex cursor-pointer items-center rounded-lg text-sidebar-foreground/72 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
        collapsed ? "h-8 w-8 justify-center" : "w-full gap-2 px-2.5 py-2 text-sm",
      )}
      aria-label="Search chats and commands"
    >
      <Search className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="flex-1 text-left">Search</span>}
      {/* {!collapsed && <kbd className="text-[10px] text-sidebar-foreground/45">⌘K</kbd>} */}
    </button>
  );
}
