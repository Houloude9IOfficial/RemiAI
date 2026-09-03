#!/usr/bin/env tsx
/**
 * RemiAI Launcher
 *
 * Interactive CLI launcher that asks the user how they want to run RemiAI:
 *   1. Desktop App (Electron)  — launches the full native desktop app
 *   2. Web Server (browser)    — starts the Next.js server for browser access
 *
 * Usage:
 *   npx tsx scripts/launcher.ts          # Interactive prompt
 *   npx tsx scripts/launcher.ts web      # Skip prompt, start web server
 *   npx tsx scripts/launcher.ts electron # Skip prompt, start Electron app
 *   npx tsx scripts/launcher.ts web --port 3001 --searxng-port 3106
 *   npx tsx scripts/launcher.ts --help   # Show help
 *
 * The launcher checks whether Electron is installed before offering the
 * Desktop App option, so it degrades gracefully if Electron isn't available.
 */

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

/**
 * Spawn a command portably.
 *
 * On Windows, `npx` (and other npm bins) are `.cmd` shims that `spawn()`
 * cannot execute directly — it raises `spawn npx ENOENT` unless the child
 * runs through the shell (which resolves `.cmd` via PATHEXT).
 */
function spawnCommand(
  command: string,
  args: string[],
  options: SpawnOptions & { stdio: "inherit" },
): ChildProcess {
  const isWindows = process.platform === "win32";
  return spawn(isWindows ? `${command}.cmd` : command, args, {
    ...options,
    shell: isWindows,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SEARXNG_STARTUP_TIMEOUT_MS = 30_000;
const SEARXNG_POLL_INTERVAL_MS = 1_000;

/** Load simple KEY=value entries before the launcher starts child processes. */
function loadProjectEnv(): void {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const rawLine of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    process.env[key] = value;
  }
}

function isSearxngEnabled(): boolean {
  const value = process.env.SEARXNG?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "no" && value !== "off";
}

function getArgumentValue(name: string): string | undefined {
  const args = process.argv.slice(2);
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function isValidPort(value: string | undefined): value is string {
  if (!value || !/^[0-9]{1,5}$/.test(value)) return false;
  const port = Number(value);
  return port >= 1 && port <= 65535;
}

function applyPortArguments(): void {
  const appPort = getArgumentValue("--port");
  const searxngPort = getArgumentValue("--searxng-port");

  if (appPort !== undefined) {
    if (!isValidPort(appPort)) throw new Error(`Invalid --port value: ${appPort}`);
    process.env.PORT = appPort;
  }
  if (searxngPort !== undefined) {
    if (!isValidPort(searxngPort)) throw new Error(`Invalid --searxng-port value: ${searxngPort}`);
    process.env.SEARXNG_PORT = searxngPort;
  }
}

function isElectronInstalled(): boolean {
  try {
    // Check if the electron package is available
    const electronPath = path.join(PROJECT_ROOT, "node_modules", "electron");
    return fs.existsSync(electronPath);
  } catch {
    return false;
  }
}

function getModeFromArgs(): "web" | "electron" | null {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("web")) return "web";
  if (args.includes("electron") || args.includes("desktop")) return "electron";

  return null;
}

function printHelp(): void {
  console.log(`
RemiAI Launcher — Choose how to run RemiAI

Usage:
  npx tsx scripts/launcher.ts            Interactive prompt (recommended)
  npx tsx scripts/launcher.ts web        Start web server directly
  npx tsx scripts/launcher.ts electron   Start Electron desktop app directly
  npx tsx scripts/launcher.ts web --port 3001 --searxng-port 3106
  --port PORT                              App port (default: 3000)
  --searxng-port PORT                      SearXNG host port (default: 3105)

After choosing, you can press Ctrl+C at any time to stop the server.
  `.trim());
  console.log();
}

// ---------------------------------------------------------------------------
// Interactive prompt
// ---------------------------------------------------------------------------

async function promptForMode(): Promise<"web" | "electron"> {
  // Dynamic import — inquirer is ESM-only in recent versions
  const inquirer = await import("inquirer");

  const choices: { name: string; value: "web" | "electron"; short: string }[] = [
    {
      name: "🌐  Web Server (browser)  — Access RemiAI from your browser",
      value: "web",
      short: "Web Server",
    },
  ];

  if (isElectronInstalled()) {
    choices.unshift({
      name: "🖥️  Desktop App (Electron)  — Run as a native desktop application",
      value: "electron",
      short: "Desktop App",
    });
  }

  // inquirer is ESM-only ("type": "module"), so default is the API object.
  // Fallback to inquirer itself for edge-case CJS interop scenarios.
  const inq = (inquirer.default ?? inquirer) as unknown as typeof inquirer.default;
  const { mode } = await inq.prompt([
    {
      type: "select",
      name: "mode",
      message: "How would you like to run RemiAI?",
      choices,
      default: isElectronInstalled() ? "electron" : "web",
    },
  ]);

  return mode as "web" | "electron";
}

// ---------------------------------------------------------------------------
// Launchers
// ---------------------------------------------------------------------------

function startWebServer(devMode: boolean): void {
  const port = process.env.PORT || "3000";
  const host = "127.0.0.1";

  const args = devMode
    ? ["next", "dev", "-H", host, "-p", port]
    : ["next", "start", "-H", host, "-p", port];

  console.log(`\n🚀  Starting RemiAI as a web server...`);
  console.log(`📡  Listening at http://${host}:${port}\n`);

  const child = spawnCommand("npx", args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: { ...process.env, PORT: port, SEARXNG_URL: getSearxngUrl() },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    child.kill("SIGINT");
    process.exit(0);
  });
}

function startElectronApp(devMode: boolean): void {
  const electronEntry = path.join(PROJECT_ROOT, "electron", "main.ts");
  const compiledEntry = path.join(PROJECT_ROOT, "electron-dist", "main.js");
  const port = devMode ? "3456" : process.env.PORT || "3456";

  // ── Step 1: Compile Electron TypeScript to JS ───────────────────
  console.log(`\n🔧  Compiling Electron source files...\n`);

  const tscResult = spawnCommand(
    "npx",
    ["tsc", "-p", "electron/tsconfig.json"],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
    },
  );

  tscResult.on("exit", (code) => {
    if (code !== 0) {
      console.error(`❌  Electron compilation failed (exit code: ${code})`);
      process.exit(code ?? 1);
    }

    if (!fs.existsSync(compiledEntry)) {
      console.error(`❌  Compiled Electron entry not found: ${compiledEntry}`);
      console.error(`    Make sure the compilation succeeded.`);
      process.exit(1);
    }

    // ── Step 2: Launch Electron with compiled output ──────────────
    console.log(`\n🖥️  Starting RemiAI as a desktop app...\n`);

    const child = spawnCommand(
      "npx",
      ["electron", compiledEntry],
      {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
        env: {
          ...process.env,
          NODE_ENV: devMode ? "development" : "production",
          PORT: port,
          SEARXNG_URL: getSearxngUrl(),
        },
      },
    );

    child.on("exit", (exitCode) => {
      process.exit(exitCode ?? 0);
    });

    process.on("SIGINT", () => {
      child.kill("SIGINT");
      process.exit(0);
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // The launcher runs before Next.js loads .env, so load it explicitly for
  // startup decisions such as whether the local SearXNG service is enabled.
  loadProjectEnv();
  applyPortArguments();

  // Parse help/mode arguments before starting services. This keeps `--help`
  // side-effect free while still allowing the normal interactive flow to
  // start SearXNG before the app surface is selected.
  const forcedMode = getModeFromArgs();

  // Start the local search backend before choosing the app surface. The
  // service is left running after the launcher exits so a later npm start does
  // not need to pull or recreate it again.
  await startSearxng();

  // Determine dev vs production mode
  // If the script is invoked as `npm run dev`, NODE_ENV may not be set
  // Heuristic: if the Next.js app hasn't been built yet, assume dev mode.
  // `npm run dev` must remain development mode even when a previous
  // production build left a `.next/BUILD_ID` behind. Use the lifecycle name
  // as the source of truth; `npm run start` is the production entrypoint.
  const devMode =
    process.argv.includes("--dev") ||
    process.env.npm_lifecycle_event === "dev" ||
    process.env.NODE_ENV === "development";

  const mode = forcedMode ?? (await promptForMode());

  console.log(`\n✨  RemiAI v${getPackageVersion()} — ${mode === "electron" ? "Desktop App" : "Web Server"} mode\n`);

  if (mode === "web") {
    startWebServer(devMode);
  } else {
    startElectronApp(devMode);
  }
}

function getSearxngPort(): string {
  const configured = process.env.SEARXNG_PORT?.trim();
  return isValidPort(configured) ? configured : "3105";
}

function getSearxngUrl(): string {
  return process.env.SEARXNG_URL?.trim() || `http://127.0.0.1:${getSearxngPort()}`;
}

/** Start the local SearXNG container without making it a launcher hard dependency. */
async function waitForSearxng(url: string): Promise<boolean> {
  const deadline = Date.now() + SEARXNG_STARTUP_TIMEOUT_MS;
  const healthUrl = new URL("/healthz", url).toString();

  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(healthUrl, {
        signal: controller.signal,
        headers: { Accept: "text/plain" },
      });
      if (response.ok) return true;
    } catch {
      // The container may still be initializing or restarting.
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, SEARXNG_POLL_INTERVAL_MS));
  }

  return false;
}

async function startSearxng(): Promise<void> {
  if (!isSearxngEnabled()) {
    console.log("\n🔎  SearXNG is disabled (SEARXNG=false).\n");
    return Promise.resolve();
  }

  if (process.env.SEARXNG_URL?.trim()) {
    console.log(`\\n🔎  Using configured SearXNG at ${getSearxngUrl()}\\n`);
    return Promise.resolve();
  }

  const port = getSearxngPort();
  console.log(`\\n🔎  Starting SearXNG on http://127.0.0.1:${port}...`);

  return new Promise((resolve) => {
    const child = spawnCommand(
      "docker",
      ["compose", "--profile", "true", "up", "-d", "searxng"],
      {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
        env: { ...process.env, SEARXNG: "true", SEARXNG_PORT: port },
      },
    );

    child.once("error", (error) => {
      console.warn(`⚠️  Could not start SearXNG: ${error.message}`);
      console.warn("    Continuing without local search; configured fallbacks can still be used.");
      resolve();
    });
    child.once("exit", async (code) => {
      if (code === 0 && await waitForSearxng(getSearxngUrl())) {
        console.log(`✅  SearXNG passed its health check at ${getSearxngUrl()}\n`);
      } else if (code === 0) {
        console.warn(`⚠️  SearXNG did not pass its health check within ${SEARXNG_STARTUP_TIMEOUT_MS / 1000}s.`);
        console.warn("    The container may be restarting; continuing with configured fallbacks.");
      } else {
        console.warn(`⚠️  SearXNG startup failed (exit code: ${code ?? "unknown"}).`);
        console.warn("    Continuing without local search; configured fallbacks can still be used.");
      }
      resolve();
    });
  });
}

function getPackageVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8"),
    );
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

main().catch((err) => {
  console.error("❌  Launcher error:", err);
  process.exit(1);
});
