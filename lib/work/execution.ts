import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getRuntimeDb, getRuntimeSqlite } from "@/db";
import { directories } from "@/db/schema";
import { getCanvasDir, slugify } from "@/lib/canvas/storage";
import { runShellCommand, sandboxCommandIsSafe } from "@/lib/tools/exec";
import { getWorkRun } from "@/lib/work/runs";
import { writeSessionFile } from "@/lib/session-files/storage";
import { publishWorkRunEvent } from "@/lib/work/events";

type ManagedServer = { process: ChildProcess; port: number; cwd: string; logs: string; startedAt: string };
const servers = new Map<number, ManagedServer>();

function kill(proc: ChildProcess) {
  try { if (proc.pid && process.platform !== "win32") process.kill(-proc.pid, "SIGTERM"); else proc.kill("SIGTERM"); } catch { /* already stopped */ }
}
export function stopWorkServer(runId: number) { const server = servers.get(runId); if (!server) return false; servers.delete(runId); kill(server.process); return true; }
export function getWorkServerUrl(runId: number) { const server = servers.get(runId); return server && server.process.exitCode === null ? `http://127.0.0.1:${server.port}` : undefined; }
export function stopConversationWorkServers(_conversationId: number) { for (const id of [...servers.keys()]) stopWorkServer(id); }
async function reservePort(): Promise<number> { return new Promise((resolve, reject) => { const s = net.createServer(); s.once("error", reject); s.listen(0, "127.0.0.1", () => { const a = s.address(); const port = typeof a === "object" && a ? a.port : 0; s.close((e) => e ? reject(e) : resolve(port)); }); }); }
async function loopbackListening(port: number): Promise<boolean> { return new Promise((resolve) => { const socket = net.connect({ host: "127.0.0.1", port }); const done = (value: boolean) => { socket.destroy(); resolve(value); }; socket.setTimeout(1_000, () => done(false)); socket.once("connect", () => done(true)); socket.once("error", () => done(false)); }); }

async function targetCwd(conversationId: number, runId: number) {
  const db = getRuntimeDb();
  const run = await getWorkRun(conversationId, runId); if (!run || !["building", "testing"].includes(run.phase)) throw new Error("Work execution requires an approved run.");
  if (run.targetType === "canvas") { const cwd = getCanvasDir(conversationId, slugify(run.canvasName ?? "canvas")); await fs.mkdir(cwd, { recursive: true }); return cwd; }
  const root = run.directoryId ? await db.select().from(directories).where(eq(directories.id, run.directoryId)).get() : null;
  if (!root?.canWrite) throw new Error("The selected Work directory is no longer writable.");
  const cwd = path.resolve(root.path, run.targetPath || "."); const boundary = path.resolve(root.path) + path.sep;
  if (cwd !== path.resolve(root.path) && !cwd.startsWith(boundary)) throw new Error("Work target escapes its configured root.");
  return cwd;
}
async function recordTerminalLog(conversationId: number, runId: number, label: string, body: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeSessionFile(conversationId, `work-runs/${runId}/logs/${stamp}-${label}.log`, body.slice(0, 100_000), "overwrite");
}
async function markWorkTesting(conversationId: number, runId: number) {
  const updatedAt = new Date().toISOString();
  const result = getRuntimeSqlite().prepare("UPDATE work_runs SET phase = 'testing', updated_at = ? WHERE id = ? AND conversation_id = ?")
    .run(updatedAt, runId, conversationId);
  if (result.changes !== 1) throw new Error("Work run not found while starting preview testing.");
  publishWorkRunEvent({ conversationId, runId, phase: "testing", updatedAt });
}

/** Build-only terminal and loopback-preview controls. These deliberately do not depend on the normal terminal toggle. */
export function buildWorkExecutionTools(conversationId: number, runId: number) {
  return {
    work_terminal: { description: "Run a read/build/test command from the approved Work target. Absolute paths and parent traversal are rejected.", inputSchema: z.object({ command: z.string().min(1), timeout: z.number().int().positive().max(120_000).optional().default(30_000) }), execute: async ({ command, timeout }: { command: string; timeout?: number }) => {
      if (!sandboxCommandIsSafe(command)) return { exitCode: -1, stderr: "Work terminal rejects absolute paths and parent traversal." };
      const cwd = await targetCwd(conversationId, runId); const started = Date.now(); const out = await runShellCommand(command, { cwd, timeoutMs: timeout ?? 30_000, start: started }); await recordTerminalLog(conversationId, runId, "terminal", `$ ${command}\n\n${out.stdout}\n${out.stderr}`); return { ...out, cwd: "selected work target" };
    } },
    work_server_start: { description: "Start one local preview server from the approved Work target. It receives HOST=127.0.0.1 and a reserved PORT, and is never exposed remotely.", inputSchema: z.object({ command: z.string().min(1), timeout: z.number().int().positive().max(30_000).optional().default(15_000) }), execute: async ({ command, timeout }: { command: string; timeout?: number }) => {
      if (!sandboxCommandIsSafe(command)) return { started: false, error: "Work server rejects absolute paths and parent traversal." };
      stopWorkServer(runId); const cwd = await targetCwd(conversationId, runId); const port = await reservePort(); const proc: ChildProcess = spawn("bash", ["-lc", command], { cwd, env: { ...process.env, PATH: process.env.PATH ?? "/usr/bin:/bin", HOST: "127.0.0.1", PORT: String(port), HOSTNAME: "127.0.0.1" }, detached: process.platform !== "win32", stdio: "pipe" });
      const server: ManagedServer = { process: proc, port, cwd, logs: "", startedAt: new Date().toISOString() }; servers.set(runId, server);
      const collect = (chunk: Buffer) => { server.logs = (server.logs + chunk.toString("utf8")).slice(-20_000); }; proc.stdout?.on("data", collect); proc.stderr?.on("data", collect); proc.once("exit", () => servers.delete(runId));
      const deadline = Date.now() + (timeout ?? 15_000); let listening = false;
      while (Date.now() < deadline && proc.exitCode === null) { listening = await loopbackListening(port); if (listening) break; await new Promise((resolve) => setTimeout(resolve, 200)); }
      if (proc.exitCode !== null || !listening) { await recordTerminalLog(conversationId, runId, "server-start", server.logs || "Process did not bind the requested 127.0.0.1 preview port."); stopWorkServer(runId); return { started: false, port, logs: server.logs || "Process did not bind the requested 127.0.0.1 preview port." }; }
      await recordTerminalLog(conversationId, runId, "server-start", `$ ${command}\n\n${server.logs}`); await markWorkTesting(conversationId, runId); return { started: true, port, url: `http://127.0.0.1:${port}`, bind: "127.0.0.1", logs: server.logs };
    } },
    work_server_status: { description: "Return the active Work preview server's loopback URL and bounded logs.", inputSchema: z.object({}), execute: async () => { const server = servers.get(runId); if (!server) return { running: false }; await recordTerminalLog(conversationId, runId, "server-status", server.logs); return { running: server.process.exitCode === null, url: `http://127.0.0.1:${server.port}`, logs: server.logs, startedAt: server.startedAt }; } },
    work_server_stop: { description: "Stop the active local Work preview server. Always call after testing.", inputSchema: z.object({}), execute: async () => ({ stopped: stopWorkServer(runId) }) },
  };
}
