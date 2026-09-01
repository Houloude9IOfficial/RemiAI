import { NextResponse } from "next/server";

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);

export const DEMO_BLOCKED_MESSAGE = "This feature is unavailable in the public demo.";

export const DEMO_CAPABILITIES = {
  chat: true,
  canvas: true,
  sessionFiles: true,
  games: false,
  settings: false,
  providers: false,
  integrations: false,
  execution: false,
  browserAutomation: false,
  automations: false,
  filesystem: false,
  uploads: true,
} as const;

export function isDemoMode(value = process.env.DEMO): boolean {
  return typeof value === "string" && TRUE_VALUES.has(value.trim().toLowerCase());
}

export function demoCapabilities() {
  return { demo: isDemoMode(), capabilities: DEMO_CAPABILITIES };
}

export function demoBlockedResponse() {
  return NextResponse.json({ error: DEMO_BLOCKED_MESSAGE }, { status: 403 });
}

export function rejectInDemo(): NextResponse | null {
  return isDemoMode() ? demoBlockedResponse() : null;
}

export function assertDemoAllowed(capability: keyof typeof DEMO_CAPABILITIES): void {
  if (isDemoMode() && !DEMO_CAPABILITIES[capability]) {
    throw new Error("DEMO_BLOCKED");
  }
}

export function isDemoBlockedError(error: unknown): boolean {
  return error instanceof Error && error.message === "DEMO_BLOCKED";
}

export const DEMO_ALLOWED_TOOL_NAMES = new Set([
  "get_time_details",
  "get_device_details",
  "delay",
  "ask_questions",
  "suggest_followups",
  "canvas_create",
  "canvas_add_file",
  "canvas_list",
  "canvas_open",
  "session_file_list",
  "session_file_read",
  "session_file_read_media",
  "session_file_write",
  "session_file_edit",
  "session_file_mkdir",
  "session_file_move",
  "session_file_download",
  "session_file_delete",
  "session_present_file",
  "session_present_files",
  "load_tool_groups",
  "get_tool_help",
  "list_available_tools",
]);

export function filterDemoTools<T>(tools: Record<string, T>): Record<string, T> {
  if (!isDemoMode()) return tools;
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => DEMO_ALLOWED_TOOL_NAMES.has(name)),
  );
}

export function isDemoToolAllowed(toolName: string): boolean {
  return !isDemoMode() || DEMO_ALLOWED_TOOL_NAMES.has(toolName);
}
