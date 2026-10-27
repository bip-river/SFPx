import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, parseDate, isSaleActive, isSaleComingSoon, calculatePermitValidity, resolveDate, resolveCatalogDates } from '../js/catalog.js';
import { quantityError } from '../js/validation.js';
import { sanitizeUrl } from '../js/links.js';

const catalog = JSON.parse(await readFile(new URL('../products.json', import.meta.url), 'utf8'));

test('catalog IDs are globally unique and all explicit product rules validate', () => {
  const resolved = resolveCatalogDates(catalog);
  assert.equal(validateCatalog(resolved), resolved);
  const duplicate = structuredClone(resolved);
  duplicate.AK.offices[0].products.fuelwood[1].id = duplicate.AK.offices[0].products.fuelwood[0].id;
  assert.throws(() => validateCatalog(duplicate), /duplicate/);
});

test('calendar parsing rejects impossible dates and missing sale bounds fail closed', () => {
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('2026-13-01'), null);
  assert.equal(parseDate('2026-2-01'), null);
  assert.ok(parseDate('2028-02-29'));
  assert.equal(isSaleActive({ saleEndDate: '2026-10-21' }, parseDate('2026-10-21')), false);
  const product = { saleStartDate: '2026-10-21', saleEndDate: '2026-10-22' };
  assert.ok(isSaleActive(product, parseDate('2026-10-21')));
  assert.ok(isSaleActive(product, parseDate('2026-10-22')));
  assert.equal(isSaleActive(product, parseDate('2026-10-23')), false);
  assert.ok(isSaleComingSoon(product, 15, parseDate('2026-10-06')));
  assert.equal(isSaleComingSoon(product, 15, parseDate('2026-10-05')), false);
});

test('relative sale dates resolve to local calendar days and malformed ones fail closed', () => {
  const today = parseDate('2026-12-30');
  assert.equal(resolveDate('today', today), '2026-12-30');
  assert.equal(resolveDate('today+3', today), '2027-01-02');
  assert.equal(resolveDate('today-365', today), '2025-12-30');
  assert.equal(resolveDate('2026-01-01', today), '2026-01-01');
  for (const malformed of ['today+', 'today+1.5', 'today+1d', 'tomorrow', ' today']) {
    const data = structuredClone(catalog); data.AK.offices[0].products.fuelwood[0].saleEndDate = malformed;
    assert.throws(() => validateCatalog(resolveCatalogDates(data, today)), /Invalid sale dates/, malformed);
  }
});

test('no shipped product sale ends for future visitors of the long-lived demo', () => {
  for (const day of ['2026-10-21', '2028-02-03', '2031-06-15', '2040-01-01']) {
    const today = parseDate(day);
    const resolved = validateCatalog(resolveCatalogDates(catalog, today));
    const products = Object.values(resolved).flatMap(state => state.offices.flatMap(office => Object.values(office.products).flat()));
    assert.deepEqual(products.filter(product => parseDate(product.saleEndDate) < today).map(product => product.id), [], day);
    assert.ok(products.filter(product => isSaleActive(product, today)).length > 0, day);
  }
});

test('shortened validity counts calendar days across a daylight-saving change', t => {
  const originalTz = process.env.TZ;
  process.env.TZ = 'America/Denver';
  t.after(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz; });
  // The local-time span from Oct 21 to Nov 10, 2026 includes the 25-hour day when DST ends.
  const validity = calculatePermitValidity({ saleStartDate: '2026-01-01', saleEndDate: '2026-11-10', validForDays: 30 }, parseDate('2026-10-21'));
  assert.equal(validity.shortened, true);
  assert.equal(validity.actualDays, 20);
});

test('quantity increments support explicit fractional products without fractional trees', () => {
  const product = { minQty: 0.1, maxQty: 1, quantityStep: 0.1, unit: 'cord' };
  assert.equal(quantityError(product, '0.3'), '');
  assert.match(quantityError(product, '0.35'), /increments/);
  assert.match(quantityError(product, ''), /Enter a quantity/);
  assert.match(quantityError(product, '2'), /fewer/);
  assert.match(quantityError({ ...product, minQty: 1, maxQty: 5, quantityStep: 1, unit: 'tree' }, '1.5'), /increments/);
});

test('links allow intended relative and contact URLs and block normalized script protocols', () => {
  const base = 'https://example.org/permits/';
  for (const url of ['java\nscript:alert(1)', 'java\tscript:alert(1)', ' JAVASCRIPT:alert(1)', 'data:text/html,bad', 'vbscript:bad', 'file:///bad']) assert.equal(sanitizeUrl(url, base), '#', url);
  for (const url of ['https://example.org/map.pdf', '../map.pdf', '#rules', 'mailto:help@example.org', 'tel:12345']) assert.equal(sanitizeUrl(url, base), url, url);
  assert.equal(sanitizeUrl(null, base), '#');
});
