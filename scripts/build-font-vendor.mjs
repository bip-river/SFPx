import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// The Latin and Latin Extended subsets cover the page copy and accented purchaser names; the browser loads each only when used.
const source = name => require.resolve(`@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-${name}-wght-normal.woff2`);
await mkdir('vendor/fonts', { recursive: true });
for (const subset of ['latin', 'latin-ext']) await copyFile(source(subset), `vendor/fonts/atkinson-hyperlegible-next-${subset}.woff2`);
await copyFile(require.resolve('@fontsource-variable/atkinson-hyperlegible-next/LICENSE'), 'vendor/fonts/OFL.txt');
console.log('Copied self-hosted Atkinson Hyperlegible Next font files.');
