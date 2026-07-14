import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        variant === "default" &&
          "bg-zinc-900 text-zinc-50",
        variant === "secondary" &&
          "bg-zinc-100 text-zinc-700",
        variant === "outline" &&
          "border border-zinc-200 text-zinc-600",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
