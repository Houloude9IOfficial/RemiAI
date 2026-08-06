import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-pointer",

          // Variants
          variant === "primary" &&
            "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
          variant === "secondary" &&
            "bg-accent text-accent-foreground hover:bg-accent/80 active:scale-[0.98]",
          variant === "outline" &&
            "border border-border bg-background text-foreground hover:bg-muted hover:border-border active:scale-[0.98]",
          variant === "ghost" &&
            "text-muted-foreground hover:bg-muted hover:text-foreground",

          // Sizes
          size === "sm" && "h-9 px-3.5 text-[13px]",
          size === "md" && "h-10 px-4 text-sm",
          size === "lg" && "h-12 px-6 text-[15px]",

          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
