import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { root, loadPage, dumpStorage, openPayure, sleep } from './dom.mjs';
import { BREAKS, DEMO_KEY } from '../demo/state.js';

const catalog = JSON.parse(await readFile(new URL('products.json', root), 'utf8'));
const LOAD_ERROR = 'We couldn’t load the permits available online. Check your internet connection, then try again. If it keeps happening, try again later or contact a local BWL office.';
const tools = (breaks = {}, extra = {}) => ({ [DEMO_KEY]: JSON.stringify({ tools: true, open: true, breaks, ...extra }) });

// The permit service with its demo tools, in a tab whose storage starts as `storage`.
async function bwl(t, { storage = {}, url = 'http://localhost/' } = {}) {
  const urls = new Map();
  const page = await loadPage(t, {
    url, storage, entry: ['app.js', 'demo/boot.js'],
    setup: (w) => {
      w.fetch = async () => ({ ok: true, json: async () => structuredClone(catalog) });
      w.URL.createObjectURL = blob => { const id = `blob:test/${urls.size}`; urls.set(id, blob); return id; };
      w.URL.revokeObjectURL = () => {};
    }
  });
  await page.ready;
  return helpers(page, { urls });
}

function helpers(page, extra = {}) {
  const { w } = page;
  const $ = selector => w.document.querySelector(selector);
  const drawer = () => $('#demoDrawer');
  // The drawer follows the page on the next animation frame.
  const settle = () => sleep(30);
  const button = (name) => [...w.document.querySelectorAll('#demoDrawer button')].find(el => el.textContent.replace(/\s+/g, ' ').trim() === name);
  const press = async (name) => {
    const el = button(name);
    if (!el) throw new Error(`No drawer button “${name}”. Buttons: ${[...w.document.querySelectorAll('#demoDrawer button')].map(b => b.textContent).join(' | ')}`);
    el.click();
    await settle();
  };
  const switches = () => [...w.document.querySelectorAll('#demoDrawer [role=switch]')].map(el => [el.textContent.trim(), el.getAttribute('aria-checked')]);
  const groups = () => [...w.document.querySelectorAll('#demoDrawer h4')].map(el => el.textContent);
  const screen = () => [...w.document.querySelectorAll('.screen')].find(el => !el.hidden)?.id.replace('screen-', '');
  const errors = () => ($('#errorBox')?.hidden ? '' : $('#errorList')?.textContent || '');
  const demoState = () => JSON.parse(w.sessionStorage.getItem(DEMO_KEY) || 'null');
  return { ...page, ...extra, $, drawer, settle, button, press, switches, groups, screen, errors, demoState };
}

test('the tools are off until the footer button turns them on, and stay on in the tab', async t => {
  const a = await bwl(t);
  assert.equal(a.drawer(), null);
  assert.equal(a.$('#demoBanner'), null);
  assert.equal(a.$('#demoToolsToggle').getAttribute('aria-pressed'), 'false');
  a.$('#demoToolsToggle').click();
  await a.settle();
  assert.ok(a.drawer(), 'the drawer opens');
  assert.equal(a.drawer().getAttribute('aria-label'), 'Demo tools');
  assert.equal(a.$('#demoToolsToggle').getAttribute('aria-pressed'), 'true');
  assert.equal(a.demoState().tools, true);
  const b = await bwl(t, { storage: dumpStorage(a.w) });
  assert.ok(b.drawer(), 'still on after a new page load');
  b.$('#demoToolsToggle').click();
  await b.settle();
  assert.equal(b.drawer(), null);
  assert.equal(b.demoState().tools, false);
  // Close keeps the tools on but folds the drawer to its tab.
  const c = await bwl(t, { storage: tools() });
  await c.press('Close demo tools');
  assert.equal(c.$('#demoDrawerBody').hidden, true);
  assert.equal(c.$('.demo-drawer-tab').hidden, false);
  c.$('.demo-drawer-tab').click();
  await c.settle();
  assert.equal(c.$('#demoDrawerBody').hidden, false);
});

