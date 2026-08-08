#!/usr/bin/env node
// scripts/install-playwright-browsers.mjs
//
// Stages Playwright's Chromium into build/playwright-browsers so
// electron-builder can bundle it into the desktop installer (extraResources
// in electron-builder.yml). The packaged app points PLAYWRIGHT_BROWSERS_PATH
// at resources/playwright-browsers (electron/main.ts), which makes the
// Browser Automation tool work out of the box with zero user setup.
//
// This must run on the SAME OS/arch as the installer being built:
//   npm run dist:mac   → Chromium for macOS (arm64 or x64, matching host)
//   npm run dist:win   → Chromium for Windows x64
//   npm run dist:linux → Chromium for Linux x64
//
// The script reuses the project's own playwright package (same version the
// server runs), so the bundled browser revision always matches what the app
// expects. Downloads are cached by playwright, so re-builds are cheap.
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = path.join(root, "build", "playwright-browsers");

// `require` is unavailable in ESM — create a scoped resolver so we can
// locate the project's own playwright package (same version the server runs).
const require = createRequire(import.meta.url);

// Resolve the playwright CLI from the project's own node_modules.
function resolvePlaywrightCli() {
  try {
    const pkgJson = require.resolve("playwright/package.json", {
      paths: [root],
    });
    return path.join(path.dirname(pkgJson), "cli.js");
  } catch {
    return null;
  }
}

// Sum real file sizes on disk. Directory symlinks (`.links`) point back into
// the same tree and must be skipped to avoid double counting.
function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    if (entry === ".links") continue;
    const p = path.join(dir, entry);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) continue;
    total += st.isDirectory() ? dirSize(p) : st.size;
  }
  return total;
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });
}

async function main() {
  console.log("[playwright:browsers] Staging Chromium into " + targetDir);

  const cli = resolvePlaywrightCli();
  if (!cli || !existsSync(cli)) {
    console.error(
      "[playwright:browsers] Cannot find the playwright CLI in node_modules. " +
        "Run `npm install` first.",
    );
    process.exit(1);
  }

  const env = {
    PLAYWRIGHT_BROWSERS_PATH: targetDir,
    // The `playwright` postinstall already auto-downloaded browsers unless
    // skipped — this script is the explicit, controlled path.
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
  };

  // Install ONLY the Playwright Headless Shell (chromium --only-shell): the
  // Browser Automation tool is headless-only, and the shell is ~5× smaller
  // than the full Chromium build — a meaningful installer-size win on every
  // platform. (Users who want the full build can run `npm run
  // playwright:install` in dev, and the tool also falls back to system
  // Chrome/Edge.)
  await run(
    process.execPath,
    [cli, "install", "chromium", "--only-shell"],
    env,
  );

  if (existsSync(targetDir)) {
    const sizeMb = (dirSize(targetDir) / 1024 / 1024).toFixed(1);
    console.log(
      `[playwright:browsers] Done — ${sizeMb} MB staged. ` +
        "electron-builder will bundle it into the installer.",
    );
  } else {
    console.error("[playwright:browsers] Staging directory missing — install failed?");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[playwright:browsers] Failed:", err.message);
  process.exit(1);
});
