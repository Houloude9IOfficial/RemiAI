import {
  existsSync,
  lstatSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

if (process.env.VERCEL !== "1") {
  process.exit(0);
}

const appDir = process.cwd();
const appNext = resolve(appDir, ".next");

let repoRoot = appDir;

while (!existsSync(join(repoRoot, ".git"))) {
  const parent = dirname(repoRoot);

  if (parent === repoRoot) {
    throw new Error("Could not find repository root.");
  }

  repoRoot = parent;
}

const repoNext = resolve(repoRoot, ".next");

console.log("[vercel-fix-output] app:", appNext);
console.log("[vercel-fix-output] repo:", repoNext);

if (!existsSync(appNext)) {
  throw new Error(`Next.js output does not exist: ${appNext}`);
}

// Remove anything currently occupying the repo-root .next path.
// lstatSync is used because existsSync() returns false for broken symlinks.
try {
  const stat = lstatSync(repoNext);

  if (stat.isSymbolicLink()) {
    console.log("[vercel-fix-output] Removing existing .next symlink");
  } else {
    console.log("[vercel-fix-output] Removing existing .next directory");
  }

  rmSync(repoNext, {
    recursive: true,
    force: true,
  });
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

symlinkSync(appNext, repoNext, "dir");

console.log(
  `[vercel-fix-output] Linked ${repoNext} -> ${appNext}`
);