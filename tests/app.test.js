import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { SourceTextModule } from 'node:vm';
import { readPdf } from './pdf-text.mjs';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const catalog = JSON.parse(await readFile(new URL('products.json', root), 'utf8'));

async function app(t, { data = structuredClone(catalog), saved, storageBlocked = false, loadFails = false } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
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
  const check = selector => { const el = $(selector); assert.equal(el.disabled, false, `${selector} enabled`); el.checked = true; change(selector); };
  const choose = (type = 'fuelwood', index = 0) => {
    $(`input[name=ptype][value=${type}]`).click();
    change('#state', 'AK');
    $('#officeOption_0').click();
    $(`#prod_${index}`).click();
    input('#qty', $('#qty').min);
    $('#qty').dispatchEvent(new w.Event('blur'));
  };
  const holder = () => {
    check('#ackPrivacy'); check('#ackTerms');
    if ($('#eligibilityAgreement').style.display !== 'none') check('#ackEligibility');
    for (const [id, value] of Object.entries({ FirstName: 'Test', MiddleName: '', LastName: 'Purchaser', AddressLine1: '123 Test Street', City: 'Test City', AddrState: 'UT', Zip: '84037', DeliveryEmail: 'test@example.com', ConfirmEmail: 'test@example.com' })) input(`#${id}`, value);
    assert.equal($('#confirmPaygov').disabled, false, 'checkout enabled');
  };
  const payload = () => JSON.parse($('#handoff .payload-content').textContent);
  const generate = async () => {
    $('#confirmPaygov').click();
    for (let attempt = 0; attempt < 500; attempt++) {
      if ($('#confirmation').style.display === 'flex') return;
      if ($('#errorBox').style.display === 'block') throw new Error($('#errorList').textContent);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('PDF generation timed out');
  };
  return { w, $, input, change, check, choose, holder, payload, generate, urls, revoked, setNow(value) { now = value; } };
}

const savedFor = (product, extra = {}) => ({ model: { state: 'AK', officeId: 'AK-ANCH', productType: 'fuelwood', productKey: product.id, productIndex: 0, qty: product.minQty, ...extra }, acknowledgements: { privacy: true, terms: true, eligibility: true } });

test('paid checkout validates holder data, preserves retry identity, and replaces it on edits', async t => {
  const a = await app(t); a.choose();
  assert.equal(a.$('#confirmPaygov').disabled, true);
  a.holder(); a.$('#confirmPaygov').click();
  const first = a.payload();
  assert.equal(first.total, 10);
  assert.equal(first.productId, catalog.AK.offices[0].products.fuelwood[0].id);
  a.$('#confirmPaygov').click(); assert.equal(a.payload().idempotencyKey, first.idempotencyKey);
  a.input('#FirstName', 'Changed');
  assert.equal(a.$('#handoff').textContent, '');
  a.$('#confirmPaygov').click(); assert.notEqual(a.payload().idempotencyKey, first.idempotencyKey);
  assert.equal(a.payload().permitHolder.firstName, 'Changed');
  const stored = a.w.sessionStorage.getItem('sfp-demo-state');
  assert.ok(!stored.includes('Changed') && !stored.includes('test@example.com'));
});

test('no-fee checkout retries reuse identity and edits revoke stale PDFs', async t => {
  const a = await app(t); a.choose('fuelwood', 3); a.holder(); await a.generate();
  const first = a.payload(), originalUrl = [...a.urls.keys()].at(-1);
  assert.equal(first.total, 0); assert.equal(a.$('#confirmation').style.display, 'flex');
  assert.match((await readPdf(a.urls.get(originalUrl))).text, /Issued to: Test Purchaser/);
  await a.generate(); assert.equal(a.payload().idempotencyKey, first.idempotencyKey);
  a.input('#FirstName', 'Changed');
  assert.equal(a.$('#confirmation').style.display, 'none');
  assert.equal(a.$('#permitDownloadBtn').disabled, true);
  assert.ok(a.revoked.includes(originalUrl));
  await a.generate();
  assert.notEqual(a.payload().idempotencyKey, first.idempotencyKey);
  assert.match((await readPdf([...a.urls.values()].at(-1))).text, /Issued to: Changed Purchaser/);
  a.$('#ackTerms').click(); assert.equal(a.$('#confirmation').style.display, 'none');
});

test('reset clears personal data, storage, payload, and transaction identity', async t => {
  const a = await app(t); a.choose(); a.holder(); a.$('#confirmPaygov').click(); const first = a.payload().idempotencyKey;
  a.w.sessionStorage.setItem('sfp-demo-transaction-ref', 'old-reference');
  a.$('#resetAll').click();
  for (const field of a.w.document.querySelectorAll('#permitHolderFieldset input, #permitHolderFieldset select')) assert.equal(field.value, '');
  assert.equal(a.w.sessionStorage.getItem('sfp-demo-state'), null);
  assert.equal(a.w.sessionStorage.getItem('sfp-demo-transaction-ref'), null);
  assert.equal(a.$('#handoff').textContent, '');
  a.choose(); a.holder(); a.$('#confirmPaygov').click(); assert.notEqual(a.payload().idempotencyKey, first);
});

test('restoration matches active IDs after inactive products and catalog reorder', async t => {
  const data = structuredClone(catalog), products = data.AK.offices[0].products.fuelwood;
  const selected = products[1]; products[0].saleEndDate = '2026-10-20';
  const a = await app(t, { data, saved: savedFor(selected) });
  assert.match(a.$('input[name=product]:checked').closest('.prod').textContent, /Anchorage South/);
  assert.equal(a.$('input[name=product]:checked').id, 'prod_0');
  assert.equal(a.$('#qty').value, '2');
  assert.equal(a.$('#FirstName').disabled, false);
  assert.equal(a.$('#confirmPaygov').disabled, true, 'personal data must be reentered');
});

test('expired, removed, and index-only saved products cannot restore another selection', async t => {
  for (const mode of ['expired', 'removed', 'legacy']) {
    const data = structuredClone(catalog), products = data.AK.offices[0].products.fuelwood, saved = savedFor(products[0]);
    if (mode === 'expired') products[0].saleEndDate = '2026-10-20';
    if (mode === 'removed') products.shift();
    if (mode === 'legacy') delete saved.model.productKey;
    const a = await app(t, { data, saved });
    assert.equal(a.$('input[name=product]:checked'), null, mode);
    assert.equal(a.$('#ackTerms').checked, false, mode);
    assert.equal(a.$('#confirmPaygov').disabled, true, mode);
  }
});

test('repeated upstream edits and quantity relocking leave step controls usable', async t => {
  const a = await app(t); a.choose();
  for (let n = 0; n < 3; n++) {
    a.input('#qty', ''); a.input('#qty', '1');
    assert.equal(a.$('#ackPrivacy').disabled, false); assert.equal(a.$('#ackTerms').disabled, false);
  }
  a.holder();
  a.input('#officeInput', 'Anchorage Aurora Outpostx');
  assert.equal(a.$('#confirmPaygov').disabled, true);
  a.input('#officeInput', 'Anchorage Aurora Outpost');
  a.$('#prod_0').click(); a.input('#qty', '1'); a.holder();
});

test('whole-tree quantities and min/max limits are enforced', async t => {
  const a = await app(t); a.choose('christmas');
  for (const invalid of ['', '0', '1.5', '-1', '100']) {
    a.input('#qty', invalid); a.$('#qty').dispatchEvent(new a.w.Event('blur'));
    assert.equal(a.$('#status3').textContent, 'Locked', invalid);
  }
  a.input('#qty', a.$('#qty').max); assert.notEqual(a.$('#status3').textContent, 'Locked');
});

test('eligibility is driven by catalog rule even if display name changes', async t => {
  const data = structuredClone(catalog); data.AK.offices[0].products.fuelwood[2].name = 'Renamed no-fee permit';
  const a = await app(t, { data }); a.choose('fuelwood', 2);
  a.check('#ackPrivacy'); a.check('#ackTerms'); assert.equal(a.$('#permitHolderFieldset').disabled, true);
  a.holder(); await a.generate(); assert.equal(a.payload().eligibility.certified, true);
});

test('checkout rechecks availability after date changes in an open tab', async t => {
  const data = structuredClone(catalog); data.AK.offices[0].products.fuelwood[0].saleEndDate = '2026-10-21';
  const a = await app(t, { data }); a.choose(); a.holder(); a.setNow('2026-10-22T12:00:00');
  a.$('#confirmPaygov').click();
  assert.equal(a.$('#confirmation').style.display, 'none'); assert.equal(a.$('#handoff').textContent, '');
  assert.match(a.$('#errorList').textContent, /no longer available/);
});

test('malformed catalog fails closed with a visible error', async t => {
  for (const mutate of [p => { delete p.saleStartDate; }, p => { p.saleEndDate = '2026-02-30'; }, p => { p.price = '10'; }, p => { p.quantityStep = 0; }]) {
    const data = structuredClone(catalog); mutate(data.AK.offices[0].products.fuelwood[0]);
    const a = await app(t, { data }); assert.equal(a.$('#state').disabled, true);
    assert.equal(a.$('#errorBox').getAttribute('aria-hidden'), 'false');
  }
});

test('unsafe attachment URLs are blocked after browser URL normalization', async t => {
  const data = structuredClone(catalog);
  data.AK.attachments = [{ label: 'bad', url: 'java\nscript:alert(1)' }, { label: 'safe', url: '/map.pdf' }];
  const a = await app(t, { data }); a.choose();
  assert.equal(a.$('#locationNotice a').getAttribute('href'), '#');
  assert.equal(a.$('#locationNotice a:nth-of-type(1)').protocol, 'http:');
  assert.ok([...a.w.document.querySelectorAll('#locationNotice a')].some(link => link.getAttribute('href') === '/map.pdf'));
});

test('malformed saved state, unavailable storage, and fetch failures are handled', async t => {
  const a = await app(t, { saved: '{broken' }); a.choose();
  const b = await app(t, { storageBlocked: true }); b.choose(); b.holder(); b.$('#confirmPaygov').click(); assert.ok(b.payload().idempotencyKey);
  const c = await app(t, { loadFails: true }); assert.equal(c.$('#state').disabled, true); assert.match(c.$('#errorList').textContent, /could not load/);
});

test('Reset during asynchronous PDF generation cannot publish a stale permit', async t => {
  const a = await app(t); a.choose('fuelwood', 3); a.holder();
  a.$('#confirmPaygov').click();
  assert.equal(a.$('#confirmPaygov').getAttribute('aria-busy'), 'true');
  a.$('#resetAll').click();
  for (let n = 0; n < 500 && a.$('#confirmPaygov').hasAttribute('aria-busy'); n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(a.$('#confirmPaygov').hasAttribute('aria-busy'), false);
  assert.equal(a.urls.size, 0);
  assert.equal(a.$('#confirmation').style.display, 'none');
  assert.equal(a.$('#permitDownloadBtn').disabled, true);
});

test('PDF failure keeps purchaser entries and allows a corrected retry', async t => {
  const a = await app(t); a.choose('fuelwood', 3); a.holder(); a.input('#FirstName', '\u{10FFFF}');
  await assert.rejects(a.generate(), /does not support/);
  assert.equal(a.$('#FirstName').value, '\u{10FFFF}');
  assert.equal(a.$('#confirmPaygov').disabled, false);
  assert.equal(a.$('#permitDownloadBtn').disabled, true);
  a.input('#FirstName', 'José'); await a.generate();
  assert.match((await readPdf([...a.urls.values()].at(-1))).text, /Issued to: José Purchaser/);
});


test('address-state change alone updates checkout readiness', async t => {
  const a = await app(t); a.choose(); a.holder();
  a.input('#AddrState', ''); assert.equal(a.$('#confirmPaygov').disabled, true);
  a.change('#AddrState', 'UT'); assert.equal(a.$('#confirmPaygov').disabled, false);
});

test('back-forward cache return clears browser-retained purchaser information', async t => {
  const a = await app(t); a.choose(); a.holder();
  a.w.dispatchEvent(new a.w.PageTransitionEvent('pageshow', { persisted: true }));
  assert.equal(a.$('#FirstName').value, '');
  assert.equal(a.$('#confirmPaygov').disabled, true);
});


test('holder blur and unchanged change events preserve checkout result and button text nodes', async t => {
  const a = await app(t); a.choose(); a.holder(); a.$('#confirmPaygov').click();
  const reference = a.payload().idempotencyKey;
  const labelNode = a.$('#confirmPaygov').firstChild;
  a.$('#FirstName').dispatchEvent(new a.w.Event('blur'));
  a.$('#FirstName').dispatchEvent(new a.w.Event('change'));
  assert.equal(a.$('#confirmPaygov').firstChild, labelNode);
  assert.equal(a.$('#handoff').style.display, 'block');
  assert.equal(a.payload().idempotencyKey, reference);
  a.input('#qty', '2');
  assert.equal(a.$('#confirmPaygov').disabled, false, 'quantity edit reevaluates existing purchaser information');
});
