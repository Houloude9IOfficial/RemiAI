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

// Find the Git repository root.
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

// Vercel's deploy step incorrectly checks <repo>/.next.
// Remove whatever is there so we can point it at the actual
// website build output.
if (existsSync(repoNext)) {
  console.log("[vercel-fix-output] Removing existing repo-root .next");
  rmSync(repoNext, {
    recursive: true,
    force: true,
  });
}

symlinkSync(appNext, repoNext, "dir");

console.log(
  `[vercel-fix-output] Linked ${repoNext} -> ${appNext}`
);