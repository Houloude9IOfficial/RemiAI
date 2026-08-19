export type BuildVerificationStatus = "passed" | "failed" | "incomplete";
export type BuildVerificationKind = "command" | "preview";

export type BuildVerificationCheck = {
  toolName: string;
  command: string;
  status: BuildVerificationStatus;
  detail: string;
  kind?: BuildVerificationKind;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function bareToolName(value: unknown): string {
  if (typeof value !== "string") return "";
  const lower = value.toLowerCase();
  return lower.includes("__") ? lower.split("__").slice(1).join("__") : lower;
}

function isVerificationTool(name: string): boolean {
  return name === "bash_execute" || name === "python_exec" || name === "js_exec";
}

function displayCommand(name: string, input: Record<string, unknown> | null): string {
  const value = input?.command ?? input?.code;
  if (typeof value !== "string" || !value.trim()) return name.replace(/_/g, " ");
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 96 ? `${normalized.slice(0, 93)}…` : normalized;
}

function isPreviewCommand(command: string): boolean {
  const normalized = command.toLowerCase();
  const localUrl = /https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/.test(normalized);
  const probe = /\b(curl|wget|httpie)\b/.test(normalized);
  const server =
    /\b(npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|preview)\b/.test(normalized) ||
    /\b(next\s+start|vite\s+preview|python(?:3)?\s+-m\s+http\.server)\b/.test(normalized);
  return localUrl && (probe || server);
}

/**
 * Extract honest verification outcomes from completed execution tool parts.
 * This is intentionally structural: it does not infer success from stdout or
 * from the assistant's prose, only from the tool's exit/timed-out result.
 */
export function summarizeBuildChecks(parts: unknown[]): BuildVerificationCheck[] {
  const checks: BuildVerificationCheck[] = [];

  for (const rawPart of parts) {
    const part = asRecord(rawPart);
    if (!part) continue;

    const name = bareToolName(
      part.toolName ??
        (typeof part.type === "string" ? part.type.replace(/^tool-/, "") : ""),
    );
    if (!isVerificationTool(name)) continue;

    const state = typeof part.state === "string" ? part.state : "call-result";
    const output = asRecord(part.output);
    const input = asRecord(part.input);
    const isError = state === "output-error";
    const isComplete =
      isError ||
      state === "output-available" ||
      state === "output-denied" ||
      state === "approval-responded";
    if (!isComplete) continue;

    const timedOut = output?.timedOut === true;
    const exitCode = output?.exitCode;
    const hasExitCode = typeof exitCode === "number";
    const status: BuildVerificationStatus = isError || timedOut
      ? "failed"
      : hasExitCode
        ? exitCode === 0
          ? "passed"
          : "failed"
        : "incomplete";

    const detail = isError
      ? "Tool execution failed"
      : timedOut
        ? "Timed out"
        : hasExitCode
          ? `Exit ${exitCode}`
          : "No exit code reported";

    const command = displayCommand(name, input);
    checks.push({
      toolName: name,
      command,
      status,
      detail,
      ...(isPreviewCommand(command) ? { kind: "preview" as const } : {}),
    });
  }

  return checks;
}

export function summarizeBuildCheckCounts(checks: BuildVerificationCheck[]): {
  passed: number;
  failed: number;
  incomplete: number;
} {
  return checks.reduce(
    (counts, check) => {
      counts[check.status] += 1;
      return counts;
    },
    { passed: 0, failed: 0, incomplete: 0 },
  );
}
