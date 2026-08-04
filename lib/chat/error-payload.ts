export type StreamErrorCategory =
  | "network"
  | "timeout"
  | "auth"
  | "credits"
  | "rate_limit"
  | "provider"
  | "bad_request"
  | "step_limit"
  | "aborted"
  | "tool"
  | "unknown";

export interface StreamErrorPayload {
  version: 1;
  category: StreamErrorCategory;
  title: string;
  message: string;
  technical?: string;
  statusCode?: number;
  providerCode?: string;
  retryable: boolean;
  shouldResume: boolean;
}

const STREAM_ERROR_PREFIX = "RMERR_JSON:";

const TIMEOUT_RE =
  /\b(timeout|timed out|etimedout|request timeout|deadline exceeded|read timeout|connect timeout)\b/i;

const NETWORK_RE =
  /\b(network request failed|fetch failed|socket hang up|econnreset|econnrefused|enotfound|eai_again|connection reset|connection closed|connection lost|tls|certificate)\b/i;

const ABORT_RE = /\b(abort|aborted|cancelled|canceled)\b/i;

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function pickStatusCode(err: Record<string, unknown> | null): number | undefined {
  if (!err) return undefined;
  const top = numberOrUndefined(err.statusCode) ?? numberOrUndefined(err.status);
  if (top != null) return top;
  const nested = Array.isArray(err.errors) ? err.errors : [];
  for (const item of nested) {
    const rec = toRecord(item);
    const n = numberOrUndefined(rec?.statusCode) ?? numberOrUndefined(rec?.status);
    if (n != null) return n;
  }
  return undefined;
}

function pickUrl(err: Record<string, unknown> | null): string | undefined {
  if (!err) return undefined;
  if (typeof err.url === "string" && err.url) return err.url;
  const nested = Array.isArray(err.errors) ? err.errors : [];
  for (const item of nested) {
    const rec = toRecord(item);
    if (typeof rec?.url === "string" && rec.url) return rec.url;
  }
  return undefined;
}

function pickResponseBody(err: Record<string, unknown> | null): string | undefined {
  if (!err) return undefined;
  const top = err.responseBody;
  if (typeof top === "string" && top) return top;
  if (top && typeof top === "object") {
    try {
      return JSON.stringify(top);
    } catch {
      // ignore
    }
  }

  const nested = Array.isArray(err.errors) ? err.errors : [];
  for (const item of nested) {
    const rec = toRecord(item);
    const body = rec?.responseBody;
    if (typeof body === "string" && body) return body;
    if (body && typeof body === "object") {
      try {
        return JSON.stringify(body);
      } catch {
        // ignore
      }
    }
  }

  return undefined;
}

function pickProviderCode(responseBody: string | undefined): string | undefined {
  if (!responseBody) return undefined;
  try {
    const parsed = JSON.parse(responseBody) as Record<string, unknown>;
    const topCode = parsed.code;
    if (typeof topCode === "string" && topCode) return topCode;
    const errorObj = toRecord(parsed.error);
    const nestedCode = errorObj?.code;
    if (typeof nestedCode === "string" && nestedCode) return nestedCode;
    const nestedType = errorObj?.type;
    if (typeof nestedType === "string" && nestedType) return nestedType;
  } catch {
    // ignore non-JSON response bodies
  }
  return undefined;
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) return error.message || "Unknown error";
  if (typeof error === "string") return error;
  if (error == null) return "Unknown error";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function shorten(text: string, max = 320): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function classifyError(
  input: string,
  statusCode: number | undefined,
): StreamErrorCategory {
  const lower = input.toLowerCase();

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /\b(unauthorized|forbidden|invalid api key|authentication failed|auth failed)\b/i.test(
      lower,
    )
  ) {
    return "auth";
  }

  if (
    statusCode === 402 ||
    /\b(insufficient[_\s-]?quota|insufficient[_\s-]?credits|billing|payment required|quota exceeded)\b/i.test(
      lower,
    )
  ) {
    return "credits";
  }

  if (
    statusCode === 429 ||
    /\b(rate limit|too many requests|throttl)\b/i.test(lower)
  ) {
    return "rate_limit";
  }

  if (statusCode === 408 || statusCode === 504 || TIMEOUT_RE.test(lower)) {
    return "timeout";
  }

  if (NETWORK_RE.test(lower)) {
    return "network";
  }

  if (ABORT_RE.test(lower)) {
    return "aborted";
  }

  if (/\b(max steps|step limit|maximum steps|stepcount|step_count)\b/i.test(lower)) {
    return "step_limit";
  }

  if (/\b(tool)\b/i.test(lower) && /\b(fail|error|timeout|invalid)\b/i.test(lower)) {
    return "tool";
  }

  if (statusCode != null) {
    if (statusCode >= 500) return "provider";
    if (statusCode >= 400) return "bad_request";
  }

  return "unknown";
}

