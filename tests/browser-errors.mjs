// Failure paths in a real browser: each scenario breaks one thing the way a network, server or browser would,
// then checks the exact message a visitor sees, what they can do next, and that the page stays accessible.
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { startServer } from './server.mjs';

const server = await startServer();
const { url } = server;
const engineName = process.env.BROWSER || 'chromium';
const engine = { chromium, firefox, webkit }[engineName];
if (!engine) throw new Error(`Unknown browser: ${engineName}`);

const LOAD_ERROR = 'We couldn’t load the permits available online. Check your internet connection, then try again. If it keeps happening, try again later or contact a local BWL office.';
const ENGINE_ERROR = 'We couldn’t create your permit because part of this page didn’t download. Check your internet connection, then try again. Your entries are still here.';
const STARTUP_ERROR = 'This page didn’t load properly, so you can’t start a permit right now. Reload the page to try again. If that doesn’t work, try another browser, or buy your permit at a local BWL office.';
const NOSCRIPT = 'This service needs JavaScript. Turn it on in your browser settings and reload the page, or buy your permit at a local BWL office.';

async function checkAccessibility(page, stage) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `${stage}: accessibility violations`);
}

let browser;
const passed = [];
async function scenario(name, run, contextOptions = {}) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...contextOptions });
  const page = await context.newPage();
  try {
    await run(page);
    passed.push(name);
  } catch (error) {
    error.message = `${engineName} – ${name}: ${error.message}`;
    throw error;
  } finally {
    await context.close();
  }
}

const screen = page => page.evaluate(() => [...document.querySelectorAll('.screen')].find(el => !el.hidden)?.id.replace('screen-', ''));
const focused = page => page.evaluate(() => document.activeElement.id);
const errorText = page => page.evaluate(() => (document.getElementById('errorBox').hidden ? '' : document.getElementById('errorList').innerText.replace(/\s+/g, ' ').trim()));
const ready = page => page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
const cont = async page => page.locator(`#screen-${await screen(page)} button[type=submit]`).click();

async function open(page) {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  await page.goto(url);
  await ready(page);
}

async function toReview(page) {
  await page.locator('#startButton').click();
  await page.locator('label[for=ptype_fuelwood]').click(); await cont(page);
  await page.locator('#state').selectOption('AK'); await page.locator('label[for=office_0]').click(); await cont(page);
  await page.locator('label[for=prod_0]').click(); await cont(page);
  const fields = { FirstName: 'Test', LastName: 'Purchaser', AddressLine1: '123 Test Street', City: 'Test City', Zip: '84037', DeliveryEmail: 'test@example.com', ConfirmEmail: 'test@example.com' };
  for (const [id, value] of Object.entries(fields)) await page.locator(`#${id}`).fill(value);
  await page.locator('#AddrState').selectOption('UT');
  await cont(page);
  assert.equal(await screen(page), 'review');
  await page.locator('label[for=agree]').click();
}

