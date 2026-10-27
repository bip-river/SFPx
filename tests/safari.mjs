import assert from 'node:assert/strict';
import { Builder, By, Key } from 'selenium-webdriver';
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
  const screen = () => driver.executeScript("return [...document.querySelectorAll('.screen')].find(el => !el.hidden)?.id.replace('screen-', '')");
  const waitForScreen = (name, timeout = 10000) => driver.wait(async () => (await screen()) === name, timeout, `screen ${name}`);
  const cont = async () => driver.findElement(By.css(`#screen-${await screen()} button[type=submit]`)).click();
  const fill = async (id, value) => { const field = await element(id); await field.clear(); await field.sendKeys(value); };
  const payload = () => driver.executeScript("return JSON.parse(document.querySelector('#handoff .payload-content').textContent)");
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
  const holder = async () => {
    for (const [id, value] of Object.entries({ FirstName: 'Áłtsé José', LastName: 'Muñoz Żółć', AddressLine1: '123 Test Street', City: 'Test City', Zip: '84037', DeliveryEmail: 'test@example.com', ConfirmEmail: 'test@example.com' })) await fill(id, value);
    await new Select(await element('AddrState')).selectByValue('UT');
  };
  const pay = async () => {
    await driver.findElement(By.css('label[for=agree]')).click();
    await (await element('confirmPaygov')).click();
    try { await waitForScreen('done', 30000); }
    catch (error) {
      console.log('Safari checkout diagnostics:', await driver.executeScript(`return { errors: window.__testErrors, secure: isSecureContext, uuid: typeof crypto.randomUUID, error: document.getElementById('errorList').textContent, holder: [...document.querySelectorAll('#screen-details input, #screen-details select')].map(el => ({ id: el.id, value: el.value })), quantity: document.getElementById('qty').value, product: document.querySelector('input[name=product]:checked')?.id, button: document.getElementById('confirmPaygov').outerHTML };`));
      throw error;
    }
  };

  const trackErrors = () => driver.executeScript(`window.__testErrors = []; window.addEventListener('error', e => window.__testErrors.push(e.message)); window.addEventListener('unhandledrejection', e => window.__testErrors.push(String(e.reason)));`);
  await driver.get(server.url); await ready();
  await driver.executeScript('sessionStorage.clear()'); await trackErrors();
  await accessibility('Safari start');
  await (await element('startButton')).click(); await waitForScreen('what');
  assert.equal(await driver.executeScript('return document.activeElement.id'), 'whatTitle');
  await accessibility('Safari what');
  await driver.findElement(By.css('label[for=ptype_fuelwood]')).click();
  await cont(); await waitForScreen('where');
  assert.equal(await driver.executeScript('return document.activeElement.id'), 'whereTitle');
  await new Select(await element('state')).selectByValue('AK');
  await driver.findElement(By.css('label[for=office_0]')).click();
  await accessibility('Safari where');
  await cont(); await waitForScreen('permit');
  await driver.findElement(By.css('label[for=prod_0]')).click();
  await accessibility('Safari permit');
  await fill('qty', '1'); await (await element('qty')).sendKeys(Key.ENTER);
  await waitForScreen('details');
  await holder(); await accessibility('Safari purchaser fields');
  await cont(); await waitForScreen('review');
  await accessibility('Safari review');
  await pay();
  assert.equal(await driver.executeScript('return document.activeElement.id'), 'doneTitle');
  assert.equal((await payload()).total, 10);
  await accessibility('Safari done');
  await driver.navigate().back(); await waitForScreen('review');
  assert.deepEqual(await driver.executeScript('return window.__testErrors'), []);
  await driver.navigate().refresh(); await ready(); await trackErrors();
  assert.equal(await screen(), 'details', 'purchaser details must be reentered');
  assert.equal(await (await element('FirstName')).getAttribute('value'), '');
  await (await element('backLink')).click(); await waitForScreen('permit');
  await driver.findElement(By.css('label[for=prod_3]')).click();
  await cont(); await waitForScreen('details');
  await holder(); await cont(); await waitForScreen('review');
  await pay();
  assert.equal((await payload()).total, 0);
  assert.equal(await (await element('permitDownloadBtn')).isEnabled(), true);
  await (await element('startAnother')).click(); await waitForScreen('what');
  assert.equal(await (await element('FirstName')).getAttribute('value'), '');
  assert.equal(await driver.executeScript("return sessionStorage.getItem('sfp-demo-state')"), null);
  assert.equal(await driver.executeScript('return document.documentElement.scrollWidth <= innerWidth'), true);
  assert.deepEqual(await driver.executeScript('return window.__testErrors'), []);
  console.log('PASS actual macOS Safari: screens, browser Back, checkout, Unicode PDF generation, focus, accessibility, reload and reset');
} finally {
  await driver?.quit();
  await server.close();
}
