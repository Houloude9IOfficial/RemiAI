"use client";

import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Moon, Sun, Monitor } from "lucide-react";

const modes = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-0.5 rounded-lg border bg-background/50 p-0.5">
        {modes.map(({ value, icon: Icon }) => (
          <div
            key={value}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-background/50 p-0.5">
      {modes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200",
            theme === value
              ? "bg-foreground/10 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
          )}
          title={label}
          aria-label={label}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
