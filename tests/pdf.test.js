import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPermitPackagePdf, buildSampleDocumentPdf } from '../js/permit-pdf.js';
import { packageSections, sampleDocumentIds, documentUrl, TYPE_DOCUMENTS, tagSheetLayout, mirrorLongEdge, mirrorShortEdge, PAGE } from '../js/permit-documents.js';
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

test('the package puts the permit and stipulations first, then each tag sheet followed by load records, then maps, notices and reference', async () => {
  const { blob, pageCount } = await buildPermitPackagePdf(permit());
  const { pages } = await readPdf(blob);
  assert.equal(pages.length, pageCount);
  const kinds = pages.map(page => {
    const text = pageText(page);
    if (/Forest Product Permit/.test(text) && /Permit holder signature/.test(text)) return 'permit';
    if (/Firewood permit stipulations/.test(text)) return 'stipulations';
    if (/FIREWOOD HAUL TAG/.test(text)) return 'tags';
    if (/Load records · Permit/.test(text)) return 'load records';
    if (/Firewood cutting areas/.test(text)) return 'map';
    if (/Anchorage access map/.test(text)) return 'area map';
    if (/Online notice: https:\/\/example\.org\/notice/.test(text)) return 'notices';
    if (/Alaska travel advisory/.test(text)) return 'notice';
    if (/How to measure firewood/.test(text)) return 'reference';
    return 'other';
  });
  assert.deepEqual(kinds, ['permit', 'stipulations', 'tags', 'load records', 'tags', 'load records', 'map', 'area map', 'notices', 'notice', 'reference']);
  const count = (page, pattern) => (pageText(page).match(pattern) || []).length;
  assert.deepEqual([2, 4].map(i => count(pages[i], /Tag \d of 6/g)), [4, 2], 'four tags, then a diagonal pair');
  assert.deepEqual([3, 5].map(i => count(pages[i], /Load record\b/g)), [4, 2], 'one load record for each tag on the sheet before');
  // Text positions from the PDF (origin bottom left) must fall inside the planned cut lines (origin top left).
  const inside = (item, page, rects) => rects.some(r => item.transform[4] >= r.x && item.transform[4] <= r.x + r.width && page.height - item.transform[5] >= r.y && page.height - item.transform[5] <= r.y + r.height);
  for (const [sheetIndex, sheet] of tagSheetLayout(6).entries()) {
    const tagPage = pages[2 + sheetIndex * 2], recordPage = pages[3 + sheetIndex * 2];
    for (const item of tagPage.items.filter(item => ['JAN', 'DEC', '1', '31', 'AM', 'PM'].includes(item.str))) assert.ok(inside(item, tagPage, sheet), `${item.str} on page ${3 + sheetIndex * 2} stays inside its tag`);
    for (const item of recordPage.items.filter(item => item.str === 'Load record')) assert.ok(inside(item, recordPage, sheet.map(mirrorLongEdge)), `record on page ${4 + sheetIndex * 2} sits behind a tag`);
  }
  assert.doesNotMatch(pages.map(pageText).join(' '), /single-sided|Leave this side blank|Back of/i, 'the package reads the same printed one- or two-sided');
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
    if (json.includes('Load records')) return 'records';
    if (json.includes('HAUL TAG')) return 'tags';
    if (json.includes('Firewood cutting areas')) return 'map';
    return 'other';
  };
  const even = packageSections(permit({ tagCount: 5 }), { frontPageCount: 2 });
  assert.deepEqual(even.tags.map(pageKind), ['tags', 'records', 'tags', 'records']);
  assert.equal(pageKind(even.reading[0]), 'map');
  const odd = packageSections(permit({ tagCount: 5 }), { frontPageCount: 3 });
  assert.deepEqual(odd.tags.map(pageKind), ['map', 'tags', 'records', 'tags', 'records'], 'the one-page map fills the gap instead of a blank page');
  assert.ok(!odd.reading.map(pageKind).includes('map'), 'the map is not repeated');
  const untagged = packageSections(permit({ tagCount: 0 }), { frontPageCount: 3 });
  assert.deepEqual(untagged.tags, [], 'no tags means no tag pages or gap');
  assert.equal(pageKind(untagged.reading[0]), 'map');
});

