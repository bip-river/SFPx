import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, parseDate, isSaleActive, isSaleComingSoon, calculatePermitValidity, resolveDate, resolveCatalogDates, haulTagsRequired, haulTagCount } from '../js/catalog.js';
import { createCheckoutIdentity, createPermitNumber } from '../js/checkout.js';
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
  assert.match(quantityError(product, '0.35'), /steps of 0\.1 cords/);
  assert.match(quantityError(product, ''), /Enter how many cords/);
  assert.match(quantityError(product, '2'), /fewer/);
  assert.match(quantityError({ ...product, minQty: 1, maxQty: 5, quantityStep: 1, unit: 'tree' }, '1.5'), /steps of 1 tree\./);
});

test('links allow intended relative and contact URLs and block normalized script protocols', () => {
  const base = 'https://example.org/permits/';
  for (const url of ['java\nscript:alert(1)', 'java\tscript:alert(1)', ' JAVASCRIPT:alert(1)', 'data:text/html,bad', 'vbscript:bad', 'file:///bad']) assert.equal(sanitizeUrl(url, base), '#', url);
  for (const url of ['https://example.org/map.pdf', '../map.pdf', '#rules', 'mailto:help@example.org', 'tel:12345']) assert.equal(sanitizeUrl(url, base), url, url);
  assert.equal(sanitizeUrl(null, base), '#');
});

test('haul tag rules cascade from state to office to listing, and mushrooms never use tags', () => {
  assert.equal(haulTagsRequired('fuelwood', {}, {}, {}), true, 'tagged types need tags unless a rule says otherwise');
  assert.equal(haulTagsRequired('fuelwood', {}, {}, { haulTags: { fuelwood: false } }), false, 'state');
  assert.equal(haulTagsRequired('fuelwood', {}, { haulTags: { fuelwood: true } }, { haulTags: { fuelwood: false } }), true, 'office overrides state');
  assert.equal(haulTagsRequired('fuelwood', { haulTags: false }, { haulTags: { fuelwood: true } }, {}), false, 'listing overrides office');
  assert.equal(haulTagsRequired('christmas', {}, {}, { haulTags: { fuelwood: false } }), true, 'rules are per collection type');
  assert.equal(haulTagsRequired('mushrooms', { haulTags: true }, {}, {}), false);
  assert.equal(haulTagCount('fuelwood', {}, {}, {}, 3), 6, 'one tag per half cord');
  assert.equal(haulTagCount('fuelwood', {}, {}, {}, 2.25), 5, 'a part load still needs a tag');
  assert.equal(haulTagCount('christmas', {}, {}, {}, 2), 2, 'one tag per tree');
  assert.equal(haulTagCount('fuelwood', { haulTags: false }, {}, {}, 3), 0);
  const resolved = resolveCatalogDates(catalog);
  for (const mutate of [
    data => { data.AK.haulTags = { mushrooms: false }; },
    data => { data.AK.offices[0].haulTags = { fuelwood: 'no' }; },
    data => { data.AK.offices[0].products.mushrooms[0].haulTags = true; },
    data => { data.AK.offices[0].id = 'ANCH'; }
  ]) {
    const data = structuredClone(resolved); mutate(data);
    assert.throws(() => validateCatalog(data), /haul tag|Office ID/, mutate.toString());
  }
});

test('permit durations vary realistically by collection type, and the start page states their range', async () => {
  const allowed = { fuelwood: [30, 60, 90, 180], christmas: [14, 30], mushrooms: [7, 14, 30] };
  const seen = { fuelwood: new Set(), christmas: new Set(), mushrooms: new Set() };
  for (const state of Object.values(catalog)) for (const office of state.offices) for (const [type, products] of Object.entries(office.products)) for (const product of products) {
    assert.ok(allowed[type].includes(product.validForDays), `${product.id}: ${product.validForDays} days`);
    seen[type].add(product.validForDays);
  }
  for (const [type, values] of Object.entries(seen)) assert.deepEqual([...values].sort((a, b) => a - b), allowed[type], type);
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /Permits last from 7 days to 6 months/, 'update the start page if the range changes');
});

test('permit numbers name the office and year, and a retry of the same checkout keeps its number', () => {
  const digits = (() => { let n = 0; return () => String(++n).padStart(6, '0'); })();
  assert.equal(createPermitNumber('AK-ANCH', parseDate('2026-10-21'), () => '048213'), 'AK-ANCH-26-048213');
  const identity = createCheckoutIdentity(() => 'id', digits);
  const first = identity.permitNumberFor({ a: 1 }, 'NV-CARS', parseDate('2027-01-02'));
  assert.equal(first, 'NV-CARS-27-000001');
  assert.equal(identity.permitNumberFor({ a: 1 }, 'NV-CARS', parseDate('2027-01-02')), first);
  assert.equal(identity.permitNumberFor({ a: 2 }, 'NV-CARS', parseDate('2027-01-02')), 'NV-CARS-27-000002');
  identity.clear();
  assert.equal(identity.permitNumberFor({ a: 2 }, 'NV-CARS', parseDate('2027-01-02')), 'NV-CARS-27-000003');
  assert.match(createPermitNumber('UT-MOAB', parseDate('2026-10-21')), /^UT-MOAB-26-\d{6}$/);
});
