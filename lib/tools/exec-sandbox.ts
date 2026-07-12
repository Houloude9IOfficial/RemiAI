import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Shared sandbox types
// ---------------------------------------------------------------------------

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Temp directory lifecycle
// ---------------------------------------------------------------------------

const SANDBOX_BASE = path.join(os.tmpdir(), "remiai-sandbox");

/**
 * Create an isolated temp directory for a single code execution.
 * The directory path is a random hex string so concurrent executions
 * don't interfere with each other.
 */
export async function createSandboxDir(): Promise<string> {
  const id = crypto.randomBytes(8).toString("hex");
  const dir = path.join(SANDBOX_BASE, id);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Remove a sandbox directory and all its contents.
 * Silently ignores errors (e.g. dir already deleted, permissions).
 */
export async function cleanupSandboxDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Warning string appended to tool descriptions
// ---------------------------------------------------------------------------

export const SANDBOX_WARNING = `⚠️ SECURITY WARNING: This is NOT a secure sandbox.

The code runs as a subprocess on the user's machine with FULL filesystem access.
- ⚠️ It CAN read, write, and delete ANY file on the system
- ⚠️ It CAN make network connections
- ⚠️ It CAN access all environment variables (currently stripped)
- ⚠️ It CAN run other executables

All environment variables (PATH, HOME, etc.) are stripped to make it harder
to discover files, but absolute paths still work.

True filesystem isolation requires Docker containers.
Do NOT run untrusted code through this tool.

If you need to access the user's files safely, use the dedicated filesystem
tools (read_file, list_directory, etc.) instead.`;
