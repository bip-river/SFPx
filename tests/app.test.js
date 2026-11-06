import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readPdf } from './pdf-text.mjs';
import { root, loadPage, dumpStorage, openPayure, sleep } from './dom.mjs';

const html = await readFile(new URL('index.html', root), 'utf8');
const catalog = JSON.parse(await readFile(new URL('products.json', root), 'utf8'));
const HOLDER = { FirstName: 'Test', LastName: 'Purchaser', AddressLine1: '123 Test Street', City: 'Test City', AddrState: 'UT', Zip: '84037', DeliveryEmail: 'test@example.com', ConfirmEmail: 'test@example.com' };

// `fetch` replaces the catalog request (setFetch swaps it mid-test); `blocked` lists dynamically imported modules that
// fail to download, like a dropped connection; `fastTimeout` makes the catalog timeout fire at once.
// Paying opens Pay.ure and then the BWL page again, as new page loads in the same tab; `a.w` and the helpers always
// refer to the page the visitor is on now.
async function app(t, { data = structuredClone(catalog), saved, storageBlocked = false, loadFails = false, hash = '', markup = html, fetch, waitReady = true, fastTimeout = false } = {}) {
  let now = '2026-10-21T12:00:00';
  const urls = new Map(), revoked = [];
  let fetchCatalog = fetch || (async () => { if (loadFails) throw new Error('test network failure'); return { ok: true, json: async () => data }; });
  const blocked = new Set();
  let page;
  async function open(url, storage, first = false) {
    page = await loadPage(t, {
      url, markup, storage, blocked, now: () => now,
      setup: (w) => {
        w.fetch = (...args) => fetchCatalog(...args);
        if (fastTimeout) { const native = w.setTimeout; w.setTimeout = (fn, ms, ...rest) => native(fn, ms === 15000 ? 1 : ms, ...rest); }
        w.URL.createObjectURL = blob => { const url = `blob:test/${urls.size}`; urls.set(url, blob); return url; };
        w.URL.revokeObjectURL = url => revoked.push(url);
        if (first && saved) w.sessionStorage.setItem('sfp-demo-state', typeof saved === 'string' ? saved : JSON.stringify(saved));
        if (first && storageBlocked) Object.defineProperty(w, 'sessionStorage', { get() { throw new Error('storage blocked'); } });
      }
    });
    if (waitReady || !first) await page.ready;
  }
  await open(`http://localhost/${hash}`, {}, true);

  const $ = selector => page.w.document.querySelector(selector);
  const input = (selector, value) => { const el = $(selector); el.value = value; el.dispatchEvent(new page.w.Event('input', { bubbles: true })); };
  const change = (selector, value) => { const el = $(selector); if (value !== undefined) el.value = value; el.dispatchEvent(new page.w.Event('change', { bubbles: true })); };
  const check = selector => { const el = $(selector); if (!el.checked) el.click(); };
  const screen = () => [...page.w.document.querySelectorAll('.screen')].filter(el => !el.hidden).map(el => el.id.replace('screen-', '')).join(',');
  const cont = () => $(`#screen-${screen()} button[type=submit]`).click();
  const start = () => $('#startButton').click();
  // Stops on the permit screen with a permit selected; its quantity starts at the minimum.
  const pickPermit = (type = 'fuelwood', index = 0) => {
    start(); $(`#ptype_${type}`).click(); cont();
    change('#state', 'AK'); $('input[name=office][value="AK-ANCH"]').click(); cont();
    $(`#prod_${index}`).click();
  };
  const choose = (type, index) => {
    pickPermit(type, index);
    if (!$('#eligibilityAgreement').hidden) check('#ackEligibility');
    cont(); assert.equal(screen(), 'details');
  };
  const holder = (values = {}) => {
    for (const [id, value] of Object.entries({ ...HOLDER, ...values })) { input(`#${id}`, value); change(`#${id}`); }
    cont();
  };
  const agree = () => {
    assert.equal(screen(), 'review', 'checkout ready');
    check('#agree');
  };
  const payload = () => JSON.parse($('#handoff .payload-content').textContent);
  // The page the visitor went to last, such as Pay.ure after Pay.
  const leftFor = () => page.navigations.at(-1)?.url;
  // Opens Pay.ure where the BWL page sent the visitor; `act` pays or cancels there. Then the BWL page opens again
  // at the address Pay.ure returned to.
  const visitPayure = async (act = p => { p.enterCard(); p.cont(); return p.pay(); }) => {
    assert.match(leftFor(), /^http:\/\/localhost\/pay-ure\/\?token=[0-9a-f-]+$/);
    const payure = await openPayure(t, leftFor(), { storage: dumpStorage(page.w), now: () => now });
    const back = await act(payure);
    assert.equal(back.replace, true, 'returning replaces the Pay.ure step in the history');
    await open(back.url, dumpStorage(payure.w));
    return payure;
  };
  // Presses Pay (or Get my permit), pays on Pay.ure with a test card when sent there, then waits for the permit.
  const generate = async () => {
    const from = page, before = page.navigations.length;
    $('#confirmPay').click();
    for (let attempt = 0; attempt < 500; attempt++) {
      if (page === from && from.navigations.length > before) await visitPayure();
      if (screen() === 'done') return;
      if (!$('#errorBox').hidden) throw new Error($('#errorList').textContent);
      await sleep(10);
    }
    throw new Error('Permit generation timed out');
  };
  // Opens the BWL page again at `url` in the same tab, as a link, the address bar or a Back button would.
  const revisit = async (url) => { await open(url, dumpStorage(page.w)); };
  // After a return from Pay.ure the permit replaces the check screen's history entry, so Back leaves for Pay.ure.
  // A visitor still reaches the check screen again in that page, for example when the permit failed and was
  // retried, so tests that need it there move within the page.
  const toReview = () => { page.w.dispatchEvent(new page.w.PopStateEvent('popstate', { state: { screen: 'review' } })); assert.equal(screen(), 'review'); };
  // The browser's Back button: history traversal fires popstate asynchronously.
  const goBack = () => new Promise(resolve => { page.w.addEventListener('popstate', () => setTimeout(resolve, 0), { once: true }); page.w.history.back(); });
  const errors = () => ($('#errorBox').hidden ? '' : $('#errorList').textContent);
  return {
    get w() { return page.w; }, get ready() { return page.ready; }, get navigations() { return page.navigations; },
    $, input, change, check, screen, cont, start, pickPermit, choose, holder, agree, payload, generate, visitPayure, leftFor, revisit, toReview, goBack, urls, revoked, blocked, errors,
    setNow(value) { now = value; }, setFetch(fn) { fetchCatalog = fn; }
  };
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
  assert.equal(a.$('#confirmPay').textContent, 'Pay $10.00 on Pay.ure');
  await a.generate();
  const first = a.payload();
  assert.equal(first.total, 10);
  assert.equal(first.productId, catalog.AK.offices[0].products.fuelwood[0].id);
  assert.equal(first.permitHolder.middleName, '', 'the middle name is optional');
  assert.match(first.permitNumber, /^AK-ANCH-26-\d{6}$/);
  assert.equal(first.haulTags, 2, 'one tag for each half cord');
  assert.match(a.$('#permitCard').textContent, new RegExp(`Permit number ${first.permitNumber}`));
  assert.match(a.$('#packageHint').textContent, /^PDF, \d+ pages\.$/);
  a.toReview();
  await a.generate(); assert.equal(a.payload().idempotencyKey, first.idempotencyKey);
  assert.equal(a.payload().permitNumber, first.permitNumber, 'a retry keeps its permit number');
  a.toReview();
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
  assert.equal(a.$('#confirmPay').textContent, 'Get my free permit');
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
  a.toReview(); a.$('#resetAll').click();
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

test('eligibility is driven by catalog rule even if display name changes, and is certified with the permit', async t => {
  const data = structuredClone(catalog); data.AK.offices[0].products.fuelwood[2].name = 'Renamed no-fee permit';
  const a = await app(t, { data }); a.pickPermit('fuelwood', 2);
  assert.match(a.$('#prod_2_sub').textContent, /Only for eligible subsistence users/);
  assert.equal(a.$('#eligibilityAgreement').hidden, false, 'the certification opens inside the chosen permit');
  assert.ok(a.$('#qtyPanel').contains(a.$('#ackEligibility')));
  a.cont();
  assert.equal(a.screen(), 'permit', 'someone who has not certified stops before entering details');
  assert.deepEqual([...a.w.document.querySelectorAll('#errorList a')].map(link => link.getAttribute('href')), ['#ackEligibility']);
  a.check('#ackEligibility'); a.cont(); a.holder();
  assert.match(a.$('#reviewSummary').textContent, /You certified that you qualify for subsistence uses under ANILCA/);
  assert.equal(a.$('#screen-review #ackEligibility'), null, 'the check screen has only the terms agreement');
  a.agree(); await a.generate(); assert.equal(a.payload().eligibility.certified, true);
  await a.goBack(); a.$('#reviewSummary a[href="#permit"]').click();
  assert.equal(a.$('#ackEligibility').checked, true, 'the certification stays with an unchanged permit');
  a.$('#prod_3').click();
  assert.equal(a.$('#eligibilityAgreement').hidden, true);
  a.$('#prod_2').click();
  assert.equal(a.$('#ackEligibility').checked, false, 'choosing the permit again asks for the certification again');
});

test('details collect an optional middle name and show the Privacy Act notice without a checkbox', async t => {
  const a = await app(t); 
  assert.match(a.$('#screen-start').textContent, /debit or credit card, or a checking or savings account/, 'Pay.ure also takes bank accounts');
  a.choose();
  const notice = a.$('#screen-details #privacyNotice');
  assert.ok(notice, 'the notice is on the screen that collects the information');
  assert.match(notice.textContent, /Authority:.*Principal purpose:.*Routine uses:.*Effect of not providing information:/s);
  assert.equal(notice.querySelector('input'), null, 'reading the notice needs no checkbox');
  assert.equal(a.$('#screen-review').textContent.includes('Privacy Act'), false);
  assert.equal(a.$('#MiddleName').required, false);
  assert.equal(a.$('#MiddleName').autocomplete, 'additional-name');
  a.holder({ MiddleName: 'Quinn' });
  assert.match(a.$('#reviewSummary').textContent, /Test Quinn Purchaser/);
  assert.equal(a.$('label[for=agree]').textContent, 'I agree to the permit terms and certify that I’m not a minor under Alaska law.', 'the age certification is visible, not only in the collapsed terms');
  assert.match(a.$('#termsDetail').textContent, /not a minor under the laws of the state/);
  a.$('#confirmPay').click();
  assert.equal(a.$('#errorList').textContent, 'Agree to the permit terms and certify that you’re not a minor.');
  a.agree(); await a.generate();
  assert.equal(a.payload().permitHolder.middleName, 'Quinn');
  assert.match(a.$('#permitCard').textContent, /Issued to Test Quinn Purchaser/);
});

test('checkout rechecks availability after date changes in an open tab', async t => {
  const data = structuredClone(catalog); data.AK.offices[0].products.fuelwood[0].saleEndDate = '2026-10-21';
  const a = await app(t, { data }); a.choose(); a.holder(); a.agree(); a.setNow('2026-10-22T12:00:00');
  a.$('#confirmPay').click();
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
    assert.match(a.$('#errorList').textContent, /couldn’t load the permits available online/);
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
  const b = await app(t, { storageBlocked: true }); b.choose('fuelwood', 3); b.holder(); b.agree(); await b.generate(); assert.ok(b.payload().idempotencyKey, 'a free permit needs no storage');
  // Paying leaves the page, and the checkout can only wait for the return in storage.
  const d = await app(t, { storageBlocked: true }); d.choose(); d.holder(); d.agree();
  await assert.rejects(d.generate(), /blocking this site from saving data/);
  assert.equal(d.errors(), 'We couldn’t take you to Pay.ure because your browser is blocking this site from saving data. Allow cookies and site data for this site, then try again. Your entries are still here.');
  assert.equal(d.navigations.length, 0, 'the visitor stays here');
  const c = await app(t, { loadFails: true }); assert.equal(c.$('#state').disabled, true); assert.match(c.errors(), /couldn’t load the permits available online/);
});

test('Reset during asynchronous PDF generation cannot publish a stale permit', async t => {
  const a = await app(t); a.choose('fuelwood', 3); a.holder(); a.agree();
  a.$('#confirmPay').click();
  assert.equal(a.$('#confirmPay').getAttribute('aria-busy'), 'true');
  assert.equal(a.$('#confirmPay').disabled, false, 'the busy button keeps focus');
  a.$('#resetAll').click();
  for (let n = 0; n < 500 && a.$('#confirmPay').hasAttribute('aria-busy'); n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(a.$('#confirmPay').hasAttribute('aria-busy'), false);
  assert.equal(a.urls.size, 0);
  assert.equal(a.screen(), 'what');
  assert.equal(a.$('#permitDownloadBtn').disabled, true);
});

const ENGINE_ERROR = 'We couldn’t create your permit because part of this page didn’t download. Check your internet connection, then try again. Your entries are still here.';

test('a PDF engine that fails to download is explained plainly, keeps entries and works on retry', async t => {
  const a = await app(t); a.choose('fuelwood', 3); a.holder(); a.agree();
  a.blocked.add('vendor/pdfmake.js');
  await assert.rejects(a.generate(), /part of this page didn’t download/);
  assert.equal(a.errors(), ENGINE_ERROR, 'no file paths or browser error text reach the visitor');
  assert.equal(a.w.document.activeElement, a.$('#errorBox'));
  assert.equal(a.screen(), 'review');
  assert.equal(a.$('#FirstName').value, 'Test');
  assert.equal(a.$('#agree').checked, true);
  assert.equal(a.$('#confirmPay').hasAttribute('aria-disabled'), false);
  assert.equal(a.$('#permitDownloadBtn').disabled, true);
  a.blocked.clear();
  await a.generate();
  assert.match((await readPdf([...a.urls.values()].at(-1))).text, /Printed name: Test Purchaser/);
  const b = await app(t); b.choose(); b.holder(); b.agree();
  b.blocked.add('vendor/permit-font.js');
  await assert.rejects(b.generate(), /part of this page didn’t download/);
});

test('characters the permit cannot print are caught at the field, before checkout', async t => {
  const a = await app(t); a.choose();
  a.input('#FirstName', 'Test 🌲');
  assert.equal(a.$('#FirstName').hasAttribute('aria-invalid'), false, 'not while typing');
  a.change('#FirstName');
  assert.equal(a.$('#FirstName-error').textContent, 'First name can’t include “🌲” because the permit can’t print it. Remove it or type it another way.');
  a.holder({ FirstName: 'Test 🌲', City: '東京' });
  assert.equal(a.screen(), 'details', 'Continue is blocked');
  assert.deepEqual([...a.w.document.querySelectorAll('#errorList a')].map(link => [link.getAttribute('href'), link.textContent]), [
    ['#FirstName', 'First name can’t include “🌲” because the permit can’t print it. Remove it or type it another way.'],
    ['#City', 'City can’t include “東” or “京” because the permit can’t print them. Remove them or type them another way.']
  ]);
  a.input('#FirstName', 'Test');
  assert.equal(a.$('#FirstName').hasAttribute('aria-invalid'), false, 'fixing it clears the error');
  a.holder({ FirstName: 'Áłtsé', LastName: 'Ελένη Борис' });
  assert.equal(a.screen(), 'review', 'Latin, Navajo, Greek and Cyrillic letters the permit prints are accepted');
});

test('an unprintable entry that reaches the PDF links back to its field, then Continue returns to checkout', async t => {
  const a = await app(t); a.choose('fuelwood', 3); a.holder(); a.agree();
  // A value set without events skips the field check, so only the PDF's own check can catch it.
  a.$('#City').value = 'Test 東';
  await assert.rejects(a.generate(), /City can’t include/);
  const link = a.$('#errorList a');
  assert.equal(link.getAttribute('href'), '#City');
  assert.equal(link.textContent, 'City can’t include “東” because the permit can’t print it. Remove it or type it another way.');
  link.click();
  assert.equal(a.screen(), 'details', 'the link opens the screen the field is on');
  assert.equal(a.w.document.activeElement, a.$('#City'));
  assert.equal(a.$('#City').getAttribute('aria-invalid'), 'true');
  a.input('#City', 'Test City'); a.cont();
  assert.equal(a.screen(), 'review', 'Continue returns to the check screen');
  a.check('#agree'); await a.generate();
});

test('unexpected script errors are reported, but errors from other origins are not', async t => {
  const a = await app(t); a.start();
  a.w.dispatchEvent(new a.w.ErrorEvent('error', { message: 'boom', filename: 'chrome-extension://abc/content.js' }));
  assert.equal(a.errors(), '');
  a.w.dispatchEvent(new a.w.ErrorEvent('error', { message: 'boom', filename: 'http://localhost/app.js' }));
  assert.equal(a.errors(), 'Something went wrong on this page. Reload the page and try again. Your choices are kept, but you’ll need to enter your details again.');
});

test('an oversized checkout payload asks for shorter entries instead of quoting bytes', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree();
  a.w.TextEncoder = class { encode() { return { length: 5000 }; } };
  a.$('#confirmPay').click();
  assert.equal(a.errors(), 'Your details are too long to send. Shorten your name, address or email, then try again.');
  assert.equal(a.urls.size, 0, 'nothing is generated');
});

const LOAD_ERROR = 'We couldn’t load the permits available online. Check your internet connection, then try again. If it keeps happening, try again later or contact a local BWL office.';
const until = async (condition, what) => {
  for (let n = 0; n < 200; n++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error(`Timed out waiting for ${what}`);
};

test('a catalog that fails to load stays explained on every screen, and Try again recovers without a reload', async t => {
  let attempts = 0;
  const failing = async () => { attempts++; return { ok: false, status: 503, json: async () => ({}) }; };
  const a = await app(t, { fetch: failing });
  const tryAgain = () => a.$('#errorList button');
  assert.equal(a.screen(), 'start');
  assert.equal(a.errors(), `${LOAD_ERROR} Try again`);
  assert.notEqual(a.w.document.activeElement, a.$('#errorBox'), 'the first load leaves focus with the browser');
  a.start();
  assert.equal(a.screen(), 'what');
  assert.equal(a.errors(), `${LOAD_ERROR} Try again`, 'the error is still shown on the first question');
  assert.equal(a.w.document.activeElement, a.$('#whatTitle'));
  a.$('#ptype_fuelwood').click(); a.cont();
  assert.equal(a.screen(), 'what', 'Continue cannot pass a missing catalog');
  assert.equal(a.w.document.activeElement, a.$('#errorBox'));

  tryAgain().click();
  assert.equal(tryAgain().textContent, 'Trying again…');
  assert.equal(tryAgain().getAttribute('aria-busy'), 'true');
  await until(() => attempts === 2 && !tryAgain()?.hasAttribute('aria-busy'), 'the retry to fail');
  assert.equal(a.errors(), `${LOAD_ERROR} Try again`, 'a failed retry says the same thing');
  assert.equal(a.w.document.activeElement, a.$('#errorBox'));

  let retryInit;
  a.setFetch(async (url, init) => { retryInit = init; return { ok: true, json: async () => structuredClone(catalog) }; });
  tryAgain().click();
  await until(() => a.$('#errorBox').hidden, 'the catalog to load');
  assert.equal(retryInit.cache, 'no-cache', 'a retry does not reuse a cached bad copy');
  assert.equal(a.w.document.activeElement, a.$('#whatTitle'), 'focus returns to the question');
  assert.equal(a.$('#state').disabled, false);
  a.cont(); assert.equal(a.screen(), 'where', 'the chosen collection type is kept');
  a.change('#state', 'AK'); assert.ok(a.$('input[name=office]'));
});

test('bad catalog responses and a catalog that never answers all show the load error', async t => {
  for (const response of [
    async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } }),
    async () => ({ ok: false, status: 404, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => [] })
  ]) {
    const a = await app(t, { fetch: response });
    assert.equal(a.errors(), `${LOAD_ERROR} Try again`);
  }
  // A request that stalls is cut off by the timeout instead of leaving the visitor waiting.
  const stalled = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const b = await app(t, { fetch: stalled, fastTimeout: true });
  assert.equal(b.errors(), `${LOAD_ERROR} Try again`);
});

