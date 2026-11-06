// Pay.ure's collection API. In production an agency's server calls Pay.ure server to server: it starts a
// collection and gets a token, sends the visitor to Pay.ure with that token, then looks the collection up by
// token to learn whether it was paid. This static demo has no servers, so the collections live in the tab's
// sessionStorage, which both sites can read because they share an origin.
//
// A collection holds what the agency sent (amount, description, its own reference and where to return), any
// declined attempts and, once paid, the tracking ID, the amount paid, the payment method and the last four digits.
// Card and account numbers never are. Status: pending, then success, cancelled or failed (Pay.ure was down).

export const COLLECTIONS_KEY = 'payure-demo-collections';
// Older collections are dropped so the store cannot grow without limit in a long-lived tab.
const MAX_COLLECTIONS = 20;

// Agencies register with Pay.ure in production; returns are allowed only to their registered pages.
export const AGENCIES = {
  'BWL-SFP': { name: 'Bureau of Wandering Lands', service: 'Forest product permits' }
};

export class CollectionError extends Error {}

function randomId(source = globalThis.crypto) {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Tracking IDs avoid 0/O and 1/I so they can be read aloud over the phone.
const TRACKING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function createTrackingId(source = globalThis.crypto) {
  const values = source.getRandomValues(new Uint32Array(10));
  return `PU-${Array.from(values, value => TRACKING_ALPHABET[value % TRACKING_ALPHABET.length]).join('')}`;
}

function sameOrigin(url, base) {
  try { return new URL(url, base).origin === new URL(base).origin; }
  catch { return false; }
}

export function createCollectionStore({ getStorage = () => sessionStorage, location = globalThis.location, makeId = randomId, makeTrackingId = createTrackingId, now = () => new Date() } = {}) {
  // Reading fails quietly: a missing store looks the same as an unknown token.
  function readAll() {
    try {
      const value = JSON.parse(getStorage().getItem(COLLECTIONS_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  // Writing throws, so the agency learns at once that the visitor cannot be sent to pay.
  function writeAll(all) {
    const kept = Object.values(all).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-MAX_COLLECTIONS);
    getStorage().setItem(COLLECTIONS_KEY, JSON.stringify(Object.fromEntries(kept.map(c => [c.token, c]))));
  }
  function update(token, change) {
    const all = readAll();
    const collection = all[token];
    if (!collection) throw new CollectionError(`No collection for token ${token}.`);
    if (collection.status === 'pending') {
      all[token] = { ...collection, ...change(collection) };
      writeAll(all);
    }
    return all[token];
  }

  return {
    // The agency's server call. Returns the token to send the visitor to Pay.ure with.
    startCollection({ agencyId, amount, description, transactionReference, successUrl, cancelUrl }) {
      if (!AGENCIES[agencyId]) throw new CollectionError(`Unknown agency ${agencyId}.`);
      if (!Number.isFinite(amount) || amount <= 0 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) throw new CollectionError(`Amount must be a positive amount in whole cents, not ${amount}.`);
      for (const url of [successUrl, cancelUrl]) {
        if (!sameOrigin(url, location.href)) throw new CollectionError(`Return address ${url} is not registered for ${agencyId}.`);
      }
      const token = makeId();
      const collection = {
        token,
        status: 'pending',
        createdAt: now().toISOString(),
        request: { agencyId, agencyName: AGENCIES[agencyId].name, amount, currency: 'USD', description, transactionReference, successUrl, cancelUrl }
      };
      writeAll({ ...readAll(), [token]: collection });
      return token;
    },

    // The agency's server call on return, and Pay.ure's own lookup when the payment page opens.
    getCollection(token) {
      return (token && readAll()[token]) || null;
    },

    // Paying twice is impossible: a collection that is no longer pending keeps its first outcome.
    // `payment` names the amount actually paid, which the agency checks against what it asked for.
    completeCollection(token, payment) {
      return update(token, () => ({
        status: 'success',
        result: { trackingId: makeTrackingId(), completedAt: now().toISOString(), ...payment }
      }));
    },

    // A declined card or account leaves the collection open, so the visitor can try another.
    recordDecline(token, attempt) {
      return update(token, collection => ({ attempts: [...(collection.attempts || []), { ...attempt, declinedAt: now().toISOString() }] }));
    },

    // Pay.ure could not process the payment. Nothing was charged; the agency starts a new collection to retry.
    failCollection(token, reason) {
      return update(token, () => ({ status: 'failed', result: { reason, failedAt: now().toISOString() } }));
    },

    cancelCollection(token) {
      return update(token, () => ({ status: 'cancelled', result: { cancelledAt: now().toISOString() } }));
    },

    // Where Pay.ure sends the visitor afterward: the agency's own address with the token added.
    returnUrl(collection, outcome) {
      const base = outcome === 'success' ? collection.request.successUrl : collection.request.cancelUrl;
      if (!sameOrigin(base, location.href)) throw new CollectionError(`Return address ${base} is not registered.`);
      const url = new URL(base, location.href);
      url.searchParams.set('token', collection.token);
      return url.href;
    }
  };
}
