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
 *   npx tsx scripts/launcher.ts --help   # Show help
 *
 * The launcher checks whether Electron is installed before offering the
 * Desktop App option, so it degrades gracefully if Electron isn't available.
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, "..");

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

  // inquirer exports differ between CJS and ESM interop — handle both.
  const inq = (inquirer.default ?? inquirer) as typeof inquirer;
  const { mode } = await inq.prompt([
    {
      type: "list",
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

  const child = spawn("npx", args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: { ...process.env, PORT: port },
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

  const tscResult = spawn(
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

    const child = spawn(
      "npx",
      ["electron", compiledEntry],
      {
        cwd: PROJECT_ROOT,
        stdio: "inherit",
        env: {
          ...process.env,
          NODE_ENV: devMode ? "development" : "production",
          PORT: port,
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
  // Determine dev vs production mode
  // If the script is invoked as `npm run dev`, NODE_ENV may not be set
  // Heuristic: if the Next.js app hasn't been built yet, assume dev mode.
  const devMode =
    process.env.NODE_ENV === "development" ||
    !fs.existsSync(path.join(PROJECT_ROOT, ".next", "BUILD_ID"));

  const forcedMode = getModeFromArgs();
  const mode = forcedMode ?? (await promptForMode());

  console.log(`\n✨  RemiAI v${getPackageVersion()} — ${mode === "electron" ? "Desktop App" : "Web Server"} mode\n`);

  if (mode === "web") {
    startWebServer(devMode);
  } else {
    startElectronApp(devMode);
  }
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
