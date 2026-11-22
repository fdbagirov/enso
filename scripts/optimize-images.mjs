// Converts the raw PNG exports from Figma (assets-src/) into compact WebP files (public/img/).
// Run: npm run images
import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'assets-src';
const OUT = 'public/img';
const MAX = 1800;

await mkdir(OUT, { recursive: true });
for (const file of await readdir(SRC)) {
  if (!file.endsWith('.png')) continue;
  const out = path.join(OUT, file.replace(/\.png$/, '.webp'));
  const info = await sharp(path.join(SRC, file))
    .resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(out);
  console.log(`${file} → ${out} ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}
