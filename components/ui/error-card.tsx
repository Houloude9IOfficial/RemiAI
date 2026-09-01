"use client";

import { useState, useCallback } from "react";
import { TriangleAlertIcon, RotateCcwIcon, XIcon, CopyIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  errorToDisplayMessage,
  decodeStreamError,
  STREAM_ERROR_PREFIX,
} from "@/lib/chat/error-payload";

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

// ── JSON error digging ──────────────────────────────────────────────
// Provider/API errors frequently arrive as JSON — either an error object
// (e.g. {"error":{"name":"AI_APICallError",...}}) or a JSON string buried
// in `message`. These helpers recursively search every key for the most
// useful text, in priority order:
//   1. `.error` / `.message` values (any depth)
//   2. response bodies (e.g. AI_APICallError.responseBody, which usually
//      holds the real provider message like "Insufficient balance")
//   3. nested error/errors objects
//   4. any other sentence-like text
//   5. `.name` on error-shaped objects (last resort — class names like
//      "AI_APICallError" are much less useful than the real message)

/** Keys that are always interesting error text carriers. */
const ERRORISH_KEYS = ["error", "errors", "message", "err", "msg"] as const;

/** Keys whose values usually carry the real provider error. */
const RESPONSE_BODY_KEYS = ["responseBody", "response", "body"] as const;

/** Keys that carry request payloads / prompts — never interesting as error text. */
const NOISE_KEYS = new Set([
  "requestBodyValues",
  "responseHeaders",
  "messages",
  "content",
  "role",
  "model",
  "headers",
  "prompt",
  "stack",
]);

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return t.length > 1 && (t.startsWith("{") || t.startsWith("["));
}

function digErrorMessage(value: unknown, depth = 0): string | null {
  if (value == null || depth > 8) return null;

  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    // Encoded stream payloads are machine-readable, not user-facing text
    if (t.startsWith(STREAM_ERROR_PREFIX)) return null;
    // A string that is itself JSON — dig one level deeper first
    if (looksLikeJson(t)) {
      try {
        const dug = digErrorMessage(JSON.parse(t), depth + 1);
        if (dug) return dug;
      } catch {
        // Truncated/invalid JSON — use the string as-is below
      }
    }
    return t;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const dug = digErrorMessage(item, depth + 1);
      if (dug) return dug;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  const rec = value as Record<string, unknown>;

  // 1. Direct string values under error/message-ish keys
  for (const key of ERRORISH_KEYS) {
    const v = rec[key];
    if (typeof v === "string") {
      const dug = digErrorMessage(v, depth + 1);
      if (dug) return dug;
    }
  }

  // 2. Response payloads — usually carry the real provider error
  for (const key of RESPONSE_BODY_KEYS) {
    const v = rec[key];
    if (v == null || v === value) continue;
    const dug = digErrorMessage(v, depth + 1);
    if (dug) return dug;
  }

  // 3. Nested error/errors objects — dig into them
  for (const key of ERRORISH_KEYS) {
    const v = rec[key];
    if (v == null || typeof v !== "object") continue;
    const dug = digErrorMessage(v, depth + 1);
    if (dug) return dug;
  }

  // 4. Anything else — dig into objects/arrays/JSON strings. For plain
  //    (non-JSON) strings, accept only sentence-like values and skip urls /
  //    ids / single tokens so we don't surface request metadata instead of
  //    the real error. JSON strings are dug unconditionally — their dug
  //    `.error` / `.message` values are always real error text.
  for (const [key, v] of Object.entries(rec)) {
    if (NOISE_KEYS.has(key)) continue;
    if (ERRORISH_KEYS.some((k) => k === key)) continue;
    if (RESPONSE_BODY_KEYS.some((k) => k === key)) continue;
    if (typeof v === "string") {
      if (looksLikeJson(v)) {
        const dug = digErrorMessage(v, depth + 1);
        if (dug) return dug;
      }
      const dug = digErrorMessage(v, depth + 1);
      if (dug && /\s/.test(dug)) return dug;
      continue;
    }
    const dug = digErrorMessage(v, depth + 1);
    if (dug) return dug;
  }

  // 5. Error-shaped object with a `name` — last resort (e.g. AI_APICallError)
  if (typeof rec.name === "string") {
    const t = rec.name.trim();
    if (t) return t;
  }

  return null;
}

