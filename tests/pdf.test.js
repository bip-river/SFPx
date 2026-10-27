import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPermitPackagePdf, buildSampleDocumentPdf } from '../js/permit-pdf.js';
import { packageSections, sampleDocumentIds, documentUrl, TAGS_PER_SHEET, TYPE_DOCUMENTS } from '../js/permit-documents.js';
import { readPdf } from './pdf-text.mjs';

const permit = (overrides = {}) => ({
  permitNumber: 'AK-ANCH-26-048213', typeId: 'fuelwood', typeLabel: 'Firewood', productName: 'Fuelwood Permit — Anchorage North',
  quantityLabel: '3 cords', areaName: 'Anchorage Aurora Outpost', officeId: 'AK-ANCH', stateName: 'Alaska',
  validFrom: 'Oct 21, 2026', validUntil: 'Jan 19, 2027', validDays: 90, fee: '$30.00 (demo: no payment was taken)',
  tagCount: 6, tagLine: '6 included, one for each half cord', tagEach: 'half cord', tagQuantity: '½ cord',
  holder: { name: 'Test Purchaser', addressLines: ['123 Test Street', 'Test City, UT 84037'], email: 'test@example.com' },
  issued: 'Oct 21, 2026', eligibility: null, eligibilityBasis: '',
  documents: { stipulations: 'firewood-stipulations', map: 'firewood-map', reference: 'firewood-measuring' },
  area: { descriptions: [], maps: ['ak-anch-access-map'], notices: ['ak-travel-advisory'], links: [{ label: 'Online notice', url: 'https://example.org/notice' }] },
  ...overrides
});
const pageText = page => page.items.map(item => item.str).join(' ');

test('the package puts the permit and stipulations first, then tag sheets backed by load records, then maps, notices and reference', async () => {
  const { blob, pageCount } = await buildPermitPackagePdf(permit());
  const { pages } = await readPdf(blob);
  assert.equal(pages.length, pageCount);
  const kinds = pages.map(page => {
    const text = pageText(page);
    if (/Forest Product Permit/.test(text) && /Permit holder signature/.test(text)) return 'permit';
    if (/Firewood permit stipulations/.test(text)) return 'stipulations';
    if (/FIREWOOD HAUL TAG/.test(text)) return 'tags';
    if (/Back of haul tags/.test(text) && (text.match(/Load record/g) || []).length === 4) return 'tag back';
    if (/Firewood cutting areas/.test(text)) return 'map';
    if (/Anchorage access map/.test(text)) return 'area map';
    if (/Online notice: https:\/\/example\.org\/notice/.test(text)) return 'notices';
    if (/Alaska travel advisory/.test(text)) return 'notice';
    if (/How to measure firewood/.test(text)) return 'reference';
    return 'other';
  });
  assert.deepEqual(kinds, ['permit', 'stipulations', 'tags', 'tag back', 'tags', 'tag back', 'map', 'area map', 'notices', 'notice', 'reference']);
  assert.doesNotMatch(pages.map(pageText).join(' '), /single-sided|Leave this side blank/, 'double-sided printing is safe, so nothing asks for single-sided');
  const tagText = pages.filter((_, i) => kinds[i] === 'tags').map(pageText).join(' ');
  for (let n = 1; n <= 6; n++) assert.match(tagText, new RegExp(`Tag ${n} of 6`));
  assert.equal((tagText.match(/½ CORD/g) || []).length, 6, 'each tag shows the amount it covers');
  assert.equal((tagText.match(/JAN 19, 2027/g) || []).length, 6, 'each tag shows when it expires');
  assert.doesNotMatch(tagText, /Tag 7 of/);
  const tagItems = pages.filter((_, i) => kinds[i] === 'tags').flatMap(page => page.items.map(item => item.str));
  assert.equal(tagItems.filter(str => str === 'Permit AK-ANCH-26-048213').length, 6, 'each tag carries the permit number');
  assert.match(pageText(pages[0]), /Not valid until printed and signed by the permit holder/);
  assert.match(pageText(pages[0]), /Printed name: Test Purchaser/);
  for (const [index, page] of pages.entries()) assert.ok(page.items.some(item => item.str.includes(`Permit AK-ANCH-26-048213 · Page ${index + 1} of ${pages.length}`)), `footer on page ${index + 1}`);
});

