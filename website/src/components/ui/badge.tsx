import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium tracking-wide transition-colors",
        variant === "default" &&
          "bg-primary text-primary-foreground",
        variant === "secondary" &&
          "bg-accent text-accent-foreground",
        variant === "outline" &&
          "border border-border text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