/** Extract a readable error/message from any error-shaped value. */
function extractErrorMessage(error: unknown): string | null {
  if (error == null) return null;

  if (typeof error === "string") {
    const t = error.trim();
    if (!t || t.startsWith(STREAM_ERROR_PREFIX)) return null;
    if (looksLikeJson(t)) {
      try {
        const dug = digErrorMessage(JSON.parse(t));
        if (dug) return dug;
      } catch {
        // Not JSON — fall through
      }
    }
    return t;
  }

  if (typeof error === "object") {
    const rec = error as Record<string, unknown>;

    // The real provider message usually lives in the response body
    // (e.g. AI_APICallError.responseBody = {"error":"Insufficient..."})
    const body = rec.responseBody;
    if (body != null && body !== error) {
      const found = extractErrorMessage(body);
      if (found) return found;
    }

    const dug = digErrorMessage(error);
    if (dug) return dug;

    for (const key of ["message", "error"] as const) {
      const v = rec[key];
      if (v == null || v === error) continue;
      const found = extractErrorMessage(v);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Dig the `message=` segment out of a stream-error technical string (e.g.
 * "status=500 • url=… • message={"error":{…}}"). The JSON there may be
 * truncated, so fall back to pulling the first `name`/`message` string.
 */
function digFromTechnicalMessage(technical: string | undefined): string | null {
  if (!technical) return null;
  const idx = technical.lastIndexOf("message=");
  if (idx < 0) return null;
  const raw = technical.slice(idx + "message=".length).trim();
  if (!raw) return null;

  if (looksLikeJson(raw)) {
    try {
      const dug = digErrorMessage(JSON.parse(raw));
      if (dug) return dug;
    } catch {
      // Truncated JSON — fall through to the regex pass
    }
  }

  // Truncated JSON: pull the first `message` / `name` string value
  const msgMatch = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (msgMatch && msgMatch[1]) return msgMatch[1];
  const nameMatch = raw.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (nameMatch && nameMatch[1]) return nameMatch[1];
  return null;
}

/** Replace the JSON blob inside a technical `message=` segment with the dug error. */
function cleanTechnical(technical: string | undefined, dug: string | null): string | undefined {
  if (!technical || !dug) return technical;
  const short = dug.length > 160 ? `${dug.slice(0, 160)}…` : dug;
  const idx = technical.lastIndexOf("message=");
  if (idx < 0) return `${technical} • message=${short}`;
  return `${technical.slice(0, idx + "message=".length)}${short}`;
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

  // Find a human-readable error inside the JSON (any `.error` / `.message`
  // key at any depth, preferring real provider messages from the response
  // body over the error class name). For stream errors, also dig the
  // `message=` segment of the technical string.
  const rawDug = extractErrorMessage(error)
  const techDug = decoded ? digFromTechnicalMessage(decoded.technical) : null
  const dugMessage = decoded ? (rawDug ?? techDug) : rawDug

  // When the raw message is one giant JSON blob, the generic normalization
  // would render the blob itself as the title — prefer the dug error.
  const rawLooksJson = (() => {
    const t = typeof rawErrorMessage === "string" ? rawErrorMessage.trim() : "";
    if (!t || !looksLikeJson(t)) return false;
    try {
      JSON.parse(t)
      return true
    } catch {
      return false
    }
  })()

  const displayTitle =
    title ??
    decoded?.title ??
    (!rawLooksJson ? normalized.title : undefined) ??
    "Request failed"

  // Surface the dug error as the body only when it adds info beyond the
  // title (e.g. responseBody message when the title is just the class name)
  // — otherwise the plain message would be duplicated in title+body.
  const dugBody = (() => {
    if (!dugMessage || !dugMessage.trim()) return null
    const t = dugMessage.trim()
    if (displayTitle && t === displayTitle) return null
    if (displayTitle && t.startsWith(displayTitle + "\n")) {
      return t.slice(displayTitle.length).trim() || null
    }
    return t
  })()

  // Prefer the provider's ACTUAL error (decoded.detail) over the friendly
  // category message — the real reason must reach the user, not a generic
  // "provider service error" text derived from keyword detection.
  const displayMessage =
    decoded?.detail ??
    decoded?.message ??
    dugBody ??
    (!rawLooksJson ? normalized.message : undefined) ??
    undefined
  const technical = decoded
    ? cleanTechnical(decoded.technical, dugMessage)
    : normalized.technical
  const hasBody = Boolean(displayMessage)
  const isContinue = decoded?.shouldResume === true

  const handleCopy = useCallback(async () => {
    // When the server sent a structured stream-error payload, copy the real
    // provider message + raw response body first (the actual error JSON),
    // followed by the full serialized error for debugging.
    const decodedPayload = decoded
      ? [
          decoded.detail ? `Message: ${decoded.detail}` : decoded.message,
          decoded.rawBody ? `Response Body:\n${decoded.rawBody}` : "",
          decoded.technical ? `Technical: ${decoded.technical}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      : null
    const text = decodedPayload
      ? `${decodedPayload}\n\n---\n${serializeError(error)}`
      : serializeError(error)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }, [decoded, error])

  return (
    <Card
      size="sm"
      className={cn(
        "mx-auto mb-2 w-full max-w-3xl border-destructive/20 bg-destructive/5 ring-destructive/20",
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
          {/* {technical && (
            <p className="mt-0.5 text-[11px] text-muted-foreground/70 overflow-wrap-break-word line-clamp-1">
              Details: {technical}
            </p>
          )} */}
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
