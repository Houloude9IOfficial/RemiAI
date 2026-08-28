/**
 * Electron Main Process — RemiAI Desktop App
 *
 * Responsibilities:
 *   - Spawns the Next.js server (dev or production) as a child process
 *   - Creates the Electron BrowserWindow pointing to the local Next.js server
 *   - Manages system tray with minimise-to-tray behaviour
 *   - Sends native OS notifications
 *   - Checks for app updates via electron-updater (GitHub Releases)
 *
 * Architecture note:
 *   In development the Next.js server is spawned as a child process using the
 *   **system Node.js** binary (\`node\`), which matches the ABI of the locally
 *   installed \`better-sqlite3\`. In packaged builds the server runs with
 *   **Electron's bundled Node.js** instead (ELECTRON_RUN_AS_NODE) — users
 *   don't have a system Node.js installed (this used to fail with
 *   \`spawn node ENOENT\`). The native module is rebuilt for Electron's ABI
 *   during packaging (electron-builder + scripts/after-pack.cjs).
 */

import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  nativeImage,
  ipcMain,
  dialog,
  shell,
  type OpenDialogOptions,
} from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const PORT = Number(process.env.PORT) || 3456;
const NEXTJS_URL = `http://127.0.0.1:${PORT}`;

/**
 * Application root directory.
 *
 * - **Development:**  project root (one level up from `electron/`)
 * - **Packaged:**     `process.resourcesPath/app` — electron-builder places
 *   the `files` listed in `electron-builder.yml` here (unpacked from asar
 *   when listed in `asarUnpack`, or readable through the asar virtual
 *   filesystem otherwise).
 */
const APP_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;

/** Flag to distinguish hide-to-tray from actual quit. */
let isQuittingApp = false;

// ---------------------------------------------------------------------------
// Next.js server management
// ---------------------------------------------------------------------------

/**
 * Resolve the path to the Next.js CLI binary.
 *
 * Always uses the full `next` package from the project's node_modules: the
 * standalone output (.next/standalone) only traces what the production
 * server.js needs, so its CLI copy is incomplete (e.g. dist/cli/next-dev.js
 * is missing after tracing/pruning) and `next dev` fails there with
 * ERR_MODULE_NOT_FOUND. Production never uses the CLI anyway — it spawns
 * .next/standalone/server.js directly (see getNextCommand).
 */
function resolveNextCli(): string {
  // Root node_modules (dev, or a packaged fallback before standalone exists)
  const rootCli = path.join(APP_ROOT, "node_modules", "next", "dist", "bin", "next");
  if (fs.existsSync(rootCli)) return rootCli;

  // Resolve via node resolution
  return "next";
}

interface NextCommand {
  script: string;
  args: string[];
  cwd: string;
}

function getNextCommand(): NextCommand {
  if (isDev) {
    return {
      script: resolveNextCli(),
      args: ["dev", "-p", String(PORT), "-H", "127.0.0.1"],
      cwd: APP_ROOT,
    };
  }

  // Production — run the standalone server. In packaged builds the app files
  // live inside resources/app.asar, but spawn() needs a REAL directory for
  // cwd (and the standalone output is extracted to app.asar.unpacked by the
  // asarUnpack config). Using the resources/app/... virtual asar path for cwd
  // makes spawn fail with ENOENT, so resolve against the unpacked root.
  const productionRoot = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked")
    : APP_ROOT;

  const standaloneServer = path.join(
    productionRoot,
    ".next",
    "standalone",
    "server.js",
  );
  if (!fs.existsSync(standaloneServer)) {
    throw new Error(
      "Standalone Next.js server not found: " + standaloneServer,
    );
  }

  return {
    script: standaloneServer,
    args: [],
    cwd: path.join(productionRoot, ".next", "standalone"),
  };
}

