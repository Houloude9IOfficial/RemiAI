#!/usr/bin/env node
// scripts/prune-standalone.mjs
//
// Keeps .next/standalone lean before packaging (Electron installers, Docker).
//
// The app reads the filesystem at runtime (file indexing, session files,
// backups, ...), so @vercel/nft's static tracing records the *whole project
// directory* as dependencies — .git/, release/ (old installers + a nested
// remiai.crickdevs.com that breaks codesign), data/ (the user's local DB, uploads and
// files — must never ship in an installer), website/, creations/, source
// dirs, ... — and Turbopack copies all of it into .next/standalone
// (measured at 2.3 GB in a repo with old release artifacts). config-level
// `outputFileTracingExcludes` is only applied by the webpack trace collector,
// not by Turbopack builds, so it cannot fix this.
//
// Instead we whitelist exactly what the standalone server needs at runtime:
//   server.js, package.json, node_modules, .next, public, db/migrations
// (the Dockerfile relies on the same layout — it copies standalone, public
// and db/migrations explicitly). Everything else is compile-time junk.
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.log("[prune-standalone] .next/standalone not found — skipping");
  process.exit(0);
}

// Top-level entries the standalone server needs at runtime. `.env` and
// `.env.production` are the only env files next build copies into the
// standalone output (loadedEnvFiles) — never keep stray dev env files.
const keep = new Set([
  "server.js",
  "package.json",
  "node_modules",
  ".next",
  "public",
  "db", // only db/migrations survives the db-level prune below
  ".env",
  ".env.production",
]);

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = statSync(p);
    total += st.isDirectory() ? dirSize(p) : st.size;
  }
  return total;
}

const before = dirSize(standalone);

for (const entry of readdirSync(standalone)) {
  if (keep.has(entry)) continue;
  rmSync(path.join(standalone, entry), { recursive: true, force: true });
}

// db/ — keep only migrations (db/index.ts runs them from process.cwd()).
const dbDir = path.join(standalone, "db");
if (existsSync(dbDir)) {
  for (const entry of readdirSync(dbDir)) {
    if (entry === "migrations") continue;
    rmSync(path.join(dbDir, entry), { recursive: true, force: true });
  }
}

const after = dirSize(standalone);
const freed = ((before - after) / 1024 / 1024).toFixed(1);
const sizeMb = (after / 1024 / 1024).toFixed(1);
console.log(
  `[prune-standalone] standalone: ${sizeMb} MB (freed ${freed} MB)`,
);