test('Continue while permits are still loading says so, then works once they arrive', async t => {
  let release;
  const slow = () => new Promise(resolve => { release = () => resolve({ ok: true, json: async () => structuredClone(catalog) }); });
  const a = await app(t, { fetch: slow, waitReady: false });
  a.start(); a.$('#ptype_fuelwood').click(); a.cont();
  assert.equal(a.errors(), 'Permits are still loading. Wait a moment, then select Continue again.');
  release(); await a.ready;
  a.cont(); assert.equal(a.screen(), 'where');
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
  a.holder(); a.$('#confirmPay').click();
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
  a.toReview(); a.$('#reviewSummary a[href="#details"]').click(); a.input('#FirstName', 'Changed'); a.cont();
  Object.defineProperty(a.w.crypto, 'getRandomValues', { value: undefined, configurable: true });
  a.$('#confirmPay').click(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(a.errors(), 'We couldn’t create your permit. Your entries are still here. Try again, and if it keeps happening, try again later or buy your permit at a local BWL office.');
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
  a.toReview();
  const labelNode = a.$('#confirmPay').firstChild;
  a.$('#FirstName').dispatchEvent(new a.w.Event('blur'));
  a.$('#FirstName').dispatchEvent(new a.w.Event('change'));
  a.$('#agree').dispatchEvent(new a.w.Event('blur'));
  a.w.dispatchEvent(new a.w.PopStateEvent('popstate', { state: { screen: 'done' } }));
  assert.equal(a.screen(), 'done', 'the permit is still valid for the current entries');
  assert.equal(a.payload().idempotencyKey, reference);
  a.w.dispatchEvent(new a.w.PopStateEvent('popstate', { state: { screen: 'review' } }));
  assert.equal(a.$('#confirmPay').firstChild, labelNode);
  a.input('#qty', '2');
  assert.equal(a.$('#permitDownloadBtn').disabled, true, 'a quantity edit discards the prepared permit');
});

const until2 = async (condition, what) => {
  for (let n = 0; n < 500; n++) { if (condition()) return; await sleep(10); }
  throw new Error(`Timed out waiting for ${what}`);
};
const HANDOFF = 'sfp-payment-handoff';
const COLLECTIONS = 'payure-demo-collections';

test('Pay sends the visitor to Pay.ure with a token, and the permit follows the confirmed payment', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree();
  assert.match(a.$('#payNote').textContent, /You’ll pay on Pay\.ure, then come back here for your permit/);
  a.$('#confirmPay').click();
  assert.equal(a.navigations.length, 1);
  assert.equal(a.navigations[0].replace, false, 'leaving for Pay.ure adds a history entry, so Back returns here');
  const token = new URL(a.leftFor()).searchParams.get('token');
  const handoff = JSON.parse(a.w.sessionStorage.getItem(HANDOFF));
  assert.equal(handoff.token, token);
  assert.equal(handoff.holder.FirstName, 'Test', 'the agency side keeps the checkout while the visitor pays');
  const collection = JSON.parse(a.w.sessionStorage.getItem(COLLECTIONS))[token];
  assert.deepEqual({ ...collection.request }, {
    agencyId: 'BWL-SFP', agencyName: 'Bureau of Wandering Lands', amount: 10, currency: 'USD',
    description: 'Firewood permit: Anchorage North, 1 cord', transactionReference: handoff.reference,
    successUrl: 'http://localhost/?payure=success#review', cancelUrl: 'http://localhost/?payure=cancel#review'
  });
  assert.ok(!a.w.sessionStorage.getItem(COLLECTIONS).includes('Purchaser'), 'Pay.ure is not given the permit holder’s details');

  await a.visitPayure();
  await until2(() => a.screen() === 'done', 'the permit after paying');
  assert.equal(a.w.location.href, 'http://localhost/#done', 'the return address is cleaned up');
  assert.equal(a.w.sessionStorage.getItem(HANDOFF), null, 'purchaser details leave storage once the visitor is back');
  assert.ok(!a.w.sessionStorage.getItem(COLLECTIONS).includes('4111111111111111'), 'the card number is never stored');
  const paid = a.payload();
  assert.equal(paid.idempotencyKey, handoff.reference);
  assert.equal(paid.permitNumber, handoff.permitNumber, 'the permit number chosen before paying is kept');
  assert.deepEqual(Object.keys(paid.payment).sort(), ['amount', 'cardBrand', 'completedAt', 'last4', 'method', 'processor', 'status', 'token', 'trackingId', 'verification']);
  assert.deepEqual(paid.payment.verification, { status: 'verified', lookedUpBy: 'token', checks: [
    { check: 'Pay.ure status', expected: 'success', found: 'success', passed: true },
    { check: 'Agency reference', expected: handoff.reference, found: handoff.reference, passed: true },
    { check: 'Amount paid', expected: 10, found: 10, passed: true }
  ] });
  assert.equal(paid.payment.processor, 'Pay.ure');
  assert.equal(paid.payment.token, token);
  assert.equal(paid.payment.status, 'success');
  assert.equal(paid.payment.cardBrand, 'Visa');
  assert.equal(paid.payment.last4, '1111');
  assert.match(paid.payment.trackingId, /^PU-[A-HJ-NP-Z2-9]{10}$/);
  assert.equal(a.$('#doneNote').textContent, `You paid $10.00 on Pay.ure with Visa ending 1111. Tracking ID ${paid.payment.trackingId}. This was a demo, so nothing was charged. In production: we’d also email the package to test@example.com.`);
  assert.match(a.$('#handoff .hint').textContent, /look the collection up by token before issuing the permit/);
  const pdfText = (await readPdf([...a.urls.values()].at(-1))).text;
  // The fee line wraps in the PDF.
  assert.ok(pdfText.replace(/\s+/g, ' ').includes(`$10.00 paid on Pay.ure, tracking ID ${paid.payment.trackingId} (demo: nothing was charged)`));

  assert.equal(a.w.history.length, 1, 'the permit replaced the return’s history entry, so Back goes to Pay.ure');
  // Back on the check screen (after a failed download, say), the permit is already paid for.
  a.toReview();
  assert.equal(a.$('#confirmPay').textContent, 'Get my permit');
  assert.equal(a.$('#payNote').textContent, `You’ve paid $10.00 on Pay.ure with Visa ending 1111. Tracking ID ${paid.payment.trackingId}.`);
  const left = a.navigations.length;
  await a.generate();
  assert.equal(a.navigations.length, left, 'no second trip to Pay.ure');
  assert.equal(a.payload().payment.trackingId, paid.payment.trackingId);
});

