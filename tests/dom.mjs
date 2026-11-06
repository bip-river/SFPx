// Loads a page of this repository in jsdom with its real ES module graph, so the tests exercise the real markup,
// events and modules. Navigation to another page is recorded instead of performed: a test follows a visitor from
// the BWL site to Pay.ure and back by opening the next page itself, carrying sessionStorage across as a browser tab does.
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { SourceTextModule } from 'node:vm';

export const root = new URL('../', import.meta.url);
// Pay.ure's processing pause (PROCESSING_MS in pay-ure/app.js) is skipped in tests.
const PAYURE_PROCESSING_MS = 800;
const NAVIGATE_STUB = 'export function navigate(url, options = {}) { globalThis.__navigate(url, options); }';
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// `blocked` lists dynamically imported modules that fail to download, like a dropped connection. `setup` runs
// after sessionStorage is seeded and before any module, so it can replace window APIs.
export async function loadPage(t, { page = 'index.html', entry = 'app.js', url, markup, storage = {}, now = () => '2026-10-21T12:00:00', blocked = new Set(), setup = () => {} }) {
  const dom = new JSDOM(markup ?? await readFile(new URL(page, root), 'utf8'), { url, runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window;
  const NativeDate = w.Date;
  w.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now()])); }
    static now() { return new NativeDate(now()).getTime(); }
  };
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.setImmediate = setImmediate;
  w.Blob = Blob;
  w.matchMedia = () => ({ matches: true });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.console.error = () => {};
  w.console.warn = () => {};
  const navigations = [];
  w.__navigate = (target, options) => navigations.push({ url: new URL(target, w.location.href).href, replace: Boolean(options.replace) });
  for (const [key, value] of Object.entries(storage)) w.sessionStorage.setItem(key, value);
  setup(w);

  const modules = new Map();
  async function loadModule(moduleUrl) {
    if (!modules.has(moduleUrl.href)) {
      const source = moduleUrl.pathname.endsWith('/navigate.js') ? NAVIGATE_STUB : await readFile(moduleUrl, 'utf8');
      modules.set(moduleUrl.href, new SourceTextModule(source, {
        context: dom.getInternalVMContext(), identifier: moduleUrl.href,
        importModuleDynamically: async (specifier, referencing) => {
          if ([...blocked].some(path => new URL(specifier, referencing.identifier).href === new URL(path, root).href)) throw new w.TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
          const dependency = await loadModule(new URL(specifier, referencing.identifier));
          if (dependency.status === 'unlinked') await dependency.link((name, parent) => loadModule(new URL(name, parent.identifier)));
          if (dependency.status === 'linked') await dependency.evaluate();
          return dependency;
        }
      }));
    }
    return modules.get(moduleUrl.href);
  }
  const module = await loadModule(new URL(entry, root));
  await module.link((specifier, referencing) => loadModule(new URL(specifier, referencing.identifier)));
  await module.evaluate();
  return { dom, w, navigations, ready: module.namespace.ready };
}

export function dumpStorage(w) {
  try {
    const storage = w.sessionStorage;
    return Object.fromEntries(Array.from({ length: storage.length }, (_, i) => [storage.key(i), storage.getItem(storage.key(i))]));
  } catch { return {}; }
}

export async function openPayure(t, url, { storage = {}, now } = {}) {
  const page = await loadPage(t, {
    page: 'pay-ure/index.html', entry: 'pay-ure/app.js', url, storage, now,
    setup: (w) => {
      const native = w.setTimeout;
      w.setTimeout = (fn, ms, ...rest) => native(fn, ms === PAYURE_PROCESSING_MS ? 0 : ms, ...rest);
    }
  });
  await page.ready;
  const { w } = page;
  const $ = selector => w.document.querySelector(selector);
  // Typing then leaving a field, as a visitor does.
  const fill = (selector, value) => {
    const el = $(selector);
    el.value = value;
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
    el.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  const view = () => Object.keys({ none: 1, finished: 1, pay: 1, review: 1 }).find(name => !$(`#view-${name}`).hidden);
  const errors = () => ($('#errorBox').hidden ? '' : [...w.document.querySelectorAll('#errorList li')].map(li => li.textContent));
  const enterCard = ({ number = '4111 1111 1111 1111', name = 'Test Purchaser', expiry = '12/30', code = '123' } = {}) => {
    $('#method_card').click();
    fill('#cardName', name); fill('#cardNumber', number); fill('#cardExpiry', expiry); fill('#cardCode', code);
  };
  const enterBank = ({ routing = '551234561', account = '1234567890', confirm = account, type = 'checking' } = {}) => {
    $('#method_bank').click();
    if (type) $(`#accountType_${type}`).click();
    fill('#routingNumber', routing); fill('#accountNumber', account); fill('#confirmAccount', confirm);
  };
  const cont = () => $('#view-pay button[type=submit]').click();
  // Authorizes and pays on the review step, then waits for Pay.ure to send the visitor back.
  const pay = async () => {
    if (view() !== 'review') throw new Error(`Pay.ure is not on its review step: ${errors() || view()}`);
    $('#authorize').click();
    $('#payButton').click();
    for (let n = 0; n < 200 && !page.navigations.length; n++) await sleep(5);
    if (!page.navigations.length) throw new Error('Pay.ure did not return to the agency');
    return page.navigations.at(-1);
  };
  return { ...page, $, fill, view, errors, enterCard, enterBank, cont, pay };
}
