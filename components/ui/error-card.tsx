"use client";

import { TriangleAlertIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ErrorCardProps {
  /** The error object with a message */
  error: Error | { message: string } | string;
  /** Called when the user clicks retry */
  onRetry?: () => void;
  /** Whether retry is currently loading */
  isRetrying?: boolean;
  /** Optional title override */
  title?: string;
  /** Optional action label override */
  retryLabel?: string;
  /** Called when the user dismisses the card */
  onDismiss?: () => void;
  /** Additional class names */
  className?: string;
}

export function ErrorCard({
  error,
  onRetry,
  isRetrying = false,
  title,
  retryLabel = "Retry",
  onDismiss,
  className,
}: ErrorCardProps) {
  const message = typeof error === "string" ? error : error.message;
  const displayTitle = title ?? "An error occurred";

  return (
    <Card
      size="sm"
      className={cn(
        "border-destructive/20 ring-destructive/20 bg-destructive/5",
        className,
      )}
    >
      <CardContent className="flex items-start gap-3 pt-(--card-spacing)">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-destructive">{displayTitle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground overflow-wrap-break-word">
            {message}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="size-4 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss error"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </CardContent>
      {onRetry && (
        <CardFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="gap-1.5"
          >
            <RotateCcwIcon
              className={cn("size-3.5", isRetrying && "animate-spin")}
            />
            {isRetrying ? "Retrying..." : retryLabel}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