test('load records match the number and position of tags whichever way a double-sided sheet turns', () => {
  const key = r => `${r.x},${r.y}`;
  for (let count = 1; count <= 13; count++) {
    const sheets = tagSheetLayout(count);
    assert.deepEqual(sheets.flat().map(tag => tag.number), Array.from({ length: count }, (_, i) => i + 1), `${count} tags, numbered in order`);
    for (const sheet of sheets) {
      assert.ok([1, 2, 4].includes(sheet.length), `${count}: sheets hold 4, 2 or 1 tags`);
      // A long-edge turn swaps left and right, a short-edge turn top and bottom; both must land on the same spots.
      assert.deepEqual(sheet.map(mirrorLongEdge).map(key).sort(), sheet.map(mirrorShortEdge).map(key).sort(), `${count} tags: records line up for either turn`);
      for (const tag of sheet) assert.ok(tag.x >= 0 && tag.y >= 0 && tag.x + tag.width <= PAGE.width && tag.y + tag.height <= PAGE.height - 40, 'on the page, above the footer');
      for (const [i, a] of sheet.entries()) for (const b of sheet.slice(i + 1)) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'tags do not overlap');
    }
  }
  assert.deepEqual(tagSheetLayout(3).map(sheet => sheet.length), [2, 1], 'no arrangement of three works, so three tags become a pair and a single');
  assert.deepEqual(tagSheetLayout(1)[0].map(tag => [tag.x * 2 + tag.width, tag.y * 2 + tag.height]), [[PAGE.width, PAGE.height]], 'a single tag is centred');
});

test('a three-tree Christmas package prints a diagonal pair and a centred tag, each followed by matching records', async () => {
  const trees = permit({ typeId: 'christmas', typeLabel: 'Christmas tree', productName: 'Christmas Tree Permit — Chugach Access', quantityLabel: '3 trees', tagCount: 3, tagLine: '3 included, one for each tree', tagEach: 'tree', tagQuantity: '1 tree', documents: { stipulations: 'christmas-tree-stipulations', map: 'christmas-tree-map', reference: 'christmas-tree-trip-planning' } });
  const { pages } = await readPdf((await buildPermitPackagePdf(trees)).blob);
  const text = pages.map(pageText);
  const tagPages = text.flatMap((t, i) => (/CHRISTMAS TREE TAG/.test(t) ? [i] : []));
  assert.equal(tagPages.length, 2);
  for (const i of tagPages) assert.match(text[i + 1], /Load records · Permit/, 'records follow each tag sheet');
  assert.ok(tagPages.every(i => i % 2 === 0), 'tag sheets start on the front of a sheet');
  assert.deepEqual(tagPages.map(i => (text[i].match(/CHRISTMAS TREE TAG/g) || []).length), [2, 1]);
  assert.deepEqual(tagPages.map(i => (text[i + 1].match(/Load record\b/g) || []).length), [2, 1]);
  assert.match(text.join(' '), /1 TREE/);
});

test('a package without haul tags has no tag pages', async () => {
  const mushrooms = permit({
    typeId: 'mushrooms', typeLabel: 'Mushrooms', productName: 'Morel Mushroom Permit (Personal Use)', quantityLabel: '5 pounds',
    tagCount: 0, tagLine: 'Not required for this permit',
    documents: { stipulations: 'mushroom-stipulations', map: 'mushroom-collection-areas', reference: 'mushroom-foraging' },
    area: { descriptions: [{ scope: 'Utah', text: 'Statewide notice text.' }], maps: [], notices: [], links: [] }
  });
  const { text, pages } = await readPdf((await buildPermitPackagePdf(mushrooms)).blob);
  assert.doesNotMatch(text, /HAUL TAG|Load records/);
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
