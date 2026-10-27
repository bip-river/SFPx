import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { SourceTextModule } from 'node:vm';
import { readPdf } from './pdf-text.mjs';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const catalog = JSON.parse(await readFile(new URL('products.json', root), 'utf8'));
const HOLDER = { FirstName: 'Test', LastName: 'Purchaser', AddressLine1: '123 Test Street', City: 'Test City', AddrState: 'UT', Zip: '84037', DeliveryEmail: 'test@example.com', ConfirmEmail: 'test@example.com' };

async function app(t, { data = structuredClone(catalog), saved, storageBlocked = false, loadFails = false, hash = '', markup = html } = {}) {
  const dom = new JSDOM(markup, { url: `http://localhost/${hash}`, runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window;
  let now = '2026-10-21T12:00:00';
  const NativeDate = w.Date;
  w.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new NativeDate(now).getTime(); }
  };
  const urls = new Map(), revoked = [];
  w.fetch = async () => { if (loadFails) throw new Error('test network failure'); return { ok: true, json: async () => data }; };
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.setImmediate = setImmediate;
  w.Blob = Blob;
  w.matchMedia = () => ({ matches: true });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.URL.createObjectURL = blob => { const url = `blob:test/${urls.size}`; urls.set(url, blob); return url; };
  w.URL.revokeObjectURL = url => revoked.push(url);
  w.console.error = () => {};
  w.console.warn = () => {};
  if (saved) w.sessionStorage.setItem('sfp-demo-state', typeof saved === 'string' ? saved : JSON.stringify(saved));
  if (storageBlocked) Object.defineProperty(w, 'sessionStorage', { get() { throw new Error('storage blocked'); } });
  const modules = new Map();
  async function loadModule(url) {
    if (!modules.has(url.href)) {
      const source = await readFile(url, 'utf8');
      modules.set(url.href, new SourceTextModule(source, {
        context: dom.getInternalVMContext(), identifier: url.href,
        importModuleDynamically: async (specifier, referencing) => {
          const dependency = await loadModule(new URL(specifier, referencing.identifier));
          if (dependency.status === 'unlinked') await dependency.link((name, parent) => loadModule(new URL(name, parent.identifier)));
          if (dependency.status === 'linked') await dependency.evaluate();
          return dependency;
        }
      }));
    }
    return modules.get(url.href);
  }
  const entry = await loadModule(new URL('app.js', root));
  await entry.link((specifier, referencing) => loadModule(new URL(specifier, referencing.identifier)));
  await entry.evaluate();
  await entry.namespace.ready;
  const $ = selector => w.document.querySelector(selector);
  const input = (selector, value) => { const el = $(selector); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const change = (selector, value) => { const el = $(selector); if (value !== undefined) el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const check = selector => { const el = $(selector); if (!el.checked) el.click(); };
  const screen = () => [...w.document.querySelectorAll('.screen')].filter(el => !el.hidden).map(el => el.id.replace('screen-', '')).join(',');
  const cont = () => $(`#screen-${screen()} button[type=submit]`).click();
  const start = () => $('#startButton').click();
  // Stops on the permit screen with a permit selected; its quantity starts at the minimum.
  const pickPermit = (type = 'fuelwood', index = 0) => {
    start(); $(`#ptype_${type}`).click(); cont();
    change('#state', 'AK'); $('input[name=office][value="AK-ANCH"]').click(); cont();
    $(`#prod_${index}`).click();
  };
  const choose = (type, index) => { pickPermit(type, index); cont(); assert.equal(screen(), 'details'); };
  const holder = (values = {}) => {
    for (const [id, value] of Object.entries({ ...HOLDER, ...values })) { input(`#${id}`, value); change(`#${id}`); }
    cont();
  };
  const agree = () => {
    assert.equal(screen(), 'review', 'checkout ready');
    if (!$('#eligibilityAgreement').hidden) check('#ackEligibility');
    check('#agree');
  };
  const payload = () => JSON.parse($('#handoff .payload-content').textContent);
  const generate = async () => {
    $('#confirmPaygov').click();
    for (let attempt = 0; attempt < 500; attempt++) {
      if (screen() === 'done') return;
      if (!$('#errorBox').hidden) throw new Error($('#errorList').textContent);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Permit generation timed out');
  };
  // The browser's Back button: history traversal fires popstate asynchronously.
  const goBack = () => new Promise(resolve => { w.addEventListener('popstate', () => setTimeout(resolve, 0), { once: true }); w.history.back(); });
  return { w, $, input, change, check, screen, cont, start, pickPermit, choose, holder, agree, payload, generate, goBack, urls, revoked, setNow(value) { now = value; } };
}

const savedFor = (product, extra = {}) => ({ model: { state: 'AK', officeId: 'AK-ANCH', productType: 'fuelwood', productKey: product.id, qty: product.minQty, ...extra } });

test('a start page explains the service before the first question', async t => {
  const a = await app(t);
  assert.equal(a.screen(), 'start');
  assert.equal(a.w.document.title, 'Get a forest product permit | Bureau of Wandering Lands');
  assert.equal(a.$('#screenTop').hidden, true, 'the start page is not a numbered step');
  assert.notEqual(a.w.document.activeElement, a.$('#startTitle'), 'the first load leaves focus with the browser');
  assert.match(a.$('#screen-start').textContent, /mailing address/);
  assert.match(a.$('#screen-start .demo-note').textContent, /Nothing is charged, emailed or issued/);
  assert.equal(a.$('#startButton').getAttribute('href'), '#what');
  a.$('#startButton').click();
  assert.equal(a.screen(), 'what');
  assert.equal(a.w.document.activeElement, a.$('#whatTitle'));
  assert.match(a.w.document.title, /^What are you collecting\? – Step 1 of 5 – /);
  assert.equal(a.$('#stepCount').textContent, 'Step 1 of 5');
  assert.equal(a.$('#backLink').getAttribute('href'), '#start');
  a.$('#backLink').click();
  assert.equal(a.screen(), 'start', 'Back on the first question returns to the start page');
  const help = await app(t, { hash: '#need-help' });
  assert.equal(help.screen(), 'start', 'another fragment with nothing restored shows the start page');
});

test('one screen shows at a time; Continue, Back and the browser Back button move between them', async t => {
  const a = await app(t);
  a.start();
  a.$('#ptype_fuelwood').click(); a.cont();
  assert.equal(a.screen(), 'where');
  assert.equal(a.w.document.activeElement, a.$('#whereTitle'), 'focus moves to the new question');
  assert.match(a.w.document.title, /^Where will you collect\? – Step 2 of 5/);
  assert.equal(a.$('#stepCount').textContent, 'Step 2 of 5');
  assert.equal(a.$('#backLink').getAttribute('href'), '#what');
  a.$('#backLink').click();
  assert.equal(a.screen(), 'what');
  assert.equal(a.$('#ptype_fuelwood').checked, true, 'answers are kept when going back');
  await a.goBack();
  assert.equal(a.screen(), 'where', 'browser Back returns to the previous screen');
  a.w.dispatchEvent(new a.w.PopStateEvent('popstate', { state: { screen: 'review' } }));
  assert.equal(a.screen(), 'where', 'a later screen cannot be reached before its earlier answers');
  assert.equal(a.w.history.state.screen, 'where');
});

test('paid checkout validates holder data, preserves retry identity, and replaces it on edits', async t => {
  const a = await app(t); a.choose();
  a.cont();
  assert.equal(a.screen(), 'details', 'missing details keep the visitor on the details screen');
  a.holder(); a.agree();
  assert.equal(a.$('#reviewTitle').textContent, 'Check and pay');
  assert.equal(a.$('#confirmPaygov').textContent, 'Pay $10.00 on Pay.gov');
  await a.generate();
  const first = a.payload();
  assert.equal(first.total, 10);
  assert.equal(first.productId, catalog.AK.offices[0].products.fuelwood[0].id);
  assert.equal(first.permitHolder.middleName, undefined);
  assert.match(first.permitNumber, /^AK-ANCH-26-\d{6}$/);
  assert.equal(first.haulTags, 2, 'one tag for each half cord');
  assert.match(a.$('#permitCard').textContent, new RegExp(`Permit number ${first.permitNumber}`));
  assert.match(a.$('#packageHint').textContent, /^PDF, \d+ pages\.$/);
  await a.goBack(); assert.equal(a.screen(), 'review');
  await a.generate(); assert.equal(a.payload().idempotencyKey, first.idempotencyKey);
  assert.equal(a.payload().permitNumber, first.permitNumber, 'a retry keeps its permit number');
  await a.goBack();
  a.$('#reviewSummary a[href="#details"]').click(); assert.equal(a.screen(), 'details');
  a.input('#FirstName', 'Changed');
  assert.equal(a.$('#handoff').textContent, '');
  a.cont(); assert.equal(a.screen(), 'review', 'Continue returns to the check screen after a change');
  await a.generate(); assert.notEqual(a.payload().idempotencyKey, first.idempotencyKey);
  assert.notEqual(a.payload().permitNumber, first.permitNumber, 'a changed checkout gets a new permit number');
  assert.equal(a.payload().permitHolder.firstName, 'Changed');
  assert.match(a.$('#permitCard').textContent, /Issued to Changed Purchaser/);
  const stored = a.w.sessionStorage.getItem('sfp-demo-state');
  assert.ok(!stored.includes('Changed') && !stored.includes('test@example.com'));
});

test('no-fee checkout retries reuse identity and edits revoke stale PDFs', async t => {
  const a = await app(t); a.choose('fuelwood', 3); a.holder(); a.agree();
  assert.equal(a.$('#confirmPaygov').textContent, 'Get my free permit');
  await a.generate();
  const first = a.payload(), originalUrl = [...a.urls.keys()].at(-1);
  assert.equal(first.total, 0);
  assert.equal(a.$('#permitDownloadBtn').disabled, false);
  const pdfText = (await readPdf(a.urls.get(originalUrl))).text;
  assert.match(pdfText, /Printed name: Test Purchaser/);
  assert.match(pdfText, /123 Test Street, Test City, UT 84037/);
  assert.match(pdfText, new RegExp(first.permitNumber));
  assert.ok(pdfText.includes('Oct 21, 2026 until Nov 20, 2026 (30 days)'), 'PDF states the validity shown on screen');
  assert.doesNotMatch(pdfText, /HAUL TAG/, 'this listing does not use haul tags');
  assert.match(a.$('#permitCard').textContent, /Valid for 30 days, until Nov 20, 2026/);
  assert.match(a.$('#permitCard').textContent, /No haul tags needed for this permit/);
  await a.goBack(); await a.generate(); assert.equal(a.payload().idempotencyKey, first.idempotencyKey);
  await a.goBack();
  a.$('#reviewSummary a[href="#details"]').click();
  a.input('#FirstName', 'Changed');
  assert.equal(a.$('#permitDownloadBtn').disabled, true);
  assert.ok(a.revoked.includes([...a.urls.keys()].at(-1)));
  a.cont(); await a.generate();
  assert.notEqual(a.payload().idempotencyKey, first.idempotencyKey);
  assert.match((await readPdf([...a.urls.values()].at(-1))).text, /Printed name: Changed Purchaser/);
  await a.goBack(); a.$('#agree').click();
  assert.equal(a.$('#permitDownloadBtn').disabled, true);
  a.w.dispatchEvent(new a.w.PopStateEvent('popstate', { state: { screen: 'done' } }));
  assert.equal(a.screen(), 'review', 'the done screen needs a permit prepared for the current entries');
});

test('reset clears personal data, storage, payload, and transaction identity', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree(); await a.generate(); const first = a.payload().idempotencyKey;
  a.w.sessionStorage.setItem('sfp-demo-transaction-ref', 'old-reference');
  a.$('#startAnother').click();
  assert.equal(a.screen(), 'what');
  for (const field of a.w.document.querySelectorAll('#screen-details input, #screen-details select')) assert.equal(field.value, '');
  assert.equal(a.$('input[name=ptype]:checked'), null);
  assert.equal(a.w.sessionStorage.getItem('sfp-demo-state'), null);
  assert.equal(a.w.sessionStorage.getItem('sfp-demo-transaction-ref'), null);
  assert.equal(a.$('#handoff').textContent, '');
  a.choose(); a.holder(); a.agree(); await a.generate(); assert.notEqual(a.payload().idempotencyKey, first);
  await a.goBack(); a.$('#resetAll').click();
  assert.equal(a.screen(), 'what');
  assert.equal(a.$('#FirstName').value, '');
});

test('restoration matches active IDs after inactive products and catalog reorder', async t => {
  const data = structuredClone(catalog), products = data.AK.offices[0].products.fuelwood;
  const selected = products[1]; products[0].saleEndDate = '2026-10-20';
  const a = await app(t, { data, saved: savedFor(selected), hash: '#permit' });
  assert.equal(a.screen(), 'permit', 'a reload returns to the screen it was on');
  assert.equal(a.$('input[name=product]:checked').id, 'prod_0');
  assert.match(a.$('input[name=product]:checked').closest('.option').textContent, /Anchorage South/);
  assert.equal(a.$('#qty').value, '2');
  assert.equal(a.$('#qtyHint').textContent, '2 to 6 cords', 'restore shows the same quantity guidance as selection');
  const b = await app(t, { data, saved: savedFor(selected), hash: '#review' });
  assert.equal(b.screen(), 'details', 'personal data must be reentered');
  assert.equal(b.$('#FirstName').value, '');
  const c = await app(t, { data, saved: savedFor(selected), hash: '#need-help' });
  assert.equal(c.screen(), 'details', 'a reload on another fragment resumes at the furthest screen');
});

test('expired, removed, and index-only saved products cannot restore another selection', async t => {
  for (const mode of ['expired', 'removed', 'legacy']) {
    const data = structuredClone(catalog), products = data.AK.offices[0].products.fuelwood, saved = savedFor(products[0]);
    if (mode === 'expired') products[0].saleEndDate = '2026-10-20';
    if (mode === 'removed') products.shift();
    if (mode === 'legacy') { delete saved.model.productKey; saved.model.productIndex = 0; }
    const a = await app(t, { data, saved, hash: '#review' });
    assert.equal(a.screen(), 'permit', mode);
    assert.equal(a.$('input[name=product]:checked'), null, mode);
  }
});

test('changing an earlier answer clears what depends on it, and Change returns to the check screen', async t => {
  const a = await app(t); a.choose(); a.holder();
  assert.equal(a.screen(), 'review');
  a.$('#reviewSummary a[href="#where"]').click();
  assert.equal(a.screen(), 'where');
  a.$('input[name=office][value="AK-JUN"]').click(); a.cont();
  assert.equal(a.screen(), 'permit', 'a new area needs a new permit choice first');
  assert.equal(a.$('input[name=product]:checked'), null);
  a.w.dispatchEvent(new a.w.PopStateEvent('popstate', { state: { screen: 'review' } }));
  assert.equal(a.screen(), 'permit');
  a.$('#prod_0').click(); a.cont();
  assert.equal(a.screen(), 'review', 'details were kept, so Continue goes straight back to the check screen');
  assert.match(a.$('#reviewSummary').textContent, /Juneau Harbor Outpost/);
});

test('whole-tree quantities and min/max limits are enforced', async t => {
  const a = await app(t); a.pickPermit('christmas');
  for (const invalid of ['', '0', '1.5', '-1', '100']) {
    a.input('#qty', invalid); a.cont();
    assert.equal(a.screen(), 'permit', invalid);
    assert.equal(a.$('#qty').getAttribute('aria-invalid'), 'true', invalid);
    assert.equal(a.$('#errorList a').getAttribute('href'), '#qty', invalid);
  }
  a.input('#qty', a.$('#qty').max);
  assert.equal(a.$('#qty').hasAttribute('aria-invalid'), false, 'a shown error clears once fixed');
  a.cont(); assert.equal(a.screen(), 'details');
});

test('the quantity stepper stays within the permit limits and updates the total', async t => {
  const a = await app(t); a.pickPermit('fuelwood', 1);
  assert.equal(a.$('#qty').value, '2', 'quantity starts at the minimum');
  assert.equal(a.$('#qtyLabel').textContent, 'How many cords?');
  assert.equal(a.$('#qtyDec').getAttribute('aria-disabled'), 'true');
  a.$('#qtyDec').click(); assert.equal(a.$('#qty').value, '2');
  a.$('#qtyInc').click(); assert.equal(a.$('#qty').value, '3');
  assert.equal(a.$('#totalAmount').textContent, '$36.00');
  assert.equal(a.$('#totalLine').textContent.replace(/\s+/g, ' ').trim(), 'Total for 3 cords $36.00');
  for (let n = 0; n < 6; n++) a.$('#qtyInc').click();
  assert.equal(a.$('#qty').value, '6');
  assert.equal(a.$('#qtyInc').getAttribute('aria-disabled'), 'true');
  assert.equal(a.$('#qtyInc').disabled, false, 'the button keeps focus at the limit');
});

test('eligibility is driven by catalog rule even if display name changes', async t => {
  const data = structuredClone(catalog); data.AK.offices[0].products.fuelwood[2].name = 'Renamed no-fee permit';
  const a = await app(t, { data }); a.pickPermit('fuelwood', 2);
  assert.match(a.$('#prod_2_sub').textContent, /Only for eligible subsistence users/);
  a.cont(); a.holder();
  assert.equal(a.$('#eligibilityAgreement').hidden, false);
  a.check('#agree'); a.$('#confirmPaygov').click();
  assert.deepEqual([...a.w.document.querySelectorAll('#errorList a')].map(link => link.getAttribute('href')), ['#ackEligibility']);
  a.agree(); await a.generate(); assert.equal(a.payload().eligibility.certified, true);
});

test('checkout rechecks availability after date changes in an open tab', async t => {
  const data = structuredClone(catalog); data.AK.offices[0].products.fuelwood[0].saleEndDate = '2026-10-21';
  const a = await app(t, { data }); a.choose(); a.holder(); a.agree(); a.setNow('2026-10-22T12:00:00');
  a.$('#confirmPaygov').click();
  assert.equal(a.screen(), 'permit');
  assert.equal(a.$('#handoff').textContent, '');
  assert.match(a.$('#errorList').textContent, /no longer available/);
  assert.equal(a.$('input[name=product]:checked'), null);
});

test('malformed catalog fails closed with a visible error', async t => {
  for (const mutate of [p => { delete p.saleStartDate; }, p => { p.saleEndDate = '2026-02-30'; }, p => { p.price = '10'; }, p => { p.quantityStep = 0; }]) {
    const data = structuredClone(catalog); mutate(data.AK.offices[0].products.fuelwood[0]);
    const a = await app(t, { data }); assert.equal(a.$('#state').disabled, true);
    assert.equal(a.$('#errorBox').hidden, false);
    a.start(); a.$('#ptype_fuelwood').click(); a.cont();
    assert.equal(a.screen(), 'what');
    assert.match(a.$('#errorList').textContent, /could not load/);
  }
});

test('unsafe attachment URLs are blocked after browser URL normalization', async t => {
  const data = structuredClone(catalog);
  data.AK.attachments = [{ label: 'bad', url: 'java\nscript:alert(1)' }, { label: 'safe', url: '/map.pdf' }];
  const a = await app(t, { data }); a.pickPermit();
  assert.equal(a.$('#locationNotice a').getAttribute('href'), '#');
  assert.equal(a.$('#locationNotice a').protocol, 'http:');
  assert.ok([...a.w.document.querySelectorAll('#locationNotice a')].some(link => link.getAttribute('href') === '/map.pdf'));
});

test('malformed saved state, unavailable storage, and fetch failures are handled', async t => {
  const a = await app(t, { saved: '{broken' }); a.choose();
  const b = await app(t, { storageBlocked: true }); b.choose(); b.holder(); b.agree(); await b.generate(); assert.ok(b.payload().idempotencyKey);
  const c = await app(t, { loadFails: true }); assert.equal(c.$('#state').disabled, true); assert.match(c.$('#errorList').textContent, /could not load/);
});

test('Reset during asynchronous PDF generation cannot publish a stale permit', async t => {
  const a = await app(t); a.choose('fuelwood', 3); a.holder(); a.agree();
  a.$('#confirmPaygov').click();
  assert.equal(a.$('#confirmPaygov').getAttribute('aria-busy'), 'true');
  assert.equal(a.$('#confirmPaygov').disabled, false, 'the busy button keeps focus');
  a.$('#resetAll').click();
  for (let n = 0; n < 500 && a.$('#confirmPaygov').hasAttribute('aria-busy'); n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(a.$('#confirmPaygov').hasAttribute('aria-busy'), false);
  assert.equal(a.urls.size, 0);
  assert.equal(a.screen(), 'what');
  assert.equal(a.$('#permitDownloadBtn').disabled, true);
});

test('PDF failure keeps purchaser entries and allows a corrected retry', async t => {
  const a = await app(t); a.choose('fuelwood', 3); a.holder({ FirstName: '\u{10FFFF}' }); a.agree();
  await assert.rejects(a.generate(), /does not support/);
  assert.equal(a.screen(), 'review');
  assert.equal(a.$('#FirstName').value, '\u{10FFFF}');
  assert.equal(a.$('#confirmPaygov').hasAttribute('aria-disabled'), false);
  assert.equal(a.$('#permitDownloadBtn').disabled, true);
  a.$('#reviewSummary a[href="#details"]').click();
  a.input('#FirstName', 'José'); a.cont(); await a.generate();
  assert.match((await readPdf([...a.urls.values()].at(-1))).text, /Printed name: José Purchaser/);
});

test('address-state change alone updates checkout readiness', async t => {
  const a = await app(t); a.choose(); a.holder({ AddrState: '' });
  assert.equal(a.screen(), 'details');
  assert.match(a.$('#errorList').textContent, /Choose your state/);
  const select = a.$('#AddrState'); select.value = 'UT'; select.dispatchEvent(new a.w.Event('change', { bubbles: true }));
  assert.equal(select.hasAttribute('aria-invalid'), false);
  a.cont(); assert.equal(a.screen(), 'review');
});

test('delivery email edits refresh the confirm-email error in both directions', async t => {
  const a = await app(t); a.choose(); a.holder();
  a.$('#reviewSummary a[href="#details"]').click();
  a.input('#DeliveryEmail', 'other@example.com');
  assert.equal(a.$('#ConfirmEmail').hasAttribute('aria-invalid'), false, 'no mismatch error while the delivery email is being typed');
  a.change('#DeliveryEmail');
  assert.equal(a.$('#ConfirmEmail').getAttribute('aria-invalid'), 'true', 'mismatch is explained once the delivery email is left');
  assert.match(a.$('#ConfirmEmail-error').textContent, /must match/);
  a.input('#DeliveryEmail', 'test@example.com');
  assert.equal(a.$('#ConfirmEmail').hasAttribute('aria-invalid'), false, 'stale mismatch is cleared');
  assert.equal(a.$('#ConfirmEmail-error').textContent, '');
  a.cont(); assert.equal(a.screen(), 'review');
  const b = await app(t); b.choose(); b.input('#DeliveryEmail', 'test@example.com'); b.change('#DeliveryEmail');
  assert.equal(b.$('#ConfirmEmail').hasAttribute('aria-invalid'), false, 'an untouched confirm field is not flagged early');
});

test('field errors wait until the field is left, then clear as soon as the entry is fixed', async t => {
  const a = await app(t); a.choose();
  a.input('#DeliveryEmail', 't');
  assert.equal(a.$('#DeliveryEmail').hasAttribute('aria-invalid'), false, 'no error on the first keystroke');
  a.change('#DeliveryEmail');
  assert.equal(a.$('#DeliveryEmail').getAttribute('aria-invalid'), 'true', 'error once the field is left');
  assert.ok(a.$('#DeliveryEmail').getAttribute('aria-describedby').split(' ').includes('DeliveryEmail-error'));
  a.input('#DeliveryEmail', 'test@example');
  assert.equal(a.$('#DeliveryEmail').getAttribute('aria-invalid'), 'true', 'a shown error follows each keystroke');
  a.input('#DeliveryEmail', 'test@example.com');
  assert.equal(a.$('#DeliveryEmail').hasAttribute('aria-invalid'), false, 'error clears as soon as it is fixed');
  assert.equal(a.$('#DeliveryEmail').getAttribute('aria-describedby'), 'emailHint');
});

test('Continue explains what is missing with links to each field', async t => {
  const a = await app(t);
  const links = () => [...a.w.document.querySelectorAll('#errorList a')];
  a.start(); a.cont();
  assert.equal(a.w.document.activeElement, a.$('#errorBox'));
  assert.deepEqual(links().map(link => link.getAttribute('href')), ['#ptypeGroup']);
  assert.ok(a.$('#ptypeGroup').getAttribute('aria-describedby').includes('ptypeGroup-error'));
  links()[0].click();
  assert.equal(a.w.document.activeElement, a.$('#ptype_fuelwood'), 'a group link moves to its first option');
  a.choose(); a.input('#FirstName', 'Test'); a.cont();
  assert.deepEqual(links().map(link => link.getAttribute('href')), ['#LastName', '#AddressLine1', '#City', '#AddrState', '#Zip', '#DeliveryEmail', '#ConfirmEmail']);
  assert.equal(a.$('#LastName').getAttribute('aria-invalid'), 'true', 'inline errors are shown too');
  links().find(link => link.getAttribute('href') === '#LastName').click();
  assert.equal(a.w.document.activeElement, a.$('#LastName'));
  a.holder(); a.$('#confirmPaygov').click();
  assert.deepEqual(links().map(link => link.getAttribute('href')), ['#agree']);
  assert.equal(a.$('#handoff').textContent, '', 'nothing is submitted');
});

test('pressing Continue holds back blur-time errors so the button cannot move before the click lands', async t => {
  const a = await app(t); a.choose();
  for (const [id, value] of Object.entries(HOLDER)) a.input(`#${id}`, value);
  a.input('#DeliveryEmail', 'not-an-email');
  const continueButton = a.$('#screen-details button[type=submit]');
  continueButton.dispatchEvent(new a.w.Event('pointerdown', { bubbles: true }));
  a.change('#DeliveryEmail'); a.$('#DeliveryEmail').dispatchEvent(new a.w.Event('blur'));
  assert.equal(a.$('#DeliveryEmail').hasAttribute('aria-invalid'), false);
  continueButton.click();
  assert.equal(a.$('#DeliveryEmail').getAttribute('aria-invalid'), 'true', 'the click reports the error');
  a.$('#DeliveryEmail').dispatchEvent(new a.w.Event('blur'));
  assert.equal(a.$('#DeliveryEmail').getAttribute('aria-invalid'), 'true', 'later blurs validate normally');
});

test('checkout works without crypto.randomUUID and reports unexpected failures', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree();
  // Insecure origins such as http://192.168.x.x expose getRandomValues but not randomUUID.
  Object.defineProperty(a.w.crypto, 'randomUUID', { value: undefined, configurable: true });
  await a.generate();
  assert.match(a.payload().idempotencyKey, /^TX-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await a.goBack(); a.$('#reviewSummary a[href="#details"]').click(); a.input('#FirstName', 'Changed'); a.cont();
  Object.defineProperty(a.w.crypto, 'getRandomValues', { value: undefined, configurable: true });
  a.$('#confirmPaygov').click(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(a.$('#errorList').textContent, /could not prepare your permit/);
  assert.equal(a.$('#FirstName').value, 'Changed');
});

test('permit options are named briefly and described by price and limits', async t => {
  const a = await app(t); a.pickPermit();
  const description = el => (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map(id => a.w.document.getElementById(id)?.textContent || '').join(' ');
  assert.equal(a.$(`#${a.$('#prod_0').getAttribute('aria-labelledby')}`).textContent, 'Anchorage North');
  assert.equal(description(a.$('#prod_0')), '$10.00 per cord Up to 10 cords');
  assert.equal(a.$('#prod_3_name').textContent, 'Free Use', 'the redundant "(No fee)" is dropped next to the No fee price');
  assert.equal(a.$('#prod_0').value, catalog.AK.offices[0].products.fuelwood[0].id);
  assert.ok(a.$('#prod_0').closest('.option').contains(a.$('#qty')), 'quantity opens inside the chosen permit');
  assert.match(a.$('#qtyDocs summary').textContent, /Maps and rules for this permit \(Anchorage North\)/);
});

test('production-only email promises are labelled as such', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree(); await a.generate();
  const promise = /email your permit|email a copy|email the package|sent to your email/i;
  const leaves = [...a.w.document.body.querySelectorAll('*')].filter(el => promise.test(el.textContent) && ![...el.children].some(child => promise.test(child.textContent)));
  assert.ok(leaves.length >= 3);
  for (const el of leaves) assert.ok(el.querySelector('.production-label'), el.textContent.trim());
});

test('areas list only offices with a permit on sale or coming soon for the chosen type', async t => {
  const areaNames = a => [...a.w.document.querySelectorAll('#areaOptions .option-title')].map(title => title.textContent);
  const reach = (a, type) => { if (a.screen() === 'start') a.start(); a.$(`#ptype_${type}`).click(); a.cont(); a.change('#state', 'AK'); };
  const expireFuelwood = keep => { const data = structuredClone(catalog); for (const product of data.AK.offices[0].products.fuelwood) if (product.id !== keep) Object.assign(product, { saleStartDate: '2026-01-01', saleEndDate: '2026-10-20' }); return data; };
  const comingSoonOnly = await app(t, { data: expireFuelwood('ak-anch-fuelwood-05') }); reach(comingSoonOnly, 'fuelwood');
  assert.ok(areaNames(comingSoonOnly).includes('Anchorage Aurora Outpost'), 'an office with only a coming-soon permit is listed');
  assert.match(comingSoonOnly.$('#office_0_sub').textContent, /^1 opening soon$/);
  comingSoonOnly.$('#office_0').click(); comingSoonOnly.cont();
  assert.equal(comingSoonOnly.$('#noProducts').hidden, false);
  comingSoonOnly.cont();
  assert.match(comingSoonOnly.$('#errorList').textContent, /No firewood permits are on sale here/);
  const nothing = await app(t, { data: expireFuelwood() }); reach(nothing, 'fuelwood');
  assert.ok(!areaNames(nothing).includes('Anchorage Aurora Outpost'), 'an office with nothing to buy is not listed');
  nothing.$('#backLink').click(); reach(nothing, 'christmas');
  assert.ok(areaNames(nothing).includes('Anchorage Aurora Outpost'), 'the office is still listed for other collection types');
  const noMushrooms = structuredClone(catalog); for (const office of noMushrooms.AK.offices) delete office.products.mushrooms;
  const empty = await app(t, { data: noMushrooms }); reach(empty, 'mushrooms');
  assert.equal(empty.$('#areaGroup').hidden, true);
  assert.equal(empty.$('#noAreas').textContent, 'No areas in Alaska sell mushroom permits online right now. Choose another state, or contact a local BWL office.');
});

test('changing the collection type keeps the state, and the area when it offers the new type', async t => {
  const data = structuredClone(catalog); delete data.AK.offices[0].products.mushrooms;
  const a = await app(t, { data }); a.choose();
  for (let n = 0; n < 3; n++) a.$('#backLink').click();
  assert.equal(a.screen(), 'what');
  a.$('#ptype_christmas').click(); a.cont();
  assert.equal(a.$('#state').value, 'AK');
  assert.equal(a.$('input[name=office]:checked').value, 'AK-ANCH');
  a.cont();
  assert.match(a.$('#productList').textContent, /Chugach Access/);
  assert.equal(a.$('input[name=product]:checked'), null, 'the permit and quantity still reset');
  a.$('#backLink').click(); a.$('#backLink').click();
  a.$('#ptype_mushrooms').click(); a.cont();
  assert.equal(a.$('#state').value, 'AK');
  assert.equal(a.$('input[name=office]:checked'), null, 'an area without the new collection type is cleared');
  a.cont(); assert.match(a.$('#errorList').textContent, /Choose an area/);
});

test('paid products with an eligibility rule carry the certification in checkout data', async t => {
  const data = structuredClone(catalog); data.AK.offices[0].products.fuelwood[0].eligibilityRule = 'anilca-subsistence';
  const a = await app(t, { data }); a.choose(); a.holder(); a.agree(); await a.generate();
  assert.equal(a.payload().total, 10);
  assert.equal(a.payload().eligibility.certified, true);
  assert.match(a.payload().eligibility.basis, /ANILCA/);
});

test('haul tags follow the listing, office and state rules, one per half cord of firewood or per tree', async t => {
  const tagLine = a => [...a.w.document.querySelectorAll('#reviewSummary .summary-line')].map(line => line.textContent).find(text => /haul tag/i.test(text)) || '';
  const reach = async (data, type, office, index, quantity) => {
    const a = await app(t, { data });
    a.start(); a.$(`#ptype_${type}`).click(); a.cont();
    a.change('#state', office.slice(0, 2)); a.$(`input[name=office][value="${office}"]`).click(); a.cont();
    a.$(`#prod_${index}`).click(); if (quantity) a.input('#qty', String(quantity)); a.cont(); a.holder();
    assert.equal(a.screen(), 'review');
    return a;
  };
  const firewood = await reach(structuredClone(catalog), 'fuelwood', 'AK-ANCH', 0, 3);
  assert.equal(tagLine(firewood), 'Includes 6 haul tags, one for each half cord');
  firewood.agree(); await firewood.generate();
  const text = (await readPdf([...firewood.urls.values()].at(-1))).text;
  assert.match(text, /Tag 6 of 6/);
  assert.doesNotMatch(text, /Tag 7 of/);
  assert.equal(firewood.payload().haulTags, 6);
  assert.equal(tagLine(await reach(structuredClone(catalog), 'christmas', 'AK-ANCH', 0, 2)), 'Includes 2 haul tags, one for each tree');
  assert.equal(tagLine(await reach(structuredClone(catalog), 'fuelwood', 'AK-ANCH', 3)), 'No haul tags needed for this permit', 'a listing can opt out');
  assert.equal(tagLine(await reach(structuredClone(catalog), 'fuelwood', 'MT-MILES', 0)), 'No haul tags needed for this permit', 'Montana turns firewood tags off statewide');
  assert.match(tagLine(await reach(structuredClone(catalog), 'fuelwood', 'MT-BILL', 0)), /^Includes \d+ haul tags/, 'the Billings office turns them back on');
  assert.equal(tagLine(await reach(structuredClone(catalog), 'mushrooms', 'AK-ANCH', 0)), '', 'mushroom permits never mention tags');
  const stateOff = structuredClone(catalog); stateOff.AK.haulTags = { fuelwood: false };
  assert.equal(tagLine(await reach(stateOff, 'fuelwood', 'AK-ANCH', 0)), 'No haul tags needed for this permit', 'a state can opt out');
  stateOff.AK.offices[0].haulTags = { fuelwood: true };
  assert.match(tagLine(await reach(stateOff, 'fuelwood', 'AK-ANCH', 0)), /^Includes 2 haul tags/, 'an office rule overrides its state');
});

test('document links open the sample PDFs in a new tab', async t => {
  const a = await app(t); a.pickPermit();
  const links = [...a.w.document.querySelectorAll('#qtyDocs a')];
  assert.deepEqual(links.map(link => link.getAttribute('href')), ['documents/firewood-map.pdf', 'documents/firewood-stipulations.pdf', 'documents/firewood-measuring.pdf']);
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener');
    assert.match(link.textContent, /\(PDF\) \(opens in a new tab\)$/);
  }
  assert.ok([...a.w.document.querySelectorAll('#locationNotice a')].some(link => link.getAttribute('href') === 'documents/ak-anch-access-map.pdf'));
  assert.equal(a.$('#qtyValidity').textContent, 'Valid for 90 days, until Jan 19, 2027', 'durations vary by permit');
});

test('coming-soon products are listed separately and are not selectable', async t => {
  const a = await app(t); a.pickPermit();
  assert.equal(a.$('#comingSoonSection').hidden, false);
  assert.match(a.$('#comingSoonList').textContent, /Anchorage Late Season/);
  assert.match(a.$('#comingSoonList').textContent, /Opens Oct 28, 2026/);
  assert.equal(a.w.document.querySelectorAll('input[name=product]').length, 4);
});

test('static notices are not live regions, screens are named by their headings, and every label has a control', async t => {
  const a = await app(t); a.pickPermit();
  const doc = a.w.document;
  for (const selector of ['.demo-note', '.notice', '.rules', '.start-section']) for (const el of doc.querySelectorAll(selector)) assert.ok(!el.hasAttribute('role') && !el.hasAttribute('aria-live'), selector);
  for (const screen of doc.querySelectorAll('.screen')) {
    assert.equal(doc.getElementById(screen.getAttribute('aria-labelledby')), screen.querySelector('h1'), screen.id);
    assert.equal(screen.querySelector('h1').getAttribute('tabindex'), '-1', screen.id);
  }
  assert.equal(doc.querySelectorAll('.screen:not([hidden])').length, 1);
  for (const label of doc.querySelectorAll('label')) assert.ok(label.control, label.outerHTML.slice(0, 80));
  assert.equal(a.$('.agency-title').hasAttribute('aria-label'), false, 'no aria-label on a role-less element');
  assert.equal(doc.querySelector('.prototype-banner'), null, 'the red prototype banner is gone');
});

test('the fictional demo does not send visitors to real agency websites and asks not to be indexed', async t => {
  const a = await app(t); a.choose('fuelwood', 2); a.holder();
  const hosts = [...a.w.document.querySelectorAll('a[href]')].map(link => new URL(link.href).hostname);
  assert.deepEqual(hosts.filter(host => /(^|\.)(blm|doi|doioig|usa)\.gov$/.test(host)), []);
  assert.ok(hosts.includes('uscode.house.gov'), 'cited law stays linked');
  assert.equal(a.$('meta[name="robots"]')?.content, 'noindex');
  assert.equal(a.$('link[rel=stylesheet]').getAttribute('href'), 'styles.css', 'no third-party stylesheet or font');
});

test('the demo PDF generates for visitors whose locale writes dates outside the embedded font', async t => {
  const a = await app(t);
  // Simulate a browser whose default locale formats dates as 2026年11月20日.
  const nativeFormat = a.w.Date.prototype.toLocaleDateString;
  a.w.Date.prototype.toLocaleDateString = function (locale, options) { return nativeFormat.call(this, locale ?? 'ja-JP', options); };
  a.choose('fuelwood', 3); a.holder(); a.agree(); await a.generate();
  assert.match((await readPdf([...a.urls.values()].at(-1))).text, /until Nov 20, 2026/);
});

test('back-forward cache return clears browser-retained purchaser information', async t => {
  const a = await app(t); a.choose(); a.holder();
  assert.equal(a.screen(), 'review');
  a.w.dispatchEvent(new a.w.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(a.$('#FirstName').value, '');
  assert.equal(a.screen(), 'details');
});

test('form values a browser restores on reload are cleared', async t => {
  // Firefox restores checkbox and input state on reload, independently of sessionStorage.
  const markup = html.replace('id="agree"', 'id="agree" checked').replace('id="ackEligibility"', 'id="ackEligibility" checked').replace('id="FirstName"', 'id="FirstName" value="Kept"').replace('id="qty"', 'id="qty" value="9"');
  const a = await app(t, { markup });
  for (const id of ['agree', 'ackEligibility']) assert.equal(a.$(`#${id}`).checked, false, id);
  assert.equal(a.$('#FirstName').value, '');
  assert.equal(a.$('#qty').value, '');
  a.choose(); a.holder(); a.check('#agree'); await a.generate();
  assert.equal(a.payload().total, 10);
});

test('holder blur and unchanged change events preserve the prepared permit and button text nodes', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree(); await a.generate();
  const reference = a.payload().idempotencyKey;
  await a.goBack();
  const labelNode = a.$('#confirmPaygov').firstChild;
  a.$('#FirstName').dispatchEvent(new a.w.Event('blur'));
  a.$('#FirstName').dispatchEvent(new a.w.Event('change'));
  a.$('#agree').dispatchEvent(new a.w.Event('blur'));
  a.w.dispatchEvent(new a.w.PopStateEvent('popstate', { state: { screen: 'done' } }));
  assert.equal(a.screen(), 'done', 'the permit is still valid for the current entries');
  assert.equal(a.payload().idempotencyKey, reference);
  a.w.dispatchEvent(new a.w.PopStateEvent('popstate', { state: { screen: 'review' } }));
  assert.equal(a.$('#confirmPaygov').firstChild, labelNode);
  a.input('#qty', '2');
  assert.equal(a.$('#permitDownloadBtn').disabled, true, 'a quantity edit discards the prepared permit');
});