test('the drawer offers only what applies to the screen on view', async t => {
  const a = await bwl(t, { storage: tools() });
  assert.deepEqual(a.switches(), [[BREAKS.catalog.label, 'false']], 'the start page can only lose its catalog');
  assert.match(a.drawer().textContent, /Nothing to fill on this screen/);
  await a.press('Your details');
  assert.equal(a.screen(), 'details');
  assert.deepEqual(a.switches(), [], 'nothing to break while entering details');
  assert.deepEqual(a.groups(), ['All fields', 'First name', 'Middle name', 'Last name', 'Street address', 'Apartment, suite or unit', 'City', 'State', 'ZIP code', 'Email', 'Confirm email']);
  await a.press('Check and pay: paid permit');
  assert.equal(a.screen(), 'review');
  assert.deepEqual(a.switches().map(([label]) => label), [BREAKS.pdf.label, BREAKS.storage.label, BREAKS.payureDown.label, BREAKS.wrongAmount.label, BREAKS.lostCheckout.label]);
  await a.press('Check and pay: free permit');
  assert.deepEqual(a.switches().map(([label]) => label), [BREAKS.pdf.label], 'a free permit never goes to Pay.ure');
  assert.deepEqual(a.groups(), ['Agreement']);
  // A switch that is on is always listed, so it can be turned off anywhere.
  const b = await bwl(t, { storage: tools({ pdf: true }) });
  assert.deepEqual(b.switches(), [[BREAKS.catalog.label, 'false'], [BREAKS.pdf.label, 'true']]);
});

test('fills type like a visitor, so each field shows its own message', async t => {
  const a = await bwl(t, { storage: tools() });
  await a.press('Your details');
  await a.press('First name: Emoji (can’t print) (shows an error)');
  assert.equal(a.$('#FirstName').value, 'Test 🌲');
  assert.equal(a.$('#FirstName-error').textContent, 'First name can’t include “🌲” because the permit can’t print it. Remove it or type it another way.');
  await a.press('ZIP code: Too short (shows an error)');
  assert.equal(a.$('#Zip-error').textContent, 'Enter a ZIP code like 99501 or 99501-1234.');
  await a.press('Email: Valid');
  await a.press('Confirm email: Different (shows an error)');
  assert.equal(a.$('#ConfirmEmail-error').textContent, 'The email addresses must match.');
  await a.press('All fields: All empty, then Continue (shows an error)');
  assert.equal(a.screen(), 'details');
  assert.match(a.errors(), /^Enter your first name\.Enter your last name\./);
  await a.press('All fields: All valid');
  a.$('#screen-details button[type=submit]').click();
  await a.settle();
  assert.equal(a.screen(), 'review');
  // Choice screens have fills too, including the errors only Continue shows.
  await a.press('Choose a permit');
  await a.press('Permit: Subsistence (needs certification)');
  assert.ok(a.groups().includes('Eligibility'));
  await a.press('Eligibility: Don’t certify, then Continue (shows an error)');
  assert.equal(a.errors(), 'Confirm that you qualify for this subsistence permit.');
  await a.press('How many: Zero (shows an error)');
  assert.equal(a.$('#qty').getAttribute('aria-invalid'), 'true');
});

test('Go to answers every earlier step and stops on the chosen screen', async t => {
  const a = await bwl(t, { storage: tools() });
  await a.press('Check and pay: subsistence permit');
  assert.equal(a.screen(), 'review');
  assert.match(a.$('#reviewSummary').textContent, /You certified that you qualify/);
  await a.press('Finished free permit');
  for (let n = 0; n < 200 && a.screen() !== 'done'; n++) await sleep(10);
  assert.equal(a.screen(), 'done');
  assert.equal(a.$('#doneTitle').textContent, 'Your permit is ready');
  await a.press('Start page');
  assert.equal(a.screen(), 'start');
});

