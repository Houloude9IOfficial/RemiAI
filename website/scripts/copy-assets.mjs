import { copyFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..");
const srcPublic = join(projectRoot, "public");
const dstPublic = join(__dirname, "..", "public");

const files = [
  // Logos
  "RemiAI.png",
  "RemiAI-Light.png",
  "RemiAI-Lighter.png",
  // Favicon files
  "favicon.ico",
  "favicon-Light.ico",
  "favicon-16x16.png",
  "favicon-16x16-Light.png",
  "favicon-16x16-Lighter.png",
  "favicon-32x32.png",
  "favicon-32x32-Light.png",
  "favicon-32x32-Lighter.png",
  "favicon-48x48.png",
  "favicon-48x48-Light.png",
  "favicon-48x48-Lighter.png",
  // Manifest
  "manifest.json",
];

if (!existsSync(dstPublic)) {
  mkdirSync(dstPublic, { recursive: true });
}

let copied = 0;
let errors = 0;

for (const file of files) {
  const src = join(srcPublic, file);
  const dst = join(dstPublic, file);
  try {
    copyFileSync(src, dst);
    console.log(`✓ ${file}`);
    copied++;
  } catch (err) {
    console.log(`✗ ${file}: ${err.message}`);
    errors++;
  }
}

console.log(`\nDone: ${copied} copied, ${errors} errors`);
