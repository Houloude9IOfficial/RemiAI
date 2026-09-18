"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  Cloud,
  Cog,
  Gauge,
  ListTodo,
  MessageSquareText,
  Settings2,
  Shield,
  UserRound,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

const groups = [
  { label: "Profile", href: "/settings/profile", icon: UserRound },
  { label: "Appearance", href: "/settings/appearance", icon: Settings2 },
  { label: "Options", href: "/settings/options", icon: MessageSquareText },
  { label: "Models", href: "/settings/providers", icon: Cloud },
  { label: "Memory", href: "/settings/memories", icon: Brain },
  {
    label: "Tools & integrations",
    icon: Wrench,
    children: [
      ["Tools", "/settings/tools"],
      ["Integrations", "/settings/mcp"],
      ["Skills", "/settings/skills"],
      ["Webhooks", "/settings/webhooks"],
    ],
  },
  {
    label: "Automations",
    icon: ListTodo,
    children: [
      ["Tasks", "/settings/tasks"],
      ["Heartbeats", "/settings/heartbeats"],
      ["Routines", "/settings/routines"],
      ["Automations", "/settings/scheduled-tasks"],
    ],
  },
  {
    label: "Data & privacy",
    icon: Shield,
    children: [
      ["Backup", "/settings/backup"],
      ["Directories", "/settings/directories"],
      ["Folder monitoring", "/settings/watcher"],
    ],
  },
  { label: "Usage", href: "/settings/usage", icon: Gauge },
];

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-full w-full flex-1 flex-col md:flex-row">
      <aside className="w-full shrink-0 border-b border-border/45 bg-surface-1/60 p-4 md:w-60 md:border-b-0 md:border-r md:p-5 lg:w-64">
        <div className="mb-5 flex items-center gap-2 px-2">
          <Cog className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold tracking-tight">Settings</h1>
        </div>
        <nav className="grid gap-1 md:block" aria-label="Settings">
          {groups.map((group) => {
            const Icon = group.icon;
            const active = group.href
              ? pathname === group.href || pathname.startsWith(`${group.href}/`)
              : group.children?.some(([, href]) => pathname.startsWith(href));
            return (
              <div key={group.label} className="mb-1">
                {group.href ? (
                  <Link
                    href={group.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {group.label}
                  </Link>
                ) : (
                  <div
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-2 text-sm font-medium",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {group.label}
                  </div>
                )}
                {group.children && (
                  <div className="ml-8 grid gap-0.5 border-l border-border/40 pl-2">
                    {group.children.map(([label, href]) => (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          "rounded-md px-2 py-1.5 text-xs transition-colors",
                          pathname.startsWith(href)
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        {/* <div className="mt-5 border-t border-border/40 pt-3">
          <Link href="/settings/providers" className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground">
            <Link2 className="h-3.5 w-3.5" /> Advanced provider settings
          </Link>
        </div> */}
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-5 md:p-8">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </section>
    </div>
  );
}
