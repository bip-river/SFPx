// Demo tools state, shared by the permit service and Pay.ure. It lives in the tab's sessionStorage, so the tools
// and any switch that breaks something on purpose stay on across pages, including the round trip to Pay.ure, until
// they are turned off or the tab closes.
//
// The app and Pay.ure call demoBreak() at the few places a switch can break, so a facilitator can show each failure
// on demand. With no switch on, demoBreak() returns null and nothing changes.
export const DEMO_KEY = 'sfp-demo-tools';

// `when` lists the screens or Pay.ure views where a switch matters; a switch that is on is always listed too.
// `reload`: the failure happens as the page loads, so switching it reloads the page.
export const BREAKS = {
  catalog: {
    label: 'Permit catalog fails to load',
    modes: { server: 'Server error', data: 'Bad data', timeout: 'No answer (15 seconds)' },
    reload: true,
    when: ['start', 'what', 'where', 'permit']
  },
  pdf: { label: 'PDF engine doesn’t download', when: ['review'] },
  storage: { label: 'Browser storage blocked (can’t leave for Pay.ure)', when: ['review:paid'] },
  payureDown: { label: 'Pay.ure is down for every payment', when: ['review:paid', 'pay', 'review-payure'] },
  wrongAmount: { label: 'Pay.ure reports the wrong amount', when: ['review:paid', 'pay', 'review-payure'] },
  lostCheckout: { label: 'Checkout lost on the return from Pay.ure', when: ['review:paid', 'pay', 'review-payure'] }
};

// Every key the demo writes to sessionStorage, for the state view and Reset.
export const STORAGE_KEYS = {
  'sfp-demo-state': 'Saved choices',
  'sfp-payment-handoff': 'Checkout waiting for Pay.ure',
  'payure-demo-collections': 'Pay.ure collections',
  'sfp-paid-permits': 'Paid permits',
  [DEMO_KEY]: 'Demo tools'
};

const empty = () => ({ tools: false, open: true, breaks: {} });

function storage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

export function readDemo() {
  try {
    const value = JSON.parse(storage()?.getItem(DEMO_KEY) || 'null');
    if (!value || typeof value !== 'object') return empty();
    const breaks = Object.fromEntries(Object.entries(value.breaks || {}).filter(([name, mode]) => BREAKS[name] && mode));
    return { tools: value.tools === true, open: value.open !== false, breaks };
  } catch { return empty(); }
}

export function writeDemo(state) {
  try { storage()?.setItem(DEMO_KEY, JSON.stringify(state)); }
  catch { /* Without storage the tools work on this page only. */ }
}

export function updateDemo(change) {
  const state = readDemo();
  change(state);
  writeDemo(state);
  return state;
}

// The mode of a switch that is on ('server', 'data', 'timeout' for the catalog; true for the others), or null.
export function demoBreak(name) {
  return readDemo().breaks[name] || null;
}

// What a broken catalog request answers, in place of fetch(): the app explains each one the same way.
export function demoCatalogResponse(mode, signal) {
  if (mode === 'data') return Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError('Demo: the catalog was switched to bad data'); } });
  if (mode === 'timeout') {
    return new Promise((resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  }
  return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
}

export function breakDescription(name, mode) {
  const info = BREAKS[name];
  return info.modes ? `${info.label}: ${info.modes[mode] || mode}` : info.label;
}