test('a bank account payment is described by its type and last four digits', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree();
  a.$('#confirmPay').click();
  await a.visitPayure(p => { p.enterBank({ type: 'savings' }); p.cont(); return p.pay(); });
  await until2(() => a.screen() === 'done', 'the permit after paying');
  assert.equal(a.payload().payment.method, 'bank');
  assert.equal(a.payload().payment.accountType, 'savings');
  assert.equal(a.payload().payment.last4, '7890');
  assert.match(a.$('#doneNote').textContent, /^You paid \$10\.00 on Pay\.ure with savings account ending 7890\./);
});

test('cancelling on Pay.ure returns to the check screen with every entry kept', async t => {
  const a = await app(t); a.choose(); a.holder({ MiddleName: 'Quinn' }); a.agree();
  a.$('#confirmPay').click();
  const reference = JSON.parse(a.w.sessionStorage.getItem(HANDOFF)).reference;
  const payure = await a.visitPayure((p) => { p.$('#cancelPay').click(); return p.navigations.at(-1); });
  assert.equal(JSON.parse(payure.w.sessionStorage.getItem(COLLECTIONS))[payure.w.location.search.slice(7)].status, 'cancelled');
  assert.equal(a.screen(), 'review');
  assert.equal(a.w.location.href, 'http://localhost/#review');
  assert.equal(a.$('#flowNotice').hidden, false);
  assert.equal(a.$('#flowNotice').textContent, 'You cancelled your payment on Pay.ure, so nothing was charged. Your entries are still here.');
  assert.equal(a.$('#MiddleName').value, 'Quinn');
  assert.equal(a.$('#agree').checked, true);
  assert.equal(a.$('#confirmPay').textContent, 'Pay $10.00 on Pay.ure');
  assert.equal(a.w.sessionStorage.getItem(HANDOFF), null);
  assert.equal(a.errors(), '');
  await a.generate();
  assert.equal(a.payload().idempotencyKey, reference, 'paying after a cancel keeps the checkout’s reference');
  assert.equal(a.$('#flowNotice').hidden, true, 'the notice goes once the visitor moves on');
});