function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const { script, args, cwd } = getNextCommand();

    // Packaged apps must NOT rely on a system `node` binary — most users
    // (especially on Windows) don't have Node.js installed, which made the
    // app fail on launch with `spawn node ENOENT`. Instead we run the server
    // with Electron's own bundled Node.js: ELECTRON_RUN_AS_NODE makes the
    // Electron binary behave as a plain Node.js process. The native
    // better-sqlite3 module is rebuilt for Electron's ABI during packaging
    // (electron-builder rebuild + scripts/after-pack.cjs), so the ABI matches.
    // In dev we keep the system node: it exists on dev machines and matches
    // the ABI of the locally installed better-sqlite3.
    const serverNodeBinary = app.isPackaged ? process.execPath : "node";

    console.log(`[electron] Starting Next.js server...`);
    console.log(
      `[electron]   binary: ${app.isPackaged ? "Electron bundled Node.js" : "node"}`,
    );
    console.log(`[electron]   script: ${script}`);
    console.log(`[electron]   args:   ${args.join(" ")}`);
    console.log(`[electron]   cwd:    ${cwd}`);

    serverProcess = spawn(serverNodeBinary, [script, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: isDev ? "development" : "production",
        PORT: String(PORT),
        // Run as a plain Node.js process when using Electron's binary.
        ...(app.isPackaged ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
        // The app bundle is read-only (macOS /Applications, Windows Program
        // Files), so all writable app data (SQLite DB, uploads, session
        // files, avatars, backups) lives in the OS user-data dir instead of
        // <cwd>/data. lib/paths.ts reads this variable.
        ...(!isDev
          ? { REMI_DATA_DIR: path.join(app.getPath("userData"), "data") }
          : {}),
        // Point Playwright at the Chromium bundled into the installer
        // (electron-builder extraResources: build/playwright-browsers →
        // resources/playwright-browsers, staged by npm run playwright:browsers).
        // In dev the default cache (~/Library/Caches/ms-playwright, ...) is
        // used, populated by `npm run playwright:install`.
        ...(app.isPackaged
          ? {
              PLAYWRIGHT_BROWSERS_PATH: path.join(
                process.resourcesPath,
                "playwright-browsers",
              ),
            }
          : {}),
      },
    });

    serverProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      console.log(`[next] ${text.trim()}`);
    });

    serverProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      process.stderr.write(`[next:err] ${text}`);
    });

    serverProcess.on("error", (err: Error) => {
      console.error("[electron] Failed to start Next.js server:", err);
      reject(err);
    });

    serverProcess.on("exit", (code: number | null, signal: string | null) => {
      console.log(`[electron] Next.js server exited (code=${code}, signal=${signal})`);
      serverProcess = null;
    });

    // Wait for the server to become available
    pollServer(NEXTJS_URL, 60)
      .then(resolve)
      .catch(reject);
  });
}

/**
 * Poll the Next.js server URL repeatedly until it responds or the maximum
 * number of retries is exhausted.
 */
function pollServer(url: string, maxRetries: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      http
        .get(url, (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
            resolve();
          } else if (attempts < maxRetries) {
            setTimeout(check, 1000);
          } else {
            reject(
              new Error(
                `Server returned ${res.statusCode} after ${maxRetries} retries`,
              ),
            );
          }
        })
        .on("error", () => {
          if (attempts < maxRetries) {
            setTimeout(check, 1000);
          } else {
            reject(
              new Error(`Server not reachable after ${maxRetries} retries`),
            );
          }
        });
    };

    check();
  });
}

