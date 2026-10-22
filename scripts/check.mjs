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
console.log('JavaScript syntax and catalog validation passed.');