test('leaving Pay.ure with the Back button returns to the check screen, from a reload or the back-forward cache', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree();
  a.$('#confirmPay').click();
  await a.revisit('http://localhost/#review');
  assert.equal(a.screen(), 'review');
  assert.equal(a.$('#flowNotice').textContent, 'You left Pay.ure without paying, so nothing was charged. Your entries are still here.');
  assert.equal(a.$('#FirstName').value, 'Test');
  assert.equal(a.w.sessionStorage.getItem(HANDOFF), null);

  const b = await app(t); b.choose(); b.holder({ FirstName: 'Cached' }); b.agree();
  b.$('#confirmPay').click();
  b.w.dispatchEvent(new b.w.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(b.screen(), 'review');
  assert.equal(b.$('#FirstName').value, 'Cached');
  assert.equal(b.w.document.activeElement, b.$('#reviewTitle'));
  assert.equal(b.$('#flowNotice').hidden, false);
});

test('a return that cannot be matched to a paid checkout never issues a permit', async t => {
  // Paid, but this tab no longer has the checkout (another tab, or cleared site data).
  const lost = await app(t, { hash: '?payure=success&token=0b0b0b0b-0000-4000-8000-000000000000#review' });
  assert.equal(lost.screen(), 'start');
  assert.equal(lost.errors(), 'We couldn’t find the permit you were paying for, so we can’t issue it here. If Pay.ure says you paid, contact your local BWL office with your name and email address. Otherwise, start again.');
  // Cancelled without the checkout: nothing to say.
  const gone = await app(t, { hash: '?payure=cancel&token=0b0b0b0b-0000-4000-8000-000000000000#review' });
  assert.equal(gone.errors(), '');
  // The success address was opened, but Pay.ure has no payment for the token.
  const a = await app(t); a.choose(); a.holder(); a.agree();
  a.$('#confirmPay').click();
  const token = new URL(a.leftFor()).searchParams.get('token');
  await a.revisit(`http://localhost/?payure=success&token=${token}#review`);
  assert.equal(a.screen(), 'review');
  assert.equal(a.errors(), 'We couldn’t confirm your payment with Pay.ure, so we haven’t issued your permit. Try paying again. If Pay.ure says you paid, contact your local BWL office with your name, email address and permit reference.');
  assert.equal(a.$('#confirmPay').textContent, 'Pay $10.00 on Pay.ure');
  assert.equal(a.urls.size, 0);
});