function messageForCategory(category: StreamErrorCategory): { title: string; message: string } {
  switch (category) {
    case "network":
      return {
        title: "Connection interrupted",
        message:
          "The connection dropped while generating. Continue to resume the current run.",
      };
    case "timeout":
      return {
        title: "Request timed out",
        message:
          "The request timed out while the model was working. Continue to resume the current run.",
      };
    case "auth":
      return {
        title: "Provider authentication failed",
        message:
          "Your provider rejected authentication. Check the API key and provider settings.",
      };
    case "credits":
      return {
        title: "Provider credits or billing issue",
        message:
          "The provider rejected this request due to credits, quota, or billing limits.",
      };
    case "rate_limit":
      return {
        title: "Provider rate limit reached",
        message:
          "Too many requests were sent to the provider. Wait briefly, then continue.",
      };
    case "provider":
      return {
        title: "Provider service error",
        message:
          "The model provider returned a server error. Continue to retry the current run.",
      };
    case "bad_request":
      return {
        title: "Request rejected",
        message:
          "The provider rejected the request. Check model settings, tool inputs, or prompt constraints.",
      };
    case "step_limit":
      return {
        title: "Step limit reached",
        message:
          "This run reached the maximum tool/thinking steps before completion. Ask the model to continue from its latest result.",
      };
    case "aborted":
      return {
        title: "Request canceled",
        message: "The request was canceled before completion.",
      };
    case "tool":
      return {
        title: "Tool execution failed",
        message:
          "A tool call failed while the model was working. Continue to retry the current run.",
      };
    default:
      return {
        title: "Generation failed",
        message:
          "The request failed unexpectedly. Continue to retry the current run.",
      };
  }
}

function retryableForCategory(category: StreamErrorCategory): boolean {
  return !["auth", "credits", "bad_request", "aborted"].includes(category);
}

function shouldResumeForCategory(category: StreamErrorCategory): boolean {
  return ["network", "timeout", "rate_limit", "provider", "tool", "unknown"].includes(
    category,
  );
}

export function normalizeStreamError(error: unknown): StreamErrorPayload {
  const err = toRecord(error);
  const statusCode = pickStatusCode(err);
  const url = pickUrl(err);
  const responseBody = pickResponseBody(err);
  const providerCode = pickProviderCode(responseBody);
  const message = messageFromUnknown(error);

  const nestedMessages = Array.isArray(err?.errors)
    ? err.errors
        .map((e) => messageFromUnknown(e))
        .filter(Boolean)
        .join(" | ")
    : "";

  const classificationInput = `${message} ${responseBody ?? ""} ${nestedMessages}`.trim();
  const category = classifyError(classificationInput, statusCode);
  const friendly = messageForCategory(category);

  const technical = [
    statusCode != null ? `status=${statusCode}` : "",
    providerCode ? `providerCode=${providerCode}` : "",
    url ? `url=${url}` : "",
    message ? `message=${shorten(message)}` : "",
  ]
    .filter(Boolean)
    .join(" • ");

  return {
    version: 1,
    category,
    title: friendly.title,
    message: friendly.message,
    technical: technical || undefined,
    statusCode,
    providerCode,
    retryable: retryableForCategory(category),
    shouldResume: shouldResumeForCategory(category),
  };
}

export function encodeStreamError(payload: StreamErrorPayload): string {
  return `${STREAM_ERROR_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

export function decodeStreamError(text: string): StreamErrorPayload | null {
  if (typeof text !== "string") {
    return null;
  }

  const idx = text.indexOf(STREAM_ERROR_PREFIX);
  if (idx < 0) return null;

  const raw = text.slice(idx + STREAM_ERROR_PREFIX.length).trim();
  try {
    const decoded = JSON.parse(decodeURIComponent(raw)) as StreamErrorPayload;
    if (!decoded || decoded.version !== 1) return null;
    if (!decoded.title || !decoded.message) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function errorToDisplayMessage(error: unknown): {
  title: string;
  message?: string;
  technical?: string;
  retryable?: boolean;
  shouldResume?: boolean;
} {
  const rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : toRecord(error)?.message && typeof toRecord(error)?.message === "string"
          ? (toRecord(error)!.message as string)
          : "";

  const decoded = decodeStreamError(rawMessage);
  if (decoded) {
    return {
      title: decoded.title,
      message: decoded.message,
      technical: decoded.technical,
      retryable: decoded.retryable,
      shouldResume: decoded.shouldResume,
    };
  }

  if (rawMessage && rawMessage.includes("\n")) {
    const [first, ...rest] = rawMessage.split("\n");
    const detail = rest.join("\n").trim();
    return {
      title: first.trim() || "Error",
      message: detail || undefined,
    };
  }

  if (rawMessage && rawMessage.trim()) {
    return { title: rawMessage.trim() };
  }

  return {
    title: "Request failed",
    message: "The request failed unexpectedly.",
  };
}
