"use client";

import { useState, useCallback } from "react";
import { TriangleAlertIcon, RotateCcwIcon, XIcon, CopyIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { errorToDisplayMessage, decodeStreamError } from "@/lib/chat/error-payload";

interface ErrorCardProps {
  error: any
  onRetry?: () => void;
  isRetrying?: boolean;
  title?: string;
  retryLabel?: string;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Serialize an error object into a detailed, human-readable string suitable
 * for clipboard copy. Includes statusCode, url, responseBody, headers, and
 * stack trace when available — matching what you'd see in the browser console.
 */
function serializeError(err: any): string {
  if (typeof err === "string") return err;
  if (err == null) return String(err);

  const lines: string[] = [];

  // Error type and message
  const name = err.name || err.constructor?.name || "Error";
  lines.push(`${name}: ${err.message ?? ""}`);

  // Status code (for API errors like 429, 401, etc.)
  if (err.statusCode != null) {
    lines.push(`\nStatus Code: ${err.statusCode}`);
  }

  // URL of the failing request
  if (err.url) {
    lines.push(`URL: ${err.url}`);
  }

  // Flag properties
  if (err.isRetryable != null) {
    lines.push(`Retryable: ${err.isRetryable}`);
  }

  // Full response body (the most valuable part for debugging)
  if (err.responseBody) {
    lines.push("\nResponse Body:");
    try {
      const parsed = JSON.parse(typeof err.responseBody === "string" ? err.responseBody : JSON.stringify(err.responseBody));
      lines.push(JSON.stringify(parsed, null, 2));
    } catch {
      lines.push(String(err.responseBody));
    }
  }

  // Response headers
  if (err.responseHeaders) {
    lines.push("\nResponse Headers:");
    lines.push(JSON.stringify(err.responseHeaders, null, 2));
  }

  // Request body values (sanitized)
  if (err.requestBodyValues) {
    lines.push("\nRequest Body Values (sanitized):");
    lines.push(JSON.stringify(err.requestBodyValues, (key, value) => {
      // Truncate long arrays (like messages) to avoid massive clipboard content
      if (Array.isArray(value) && value.length > 5) {
        return `[Array(${value.length}) — truncated for copy]`;
      }
      return value;
    }, 2));
  }

  // Nested errors (e.g. AI_RetryError has an `errors` array)
  if (err.errors && Array.isArray(err.errors)) {
    lines.push(`\nNested Errors (${err.errors.length}):`);
    for (let i = 0; i < err.errors.length; i++) {
      const sub = err.errors[i];
      lines.push(`\n  [${i + 1}] ${sub.name || "Error"}: ${sub.message ?? ""}`);
      if (sub.statusCode != null) lines.push(`       Status: ${sub.statusCode}`);
      if (sub.responseBody) {
        lines.push(`       Response:`);
        try {
          const parsed = JSON.parse(typeof sub.responseBody === "string" ? sub.responseBody : "");
          lines.push(`       ${JSON.stringify(parsed).slice(0, 500)}`);
        } catch {
          lines.push(`       ${String(sub.responseBody).slice(0, 500)}`);
        }
      }
    }
  }

  // Nested cause chain
  let cause = err.cause;
  let depth = 0;
  while (cause != null && depth < 5) {
    lines.push(`\nCaused by [${depth + 1}]: ${cause.name || "Error"}: ${cause.message ?? ""}`);
    if (cause.stack) {
      lines.push(cause.stack.split("\n").slice(0, 3).join("\n"));
    }
    cause = cause.cause;
    depth++;
  }

  // Data payload
  if (err.data != null) {
    lines.push(`\nData: ${JSON.stringify(err.data, null, 2)}`);
  }

  // Reason (for retry errors)
  if (err.reason) {
    lines.push(`\nReason: ${err.reason}`);
  }

  // Stack trace
  if (err.stack) {
    lines.push("\nStack:");
    lines.push(err.stack);
  }

  return lines.join("\n");
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
  const [copied, setCopied] = useState(false)

  const normalized = errorToDisplayMessage(error)
  const rawErrorMessage =
    typeof error === "string"
      ? error
      : error?.message ?? error?.error ?? String(error)
  const decoded = decodeStreamError(rawErrorMessage)

  const displayTitle = title ?? normalized.title ?? "Request failed"
  const displayMessage = normalized.message
  const technical = normalized.technical
  const hasBody = Boolean(displayMessage)
  const isContinue = decoded?.shouldResume === true

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(serializeError(error))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }, [error])

  return (
    <Card
      size="sm"
      className={cn(
        "border-destructive/20 mb-2 ring-destructive/20 bg-destructive/5",
        className,
      )}
    >
      <CardContent className="flex items-center gap-3">
        <TriangleAlertIcon className="size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-destructive">{displayTitle}</p>
          {hasBody && (
            <p className="mt-0.5 text-xs text-muted-foreground overflow-wrap-break-word line-clamp-2">
              {displayMessage}
            </p>
          )}
          {technical && (
            <p className="mt-0.5 text-[11px] text-muted-foreground/70 overflow-wrap-break-word line-clamp-1">
              Details: {technical}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="gap-1.5 shrink-0"
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="gap-1.5 shrink-0"
          >
            <RotateCcwIcon
              className={cn("size-3.5", isRetrying && "animate-spin")}
            />
            {isRetrying ? "Retrying..." : (retryLabel || (isContinue ? "Continue" : "Retry"))}
          </Button>
        )}
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
    </Card>
  )
}
