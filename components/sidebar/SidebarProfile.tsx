"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { preferencesApi } from "@/lib/api/preferences";
import { Settings } from "lucide-react";

export function SidebarProfile() {
  const { data: prefs } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
  });

  const name = prefs?.preferredName?.trim() || "User";
  const avatarUrl = prefs?.avatarUrl?.trim() || null;

  // Generate initials from name
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

  return (
    <Link
      href="/settings/profile"
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground",
        "hover:bg-muted hover:text-foreground",
        "transition-all duration-200",
      )}
    >
      {/* Avatar */}
      <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full ring-1 ring-border/50">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/10 text-xs font-semibold text-primary">
            {initials || "?"}
          </div>
        )}
      </div>

      {/* Name + subtle hint */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium leading-tight text-foreground">
          {name}
        </span>
        <span className="truncate text-[11px] leading-tight text-muted-foreground/50">
          View profile
        </span>
      </div>

      {/* Settings icon — appears on hover */}
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <Settings className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
      </div>
    </Link>
  );
}
