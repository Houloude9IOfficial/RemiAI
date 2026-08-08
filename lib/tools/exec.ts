import { z } from "zod";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
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
import { getPermittedRoots } from "@/lib/fs/access";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ExecResult = SandboxResult;

// ---------------------------------------------------------------------------
// Shared subprocess runner (used by Python and JS)
// ---------------------------------------------------------------------------

/**
 * Build a minimal environment for subprocess execution.
 * Keeps only PATH (needed to find executables) and SYSTEMROOT
 * (needed on Windows). Strips HOME, USERPROFILE, APPDATA, etc.
 * so the subprocess can't easily discover user directories.
 */
function getSafeEnv(): NodeJS.ProcessEnv {
  // GUI-launched apps (e.g. the packaged Electron app) can start with an
  // empty PATH, which makes every spawn fail with ENOENT. Fall back to a
  // minimal standard PATH so shells and common tools remain findable.
  const fallbackPath =
    process.platform === "win32"
      ? "C:\\Windows\\System32;C:\\Windows"
      : "/usr/bin:/bin:/usr/sbin:/sbin";
  const env: Record<string, string> = {
    PATH:
      process.env.PATH && process.env.PATH.trim().length > 0
        ? process.env.PATH
        : fallbackPath,
  };
  if (process.platform === "win32") {
    env.SYSTEMROOT = process.env.SYSTEMROOT ?? "";
  }
  return env as NodeJS.ProcessEnv;
}

/**
 * Safely kill a child process — and, crucially, its whole process tree —
 * cross-platform.
 *
 * Killing only the shell (e.g. `bash -lc "npm run build"`) would orphan the
 * actual command, which keeps running in the background. Subprocesses are
 * therefore spawned with `detached: true` (Unix), making each child a
 * process-group leader, so we can signal the entire group:
 * - On Unix: SIGTERM to the group (-pid), then SIGKILL after 2s for anything
 *   that ignores SIGTERM (stubborn daemons, trapped handlers).
 * - On Windows: `taskkill /T` terminates the whole process tree.
 */