test('a switch breaks its part until switched off, with a banner on every page meanwhile', async t => {
  const a = await bwl(t, { storage: tools() });
  await a.press('Check and pay: free permit');
  a.$('#demoBreak-pdf').click();
  await a.settle();
  assert.equal(a.$('#demoBreak-pdf').getAttribute('aria-checked'), 'true');
  assert.equal(a.$('#demoBanner').textContent, `Broken on purpose: ${BREAKS.pdf.label}. Fix all`);
  a.$('#agree').click();
  a.$('#confirmPay').click();
  for (let n = 0; n < 100 && a.errors() === ''; n++) await sleep(10);
  assert.equal(a.errors(), 'We couldn’t create your permit because part of this page didn’t download. Check your internet connection, then try again. Your entries are still here.');
  // The banner stays when the tools are turned off, and on the next page.
  a.$('#demoToolsToggle').click();
  await a.settle();
  assert.equal(a.drawer(), null);
  const b = await bwl(t, { storage: dumpStorage(a.w) });
  assert.ok(b.$('#demoBanner'));
  b.$('#demoBanner button').click();
  await b.settle();
  assert.equal(b.$('#demoBanner'), null, 'Fix all clears the switches');
  assert.deepEqual(b.demoState().breaks, {});
  assert.equal(b.navigations.length, 0, 'no reload needed for the PDF switch');
});

test('the catalog switch reloads to apply and fails the chosen way', async t => {
  const a = await bwl(t, { storage: tools() });
  a.$('#demoBreak-catalog').click();
  assert.deepEqual(a.navigations.at(-1), { url: 'http://localhost/#start', replace: false, reload: true });
  assert.equal(a.demoState().breaks.catalog, 'server');
  for (const mode of ['server', 'data']) {
    const b = await bwl(t, { storage: tools({ catalog: mode }) });
    assert.equal(b.errors(), `${LOAD_ERROR} Try again`, mode);
    assert.equal(b.$('#demoBreakMode-catalog').value, mode);
  }
  const c = await bwl(t, { storage: tools({ catalog: 'data' }) });
  c.$('#demoBreakMode-catalog').value = 'timeout';
  c.$('#demoBreakMode-catalog').dispatchEvent(new c.w.Event('change', { bubbles: true }));
  assert.equal(c.demoState().breaks.catalog, 'timeout');
  assert.equal(c.navigations.at(-1).reload, true);
  c.$('#demoBanner button').click();
  assert.equal(c.navigations.at(-1).reload, true, 'fixing a load-time switch reloads too');
});

test('the payment switches break storage, Pay.ure and the return, whatever the card', async t => {
  const blocked = await bwl(t, { storage: tools({ storage: true }) });
  await blocked.press('Check and pay: paid permit');
  blocked.$('#agree').click(); blocked.$('#confirmPay').click();
  assert.match(blocked.errors(), /^We couldn’t take you to Pay\.ure because your browser is blocking this site from saving data\./);

  // Pay.ure down and the wrong amount, with the card that normally approves.
  for (const [name, check] of [
    ['payureDown', p => assert.equal(p.view(), 'unavailable')],
    ['wrongAmount', p => assert.equal(Object.values(JSON.parse(p.w.sessionStorage.getItem('payure-demo-collections')))[0].result.amount, 1)]
  ]) {
    const a = await bwl(t, { storage: tools({ [name]: true }) });
    await a.press('Check and pay: paid permit');
    a.$('#agree').click(); a.$('#confirmPay').click();
    const p = await openPayure(t, a.navigations.at(-1).url, { storage: dumpStorage(a.w), demo: true });
    p.enterCard(); p.cont();
    p.$('#authorize').click(); p.$('#payButton').click();
    for (let n = 0; n < 100 && p.view() === 'review'; n++) await sleep(5);
    check(p);
  }

  // The checkout lost on the return: the permit service can't find what was paid for.
  const a = await bwl(t, { storage: tools({ lostCheckout: true }) });
  await a.press('Check and pay: paid permit');
  a.$('#agree').click(); a.$('#confirmPay').click();
  const p = await openPayure(t, a.navigations.at(-1).url, { storage: dumpStorage(a.w) });
  p.enterCard(); p.cont();
  const back = await p.pay();
  const returned = await bwl(t, { url: back.url, storage: dumpStorage(p.w) });
  assert.match(returned.errors(), /^We couldn’t find the permit you were paying for/);
});

