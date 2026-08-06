// electron-builder `afterPack` hook (configured in electron-builder.yml).
//
// The packaged app runs its Next.js standalone server with Electron's bundled
// Node.js (see electron/main.ts — ELECTRON_RUN_AS_NODE), so every native
// module the server loads must be compiled for Electron's ABI.
//
// electron-builder already rebuilds native modules in the app's
// node_modules (better-sqlite3) before packing. BUT the standalone server
// loads better-sqlite3 from ITS OWN self-contained copy
// (.next/standalone/node_modules/better-sqlite3), which was traced by
// `next build` and still targets the build-time (system) Node ABI. This hook
// replaces that copy with the freshly rebuilt Electron-ABI module.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const projectDir = packager.projectDir || packager.appDir;

  const src = path.join(projectDir, "node_modules", "better-sqlite3");
  if (!fs.existsSync(src)) {
    console.warn(
      "[after-pack] node_modules/better-sqlite3 not found — skipping ABI fix",
    );
    return;
  }

  // App files are staged inside the asar (with asarUnpack files extracted to
  // app.asar.unpacked) under Contents/Resources on macOS and resources/ on
  // Windows/Linux.
  const resourcesDir =
    electronPlatformName === "darwin"
      ? path.join(appOutDir, "Contents", "Resources")
      : path.join(appOutDir, "resources");

  const candidates = [
    path.join(
      resourcesDir,
      "app.asar.unpacked",
      ".next",
      "standalone",
      "node_modules",
      "better-sqlite3",
    ),
    // asar disabled — files copied directly
    path.join(
      resourcesDir,
      "app",
      ".next",
      "standalone",
      "node_modules",
      "better-sqlite3",
    ),
  ];

  const dest = candidates.find((c) => fs.existsSync(c));
  if (!dest) {
    console.warn(
      "[after-pack] standalone better-sqlite3 not found under " +
        resourcesDir +
        " — skipping ABI fix",
    );
    return;
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(
    "[after-pack] Replaced standalone better-sqlite3 with the Electron-ABI build",
  );
};
