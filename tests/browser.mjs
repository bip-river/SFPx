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
  const screen = () => page.evaluate(() => [...document.querySelectorAll('.screen')].find(el => !el.hidden)?.id.replace('screen-', ''));
  const focused = () => page.evaluate(() => document.activeElement.id);
  const cont = async () => page.locator(`#screen-${await screen()} button[type=submit]`).click();
  const payload = () => page.locator('#handoff .payload-content').textContent().then(JSON.parse);
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const fields = { FirstName: 'Áłtsé José', LastName: 'Muñoz Żółć', AddressLine1: '123 Test Street', City: 'Test City', Zip: '84037', DeliveryEmail: 'test@example.com', ConfirmEmail: 'test@example.com' };
  const fillHolder = async () => {
    for (const [id, value] of Object.entries(fields)) await page.locator(`#${id}`).fill(value);
    await page.locator('#AddrState').selectOption('UT');
  };
  const pdfText = async () => {
    const downloadEvent = page.waitForEvent('download'); await page.locator('#permitDownloadBtn').click();
    const download = await downloadEvent;
    assert.equal(await download.failure(), null);
    return { name: download.suggestedFilename(), text: (await readPdf(new Blob([await readFile(await download.path())]))).text };
  };
  const waitForDone = async () => {
    try { await page.locator('#screen-done').waitFor({ state: 'visible' }); }
    catch (error) {
      console.log('Browser checkout diagnostics:', engineName, await page.evaluate(() => ({ secure: isSecureContext, uuid: typeof crypto.randomUUID, agreed: document.getElementById('agree').checked, error: document.getElementById('errorList').textContent, button: document.getElementById('confirmPaygov').outerHTML, focus: document.activeElement.id })));
      throw error;
    }
  };
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
    await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
    await page.goto(url);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    assert.equal(await screen(), 'start');
    assert.equal(await page.locator('.screen:not([hidden])').count(), 1, 'one screen at a time');
    await checkAccessibility(page, 'start');
    await page.getByRole('link', { name: 'Start now' }).click();
    assert.equal(await screen(), 'what');
    assert.equal(await focused(), 'whatTitle', 'focus moves to the first question');
    await checkAccessibility(page, 'what');

    // Keyboard: arrows move between collection types and Enter on Continue submits.
    await page.locator('#ptype_fuelwood').focus(); await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown'); assert.equal(await page.locator('#ptype_christmas').isChecked(), true);
    await page.keyboard.press('ArrowUp'); assert.equal(await page.locator('#ptype_fuelwood').isChecked(), true);
    // macOS WebKit can skip buttons when tabbing, so focus Continue directly.
    await page.locator('#screen-what button[type=submit]').focus(); await page.keyboard.press('Enter');
    assert.equal(await screen(), 'where');
    assert.equal(await focused(), 'whereTitle', 'focus moves to the new question');

    await page.locator('#state').selectOption('AK');
    await page.locator('label[for=office_0]').click();
    await page.locator('#locationNotice summary').click();
    await checkAccessibility(page, 'where');
    await cont();
    assert.equal(await screen(), 'permit');
    assert.equal(await page.getByRole('radio', { name: 'Anchorage North', exact: true }).count(), 1);
    await page.locator('label[for=prod_0]').click();
    assert.equal(await page.locator('#qty').inputValue(), '1', 'quantity starts at the minimum');
    await page.locator('#qtyInc').click();
    assert.equal(await page.locator('#totalAmount').textContent(), '$20.00');
    await checkAccessibility(page, 'permit with quantity');
    const mapLink = page.locator('#qtyDocs a').first();
    assert.equal(await mapLink.getAttribute('target'), '_blank');
    const mapResponse = await page.request.get(new URL(await mapLink.getAttribute('href'), page.url()).href);
    assert.equal(mapResponse.status(), 200);
    assert.match((await readPdf(new Blob([await mapResponse.body()]))).text, /Firewood cutting areas/, 'sample documents are served');
    await page.locator('#qty').fill('0'); await page.locator('#qty').press('Tab');
    assert.equal(await page.locator('#qty').getAttribute('aria-invalid'), 'true');
    assert.ok((await page.locator('#qty').getAttribute('aria-describedby')).includes('qty-error'));
    assert.notEqual(await focused(), 'qty', 'validation does not steal focus');
    await page.locator('#qty').fill('1'); await page.locator('#qty').press('Enter');
    assert.equal(await screen(), 'details', 'Enter in the quantity field continues');

    await fillHolder();
    assert.equal(await page.getByRole('textbox', { name: 'First name', exact: true }).getAttribute('required'), '');
    await checkAccessibility(page, 'completed purchaser fields');
    // A mistyped confirmation is explained when Continue is pressed, with a link that moves to the field.
    await page.locator('#ConfirmEmail').fill('typo@example.com');
    await cont();
    await page.locator('#errorBox').waitFor({ state: 'visible' });
    assert.equal(await focused(), 'errorBox', 'the error summary takes focus');
    await checkAccessibility(page, 'error summary');
    await page.locator('#errorList a[href="#ConfirmEmail"]').click();
    assert.equal(await focused(), 'ConfirmEmail', 'the summary link moves to its field');
    await page.locator('#ConfirmEmail').fill('test@example.com');
    await cont();
    assert.equal(await screen(), 'review');
    await checkAccessibility(page, 'review');
    await page.locator('label[for=agree]').click();
    await page.locator('#confirmPaygov').click();
    await waitForDone();
    assert.equal(await focused(), 'doneTitle');
    const first = await payload();
    assert.equal(first.total, 10);
    await page.locator('#handoffDetail summary').click();
    assert.equal(await noOverflow(), true, 'no horizontal overflow with checkout payload');
    await checkAccessibility(page, 'done');
    const paidPdf = await pdfText();
    assert.match(paidPdf.name, /^AK-ANCH-26-\d{6}\.pdf$/, 'the package is named by its permit number');
    assert.match(paidPdf.text, /Printed name: Áłtsé José Muñoz Żółć/);
    assert.match(paidPdf.text, /Tag 2 of 2/, 'one cord of firewood comes with two haul tags');

    // The browser's Back button returns to the check screen; paying again keeps the same reference.
    await page.goBack();
    assert.equal(await screen(), 'review');
    await page.locator('#confirmPaygov').click();
    await waitForDone();
    assert.equal((await payload()).idempotencyKey, first.idempotencyKey);

    await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    assert.equal(await screen(), 'details', 'purchaser details must be reentered after a reload');
    assert.equal(await page.locator('#FirstName').inputValue(), '');
    await page.locator('#backLink').click();
    assert.equal(await page.locator('input[name=product]:checked').count(), 1, 'the permit choice survives the reload');

    // Change to the free-use option, then generate and download a PDF.
    await page.locator('label[for=prod_3]').click();
    await cont(); await fillHolder(); await cont();
    await page.locator('label[for=agree]').click();
    assert.equal(await page.locator('#confirmPaygov').textContent(), 'Get my free permit');
    await page.locator('#confirmPaygov').click();
    await waitForDone();
    assert.equal((await payload()).total, 0);
    assert.equal(await focused(), 'doneTitle');
    assert.equal(await page.getByRole('heading', { level: 1, name: 'Your permit is ready' }).count(), 1);
    const freePdf = await pdfText();
    assert.match(freePdf.name, /^AK-ANCH-26-\d{6}\.pdf$/);
    assert.match(freePdf.text, /Printed name: Áłtsé José Muñoz Żółć/);
    assert.doesNotMatch(freePdf.text, /HAUL TAG/, 'this listing does not use haul tags');

    await page.locator('#startAnother').click();
    assert.equal(await screen(), 'what');
    assert.equal(await page.locator('#FirstName').inputValue(), '');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('sfp-demo-state')), null);
    assert.equal(await noOverflow(), true, 'no horizontal overflow');
    assert.deepEqual(errors, []);
    console.log(`PASS ${engineName}: keyboard, screens, browser Back, checkout, Unicode PDFs, accessibility, focus, reload and reset at ${viewport.width}px`);
  }
  await page.goto(`${url}/tests/smoke.html`);
  await page.waitForFunction(() => document.querySelectorAll('#results .status').length === 8);
  assert.equal(await page.locator('#results .fail').count(), 0);
  console.log('PASS browser smoke page: 8 checks');
} finally {
  await browser?.close();
  await server.close();
}