test('on Pay.ure, test numbers and fills appear only for the method chosen, on step 1', async t => {
  const a = await bwl(t, { storage: tools() });
  await a.press('Check and pay: paid permit');
  a.$('#agree').click(); a.$('#confirmPay').click();
  const p = await openPayure(t, a.navigations.at(-1).url, { storage: dumpStorage(a.w), demo: true });
  const ph = helpers(p);
  await ph.settle();
  assert.equal(p.$('#testPanel').hidden, true, 'participants see numbers once they choose how to pay');
  assert.deepEqual(ph.groups(), ['Everything valid', 'How do you want to pay?']);
  assert.deepEqual(ph.switches().map(([label]) => label), [BREAKS.payureDown.label, BREAKS.wrongAmount.label, BREAKS.lostCheckout.label]);
  p.$('#method_card').click();
  await ph.settle();
  assert.equal(p.$('#testPanel').hidden, false);
  assert.equal(p.$('#testCardsSection').hidden, false);
  assert.equal(p.$('#testAccountsSection').hidden, true);
  assert.deepEqual(ph.groups(), ['Everything valid', 'How do you want to pay?', 'Name on card', 'Card number', 'Expiry date', 'Security code']);
  await ph.press('Expiry date: Expired (shows an error)');
  assert.equal(p.$('#cardExpiry-error').textContent, 'This card has expired. Enter a future expiry date.');
  await ph.press('Card number: Visa · Declined');
  assert.equal(p.$('#cardNumber').value, '4000 0000 0000 0002');
  p.$('#method_bank').click();
  await ph.settle();
  assert.equal(p.$('#testCardsSection').hidden, true);
  assert.equal(p.$('#testAccountsSection').hidden, false);
  assert.deepEqual(ph.groups(), ['Everything valid', 'How do you want to pay?', 'Account type', 'Routing number', 'Account number', 'Confirm account number']);
  await ph.press('Routing number: One wrong digit (shows an error)');
  assert.equal(p.$('#routingNumber-error').textContent, 'Check the routing number. One of the digits is wrong.');
  await ph.press('Step 2 with a card that approves');
  assert.equal(p.view(), 'review');
  assert.equal(p.$('#testPanel').hidden, true, 'step 2 needs no numbers');
  assert.deepEqual(ph.groups(), ['Authorization']);
});

test('Reset demo state clears the tab and starts again, with the tools still on', async t => {
  const a = await bwl(t, { storage: tools({ pdf: true }) });
  await a.press('Check and pay: paid permit');
  a.$('#agree').click(); a.$('#confirmPay').click();
  assert.ok(a.w.sessionStorage.getItem('sfp-payment-handoff'));
  await a.press('Reset demo state');
  assert.deepEqual(a.navigations.at(-1), { url: 'http://localhost/', replace: false });
  for (const key of ['sfp-demo-state', 'sfp-payment-handoff', 'payure-demo-collections', 'sfp-paid-permits']) assert.equal(a.w.sessionStorage.getItem(key), null, key);
  assert.deepEqual(a.demoState(), { tools: true, open: true, breaks: {} });
});

test('the stored-data view shows what the tab holds', async t => {
  const a = await bwl(t, { storage: tools() });
  await a.press('Check and pay: paid permit');
  const shown = JSON.parse(a.$('#demoDrawer .demo-state').textContent);
  assert.equal(shown['sfp-demo-state'].model.officeId, 'AK-ANCH');
  assert.equal(shown[DEMO_KEY].tools, true);
});