try {
  browser = await engine.launch({
    headless: true,
    // Each scenario uses a fresh context, which single-process Chromium cannot reopen, so only the path is passed.
    ...(engineName === 'chromium' && process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {})
  });

  await scenario('catalog server error, then Try again', async page => {
    let fail = true;
    await page.route('**/products.json', route => (fail ? route.fulfill({ status: 503, body: 'Service Unavailable' }) : route.continue()));
    await open(page);
    assert.equal(await screen(page), 'start');
    assert.equal(await errorText(page), `${LOAD_ERROR} Try again`);
    await checkAccessibility(page, 'load error on the start page');
    await page.locator('#startButton').click();
    assert.equal(await errorText(page), `${LOAD_ERROR} Try again`, 'the error stays on the first question');
    await page.locator('label[for=ptype_fuelwood]').click(); await cont(page);
    assert.equal(await screen(page), 'what');
    assert.equal(await focused(page), 'errorBox');
    await checkAccessibility(page, 'load error on step 1');
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.locator('#errorBox').waitFor({ state: 'hidden' });
    assert.equal(await focused(page), 'whatTitle');
    await cont(page);
    assert.equal(await screen(page), 'where');
    assert.ok(await page.locator('#state option[value=AK]').count());
  });

  await scenario('catalog is not valid JSON, and a retry that fails again', async page => {
    await page.route('**/products.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"AK": ' }));
    await open(page);
    assert.equal(await errorText(page), `${LOAD_ERROR} Try again`);
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.waitForFunction(() => document.activeElement.id === 'errorBox');
    assert.equal(await errorText(page), `${LOAD_ERROR} Try again`);
  });

  await scenario('catalog request is blocked by the network', async page => {
    await page.route('**/products.json', route => route.abort('internetdisconnected'));
    await open(page);
    assert.equal(await errorText(page), `${LOAD_ERROR} Try again`);
    assert.equal(await page.locator('#state').isDisabled(), true);
  });

  await scenario('catalog request never answers', async page => {
    await page.clock.install({ time: new Date('2026-10-21T12:00:00Z') });
    await page.route('**/products.json', () => { /* never answered */ });
    await page.goto(url);
    await page.locator('#startButton').click();
    await page.locator('label[for=ptype_fuelwood]').click(); await cont(page);
    assert.equal(await errorText(page), 'Permits are still loading. Wait a moment, then select Continue again.');
    await page.clock.runFor(15000);
    await ready(page);
    assert.equal(await errorText(page), `${LOAD_ERROR} Try again`);
  });

  await scenario('PDF engine does not download, then pays on retry', async page => {
    let block = true;
    await page.route('**/vendor/pdfmake.js', route => (block ? route.abort('internetdisconnected') : route.continue()));
    await open(page);
    await toReview(page);
    await page.locator('#confirmPaygov').click();
    await page.locator('#errorBox').waitFor({ state: 'visible' });
    assert.equal(await errorText(page), ENGINE_ERROR);
    assert.equal(await screen(page), 'review');
    assert.equal(await page.locator('#agree').isChecked(), true, 'entries are kept');
    await checkAccessibility(page, 'PDF engine error');
    block = false;
    await page.locator('#confirmPaygov').click();
    await page.locator('#screen-done').waitFor({ state: 'visible' });
  });

  await scenario('PDF font returns a server error', async page => {
    await page.route('**/vendor/permit-font.js', route => route.fulfill({ status: 500, body: '' }));
    await open(page);
    await toReview(page);
    await page.locator('#confirmPaygov').click();
    await page.locator('#errorBox').waitFor({ state: 'visible' });
    assert.equal(await errorText(page), ENGINE_ERROR);
  });

  await scenario('unprintable characters are explained when the field is left', async page => {
    await open(page);
    await page.locator('#startButton').click();
    await page.locator('label[for=ptype_fuelwood]').click(); await cont(page);
    await page.locator('#state').selectOption('AK'); await page.locator('label[for=office_0]').click(); await cont(page);
    await page.locator('label[for=prod_0]').click(); await cont(page);
    await page.locator('#FirstName').fill('Test 🌲'); await page.locator('#FirstName').press('Tab');
    assert.equal(await page.locator('#FirstName-error').textContent(), 'First name can’t include “🌲” because the permit can’t print it. Remove it or type it another way.');
    await page.locator('#City').fill('東京'); await page.locator('#City').press('Tab');
    assert.equal(await page.locator('#City-error').textContent(), 'City can’t include “東” or “京” because the permit can’t print them. Remove them or type them another way.');
    await checkAccessibility(page, 'unprintable character errors');
  });

  const startupFailure = async (page, stage) => {
    await page.locator('#startupError').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#startupError').innerText()).trim(), STARTUP_ERROR);
    assert.equal(await page.locator('#startButton').isVisible(), false, 'no start button that cannot work');
    await checkAccessibility(page, stage);
  };

  await scenario('app.js does not download', async page => {
    await page.route('**/app.js', route => route.fulfill({ status: 404, body: '' }));
    await page.goto(url);
    await startupFailure(page, 'app.js missing');
  });

  await scenario('a module app.js imports does not download', async page => {
    await page.route('**/js/ui.js', route => route.abort('failed'));
    await page.goto(url);
    await startupFailure(page, 'module missing');
  });

  await scenario('app.js stops with an error while starting', async page => {
    await page.route('**/app.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: "throw new Error('broken build');" }));
    await page.goto(url);
    await startupFailure(page, 'app.js throws');
  });

  await scenario('JavaScript is turned off', async page => {
    await page.goto(url);
    assert.equal((await page.locator('#screen-start .startup-error').first().innerText()).trim(), NOSCRIPT);
    assert.equal(await page.locator('#startButton').isVisible(), false);
    assert.equal(await page.locator('.start-time').isVisible(), false);
  }, { javaScriptEnabled: false });

  await scenario('a working page shows no startup error', async page => {
    await open(page);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#startupError').isVisible(), false);
    assert.equal(await page.locator('#startButton').isVisible(), true);
    assert.equal(await errorText(page), '');
  });

  for (const name of passed) console.log(`PASS ${engineName}: ${name}`);
} finally {
  await browser?.close();
  await server.close();
}
