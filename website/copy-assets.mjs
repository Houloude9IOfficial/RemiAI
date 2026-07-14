import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = join(projectRoot, "public");
const dstDir = join(projectRoot, "website", "public");

if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });

// Files to copy
const files = readdirSync(srcDir).filter(
  (f) =>
    f.startsWith("RemiAI") ||
    f.startsWith("favicon") ||
    f === "manifest.json"
);

let ok = 0,
  fail = 0;
for (const f of files) {
  try {
    copyFileSync(join(srcDir, f), join(dstDir, f));
    console.log(`  ✓ ${f}`);
    ok++;
  } catch (e) {
    console.log(`  ✗ ${f}: ${e.message}`);
    fail++;
  }
}

console.log(`\n${ok} copied, ${fail} failed`);

function resolve(...p) {
  let dir = __dirname;
  for (const seg of p.flat()) {
    if (seg === "..") dir = join(dir, "..");
    else dir = join(dir, seg);
  }
  return dir;
}
