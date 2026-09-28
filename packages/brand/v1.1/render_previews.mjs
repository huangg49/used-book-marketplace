// Rasterize the original outlined SVG studies. No app runtime dependency on sharp.
// Pass the absolute path to a separately installed sharp module as argv[2].
import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || 'sharp');
const directory = fileURLToPath(new URL('./assets/', import.meta.url));
const files = (await readdir(directory)).filter((name) => name.endsWith('.svg')).sort();
for (const name of files) {
  await sharp(path.join(directory, name)).png().toFile(path.join(directory, name.replace(/\.svg$/, '.png')));
}
console.log(`Rendered ${files.length} PNG previews from original vector assets.`);
