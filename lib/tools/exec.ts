import { z } from "zod";
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { truncateToolResult } from "@/lib/utils";
import {
  createSandboxDir,
  cleanupSandboxDir,
  SANDBOX_WARNING,
  type SandboxResult,
} from "./exec-sandbox";
import { db } from "@/db";
import { toolConfigs } from "@/db/schema";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ExecResult = SandboxResult;

// ---------------------------------------------------------------------------
// Python execution
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared subprocess runner (used by both Python and JS)
// ---------------------------------------------------------------------------

/**
 * Build a minimal environment for subprocess execution.
 * Keeps only PATH (needed to find executables) and SYSTEMROOT
 * (needed on Windows). Strips HOME, USERPROFILE, APPDATA, etc.
 * so the subprocess can't easily discover user directories.
 */
function getSafeEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
  };
  if (process.platform === "win32") {
    env.SYSTEMROOT = process.env.SYSTEMROOT ?? "";
  }
  return env as NodeJS.ProcessEnv;
}

/**
 * Safely kill a child process cross-platform.
 * - On Unix: sends SIGTERM, then SIGKILL after 2s if still alive.
 * - On Windows: sends TerminateProcess (SIGKILL doesn't exist there).
 */
function killProcess(proc: import("node:child_process").ChildProcess): void {
  try {
    if (process.platform === "win32") {
      proc.kill();
      setTimeout(() => {
        try { proc.kill(); } catch { /* already dead */ }
      }, 2000);
    } else {
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* already dead */ }
      }, 2000);
    }
  } catch {
    // Process may already be dead
  }
}

/**
 * Spawn a subprocess and collect its output.
 * Runs in an isolated temp directory (the sandbox dir).
 */
