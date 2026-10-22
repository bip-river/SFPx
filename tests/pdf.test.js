import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoPermitPdf } from '../js/permit-pdf.js';
import { readPdf } from './pdf-text.mjs';

test('PDF embeds a Unicode font and retains accented, Navajo, Greek and Cyrillic names', async () => {
  const name = 'José Muñoz | Áłtsé Hastiin | Łukasz Żółć | Ελληνικά | Кириллица | A\u0328\u0301';
  const blob = await buildDemoPermitPdf(['Forest Product Permit - DEMO', `Issued to: ${name}`, 'Backslashes \\ and parentheses (preserved).']);
  const result = await readPdf(blob);
  assert.equal(result.pages.length, 1);
  assert.ok(result.text.normalize('NFC').includes(name.normalize('NFC')));
  assert.ok(result.text.includes('Backslashes \\ and parentheses (preserved).'));
});

test('PDF wraps long paragraphs and unbroken text and paginates without clipping', async () => {
  const blob = await buildDemoPermitPdf(['Forest Product Permit - DEMO', 'x'.repeat(500), ...Array.from({ length: 120 }, (_, i) => `Paragraph ${i}: ` + 'Long permit content must remain visible. '.repeat(8)), 'END OF PERMIT']);
  const result = await readPdf(blob);
  assert.ok(result.pages.length > 2);
  assert.match(result.text, /END OF PERMIT/);
  for (const [index, page] of result.pages.entries()) {
    assert.ok(page.items.some(item => item.str.includes(`Page ${index + 1} of ${result.pages.length}`)));
    for (const item of page.items.filter(item => item.str.trim())) {
      assert.ok(item.transform[4] >= 47.9, `left bound: ${item.str}`);
      assert.ok(item.transform[4] + item.width <= page.width - 47.9, `right bound: ${item.str}`);
      assert.ok(item.transform[5] > 20 && item.transform[5] < page.height - 35, `vertical bound: ${item.str}`);
    }
  }
});

test('unsupported glyphs produce an explicit error instead of a corrupt permit', async () => {
  await assert.rejects(buildDemoPermitPdf(['Name: \u{10FFFF}']), /does not support U\+10FFFF/);
});
