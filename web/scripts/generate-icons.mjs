// PWA icons, Nov 2026. The GitHub push tool only accepts UTF-8 text, so
// the PNG icons are stored as base64 in icons.json (a text file) and this
// script decodes them into public/icons/ before the Vite build runs
// (package.json "prebuild"). The manifest and apple-touch-icon reference
// /icons/*.png, which Vite then copies from public/ into dist/.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });
const icons = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'icons.json'), 'utf8'));
for (const [name, b64] of Object.entries(icons)) {
  writeFileSync(join(outDir, name), Buffer.from(b64, 'base64'));
}
console.log(`generate-icons: wrote ${Object.keys(icons).length} PNGs to public/icons/`);
