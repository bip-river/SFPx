// Paying means leaving this page for Pay.ure and coming back as a new page load. In production the agency's
// server would keep the checkout while the visitor pays. This static demo has no server, so the checkout,
// purchaser details included, waits in the tab's sessionStorage and is removed as soon as the visitor is back.
export const HANDOFF_KEY = 'sfp-payment-handoff';

export const PAYMENT_AGENCY_ID = 'BWL-SFP';

export function createPaymentHandoff(getStorage = () => sessionStorage) {
  return {
    // Throws when storage is blocked, so the visitor is told before being sent away.
    save(record) {
      getStorage().setItem(HANDOFF_KEY, JSON.stringify(record));
    },
    read() {
      try {
        const value = JSON.parse(getStorage().getItem(HANDOFF_KEY) || 'null');
        return value && typeof value === 'object' && typeof value.token === 'string' ? value : null;
      } catch { return null; }
    },
    clear() {
      try { getStorage().removeItem(HANDOFF_KEY); }
      catch { /* Storage can be unavailable in private contexts. */ }
    }
  };
}

// Pay.ure adds ?token=… to the address the agency registered for each outcome.
export function paymentReturnUrls(href) {
  const base = new URL(href);
  base.search = '';
  base.hash = '#review';
  const withOutcome = (outcome) => {
    const url = new URL(base);
    url.searchParams.set('payure', outcome);
    return url.href;
  };
  return { successUrl: withOutcome('success'), cancelUrl: withOutcome('cancel') };
}

// Reads ?payure=success|cancel&token=… from a return, or null for an ordinary visit.
export function readPaymentReturn(href) {
  const params = new URL(href).searchParams;
  const outcome = params.get('payure');
  const token = params.get('token');
  if (!token || (outcome !== 'success' && outcome !== 'cancel')) return null;
  return { outcome, token };
}

export function describePayment(result) {
  if (!result) return '';
  if (result.method === 'card') return `${result.cardBrand} ending ${result.last4}`;
  return `${result.accountType === 'savings' ? 'savings' : 'checking'} account ending ${result.last4}`;
}

// Permits this tab has paid for, so a paid checkout is never offered for payment again: after the browser's
// Forward button reloads the page (and the browser refills the form), after Pay.ure's "Return" link on a payment it
// has already taken, or when the visitor enters the same details again. In production the agency's server would
// know. Each record holds the payment's token, references, amount, method and last 4 digits, and a one-way
// fingerprint of the checkout in place of the purchaser's details. The fingerprint is a 53-bit hash (cyrb53): enough
// to recognize the same entries in one tab, not a cryptographic protection.
export const PAID_PERMITS_KEY = 'sfp-paid-permits';
const MAX_PAID_PERMITS = 20;

export function checkoutKey(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function createPaidPermits(getStorage = () => sessionStorage) {
  const list = () => {
    try {
      const value = JSON.parse(getStorage().getItem(PAID_PERMITS_KEY) || '[]');
      return Array.isArray(value) ? value.filter(record => record && typeof record === 'object') : [];
    } catch { return []; }
  };
  return {
    list,
    // By the checkout's fingerprint, or by the Pay.ure token a return carries.
    find({ key, token }) {
      return list().find(record => (key && record.key === key) || (token && record.token === token)) || null;
    },
    // "Start over" forgets them, so the same details can buy a second permit.
    clear() {
      try { getStorage().removeItem(PAID_PERMITS_KEY); }
      catch { /* Storage can be unavailable in private contexts. */ }
    },
    remember({ key, token, reference, permitNumber, amount, result, verification }) {
      const kept = list().filter(record => record.token !== token).slice(-(MAX_PAID_PERMITS - 1));
      try { getStorage().setItem(PAID_PERMITS_KEY, JSON.stringify([...kept, { key, token, reference, permitNumber, amount, result, verification }])); }
      catch { /* Without storage the payment is still remembered in memory for this page. */ }
    }
  };
}
