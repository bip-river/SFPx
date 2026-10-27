import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validateCatalog } from '../js/catalog.js';

for (const directory of ['.', 'js', 'tests', 'scripts', 'vendor']) {
  for (const file of await readdir(directory)) {
    if (!/\.(m?js)$/.test(file)) continue;
    const path = `${directory}/${file}`;
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || `Cannot parse ${path}`);
  }
}
validateCatalog(JSON.parse(await readFile(new URL('../products.json', import.meta.url), 'utf8')));
// An undefined var() silently falls back to the inherited value instead of failing.
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const definedProperties = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
const undefinedProperties = [...new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1]))].filter(name => !definedProperties.has(name));
if (undefinedProperties.length) throw new Error(`styles.css uses undefined custom properties: ${undefinedProperties.join(', ')}`);
console.log('JavaScript syntax, catalog, and CSS custom property checks passed.');
