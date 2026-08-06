"use client";

/**
 * Client-side helpers that expose the user's timezone + locale so chat
 * requests can send them to the server (as headers). The server uses them
 * for `get_time_details` (the AI reports the USER's local time, not the
 * server's) and to localize web search results to the user's region.
 */

/** The user's IANA timezone from the browser, e.g. "Europe/Bucharest". */
export function getClientTimeZone(): string {
  if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }
  return "UTC";
}

/** The user's locale from the browser, e.g. "en-US" (falls back to "en"). */
export function getClientLocale(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return "en";
}

/**
 * Headers to attach to chat API requests (`/api/chat`, `/api/chat/start`)
 * so the server knows the user's timezone and locale.
 */
export function userContextHeaders(): Record<string, string> {
  return {
    "x-user-timezone": getClientTimeZone(),
    "x-user-locale": getClientLocale(),
  };
}
