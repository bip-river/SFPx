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
