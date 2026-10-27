import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { startServer } from './server.mjs';
import { readPdf } from './pdf-text.mjs';
const server = await startServer();
const { url } = server;
const engineName = process.env.BROWSER || 'chromium';
const engine = { chromium, firefox, webkit }[engineName];
if (!engine) throw new Error(`Unknown browser: ${engineName}`);
async function checkAccessibility(page, stage) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `${stage}: accessibility violations`);
}
let browser;
try {
  browser = await engine.launch({
    headless: true,
    ...(engineName === 'chromium' && process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--single-process', '--no-zygote', '--disable-gpu'] } : {})
  });
  const context = await browser.newContext({ reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage();
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
    await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    assert.equal(await page.locator('#step3Body').getAttribute('inert'), '');
    await checkAccessibility(page, 'initial form');
    await page.locator('#resetAll').focus(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('[inert]')), false, 'locked controls are skipped');
    await page.locator('.ptype-card').first().click();
    await page.locator('#state').selectOption('AK');
    // A pointer press held longer than a quick tap must still choose the option.
    await page.locator('#officeInput').click();
    const slowOption = page.locator('#officeOption_1'); await slowOption.scrollIntoViewIfNeeded();
    const optionBox = await slowOption.boundingBox();
    await page.mouse.move(optionBox.x + optionBox.width / 2, optionBox.y + optionBox.height / 2);
    await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up();
    assert.equal(await page.locator('#officeInput').inputValue(), 'Juneau Harbor Outpost', 'slow pointer click selects an office');
    await page.locator('#officeInput').click();
    assert.equal(await page.locator('#officeInput').getAttribute('aria-expanded'), 'true', 'clicking the still-focused field reopens the list');
    await page.locator('#officeInput').fill(''); await page.locator('#state').focus();
    await page.locator('#officeInput').focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#officeInput').inputValue(), 'Anchorage Aurora Outpost');
    assert.equal(await page.getByRole('radio', { name: 'Fuelwood Permit — Anchorage North', exact: true }).count(), 1);
    await checkAccessibility(page, 'available products');
    await page.locator('.prod-header').first().click();
    await page.locator('#qty').fill('0'); await page.locator('#qty').press('Tab');
    assert.equal(await page.locator('#qty').getAttribute('aria-invalid'), 'true');
    assert.ok((await page.locator('#qty').getAttribute('aria-describedby')).includes('qty-error'));
    assert.notEqual(await page.evaluate(() => document.activeElement.id), 'qty', 'validation does not steal focus');
    await page.locator('#qty').fill('1'); await page.locator('#qty').press('Tab');
    await page.locator('#ackPrivacy').check(); await page.locator('#ackTerms').check();
    const fields = { FirstName: 'Áłtsé José', LastName: 'Muñoz Żółć', AddressLine1: '123 Test Street', City: 'Test City', Zip: '84037', DeliveryEmail: 'test@example.com', ConfirmEmail: 'test@example.com' };
    for (const [id, value] of Object.entries(fields)) await page.locator(`#${id}`).fill(value);
    await page.locator('#AddrState').selectOption('UT');
    assert.equal(await page.getByRole('textbox', { name: 'First name', exact: true }).getAttribute('required'), '');
    await checkAccessibility(page, 'completed purchaser fields');
    await page.locator('#confirmPaygov').click();
    const payload = () => page.locator('#handoff .payload-content').textContent().then(JSON.parse);
    let first;
    try { first = await payload(); }
    catch (error) {
      console.log('Browser checkout diagnostics:', engineName, errors, await page.evaluate(() => ({ secure: isSecureContext, uuid: typeof crypto.randomUUID, error: document.getElementById('errorList').textContent, button: document.getElementById('confirmPaygov').outerHTML, focus: document.activeElement.id })));
      throw error;
    }
    assert.equal(first.total, 10);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow with checkout payload');
    await page.locator('#confirmPaygov').click(); assert.equal((await payload()).idempotencyKey, first.idempotencyKey);
    await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    assert.equal(await page.locator('input[name=product]:checked').count(), 1);
    assert.equal(await page.locator('#FirstName').inputValue(), '');
    assert.equal(await page.locator('#confirmPaygov').isDisabled(), true);
    // Change to the free-use option, then generate and download a PDF.
    await page.locator('.prod-header').nth(3).click();
    await page.locator('#qty').fill('1'); await page.locator('#qty').press('Tab');
    await page.locator('#ackPrivacy').check(); await page.locator('#ackTerms').check();
    for (const [id, value] of Object.entries(fields)) await page.locator(`#${id}`).fill(value);
    await page.locator('#AddrState').selectOption('UT');
    await page.locator('#confirmPaygov').click();
    await page.locator('#confirmation').waitFor({ state: 'visible' });
    assert.equal((await payload()).total, 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'confirmation');
    assert.equal(await page.getByRole('region', { name: 'Demo permit generated', exact: true }).count(), 1);
    await page.waitForFunction(() => document.getElementById('stepLiveRegion').textContent.includes('download button is ready'));
    await checkAccessibility(page, 'permit confirmation');
    const downloadEvent = page.waitForEvent('download'); await page.locator('#permitDownloadBtn').click();
    const download = await downloadEvent; assert.match(download.suggestedFilename(), /^PERMIT-.+\.pdf$/);
    assert.equal(await download.failure(), null);
    const pdf = await readPdf(new Blob([await readFile(await download.path())]));
    assert.match(pdf.text, /Áłtsé José Muñoz Żółć/);
    await page.locator('#FirstName').fill('Changed');
    assert.equal(await page.locator('#confirmation').isVisible(), false);
    await page.locator('#resetAll').click();
    assert.equal(await page.locator('#FirstName').inputValue(), '');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('sfp-demo-state')), null);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
    assert.deepEqual(errors, []);
    console.log(`PASS ${engineName}: checkout, Unicode PDF, accessibility, focus, reload, Reset at ${viewport.width}px`);
  }
  await page.goto(`${url}/tests/smoke.html`);
  await page.waitForFunction(() => document.querySelectorAll('#results .status').length === 8);
  assert.equal(await page.locator('#results .fail').count(), 0);
  console.log('PASS browser smoke page: 8 checks');
} finally {
  await browser?.close();
  await server.close();
}
