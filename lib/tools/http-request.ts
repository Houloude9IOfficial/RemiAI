import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

export type HttpRequestMode = "sandboxed" | "full";
export type HttpRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CHARS = 20_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_CHARS = 100_000;

const privateIpv4 = [
  { start: 0x0a000000, end: 0x0affffff },
  { start: 0x64400000, end: 0x647fffff },
  { start: 0x7f000000, end: 0x7fffffff },
  { start: 0xa9fe0000, end: 0xa9feffff },
  { start: 0xac100000, end: 0xac1fffff },
  { start: 0xc0a80000, end: 0xc0a8ffff },
];

function ipv4ToNumber(value: string): number {
  return value.split(".").reduce((result, octet) => (result * 256) + Number(octet), 0) >>> 0;
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const numeric = ipv4ToNumber(address);
    return privateIpv4.some(({ start, end }) => numeric >= start && numeric <= end);
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::" || normalized === "::1" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb") ||
      normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.") || normalized.startsWith("::ffff:172.");
  }
  return false;
}

async function assertSafeDestination(url: URL): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") || hostname === "metadata.google.internal" ||
    hostname === "instance-data.ec2.internal"
  ) {
    throw new Error("Sandboxed HTTP requests cannot target local or metadata-service hostnames.");
  }

  if (isPrivateAddress(hostname)) {
    throw new Error("Sandboxed HTTP requests cannot target private or link-local addresses.");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Sandboxed HTTP requests cannot target a hostname resolving to a private or link-local address.");
  }
}

function serializeBody(body: unknown): { body?: string; isStructured: boolean } {
  if (body === undefined || body === null) return { isStructured: false };
  if (typeof body === "string") return { body, isStructured: false };
  return { body: JSON.stringify(body), isStructured: true };
}

export function buildHttpRequestTool(options: {
  mode?: HttpRequestMode;
  allowMutations?: boolean;
} = {}) {
  const mode = options.mode ?? "sandboxed";
  const allowMutations = options.allowMutations ?? true;

  return {
    description:
      "Make an HTTP request to an API or website using GET, POST, PUT, PATCH, or DELETE. " +
      "Supports optional headers and raw text or JSON bodies. Use web_fetch for simple public reads; " +
      `this tool is in ${mode === "full" ? "Full" : "Safe"} request mode.`,
    inputSchema: z.object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      url: z.string().url().describe("Absolute http:// or https:// URL"),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
      timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
      maxChars: z.number().int().positive().max(MAX_RESPONSE_CHARS).default(DEFAULT_MAX_CHARS),
    }),
    execute: async ({
      method,
      url,
      headers = {},
      body,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      maxChars = DEFAULT_MAX_CHARS,
    }: {
      method: HttpRequestMethod;
      url: string;
      headers?: Record<string, string>;
      body?: string | Record<string, unknown> | unknown[];
      timeoutMs?: number;
      maxChars?: number;
    }) => {
      try {
        const parsedUrl = new URL(url);
        if (!/^https?:$/i.test(parsedUrl.protocol)) {
          return { url, error: "Only http:// and https:// URLs are supported." };
        }
        if (!allowMutations && method !== "GET") {
          return { url, method, error: "Plan mode is read-only: only GET requests are allowed." };
        }
        if (mode === "sandboxed") await assertSafeDestination(parsedUrl);

        const serialized = serializeBody(body);
        const requestHeaders = { ...headers };
        if (serialized.isStructured && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === "content-type")) {
          requestHeaders["Content-Type"] = "application/json";
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        let response: Response;
        try {
          response = await fetch(parsedUrl, {
            method,
            headers: requestHeaders,
            body: serialized.body,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        const responseBody = await response.text();
        const truncated = responseBody.length > maxChars;
        return truncateToolResult({
          url,
          method,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          contentType: response.headers.get("content-type") ?? "unknown",
          contentLength: responseBody.length,
          returnedLength: Math.min(responseBody.length, maxChars),
          truncated,
          body: truncated
            ? responseBody.slice(0, maxChars) + `\n\n[...truncated: ${(responseBody.length - maxChars).toLocaleString()} more characters]`
            : responseBody,
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "AbortError";
        return truncateToolResult({
          url,
          method,
          error: timedOut
            ? `Request timed out after ${timeoutMs}ms`
            : error instanceof Error ? error.message : "HTTP request failed",
          hint: timedOut
            ? "Retry with a smaller endpoint or a longer timeout."
            : "Check the URL, request parameters, and remote server availability.",
        });
      }
    },
  };
}

export const httpRequestTool = buildHttpRequestTool();