async function spawnSubprocess(
  command: string,
  args: string[],
  opts: {
    cwd: string;
    timeoutMs: number;
    start: number;
  },
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    let resolved = false;
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const proc = spawn(command, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: opts.timeoutMs,
      windowsHide: true,
      env: getSafeEnv(),
    });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      killProcess(proc);
    }, opts.timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeoutTimer);
      if (!resolved) {
        resolved = true;
        resolve({
          stdout,
          stderr: `Cannot run: ${err.message}`,
          exitCode: -1,
          timedOut,
          durationMs: Date.now() - opts.start,
        });
      }
    });

    proc.on("close", (exitCode) => {
      clearTimeout(timeoutTimer);
      if (!resolved) {
        resolved = true;
        resolve({
          stdout,
          stderr,
          exitCode,
          timedOut,
          durationMs: Date.now() - opts.start,
        });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Python execution
// ---------------------------------------------------------------------------

/**
 * Execute Python code as a subprocess in an isolated temp directory.
 * The temp dir is the cwd and is cleaned up after execution.
 * Environment variables are stripped (only PATH + SYSTEMROOT kept).
 * NOTE: absolute paths like open("/etc/passwd") still work — this is
 * not a security boundary, just accident prevention.
 */
async function runPython(
  code: string,
  timeoutMs: number = 30_000,
): Promise<SandboxResult> {
  const start = Date.now();
  const sandboxDir = await createSandboxDir();

  try {
    const commands =
      process.platform === "win32"
        ? ["python", "python3", "py"]
        : ["python3", "python"];

    for (const cmd of commands) {
      const result = await trySpawnPython(cmd, code, {
        cwd: sandboxDir,
        timeoutMs,
        start,
      });
      if (result !== null) return result;
    }

    return {
      stdout: "",
      stderr:
        "Python is not installed or not in PATH. " +
        `Tried: ${commands.join(", ")}`,
      exitCode: -1,
      timedOut: false,
      durationMs: Date.now() - start,
    };
  } finally {
    await cleanupSandboxDir(sandboxDir);
  }
}

/**
 * Try to spawn Python with a specific command in the sandbox dir.
 * Returns result or `null` if command not found (ENOENT).
 */
async function trySpawnPython(
  cmd: string,
  code: string,
  opts: { cwd: string; timeoutMs: number; start: number },
): Promise<SandboxResult | null> {
  const startInner = Date.now();

  return new Promise((resolve) => {
    let resolved = false;
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const proc = spawn(cmd, ["-u", "-c", code], {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: opts.timeoutMs,
      windowsHide: true,
      env: getSafeEnv(),
    });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      killProcess(proc);
    }, opts.timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeoutTimer);
      if ((err as any).code === "ENOENT" && !resolved) {
        resolved = true;
        resolve(null);
      } else if (!resolved) {
        resolved = true;
        resolve({
          stdout,
          stderr: `Python error: ${err.message}`,
          exitCode: -1,
          timedOut,
          durationMs: Date.now() - startInner,
        });
      }
    });

    proc.on("close", (exitCode) => {
      clearTimeout(timeoutTimer);
      if (!resolved) {
        resolved = true;
        resolve({
          stdout,
          stderr,
          exitCode,
          timedOut,
          durationMs: Date.now() - startInner,
        });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// JavaScript / TypeScript execution (subprocess, NO vm module)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// JS output parsing (strip our internal markers from output)
// ---------------------------------------------------------------------------

/**
 * Parse the markers injected by the JS wrapper code
 * (__CONSOLE_STDOUT__ / __CONSOLE_STDERR__ / __CONSOLE_END__)
 * and return only the clean console output.
 * If markers are missing (e.g. user code bypassed them), fall back
 * to the raw output.
 */
function parseJsOutput(stdout: string, stderr: string): { stdout: string; stderr: string } {
  const stdoutMarker = "__CONSOLE_STDOUT__";
  const stderrMarker = "__CONSOLE_STDERR__";
  const endMarker = "__CONSOLE_END__";

  const stdoutStart = stdout.indexOf(stdoutMarker);
  const stdoutEnd = stdout.lastIndexOf(endMarker);
  const cleanStdout =
    stdoutStart !== -1 && stdoutEnd > stdoutStart
      ? stdout.slice(stdoutStart + stdoutMarker.length, stdoutEnd)
      : stdout;

  const stderrStart = stderr.indexOf(stderrMarker);
  const stderrEnd = stderr.lastIndexOf(endMarker);
  const cleanStderr =
    stderrStart !== -1 && stderrEnd > stderrStart
      ? stderr.slice(stderrStart + stderrMarker.length, stderrEnd)
      : stderr;

  return { stdout: cleanStdout, stderr: cleanStderr };
}

// ---------------------------------------------------------------------------
// JavaScript / TypeScript execution (subprocess, NO vm module)
// ---------------------------------------------------------------------------

/**
 * Execute JavaScript code as a Node.js subprocess in an isolated temp
 * directory. Uses `node -e` (NOT vm.Script) to avoid known `vm` escape
 * vectors. Still has full user-level filesystem access — this is NOT a
 * security sandbox, just accident prevention.
 *
 * Passes `--disallow-code-generation-from-strings` to block eval() and
 * new Function() calls within the subprocess.
 */
async function runJavaScript(
  code: string,
  timeoutMs: number = 15_000,
): Promise<SandboxResult> {
  const start = Date.now();
  const sandboxDir = await createSandboxDir();

  try {
    const wrappedCode = `
const __logs = [];
const __errs = [];
console.log = (...args) => __logs.push(args.map(String).join(" "));
console.info = (...args) => __logs.push(args.map(String).join(" "));
console.warn = (...args) => __errs.push(args.map(String).join(" "));
console.error = (...args) => __errs.push(args.map(String).join(" "));
console.dir = (obj) => __logs.push(JSON.stringify(obj, null, 2));
console.table = (data) => __logs.push(JSON.stringify(data, null, 2));

(async () => {
${code}
})().then(() => {
  process.stdout.write("__CONSOLE_STDOUT__" + __logs.join("\\n") + "__CONSOLE_END__");
  process.stderr.write("__CONSOLE_STDERR__" + __errs.join("\\n") + "__CONSOLE_END__");
}).catch(err => {
  process.stderr.write("__CONSOLE_STDERR__" + (__errs.length ? __errs.join("\\n") + "\\n" : "") + (err?.stack || err?.message || String(err)) + "__CONSOLE_END__");
});
`;

    const hardenedArgs = [
      "--disallow-code-generation-from-strings",
      "-e",
      wrappedCode,
    ];

    const raw = await spawnSubprocess("node", hardenedArgs, {
      cwd: sandboxDir,
      timeoutMs,
      start,
    });

    // Strip the internal markers from the output before returning
    const parsed = parseJsOutput(raw.stdout, raw.stderr);
    return {
      ...raw,
      stdout: parsed.stdout,
      stderr: parsed.stderr,
    };
  } finally {
    await cleanupSandboxDir(sandboxDir);
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/**
 * Execute Python code and return the console output.
 * The code runs in an isolated temp directory with env vars stripped.
 * NOTE: absolute paths still work — this is NOT a security boundary.
 */
export const pythonExecTool = {
  description: `Execute Python code and return its console output (stdout, stderr, exit code).

${SANDBOX_WARNING}

Use this to:
- Run calculations, data processing, algorithms
- Test Python code snippets
- Use Python libraries installed on the system

Print output with print() to see results. Default timeout: 30s, max: 120s.`,
  parameters: z.object({
    code: z
      .string()
      .min(1)
      .describe("Python code to execute. Use print() to produce output."),
    timeout: z
      .number()
      .int()
      .positive()
      .max(120_000)
      .optional()
      .default(30_000)
      .describe("Timeout in milliseconds (default: 30s, max: 120s)"),
  }),
  execute: async ({
    code,
    timeout,
  }: {
    code: string;
    timeout?: number;
  }) => {
    const result = await runPython(code, timeout ?? 30_000);
    return truncateToolResult({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      duration: `${result.durationMs}ms`,
    });
  },
};

/**
 * Execute JavaScript code in an isolated temp directory with env vars
 * stripped. Uses node -e subprocess (NOT vm.Script).
 * NOTE: require("fs") with absolute paths still works — this is NOT
 * a security boundary, just accident prevention.
 */
export const javaScriptExecTool = {
  description: `Execute JavaScript code and return the console output.

${SANDBOX_WARNING}

Use this to:
- Run calculations, data transformations, algorithms
- Test code snippets before writing to files
- Process data or run logic

Use console.log() to print output. You can use await at the top level.
Default timeout: 15s, max: 60s.`,
  parameters: z.object({
    code: z
      .string()
      .min(1)
      .describe(
        "JavaScript code to execute. Use console.log() for output. await is supported.",
      ),
    timeout: z
      .number()
      .int()
      .positive()
      .max(60_000)
      .optional()
      .default(15_000)
      .describe("Timeout in milliseconds (default: 15s, max: 60s)"),
  }),
  execute: async ({
    code,
    timeout,
  }: {
    code: string;
    timeout?: number;
  }) => {
    const result = await runJavaScript(code, timeout ?? 15_000);
    return truncateToolResult({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      duration: `${result.durationMs}ms`,
    });
  },
};

// ---------------------------------------------------------------------------
// Builder function for the chat route
// ---------------------------------------------------------------------------

/**
 * Build code execution tools. Only includes them if the user has enabled
 * the "code_execution" tool config in settings. Disabled by default for
 * security reasons (not a secure sandbox).
 */
export async function buildExecutionTools(): Promise<Record<string, any>> {
  const config = await db
    .select()
    .from(toolConfigs)
    .where(eq(toolConfigs.toolId, "code_execution"))
    .get();

  if (!config?.enabled) {
    return {};
  }

  return {
    python_exec: pythonExecTool,
    js_exec: javaScriptExecTool,
  };
}
