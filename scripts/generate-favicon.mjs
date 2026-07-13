import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function generateIco(variant, suffix) {
  const src = path.join(root, "public", `favicon-32x32${suffix}.png`);
  const dst = variant === "dark"
    ? path.join(root, "public", "favicon.ico")
    : path.join(root, "public", `favicon${suffix}.ico`);

  if (!fs.existsSync(src)) {
    console.error(`Source not found: ${src}`);
    return;
  }

  const png = fs.readFileSync(src);
  const sizes = [16, 32];
  const buffers = await Promise.all(
    sizes.map((s) => sharp(png).resize(s, s).png().toBuffer())
  );

  const count = buffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const entries = buffers.map((buf, i) => {
    const size = sizes[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buf.length;
    return entry;
  });

  const ico = Buffer.concat([header, ...entries, ...buffers]);
  fs.writeFileSync(dst, ico);
  console.log(`Generated ${path.basename(dst)} (${ico.length} bytes) - sizes: ${sizes.join("x, ")}x`);
}

async function main() {
  // Dark logo (for light themes) → favicon.ico
  await generateIco("dark", "");
  // Light logo (for dark themes) → favicon-Light.ico
  await generateIco("light", "-Light");
}

main().catch((err) => console.error(err));
