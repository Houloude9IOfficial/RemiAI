import { copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const src = join(root, 'public', 'favicon.ico');
const dest = join(root, 'src', 'app', 'favicon.ico');

if (!existsSync(src)) {
  console.error(`❌ Source not found: ${src}`);
  process.exit(1);
}

// Delete destination first if it exists
try {
  copyFileSync(src, dest);
  const stats = (await import('fs')).statSync(dest);
  console.log(`✅ Custom favicon copied to src/app/favicon.ico (${stats.size} bytes)`);
} catch (err) {
  console.error(`❌ Failed: ${err.message}`);
  process.exit(1);
}
