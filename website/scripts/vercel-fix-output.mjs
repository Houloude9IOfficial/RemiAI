// website/scripts/vercel-fix-output.mjs
//
// Vercel deployment workaround — do not delete.
//
// When this Next.js app lives in a monorepo subdirectory, Vercel's deploy
// step ("Deploying outputs...") resolves the Next.js build markers from the
// *git repo root*:
//
//     lstat '/vercel/path0/.next/package.json'   → ENOENT
//
// but `next build` emits them inside THIS app's directory
// (`website/.next/package.json`), which always exists. The build itself
// succeeds; only the final output-collection step aborts. This is a known
// Vercel limitation for subdirectory Next.js projects (switching between
// Turbopack and webpack does not affect it — the markers are written next to
// the app either way).
//
// This script runs after `next build` on Vercel and makes the repo-root
// `.next` path resolve to the real build output via a symlink (falling back
// to writing the `package.json` marker + `BUILD_ID` directly if a symlink
// cannot be created). The `lstat`/read calls in Vercel's deploy step then
// succeed.
//
// Locally the script is a no-op (`process.env.VERCEL` is only set during
// Vercel builds), so it never touches the main app's `.next` directory.
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

// Vercel sets VERCEL=1 for production/preview builds (the CLI does the same
// for `vercel build`). Skip everywhere else.
if (process.env.VERCEL !== "1") {
  process.exit(0);
}

// During a Vercel build the working directory is the app's directory
// (the "Root Directory" project setting), e.g. `/vercel/path0/website`.
const appDir = process.cwd();
const appNext = resolve(appDir, ".next");

if (existsSync(appNext) === false) {
  console.error("[vercel-fix-output] website/.next not found — did `next build` run?");
  process.exit(1);
}

// Find the git repo root by walking up until a `.git` directory is found.
// This keeps the script correct even if the app moves deeper (e.g. `apps/web`).
let repoRoot = appDir;
while (!existsSync(join(repoRoot, ".git"))) {
  const parent = dirname(repoRoot);
  if (parent === repoRoot) {
    // No `.git` found — fall back to one level up (the current layout).
    repoRoot = resolve(appDir, "..");
    break;
  }
  repoRoot = parent;
}

const repoRootNext = resolve(repoRoot, ".next");

function isBrokenSymlink(target) {
  try {
    return lstatSync(target).isSymbolicLink() && !existsSync(target);
  } catch {
    return false;
  }
}

try {
  if (isBrokenSymlink(repoRootNext)) {
    rmSync(repoRootNext, { recursive: true, force: true });
  }

  if (!existsSync(repoRootNext)) {
    try {
      // Prefer a symlink so EVERY marker Vercel looks for under
      // `<repo root>/.next/` (package.json, BUILD_ID, manifests, …)
      // resolves to the real build output.
      symlinkSync(appNext, repoRootNext, "dir");
      console.log("[vercel-fix-output] Linked repo-root .next -> " + appNext);
    } catch (err) {
      // Fallback: if symlinks are not allowed, at least plant the markers
      // Vercel's checks require. Best-effort — later lookups that need more
      // files may still fail, but the primary (symlink) path covers those.
      console.warn(
        "[vercel-fix-output] Could not symlink .next at repo root (" +
          err.message +
          "), writing marker files instead."
      );
      mkdirSync(repoRootNext, { recursive: true });
      writeFileSync(resolve(repoRootNext, "package.json"), '{"type": "commonjs"}\n');
      try {
        writeFileSync(
          resolve(repoRootNext, "BUILD_ID"),
          readFileSync(join(appNext, "BUILD_ID"))
        );
      } catch {
        // BUILD_ID is optional in the fallback; keep going.
      }
    }
  } else {
    console.warn(
      "[vercel-fix-output] Repo-root .next already exists — leaving it alone. " +
        "If Vercel reads stale markers from it, remove it and redeploy."
    );
  }
} catch (err) {
  console.error("[vercel-fix-output] Failed:", err.message);
  process.exit(1);
}
