import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, catalogProblems, CatalogError, parseDate, isSaleActive, isSaleComingSoon, calculatePermitValidity, resolveDate, resolveCatalogDates, haulTagsRequired, haulTagCount } from '../js/catalog.js';
import { createCheckoutIdentity, createPermitNumber } from '../js/checkout.js';
import { quantityError, createFieldValidators } from '../js/validation.js';
import { canPrint, unprintableCharacters, describeCharacters, unprintableMessage } from '../js/printable.js';
import { sanitizeUrl } from '../js/links.js';

const catalog = JSON.parse(await readFile(new URL('../products.json', import.meta.url), 'utf8'));

test('catalog IDs are globally unique and all explicit product rules validate', () => {
  const resolved = resolveCatalogDates(catalog);
  assert.equal(validateCatalog(resolved), resolved);
  const duplicate = structuredClone(resolved);
  duplicate.AK.offices[0].products.fuelwood[1].id = duplicate.AK.offices[0].products.fuelwood[0].id;
  assert.throws(() => validateCatalog(duplicate), /AK › AK-ANCH › fuelwood\[1\] ak-anch-fuelwood-01: duplicate product id "ak-anch-fuelwood-01"; it is also used at AK › AK-ANCH › fuelwood\[0\] ak-anch-fuelwood-01/);
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
    assert.deepEqual(catalogProblems(resolveCatalogDates(data, today)), [`AK › AK-ANCH › fuelwood[0] ak-anch-fuelwood-01: saleEndDate must be a date like 2026-10-01, or "today", "today+30" or "today-7" (found ${JSON.stringify(malformed)})`], malformed);
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
    assert.throws(() => validateCatalog(data), /haulTags|id must look like AK-CODE/, mutate.toString());
  }
});