function stopNextServer(): void {
  if (serverProcess) {
    console.log("[electron] Stopping Next.js server...");
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

// ---------------------------------------------------------------------------
// BrowserWindow
// ---------------------------------------------------------------------------

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: "RemiAI",
    show: false,
    webPreferences: {
      // Use the compiled preload.js from electron-dist/.  In both dev
      // and production the electron files are compiled first via tsc.
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(NEXTJS_URL);

  // Show window when ready to avoid white flash
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Minimise to tray instead of closing
  mainWindow.on("close", (event) => {
    if (!isQuittingApp) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // DevTools in dev mode
  const shouldOpenDevTools = false; // Hey friend! Set to true if you want DevTools to open automatically in dev
  if (isDev && shouldOpenDevTools) {
    mainWindow.webContents.openDevTools();
  }
}

// ---------------------------------------------------------------------------
// System Tray
// ---------------------------------------------------------------------------

function createTray(): void {
  let icon: Electron.NativeImage;

  // Use the generated 22×22 icon from build/.  Fall back to public favicon
  // in dev if the icon hasn't been generated yet.
  const trayIconPath = path.join(APP_ROOT, "build", "icon-tray.png");
  const trayIcon2xPath = path.join(APP_ROOT, "build", "icon-tray@2x.png");
  const faviconPath = path.join(APP_ROOT, "public", "favicon-16x16-Light.png");

  // Try Retina first, then standard, then fallback
  const resolvedIcon = [trayIcon2xPath, trayIconPath, faviconPath].find((p) =>
    fs.existsSync(p),
  );

  if (resolvedIcon) {
    icon = nativeImage.createFromPath(resolvedIcon);
  } else {
    // Last resort: 1-pixel transparent PNG
    icon = nativeImage.createFromBuffer(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkYPj/n4EBBJgYKAQMowYM\nA4YRBUYUGFFgRIERBUYUGFFgRIHhpgAALikDBy3pS9sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
  }

  tray = new Tray(icon);
  tray.setToolTip("RemiAI");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show RemiAI",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuittingApp = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

ipcMain.handle(
  "send-notification",
  (_event: Electron.IpcMainInvokeEvent, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body });
      notification.show();
    }
  },
);

// ---------------------------------------------------------------------------
// IPC handlers — expose native features to the renderer
// ---------------------------------------------------------------------------

ipcMain.handle("get-app-info", () => ({
  version: app.getVersion(),
  name: app.getName(),
  platform: process.platform,
  arch: process.arch,
  isDev,
}));

ipcMain.handle("get-platform", () => process.platform);

ipcMain.handle(
  "open-file-dialog",
  async (_event: Electron.IpcMainInvokeEvent, options?: OpenDialogOptions) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, options ?? {});
    return result;
  },
);

ipcMain.handle(
  "open-directory-dialog",
  async (_event: Electron.IpcMainInvokeEvent, options?: OpenDialogOptions) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      ...options,
    });
    return result;
  },
);

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

function setupAutoUpdater(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require("electron-updater") as {
      autoUpdater: import("electron-updater").AppUpdater;
    };

    autoUpdater.logger = console;
    autoUpdater.autoDownload = false;

    autoUpdater.on("update-available", (info: { version: string }) => {
      console.log("[auto-updater] Update available:", info.version);

      // Notify the renderer so it can show a UI prompt
      mainWindow?.webContents.send("update-available", info.version);

      // Also show a native notification
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: "Update Available",
          body: `RemiAI ${info.version} is available. Downloading...`,
        });
        notification.show();
      }

      // Auto-download the update
      autoUpdater.downloadUpdate();
    });

    autoUpdater.on("update-downloaded", (info: { version: string }) => {
      console.log("[auto-updater] Update downloaded:", info.version);

      mainWindow?.webContents.send("update-downloaded", info.version);

      if (Notification.isSupported()) {
        const notification = new Notification({
          title: "Update Ready",
          body: `RemiAI ${info.version} has been downloaded. Restart to install.`,
        });
        notification.show();
      }
    });

    autoUpdater.on("error", (err: Error) => {
      console.error("[auto-updater] Error:", err.message);
    });

    // Check for updates after a short delay (let the app settle first)
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err: Error) => {
        console.warn("[auto-updater] Check failed:", err.message);
      });
    }, 10_000);

    // IPC handler for manual "install and restart"
    ipcMain.handle("install-update", () => {
      autoUpdater.quitAndInstall(false, true);
    });
  } catch (err) {
    console.warn("[auto-updater] Not available (electron-updater not installed):", err);
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  try {
    // Start the Next.js server first
    await startNextServer();
    console.log("[electron] Next.js server is ready");

    // Create the window and tray
    createWindow();
    createTray();

    // Set up the auto-updater
    setupAutoUpdater();

    mainWindow?.maximize();

    // macOS: re-create window when dock icon is clicked
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        mainWindow?.show();
      }
    });
  } catch (err) {
    console.error("[electron] Failed to start:", err);
    dialog.showErrorBox(
      "Startup Error",
      `Failed to start RemiAI:\n\n${err instanceof Error ? err.message : String(err)}`,
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // On macOS, apps typically stay open until Cmd+Q.
  // On other platforms we keep the tray alive so the user can re-show.
});

app.on("before-quit", () => {
  isQuittingApp = true;
  stopNextServer();
});

app.on("will-quit", () => {
  stopNextServer();
});
