import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = join(projectRoot, "public");
const assetsDir = join(projectRoot, "assets");
const dstDir = join(projectRoot, "website", "public");
const dstAssetsDir = join(dstDir, "assets");

if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });
if (!existsSync(dstAssetsDir)) mkdirSync(dstAssetsDir, { recursive: true });

let ok = 0,
  fail = 0;

// Files to copy from the main app's public/
const files = readdirSync(srcDir).filter(
  (f) =>
    f.startsWith("RemiAI") ||
    f.startsWith("favicon") ||
    f.startsWith("icon-") ||
    f.startsWith("apple-touch-icon")
  // manifest.json intentionally NOT copied: the website keeps its own
  // light-themed manifest (the app's is dark-themed).
);

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

// Dashboard screenshots from the root assets/
const shots = readdirSync(assetsDir).filter((f) =>
  /^RemiAIv2(Light|Dark)\.png$/.test(f)
);

for (const f of shots) {
  try {
    copyFileSync(join(assetsDir, f), join(dstAssetsDir, f));
    console.log(`  ✓ assets/${f}`);
    ok++;
  } catch (e) {
    console.log(`  ✗ assets/${f}: ${e.message}`);
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
