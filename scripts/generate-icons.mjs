#!/usr/bin/env node
/**
 * Generate platform icon files for the Electron app.
 *
 * Takes the 512×512 RemiAI logo and produces:
 *   - build/icon.icns      (macOS — multiple resolutions via .iconset)
 *   - build/icon.png       (Linux / Windows source — 512x512)
 *   - build/icon-tray.png  (Tray icon — 22x22)
 *   - build/icon-tray@2x.png  (Tray icon HiDPI — 44x44)
 *
 * Usage:  node scripts/generate-icons.mjs
 */

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const BUILD = "build";

// ── Resolve source logo ─────────────────────────────────────────────

function resolveSource() {
  const candidates = [
    "assets/MacLogo.icon/Assets/RemiAI-Light.png",
    "public/RemiAI.png",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  console.error("❌ No source logo found. Tried:", candidates.join(", "));
  process.exit(1);
}

const srcPath = resolveSource();
console.log(`🔍 Source logo: ${srcPath}`);

// ── macOS .iconset (all required sizes) ─────────────────────────────

const ICONSET_SIZES = [
  { name: "icon_16x16.png",        size: 16 },
  { name: "icon_16x16@2x.png",     size: 32 },
  { name: "icon_32x32.png",        size: 32 },
  { name: "icon_32x32@2x.png",     size: 64 },
  { name: "icon_128x128.png",      size: 128 },
  { name: "icon_128x128@2x.png",   size: 256 },
  { name: "icon_256x256.png",      size: 256 },
  { name: "icon_256x256@2x.png",   size: 512 },
  { name: "icon_512x512.png",      size: 512 },
  { name: "icon_512x512@2x.png",   size: 1024 },
];

const ICONSET_DIR = path.join(BUILD, "RemiAI.iconset");
fs.mkdirSync(ICONSET_DIR, { recursive: true });

console.log(`\n📦 Generating macOS iconset...`);

for (const { name, size } of ICONSET_SIZES) {
  const outPath = path.join(ICONSET_DIR, name);
  if (size > 512) {
    console.log(`   ⚠  Upscaling ${name} (${size}x${size}) from 512x512 source`);
  }
  await sharp(srcPath)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log(`   ✓ ${name} (${size}x${size})`);
}

// ── Convert .iconset → .icns ────────────────────────────────────────

const ICNS_PATH = path.join(BUILD, "icon.icns");

try {
  execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${ICNS_PATH}"`, {
    stdio: "pipe",
  });
  const stat = fs.statSync(ICNS_PATH);
  console.log(`\n✅ macOS icon: build/icon.icns (${(stat.size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error(`\n❌ iconutil failed:`, err.stderr?.toString() || err.message);
  console.error(`   Fallback: electron-builder will use build/icon.png`);
}

// ── Linux / platform fallback PNG (512×512) ─────────────────────────

await sharp(srcPath)
  .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(BUILD, "icon.png"));
console.log(`✅ Platform icon: build/icon.png (512x512)`);

// ── Tray icons (22px standard, 44px Retina) ─────────────────────────

await sharp(srcPath)
  .resize(22, 22, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(BUILD, "icon-tray.png"));
console.log(`✅ Tray icon: build/icon-tray.png (22x22)`);

await sharp(srcPath)
  .resize(44, 44, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(BUILD, "icon-tray@2x.png"));
console.log(`✅ Tray icon: build/icon-tray@2x.png (44x44)`);

// ── Clean up ────────────────────────────────────────────────────────

fs.rmSync(ICONSET_DIR, { recursive: true, force: true });

console.log(`\n🎉 All icons generated in build/`);
console.log(`   build/icon.icns        — macOS app icon`);
console.log(`   build/icon.png         — Linux / Windows source`);
console.log(`   build/icon-tray.png    — Menu bar (22px)`);
console.log(`   build/icon-tray@2x.png — Menu bar HiDPI (44px)`);