test('Pay checks every entry again before leaving, so no one pays for a permit that cannot be issued', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree();
  // A value set without events skips the field check.
  a.$('#City').value = 'Test 東';
  a.$('#confirmPay').click();
  assert.equal(a.navigations.length, 0);
  assert.equal(a.$('#errorList a').getAttribute('href'), '#City');
  assert.equal(a.$('#errorList a').textContent, 'City can’t include “東” because the permit can’t print it. Remove it or type it another way.');
  assert.equal(a.w.sessionStorage.getItem(HANDOFF), null);
});

test('Start over forgets a checkout waiting for Pay.ure', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree();
  a.$('#confirmPay').click();
  assert.ok(a.w.sessionStorage.getItem(HANDOFF));
  a.$('#resetAll').click();
  assert.equal(a.w.sessionStorage.getItem(HANDOFF), null);
});

const PAID_PERMITS = 'sfp-paid-permits';
const payWith = number => async (p) => { p.enterCard({ number }); p.cont(); return p.pay(); };

test('when Pay.ure is down, the check screen says nothing was charged and paying again works', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree();
  a.$('#confirmPay').click();
  await a.visitPayure(async (p) => {
    p.enterCard({ number: '4000 0000 0000 0119' }); p.cont();
    p.$('#authorize').click(); p.$('#payButton').click();
    for (let n = 0; n < 200 && p.view() !== 'unavailable'; n++) await sleep(5);
    p.$('#unavailableReturn').click();
    return p.navigations.at(-1);
  });
  assert.equal(a.screen(), 'review');
  assert.equal(a.$('#flowNotice').textContent, 'Pay.ure couldn’t take your payment, so nothing was charged. Wait a few minutes, then try again. Your entries are still here.');
  assert.equal(a.$('#agree').checked, true);
  assert.equal(a.$('#confirmPay').textContent, 'Pay $10.00 on Pay.ure');
  await a.generate();
  assert.equal(a.payload().payment.verification.status, 'verified');
});

