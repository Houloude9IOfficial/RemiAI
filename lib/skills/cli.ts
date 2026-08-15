import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Thin wrapper around the `npx skills` CLI (the skills.sh ecosystem CLI).
 *
 * Used as the fallback install path for source types the native GitHub
 * fetcher doesn't cover (GitLab, direct download/archive URLs, local paths,
 * git URLs) and for ecosystem search/discovery. Spawns `npx --yes skills`
 * with a timeout so a slow first-run package download can't hang a request.
 */

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** Locate an executable on PATH, preferring a local node_modules/.bin. */
function findExecutable(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  // Fall back to PATH lookup via a shell-out free check is complex; rely on
  // `npx` being resolvable through the shell's PATH below.
  return candidates[0];
}

/**
 * Run `npx skills <args>` non-interactively.
 *
 * - Uses `--yes` so npx never prompts to install the package.
 * - On Windows prefers `npx.cmd` / the local `.bin` shim.
 * - Never throws for non-zero exits — the caller inspects `exitCode`.
 */
export async function runSkillsCli(
  args: string[],
  opts: { timeoutMs?: number; cwd?: string } = {},
): Promise<CliResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const isWin = process.platform === "win32";
  const localBin = path.join(process.cwd(), "node_modules", ".bin");
  const npxCandidates = isWin
    ? [
        path.join(localBin, "npx.cmd"),
        path.join(localBin, "skills.cmd"),
        "npx.cmd",
        "npx",
      ]
    : [path.join(localBin, "skills"), "npx"];

  const npxPath = findExecutable(npxCandidates) ?? "npx";
  const command = npxPath;
  const commandArgs = isWin
    ? ["--yes", "skills", ...args]
    : ["--yes", "skills", ...args];

  return new Promise<CliResult>((resolve) => {
    execFile(
      command,
      commandArgs,
      {
        cwd: opts.cwd ?? process.cwd(),
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        env: {
          ...process.env,
          CI: "1",
          NO_COLOR: "1",
        },
      },
      (error, stdout, stderr) => {
        const exitCode =
          (error as { code?: number | string } | null)?.code ?? 0;
        const code =
          typeof exitCode === "number" ? exitCode : error ? 1 : 0;
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: code,
        });
      },
    );
  });
}