test('tag sheets start on the front of a sheet whatever length the permit takes, with no blank pages', () => {
  const pageKind = page => {
    const json = JSON.stringify(page);
    if (json.includes('Load record')) return 'back';
    if (json.includes('HAUL TAG')) return 'tags';
    if (json.includes('Firewood cutting areas')) return 'map';
    return 'other';
  };
  const even = packageSections(permit({ tagCount: 5 }), { frontPageCount: 2 });
  assert.deepEqual(even.tags.map(pageKind), ['tags', 'back', 'tags', 'back']);
  assert.equal(pageKind(even.reading[0]), 'map');
  const odd = packageSections(permit({ tagCount: 5 }), { frontPageCount: 3 });
  assert.deepEqual(odd.tags.map(pageKind), ['map', 'tags', 'back', 'tags', 'back'], 'the one-page map fills the gap instead of a blank page');
  assert.ok(!odd.reading.map(pageKind).includes('map'), 'the map is not repeated');
  assert.equal(TAGS_PER_SHEET, 4);
  const untagged = packageSections(permit({ tagCount: 0 }), { frontPageCount: 3 });
  assert.deepEqual(untagged.tags, [], 'no tags means no tag pages or gap');
  assert.equal(pageKind(untagged.reading[0]), 'map');
});

test('a package without haul tags has no tag pages', async () => {
  const mushrooms = permit({
    typeId: 'mushrooms', typeLabel: 'Mushrooms', productName: 'Morel Mushroom Permit (Personal Use)', quantityLabel: '5 pounds',
    tagCount: 0, tagLine: 'Not required for this permit',
    documents: { stipulations: 'mushroom-stipulations', map: 'mushroom-collection-areas', reference: 'mushroom-foraging' },
    area: { descriptions: [{ scope: 'Utah', text: 'Statewide notice text.' }], maps: [], notices: [], links: [] }
  });
  const { text, pages } = await readPdf((await buildPermitPackagePdf(mushrooms)).blob);
  assert.doesNotMatch(text, /HAUL TAG|Back of haul tags/);
  assert.match(text, /Not required for this permit/);
  assert.match(text, /Statewide notice text\./);
  assert.equal(pages.length, 5, 'permit, stipulations, collection areas, area notices, foraging guidelines');
});

test('the package keeps accented, Navajo, Greek and Cyrillic names, and long entries stay on the page', async () => {
  const name = 'José Muñoz | Áłtsé Hastiin | Łukasz Żółć | Ελληνικά | Кириллица | Ą́';
  const { text } = await readPdf((await buildPermitPackagePdf(permit({ holder: { name, addressLines: ['1 Road'], email: 'a@example.com' } }))).blob);
  assert.ok(text.normalize('NFC').includes(name.normalize('NFC')));
  const long = permit({ holder: { name: 'x'.repeat(101), addressLines: ['y'.repeat(120), `${'z'.repeat(80)}, UT 84037-1234`], email: `${'e'.repeat(108)}@example.com` } });
  const { pages } = await readPdf((await buildPermitPackagePdf(long)).blob);
  for (const [index, page] of pages.entries()) {
    for (const item of page.items.filter(item => item.str.trim())) {
      assert.ok(item.transform[4] >= 47.9, `left bound on page ${index + 1}: ${item.str}`);
      assert.ok(item.transform[4] + item.width <= page.width - 47.9, `right bound on page ${index + 1}: ${item.str}`);
      assert.ok(item.transform[5] > 20 && item.transform[5] < page.height - 40, `vertical bound on page ${index + 1}: ${item.str}`);
    }
  }
});

test('unsupported glyphs produce an explicit error instead of a corrupt permit', async () => {
  await assert.rejects(buildPermitPackagePdf(permit({ holder: { name: 'Name \u{10FFFF}', addressLines: ['1 Road'], email: 'a@example.com' } })), /does not support U\+10FFFF/);
});

test('the sample documents linked from the site match what the package would print', async () => {
  for (const id of sampleDocumentIds()) {
    const committed = await readPdf(new Blob([await readFile(new URL(`../${documentUrl(id)}`, import.meta.url))]));
    const fresh = await readPdf(await buildSampleDocumentPdf(id));
    assert.equal(committed.text, fresh.text, `${documentUrl(id)} is out of date; run npm run build:documents`);
    assert.match(committed.text, /Sample document/);
    // A map can fill the gap before the tag sheets only if it stays one page.
    if (Object.values(TYPE_DOCUMENTS).flat().some(doc => doc.id === id && doc.kind === 'map')) assert.equal(committed.pages.length, 1, id);
  }
});