test('a payment for the wrong amount fails the check on return and no permit is issued', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree();
  a.$('#confirmPay').click();
  const payure = await a.visitPayure(payWith('4000 0000 0000 0259'));
  const trackingId = JSON.parse(payure.w.sessionStorage.getItem(COLLECTIONS))[new URL(payure.w.location.href).searchParams.get('token')].result.trackingId;
  assert.equal(a.screen(), 'review');
  assert.equal(a.errors(), `Pay.ure reports a payment of $1.00, but this permit costs $10.00, so we haven’t issued it. Don’t pay again. Contact your local BWL office with your name, email address and Pay.ure tracking ID ${trackingId}, and staff will sort out the payment.`);
  assert.equal(a.urls.size, 0, 'no permit is generated');
  assert.equal(a.w.sessionStorage.getItem(PAID_PERMITS), null, 'a refused payment does not count as paid');
  assert.equal(a.$('#confirmPay').textContent, 'Pay $10.00 on Pay.ure');
});

test('a paid permit is recognized after a reload or a new visit, so it is never paid for twice', async t => {
  const a = await app(t); a.choose(); a.holder(); a.agree();
  await a.generate();
  const paid = a.payload();
  const stored = a.w.sessionStorage.getItem(PAID_PERMITS);
  for (const personal of ['Purchaser', 'test@example.com', '123 Test Street', '84037']) assert.ok(!stored.includes(personal), `no ${personal} in the paid-permit record`);

  // A reload, or the Forward button after Back to Pay.ure: the details are entered again, here by the visitor.
  await a.revisit('http://localhost/#review');
  assert.equal(a.screen(), 'details');
  a.holder();
  assert.equal(a.screen(), 'review');
  assert.equal(a.$('#confirmPay').textContent, 'Get my permit', 'recognized before the agreement is ticked again');
  assert.equal(a.$('#payNote').textContent, `You’ve paid $10.00 on Pay.ure with Visa ending 1111. Tracking ID ${paid.payment.trackingId}.`);
  a.agree();
  const left = a.navigations.length;
  await a.generate();
  assert.equal(a.navigations.length, left, 'no second trip to Pay.ure');
  assert.equal(a.payload().permitNumber, paid.permitNumber);
  assert.equal(a.payload().idempotencyKey, paid.idempotencyKey);
  assert.equal(a.payload().payment.trackingId, paid.payment.trackingId);

  // Different details are a different permit.
  a.toReview(); a.$('#reviewSummary a[href="#details"]').click(); a.input('#FirstName', 'Other'); a.cont();
  assert.equal(a.$('#confirmPay').textContent, 'Pay $10.00 on Pay.ure');

  // Pay.ure's "You've already paid" page returns here with the token, after the details have gone.
  await a.revisit(`http://localhost/?payure=success&token=${paid.payment.token}#review`);
  assert.equal(a.screen(), 'details');
  assert.equal(a.w.location.href, 'http://localhost/#details', 'the token comes off the address bar');
  assert.equal(a.$('#flowNotice').hidden, false);
  assert.equal(a.$('#flowNotice').textContent, `You’ve already paid $10.00 for permit ${paid.permitNumber} (Pay.ure tracking ID ${paid.payment.trackingId}). To download it again, choose the same permit and enter the same details as before. You won’t be charged again.`);
  assert.equal(a.errors(), '');
  a.holder();
  assert.equal(a.$('#flowNotice').hidden, true, 'the notice goes with its screen');
  assert.equal(a.$('#confirmPay').textContent, 'Get my permit');

  // Start another permit forgets paid permits, so the same details can buy a second one.
  a.$('#resetAll').click();
  assert.equal(a.w.sessionStorage.getItem(PAID_PERMITS), null);
  a.choose(); a.holder();
  assert.equal(a.$('#confirmPay').textContent, 'Pay $10.00 on Pay.ure');
});