test('permit durations vary realistically by collection type, and the start page states their range', async () => {
  const allowed = { fuelwood: [30, 60, 90, 180, 365], christmas: [14, 30], mushrooms: [7, 14, 30] };
  const seen = { fuelwood: new Set(), christmas: new Set(), mushrooms: new Set() };
  for (const state of Object.values(catalog)) for (const office of state.offices) for (const [type, products] of Object.entries(office.products)) for (const product of products) {
    assert.ok(allowed[type].includes(product.validForDays), `${product.id}: ${product.validForDays} days`);
    seen[type].add(product.validForDays);
  }
  for (const [type, values] of Object.entries(seen)) assert.deepEqual([...values].sort((a, b) => a - b), allowed[type], type);
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /Permits typically last from 7 days to 12 months/, 'update the start page if the range changes');
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

test('catalog problems are all listed at once, each with its location, the rule and the value found', () => {
  const data = structuredClone(resolveCatalogDates(catalog));
  const office = data.AK.offices[0];
  Object.assign(office.products.fuelwood[0], { price: '10', minQty: 0, eligibilityRule: undefined });
  delete office.products.fuelwood[0].saleStartDate;
  Object.assign(office.products.fuelwood[1], { maxQty: 0.5, saleStartDate: '2027-01-02', saleEndDate: '2027-01-01', unit: '' });
  office.products.fuelwood[2].name = 'Firewood 🌲';
  office.products.mushrooms[0].haulTags = true;
  office.products.fuelwod = [];
  office.attachments = [{ label: 'Map' }];
  data.AK.offices[1].id = 'ANCH';
  data.Alaska = { name: 'Alaska', offices: 'none' };
  const expected = [
    'AK › AK-ANCH › attachments[0]: url must be non-empty text (it is missing)',
    'AK › AK-ANCH › fuelwood[0] ak-anch-fuelwood-01: price must be a number of 0 or more, where 0 means no fee (found "10")',
    'AK › AK-ANCH › fuelwood[0] ak-anch-fuelwood-01: minQty must be a number above 0 (found 0)',
    'AK › AK-ANCH › fuelwood[0] ak-anch-fuelwood-01: saleStartDate must be a date like 2026-10-01, or "today", "today+30" or "today-7" (it is missing)',
    'AK › AK-ANCH › fuelwood[0] ak-anch-fuelwood-01: eligibilityRule must be null or "anilca-subsistence" (it is missing)',
    'AK › AK-ANCH › fuelwood[1] ak-anch-fuelwood-02: unit must be non-empty text (found "")',
    'AK › AK-ANCH › fuelwood[1] ak-anch-fuelwood-02: maxQty must be a number of at least minQty (2) (found 0.5)',
    'AK › AK-ANCH › fuelwood[1] ak-anch-fuelwood-02: saleStartDate (2027-01-02) must not be after saleEndDate (2027-01-01)',
    'AK › AK-ANCH › fuelwood[2] ak-anch-fuelwood-03: name uses “🌲”, which the permit PDF cannot print',
  ];
  const problems = catalogProblems(data);
  for (const problem of expected) assert.ok(problems.includes(problem), `missing: ${problem}\nall:\n${problems.join('\n')}`);
  assert.ok(problems.some(p => /^AK › AK-ANCH › mushrooms\[0\] [\w-]+: haulTags cannot be true for mushrooms; only fuelwood and christmas use haul tags$/.test(p)));
  assert.ok(problems.includes('AK › AK-ANCH › fuelwod: unknown collection type; use fuelwood, christmas, mushrooms'));
  assert.ok(problems.includes('AK › ANCH: id must look like AK-CODE, with 2 to 8 capital letters or digits after the dash (found "ANCH")'));
  assert.ok(problems.includes('Alaska: state keys must be two-letter codes like "AK"'));
  assert.ok(problems.includes('Alaska: offices must be a list (found "none")'));
  let error;
  try { validateCatalog(data); } catch (caught) { error = caught; }
  assert.ok(error instanceof CatalogError);
  assert.deepEqual(error.problems, problems);
  assert.match(error.message, new RegExp(`^The permit catalog has ${problems.length} problems:\\n- `));
  for (const empty of [null, [], {}, 'catalog']) assert.deepEqual(catalogProblems(empty), ['The catalog must be a JSON object with at least one state, like { "AK": { "name": "Alaska", "offices": [] } }.']);
  const unresolved = structuredClone(catalog);
  assert.match(catalogProblems(unresolved)[0], /saleStartDate "today[+-]\d+" was not resolved to a calendar date; pass the catalog through resolveCatalogDates/);
});

test('the browser character list matches the embedded PDF font, and unprintable characters are described plainly', async () => {
  const { codePoints } = await import('../vendor/permit-font.js');
  const { coverageModule, COVERAGE_PATH } = await import('../scripts/font-coverage.mjs');
  assert.equal(await readFile(new URL(`../${COVERAGE_PATH}`, import.meta.url), 'utf8'), coverageModule(codePoints), 'run npm run build:pdf-vendor');
  for (const point of [0x20, 0x41, 0xe9, 0x142, 0x3a9, 0x416, 0x2019]) assert.ok(canPrint(point), point.toString(16));
  for (const point of [0x1f332, 0x6771, 0x10ffff]) assert.equal(canPrint(point), false, point.toString(16));
  assert.deepEqual(unprintableCharacters('Áłtsé José Muñoz Żółć Ελένη Борис'), []);
  assert.deepEqual(unprintableCharacters('José'), [], 'decomposed accents are checked after NFC normalization');
  assert.deepEqual(unprintableCharacters('🌲 東 🌲'), ['🌲', '東']);
  assert.equal(unprintableMessage('First name', 'Test 🌲'), 'First name can’t include “🌲” because the permit can’t print it. Remove it or type it another way.');
  assert.equal(unprintableMessage('City', '東京'), 'City can’t include “東” or “京” because the permit can’t print them. Remove them or type them another way.');
  assert.equal(describeCharacters(['a', 'b', 'c', 'd', 'e']), '“a”, “b”, “c” or 2 other characters');
  assert.equal(describeCharacters(['a', 'b', 'c', 'd']), '“a”, “b”, “c” or 1 other character');
  assert.equal(describeCharacters(['\u{E000}']), 'an invisible character (U+E000)');
  assert.equal(unprintableMessage('City', 'Fine'), '');
});

test('purchaser fields explain each problem in order: missing, unprintable, too short, too long', () => {
  const field = value => ({ value });
  const holder = { DeliveryEmail: field('test@example.com') };
  const v = createFieldValidators({ model: {}, permitHolder: holder });
  assert.equal(v.FirstName(field('  ')), 'Enter your first name.');
  assert.equal(v.FirstName(field('🌲')), 'First name can’t include “🌲” because the permit can’t print it. Remove it or type it another way.');
  assert.equal(v.FirstName(field('x'.repeat(51))), 'First name must be 50 characters or fewer.');
  assert.equal(v.MiddleName(field('')), '', 'optional');
  assert.equal(v.MiddleName(field('東')), 'Middle name can’t include “東” because the permit can’t print it. Remove it or type it another way.');
  assert.equal(v.AddressLine1(field('1 🌲')), 'Street address can’t include “🌲” because the permit can’t print it. Remove it or type it another way.', 'unprintable before too short');
  assert.equal(v.AddressLine1(field('1 Rd')), 'Enter your full street address.');
  assert.equal(v.AddressLine2(field('Unit 🌲')), 'Apartment, suite or unit can’t include “🌲” because the permit can’t print it. Remove it or type it another way.');
  assert.equal(v.City(field('X')), 'City must be at least 2 letters.');
  assert.equal(v.City(field('x'.repeat(81))), 'City must be 80 characters or fewer.');
  assert.equal(v.Zip(field('9950')), 'Enter a ZIP code like 99501 or 99501-1234.');
  assert.equal(v.DeliveryEmail(field('a@b')), 'Enter an email address like name@example.com.');
  assert.equal(v.DeliveryEmail(field('東@example.com')), 'Email can’t include “東” because the permit can’t print it. Remove it or type it another way.');
  assert.equal(v.DeliveryEmail(field(`${'x'.repeat(110)}@example.com`)), 'Email must be 120 characters or fewer.');
  assert.equal(v.ConfirmEmail(field('')), 'Enter your email address again.');
  assert.equal(v.ConfirmEmail(field('TEST@example.com')), '', 'matching ignores case');
  assert.equal(v.ConfirmEmail(field('other@example.com')), 'The email addresses must match.');
  assert.equal(v.AddrState(field('')), 'Choose your state.');
});
