import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import { getTimeDetails } from "@/lib/time";

/**
 * Build context tools that provide the AI with information about the
 * current environment — time, date, timezone, and the user's device/browser
 * details (extracted from the User-Agent header).
 *
 * @param userAgent - The `User-Agent` request header, if available.
 * @param timezone - The USER's IANA timezone (sent by the browser), if
 *   available. When omitted, the server's own timezone is used.
 * @param locale - The USER's locale (e.g. "en-US"), if available.
 */
export function buildContextTools(
  userAgent?: string,
  timezone?: string,
  locale?: string,
): Record<string, any> {
  const tools: Record<string, any> = {};

  // -----------------------------------------------------------------------
  // get_time_details
  // -----------------------------------------------------------------------
  tools.get_time_details = {
    description:
      "Get the current date, time, timezone, and daylight-saving info in the USER'S local timezone.",
    parameters: z.object({}),
    execute: async () => getTimeDetails(timezone),
  };

  // -----------------------------------------------------------------------
  // get_device_details
  // -----------------------------------------------------------------------
  tools.get_device_details = {
    description:
      "Get details about the user's device and browser (OS, browser name/version, device type, language, timezone).",
    parameters: z.object({}),
    execute: async () => {
      const info = parseUserAgent(userAgent ?? "");
      return {
        userAgent: userAgent ?? "Not available",
        browser: info.browser,
        browserVersion: info.browserVersion,
        os: info.os,
        osVersion: info.osVersion,
        deviceType: info.deviceType,
        isMobile: info.deviceType === "mobile",
        isDesktop: info.deviceType === "desktop",
        language: locale ?? null,
        timezone:
          timezone ??
          (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
      };
    },
  };

  // Wrap all tools with result truncation
  for (const key of Object.keys(tools)) {
    const tool = tools[key];
    tools[key] = {
      description: tool.description,
      parameters: tool.parameters,
      execute: async (...args: any[]) => {
        const result = await tool.execute(...args);
        return truncateToolResult(result);
      },
    };
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Basic User-Agent parser
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string): {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
} {
  const result: {
    browser: string;
    browserVersion: string;
    os: string;
    osVersion: string;
    deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  } = {
    browser: "Unknown",
    browserVersion: "",
    os: "Unknown",
    osVersion: "",
    deviceType: "desktop",
  };

  if (!ua) return result;

  // Browser detection
  const browserPatterns: [RegExp, string][] = [
    [/Edg\/([\d.]+)/, "Edge"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Safari\/([\d.]+)/, "Safari"],
    [/OPR\/([\d.]+)/, "Opera"],
  ];

  for (const [pattern, name] of browserPatterns) {
    const match = ua.match(pattern);
    if (match) {
      result.browser = name;
      result.browserVersion = match[1] ?? "";
      break;
    }
  }

  // OS detection
  if (/Windows NT (\d+\.\d+)/.test(ua)) {
    const verMap: Record<string, string> = {
      "10.0": "10",
      "6.3": "8.1",
      "6.2": "8",
      "6.1": "7",
    };
    const match = ua.match(/Windows NT ([\d.]+)/);
    result.os = "Windows";
    result.osVersion = verMap[match![1]!] ?? match![1]!;
  } else if (/Mac OS X ([\d_]+)/.test(ua)) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    result.os = "macOS";
    result.osVersion = match![1]!.replace(/_/g, ".");
  } else if (/Android ([\d.]+)/.test(ua)) {
    const match = ua.match(/Android ([\d.]+)/);
    result.os = "Android";
    result.osVersion = match![1]!;
  } else if (/iPhone|iPad/.test(ua)) {
    const match = ua.match(/OS ([\d_]+)/);
    result.os = "iOS";
    result.osVersion = match ? match[1]!.replace(/_/g, ".") : "";
  } else if (/Linux/.test(ua)) {
    result.os = "Linux";
  }

  // Device type
  if (/Mobi|Android.*Mobile/.test(ua)) {
    result.deviceType = "mobile";
  } else if (/iPad|Tablet/.test(ua)) {
    result.deviceType = "tablet";
  }

  return result;
}
