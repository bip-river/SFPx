import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
  try { response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'text/plain' }).end(await readFile(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--single-process', '--no-zygote', '--disable-gpu'] } : {})
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
    await page.locator('.ptype-card').first().click();
    await page.locator('#state').selectOption('AK');
    await page.locator('#officeInput').focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#officeInput').inputValue(), 'Anchorage Aurora Outpost');
    await page.locator('.prod-header').first().click();
    await page.locator('#qty').fill('1'); await page.locator('#qty').press('Tab');
    await page.locator('#ackPrivacy').check(); await page.locator('#ackTerms').check();
    const fields = { FirstName: 'Test', LastName: 'Purchaser', AddressLine1: '123 Test Street', City: 'Test City', Zip: '84037', DeliveryEmail: 'test@example.com', ConfirmEmail: 'test@example.com' };
    for (const [id, value] of Object.entries(fields)) await page.locator(`#${id}`).fill(value);
    await page.locator('#AddrState').selectOption('UT');
    await page.locator('#confirmPaygov').click();
    const payload = () => page.locator('#handoff .payload-content').textContent().then(JSON.parse);
    const first = await payload(); assert.equal(first.total, 10);
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
    await page.locator('#confirmPaygov').click(); assert.equal((await payload()).total, 0);
    const downloadEvent = page.waitForEvent('download'); await page.locator('#permitDownloadBtn').click();
    const download = await downloadEvent; assert.match(download.suggestedFilename(), /^PERMIT-.+\.pdf$/);
    assert.equal(await download.failure(), null);
    await page.locator('#FirstName').fill('Changed');
    assert.equal(await page.locator('#confirmation').isVisible(), false);
    await page.locator('#resetAll').click();
    assert.equal(await page.locator('#FirstName').inputValue(), '');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('sfp-demo-state')), null);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
    assert.deepEqual(errors, []);
    console.log(`PASS browser checkout, reload, download, Reset, and keyboard flow at ${viewport.width}px`);
  }
  await page.goto(`${url}/tests/smoke.html`);
  await page.waitForFunction(() => document.querySelectorAll('#results .status').length === 8);
  assert.equal(await page.locator('#results .fail').count(), 0);
  console.log('PASS browser smoke page: 8 checks');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
