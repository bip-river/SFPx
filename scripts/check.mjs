import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validateCatalog, resolveCatalogDates, CatalogError } from '../js/catalog.js';
import { codePoints } from '../vendor/permit-font.js';
import { COVERAGE_PATH, coverageModule } from './font-coverage.mjs';
import { sampleDocumentIds, documentUrl } from '../js/permit-documents.js';

for (const directory of ['.', 'js', 'tests', 'scripts', 'vendor', 'pay-ure', 'pay-ure/js']) {
  for (const file of await readdir(directory)) {
    if (!/\.(m?js)$/.test(file)) continue;
    const path = `${directory}/${file}`;
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (result.status !== 0) fail(result.stderr || `Cannot parse ${path}`);
  }
}
// Problems are printed as a list for the person editing the catalog rather than as a stack trace.
function fail(message) {
  console.error(message);
  process.exit(1);
}
let catalog;
try {
  catalog = validateCatalog(resolveCatalogDates(JSON.parse(await readFile(new URL('../products.json', import.meta.url), 'utf8'))));
} catch (error) {
  fail(error instanceof CatalogError ? `products.json: ${error.message}` : `products.json could not be read: ${error.message}`);
}
// Field checks in the browser use this list instead of the 1 MB font, so it must describe the same font.
if (await readFile(new URL(`../${COVERAGE_PATH}`, import.meta.url), 'utf8').catch(() => '') !== coverageModule(codePoints)) {
  fail(`${COVERAGE_PATH} does not match vendor/permit-font.js. Run npm run build:pdf-vendor.`);
}
// Every document the site or package refers to must exist; npm run build:documents writes them.
const linked = JSON.stringify(catalog).match(/documents\/[a-z0-9-]+\.pdf/g) || [];
for (const path of new Set([...linked, ...sampleDocumentIds().map(documentUrl)])) {
  try { await access(new URL(`../${path}`, import.meta.url)); }
  catch { fail(`Missing ${path}. Run npm run build:documents.`); }
}
// An undefined var() silently falls back to the inherited value instead of failing.
for (const stylesheet of ['styles.css', 'pay-ure/styles.css']) {
  const css = await readFile(new URL(`../${stylesheet}`, import.meta.url), 'utf8');
  const definedProperties = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
  const undefinedProperties = [...new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1]))].filter(name => !definedProperties.has(name));
  if (undefinedProperties.length) fail(`${stylesheet} uses undefined custom properties: ${undefinedProperties.join(', ')}`);
}
console.log('JavaScript syntax, catalog, PDF font coverage, sample document, and CSS custom property checks passed (BWL and Pay.ure).');
