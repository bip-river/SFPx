import assert from 'node:assert/strict';
import { Builder, By, Key, until } from 'selenium-webdriver';
import { Select } from 'selenium-webdriver/lib/select.js';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const server = await startServer();
let driver;
try {
  driver = await new Builder().forBrowser('safari').build();
  console.log('Safari version:', (await driver.getCapabilities()).get('browserVersion'));
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30000, script: 30000 });
  await driver.manage().window().setRect({ width: 1280, height: 900 });
  const element = id => driver.findElement(By.id(id));
  const ready = () => driver.wait(() => driver.executeScript("return document.documentElement.dataset.appReady === 'true'"), 30000);
  const fill = async (id, value) => { const field = await element(id); await field.clear(); await field.sendKeys(value); };
  const accessibility = async stage => {
    await driver.executeScript(axeSource);
    const result = await driver.executeAsyncScript(`
      const done = arguments[arguments.length - 1];
      axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })
        .then(result => done(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))))
        .catch(error => done({ error: error.message }));
    `);
    assert.deepEqual(result, [], stage);
  };
  await driver.get(server.url); await ready();
  await driver.executeScript(`window.__testErrors = []; window.addEventListener('error', e => window.__testErrors.push(e.message)); window.addEventListener('unhandledrejection', e => window.__testErrors.push(String(e.reason)));`);
  await accessibility('Safari initial form');
  await driver.findElement(By.css('.ptype-card')).click();
  await new Select(await element('state')).selectByValue('AK');
  await (await element('officeInput')).click();
  await (await element('officeInput')).sendKeys(Key.ARROW_DOWN, Key.ARROW_UP, Key.ENTER);
  assert.equal(await (await element('officeInput')).getAttribute('value'), 'Anchorage Aurora Outpost');
  await accessibility('Safari product selection');
  await driver.findElement(By.css('.prod-header')).click();
  await fill('qty', '1'); await (await element('qty')).sendKeys(Key.TAB);
  const holder = async () => {
    await (await element('ackPrivacy')).click(); await (await element('ackTerms')).click();
    for (const [id, value] of Object.entries({ FirstName: 'Áłtsé José', LastName: 'Muñoz Żółć', AddressLine1: '123 Test Street', City: 'Test City', Zip: '84037', DeliveryEmail: 'test@example.com', ConfirmEmail: 'test@example.com' })) await fill(id, value);
    await new Select(await element('AddrState')).selectByValue('UT');
  };
  await holder(); await accessibility('Safari purchaser fields');
  const checkoutEnabled = await (await element('confirmPaygov')).isEnabled();
  if (!checkoutEnabled) console.log('Safari readiness diagnostics:', await driver.executeScript(`return [...document.querySelectorAll('#permitHolderFieldset input, #permitHolderFieldset select')].map(el => ({ id: el.id, value: el.value, disabled: el.disabled, invalid: el.getAttribute('aria-invalid') }));`));
  assert.equal(checkoutEnabled, true, 'Safari address-state change enables checkout');
  await (await element('confirmPaygov')).click();
  try { await driver.wait(until.elementLocated(By.css('#handoff .payload-content')), 10000); }
  catch (error) {
    console.log('Safari checkout diagnostics:', await driver.executeScript(`return { errors: window.__testErrors, secure: isSecureContext, uuid: typeof crypto.randomUUID, error: document.getElementById('errorList').textContent, holder: [...document.querySelectorAll('#permitHolderFieldset input, #permitHolderFieldset select')].map(el => ({ id: el.id, value: el.value, disabled: el.disabled })), quantity: document.getElementById('qty').value, product: document.querySelector('input[name=product]:checked')?.id, button: document.getElementById('confirmPaygov').outerHTML };`));
    throw error;
  }
  assert.equal(await driver.executeScript("return JSON.parse(document.querySelector('#handoff .payload-content').textContent).total"), 10);
  await driver.navigate().refresh(); await ready();
  assert.equal(await (await element('FirstName')).getAttribute('value'), '');
  assert.equal(await (await element('confirmPaygov')).isEnabled(), false);
  const products = await driver.findElements(By.css('.prod-header')); await products[3].click();
  await fill('qty', '1'); await (await element('qty')).sendKeys(Key.TAB); await holder();
  await (await element('confirmPaygov')).click();
  await driver.wait(until.elementIsVisible(await element('confirmation')), 30000);
  assert.equal(await driver.executeScript('return document.activeElement.id'), 'confirmation');
  await accessibility('Safari PDF confirmation');
  await fill('FirstName', 'Changed'); assert.equal(await (await element('confirmation')).isDisplayed(), false);
  await (await element('resetAll')).click();
  assert.equal(await (await element('FirstName')).getAttribute('value'), '');
  assert.equal(await driver.executeScript("return sessionStorage.getItem('sfp-demo-state')"), null);
  assert.equal(await driver.executeScript('return document.documentElement.scrollWidth <= innerWidth'), true);
  console.log('PASS actual macOS Safari: keyboard, checkout, Unicode PDF generation, focus, accessibility, reload and Reset');
} finally {
  await driver?.quit();
  await server.close();
}
