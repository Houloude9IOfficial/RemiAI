/* eslint-disable @typescript-eslint/no-require-imports */
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
  const { appOutDir, packager } = context;
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
  // Windows/Linux. On macOS the bundle lives at <appOutDir>/<ProductName>.app,
  // so appOutDir itself is NOT the Resources dir — use the packager's helper,
  // which knows the platform layout (mac: <appOutDir>/remiai.crickdevs.com/Contents/Resources).
  const resourcesDir = packager.getResourcesDir(appOutDir);

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

  // Turbopack externalizes serverExternalPackages under hashed IDs and emits
  // symlinks in .next/standalone/.next/node_modules (e.g.
  // better-sqlite3-<hash> -> ../../node_modules/better-sqlite3). electron-
  // builder dereferences those symlinks into real directories when packing,
  // so the alias holds a copy of the PRE-swap (system-Node-ABI) module. The
  // standalone server requires the hashed name, so it would load the wrong
  // binary — replace the alias with a symlink to the canonical build we just
  // swapped above.
  const aliasesDir = path.join(
    resourcesDir,
    "app.asar.unpacked",
    ".next",
    "standalone",
    ".next",
    "node_modules",
  );
  if (fs.existsSync(aliasesDir)) {
    for (const entry of fs.readdirSync(aliasesDir)) {
      if (!entry.startsWith("better-sqlite3")) continue;
      const aliasPath = path.join(aliasesDir, entry);
      fs.rmSync(aliasPath, { recursive: true, force: true });
      try {
        // On Windows directory symlinks require privileges/Developer Mode;
        // junctions work without them and resolve identically for Node.
        fs.symlinkSync(
          "../../node_modules/better-sqlite3",
          aliasPath,
          process.platform === "win32" ? "junction" : undefined,
        );
      } catch (err) {
        // Fall back to a plain copy of the (already Electron-ABI) module.
        console.warn(
          "[after-pack] symlink failed (" + err.code + "), copying instead",
        );
        fs.cpSync(src, aliasPath, { recursive: true });
      }
      console.log(
        "[after-pack] Replaced Turbopack external alias " + entry,
      );
    }
  }
};
