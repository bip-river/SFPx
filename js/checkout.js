export const MAX_PAYLOAD_BYTES = 4096;

// randomUUID needs a secure context; getRandomValues also works on plain-HTTP device testing origins.
export function randomId(source = globalThis.crypto) {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Identity is scoped to one immutable checkout snapshot and lives only in memory.
export function createCheckoutIdentity(makeId = randomId) {
  let current = null;
  return {
    referenceFor(snapshot, prefix) {
      const fingerprint = JSON.stringify(snapshot);
      if (!current || current.fingerprint !== fingerprint || current.prefix !== prefix) {
        current = { fingerprint, prefix, reference: `${prefix}-${makeId()}` };
      }
      return current.reference;
    },
    clear() { current = null; }
  };
}

export function readPermitHolder(fields) {
  return {
    firstName: fields.FirstName.value.trim(),
    middleName: fields.MiddleName.value.trim(),
    lastName: fields.LastName.value.trim(),
    addressLine1: fields.AddressLine1.value.trim(),
    addressLine2: fields.AddressLine2.value.trim(),
    city: fields.City.value.trim(),
    state: fields.AddrState.value,
    zip: fields.Zip.value.trim(),
    deliveryEmail: fields.DeliveryEmail.value.trim()
  };
}

export function buildCheckoutPayload({ model, holder, reference, eligibility = null }) {
  const unitPrice = model.product.price;
  const total = unitPrice * model.qty;
  const noFee = unitPrice === 0;
  return {
    idempotencyKey: reference,
    ...(noFee ? { permitReference: reference } : { transactionReference: reference }),
    state: model.state,
    officeId: model.officeId,
    officeName: model.officeName,
    productType: model.productType,
    productId: model.product.id,
    productName: model.product.name,
    unit: model.product.unit,
    unitPrice,
    quantity: model.qty,
    total,
    permitHolder: holder,
    // A certification belongs with any product whose rule requires it, paid or not.
    ...(eligibility ? { eligibility } : noFee ? { eligibility: { certified: false, basis: 'Not required' } } : {}),
    nextStep: noFee
      ? 'Issue permit (no fee) server-side, then present a confirmation page with a download link for the permit PDF.'
      : 'Redirect to Pay.gov, verify payment status server-side, then return to download the permit with this reference.',
    deliveryPlan: noFee
      ? 'Permit is available immediately after confirmation (demo download only; no email is sent).'
      : 'After Pay.gov returns, use the transaction reference to fetch verified payment status. Retries reuse the same checkout identity.',
    serverChecks: { verifyEmailMatch: true, enforcePayloadLimitBytes: MAX_PAYLOAD_BYTES }
  };
}

export function payloadSizeBytes(payload) {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}
