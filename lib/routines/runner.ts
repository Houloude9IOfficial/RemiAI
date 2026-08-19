import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns, routines, routineLogs } from "@/db/schema";
import {
  createSandboxDir,
  cleanupSandboxDir,
} from "@/lib/tools/exec-sandbox";
import {
  createAutomationRun,
  finishAutomationRun,
  getAutomationRun,
  scheduleAutomationRetry,
  startAutomationRun,
} from "@/lib/runs/automation";

// ---------------------------------------------------------------------------
// Execution result type
// ---------------------------------------------------------------------------

export interface ActionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// JS execution — adapted from lib/tools/exec.ts runJavaScript
// ---------------------------------------------------------------------------

function getSafeEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
  };
  if (process.platform === "win32") {
    env.SYSTEMROOT = process.env.SYSTEMROOT ?? "";
  }
  return env as NodeJS.ProcessEnv;
}

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

async function runJavaScript(
  code: string,
  timeoutMs: number = 30_000,
): Promise<ActionResult> {
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

interface SpawnOptions {
  cwd: string;
  timeoutMs: number;
  start: number;
}

function spawnSubprocess(
  command: string,
  args: string[],
  opts: SpawnOptions,
): Promise<ActionResult> {
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
// Public API — execute a routine by its DB record
// ---------------------------------------------------------------------------

/**
 * Execute a routine and store the result in the routine_logs table.
 * Returns the routine log record ID.
 */
export type RoutineExecutionOptions = {
  conversationId?: number;
  automationRunId?: number;
};

export async function executeRoutine(
  routineId: number,
  timeoutMs: number = 30_000,
  options: RoutineExecutionOptions = {},
): Promise<{ logId: number; result: ActionResult; automationRunId?: number }> {
  // Get the routine
  const routine = await db
    .select()
    .from(routines)
    .where(eq(routines.id, routineId))
    .get();

  if (!routine) {
    throw new Error(`Routine not found: ${routineId}`);
  }

  let automationRunId = options.automationRunId;
  if (options.conversationId && !automationRunId) {
    const run = await createAutomationRun({
      conversationId: options.conversationId,
      kind: "routine",
      sourceId: routine.id,
      name: `Routine: ${routine.name}`,
      task: routine.description || `Run routine ${routine.name}`,
    });
    automationRunId = run.id;
  }
  if (automationRunId) {
    const existingRun = await getAutomationRun(automationRunId);
    if (existingRun?.control === "stop" || existingRun?.status === "cancelled") {
      return {
        logId: 0,
        result: { stdout: "", stderr: "Cancelled by user", exitCode: -1, timedOut: false, durationMs: 0 },
        automationRunId,
      };
    }
    await startAutomationRun(automationRunId);
  }

  // Create log entry
  const log = await db
    .insert(routineLogs)
    .values({
      automationRunId: automationRunId ?? null,
      routineId: routine.id,
      status: "running" as const,
      startedAt: new Date().toISOString(),
    })
    .returning()
    .get();

  if (automationRunId) {
    await db.update(automationRuns).set({
      checkpoint: { phase: "executing", routineId: routine.id, logId: log.id },
      updatedAt: new Date().toISOString(),
    }).where(eq(automationRuns.id, automationRunId)).run();
  }

  try {
    const result = await runJavaScript(routine.code, timeoutMs);

    const status = result.exitCode === 0 ? "completed" as const : "failed" as const;

    await db
      .update(routineLogs)
      .set({
        status,
        output: result.stdout + (result.stderr ? `\n--- stderr ---\n${result.stderr}` : ""),
        error: result.exitCode !== 0 && result.exitCode !== null
          ? `Exit code: ${result.exitCode}${result.timedOut ? " (timed out)" : ""}`
          : result.timedOut ? "Timed out" : null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(routineLogs.id, log.id))
      .run();

    if (automationRunId && status === "failed") {
      const canRetry = await scheduleAutomationRetry(automationRunId, `Exit code: ${result.exitCode}`);
      if (canRetry) {
        const retryRun = await getAutomationRun(automationRunId);
        const delayMs = retryRun?.nextRetryAt
          ? Math.max(0, new Date(retryRun.nextRetryAt).getTime() - Date.now())
          : 2_000;
        setTimeout(() => {
          void executeRoutine(routineId, timeoutMs, { ...options, automationRunId });
        }, delayMs);
        return { logId: log.id, result, automationRunId };
      }
    }
    if (automationRunId) {
      await finishAutomationRun(automationRunId, {
        status: status === "completed" ? "completed" : "failed",
        result: result.stdout,
        error: status === "failed" ? `Exit code: ${result.exitCode}` : null,
        checkpoint: { phase: status, routineId: routine.id, logId: log.id },
      });
    }
    return { logId: log.id, result, automationRunId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db
      .update(routineLogs)
      .set({
        status: "failed" as const,
        error: errorMessage,
        completedAt: new Date().toISOString(),
      })
      .where(eq(routineLogs.id, log.id))
      .run();

    if (automationRunId) {
      await finishAutomationRun(automationRunId, {
        status: "failed",
        error: errorMessage,
        checkpoint: { phase: "failed", routineId: routine.id, logId: log.id },
      });
    }
    return {
      logId: log.id,
      result: {
        stdout: "",
        stderr: errorMessage,
        exitCode: -1,
        timedOut: false,
        durationMs: 0,
      },
      automationRunId,
    };
  }
}