function killProcess(proc: import("node:child_process").ChildProcess): void {
  const pid = proc.pid;
  try {
    if (process.platform === "win32") {
      if (pid) {
        // taskkill /T /F kills the process and all descendants.
        spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        proc.kill();
      }
      return;
    }
    if (pid) {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        proc.kill("SIGTERM");
      }
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          try { proc.kill("SIGKILL"); } catch { /* already dead */ }
        }
      }, 2000);
    } else {
      proc.kill("SIGTERM");
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
      windowsHide: true,
      // Make each child a process-group leader on Unix so a timeout can
      // cancel the whole tree (shell + the command it runs), not just the
      // direct child. Windows uses `taskkill /T` instead (see killProcess).
      // NOTE: children are intentionally not tied to the parent's lifetime
      // (detached) — the manual timer below is what guarantees they get
      // reaped on timeout even if the shell ignores SIGTERM. The process is
      // *not* unref()'d, so we still await its 'close' event.
      detached: process.platform !== "win32",
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
      windowsHide: true,
      detached: process.platform !== "win32",
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
  description: `Execute Python code and return its console output (stdout, stderr, exit code). ${SANDBOX_WARNING} Print output with print(). Default timeout: 30s, max: 120s.`,
  parameters: z.object({
    code: z
      .string()
      .min(1)
      .describe("Python code to execute; use print() to produce output"),
    timeout: z
      .number()
      .int()
      .positive()
      .max(120_000)
      .optional()
      .default(30_000)
      .describe("Timeout in ms (default: 30s, max: 120s)"),
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
  description: `Execute JavaScript code and return its console output. ${SANDBOX_WARNING} Use console.log() for output; top-level await supported. Default timeout: 15s, max: 60s.`,
  parameters: z.object({
    code: z
      .string()
      .min(1)
      .describe("JavaScript code to execute; console.log() for output; await supported"),
    timeout: z
      .number()
      .int()
      .positive()
      .max(60_000)
      .optional()
      .default(15_000)
      .describe("Timeout in ms (default: 15s, max: 60s)"),
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

function sandboxCommandIsSafe(command: string): boolean {
  // This is a deliberate guardrail rather than an OS security boundary. It
  // rejects the path forms that can leave the selected project tree while the
  // process itself is pinned to that tree as its cwd.
  return !/(^|[\s;|&])\.\.([/\\]|\s|$)|(^|[\s;|&])[/\\]/.test(command);
}

/**
 * Candidates for the system shell, in order of preference. `bash` covers
 * Linux/macOS and Git Bash on Windows; `sh` (POSIX) is a fallback for
 * minimal environments (e.g. Alpine containers, Windows without Git Bash)
 * that ship no `bash`.
 */
const SHELL_CANDIDATES = ["bash", "sh"];

/**
 * Run a command through the first available system shell. When a shell
 * binary is missing (ENOENT), falls back to the next candidate so the tool
 * keeps working in minimal environments; only when no shell exists at all
 * returns a clear error instead of the raw "Cannot run: spawn bash ENOENT".
 */
async function runShellCommand(
  command: string,
  opts: { cwd: string; timeoutMs: number; start: number },
): Promise<SandboxResult> {
  for (const shell of SHELL_CANDIDATES) {
    const result = await spawnSubprocess(shell, ["-lc", command], opts);
    // spawnSubprocess reports a missing binary as exitCode -1 with a
    // "Cannot run: spawn <name> …" message. Only fall through in that case.
    if (result.exitCode === -1 && result.stderr.startsWith(`Cannot run: spawn ${shell} `)) {
      continue; // shell not present — try the next candidate
    }
    return result;
  }
  return {
    stdout: "",
    stderr:
      "No shell is available on this machine (tried: bash, sh). " +
      "Install bash or a POSIX shell to use Bash commands.",
    exitCode: -1,
    timedOut: false,
    durationMs: Date.now() - opts.start,
  };
}

/**
 * Resolve the working directory for a bash invocation.
 * In sandboxed mode the cwd is the first permitted root. If that root no
 * longer exists on this machine (configured elsewhere, or a host path inside
 * a container), fall back to a throwaway temp dir and surface a clear
 * warning — otherwise every command would die with a misleading
 * `spawn bash ENOENT` even though the shell exists.
 */
async function resolveBashCwd(
  rootPath: string | null,
): Promise<{ cwd: string; warning?: string; tempDir?: string }> {
  if (!rootPath) return { cwd: process.cwd() };
  try {
    const st = await fs.stat(rootPath);
    if (st.isDirectory()) return { cwd: rootPath };
  } catch {
    // Root missing or unreadable — fall through to the temp fallback
  }
  const tempDir = await createSandboxDir();
  return {
    cwd: tempDir,
    tempDir,
    warning:
      `WARNING: configured root "${rootPath}" does not exist on this machine ` +
      `(check Settings > Directories). Bash ran in a temporary directory instead.`,
  };
}

/**
 * Human-readable note appended to a tool result when the command was killed
 * by the timeout, so the model clearly sees the run was cut short.
 */
function buildTimeoutNote(timeoutMs: number): string {
  const secs = timeoutMs / 1000;
  // Whole seconds for long timeouts, one decimal for short ones (1.5s).
  const label =
    secs >= 10
      ? `${Math.round(secs)}s`
      : `${Math.round(secs * 10) / 10}s`;
  return (
    `\n⚠️ Command timed out after ${label} and was terminated. ` +
    `The output above was captured up to the timeout.`
  );
}

export function buildBashExecuteTool(mode: "sandboxed" | "full") {
  return {
    description: mode === "sandboxed"
      ? "Run a shell COMMAND (e.g. build, test, start a server, check a process, install a package) in the session's permitted project directory (relative paths only; commands leaving the project tree are rejected). ⚠️ Commands ONLY — do NOT create, edit, or delete files/folders with this tool; use write_file/edit_file/session_file_write for that. Default timeout: 30s, max: 120s. On timeout the command is terminated and partial output is returned."
      : "Run a shell COMMAND with full device access (e.g. build, test, start a server, check a process, install a package; explicitly enabled by the user for this session). ⚠️ Commands ONLY — do NOT create, edit, or delete files/folders with this tool; use write_file/edit_file/session_file_write for that. Use only for work the user requested. Default timeout: 30s, max: 120s. On timeout the command is terminated and partial output is returned.",
    parameters: z.object({
      command: z.string().min(1).describe("Bash command to execute"),
      timeout: z
        .number()
        .int()
        .positive()
        .max(120_000)
        .optional()
        .default(30_000)
        .describe("Timeout in ms (default: 30s, max: 120s)"),
    }),
    execute: async ({ command, timeout }: { command: string; timeout?: number }) => {
      if (mode === "sandboxed" && !sandboxCommandIsSafe(command)) {
        return {
          stdout: "",
          stderr: "Sandboxed Bash accepts relative project paths only; absolute paths and parent-directory traversal are blocked.",
          exitCode: -1,
          timedOut: false,
          duration: "0ms",
          mode,
        };
      }
      const roots = await getPermittedRoots();
      const writableRoot = roots.find((root) => root.canWrite) ?? roots.find((root) => root.canRead);
      if (mode === "sandboxed" && !writableRoot) {
        return { stdout: "", stderr: "No permitted directory is configured for sandboxed Bash.", exitCode: -1, timedOut: false, duration: "0ms", mode };
      }

      const start = Date.now();
      let tempDir: string | undefined;
      try {
        // Sandboxed cwd = the permitted root (falls back to a temp dir when
        // the configured root doesn't exist on this machine). Full mode runs
        // in the server's own working directory.
        const { cwd, warning, tempDir: fallbackDir } =
          mode === "sandboxed"
            ? await resolveBashCwd(writableRoot!.path)
            : { cwd: process.cwd(), warning: undefined, tempDir: undefined };
        tempDir = fallbackDir;

        const timeoutMs = timeout ?? 30_000;
        const result = await runShellCommand(command, {
          cwd,
          timeoutMs,
          start,
        });

        const stderr = [
          warning,
          result.stderr,
          // When the command was killed by the timeout, make it explicit in
          // the output itself (not just the timedOut flag).
          result.timedOut ? buildTimeoutNote(timeoutMs) : undefined,
        ]
          .filter((s): s is string => Boolean(s))
          .join("\n");

        return truncateToolResult({
          stdout: result.stdout,
          stderr,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          duration: `${result.durationMs}ms`,
          mode,
          // When the configured root was missing and bash ran in a temp dir,
          // omit the label — the warning on stderr explains the fallback.
          ...(mode === "sandboxed" && !tempDir ? { root: writableRoot!.label } : {}),
        });
      } finally {
        if (tempDir) await cleanupSandboxDir(tempDir);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Builder function for the chat route
// ---------------------------------------------------------------------------

/**
 * Build code execution tools. Only includes them if the user has enabled
 * the "code_execution" tool config in settings. Disabled by default for
 * security reasons (not a secure sandbox).
 */
export async function buildExecutionTools(
  bashMode: "sandboxed" | "full" = "sandboxed",
): Promise<Record<string, any>> {
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
    bash_execute: buildBashExecuteTool(bashMode),
  };
}
