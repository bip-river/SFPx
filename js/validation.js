import { unprintableMessage } from './printable.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LENGTH_LIMITS = {
  FirstName: 50,
  MiddleName: 50,
  LastName: 50,
  AddressLine1: 120,
  AddressLine2: 120,
  City: 80,
  DeliveryEmail: 120,
  ConfirmEmail: 120,
};

const plural = (product, n) => `${product.unit}${n === 1 ? '' : 's'}`;

export function quantityError(product, value) {
  if (!product) return 'Choose a permit first.';
  if (String(value).trim() === '') return `Enter how many ${plural(product, 2)} you need.`;
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 'Enter the quantity using numbers only.';
  if (quantity < product.minQty) return `Enter ${product.minQty} or more ${plural(product, product.minQty)}.`;
  if (quantity > product.maxQty) return `Enter ${product.maxQty} or fewer ${plural(product, product.maxQty)}.`;
  const steps = (quantity - product.minQty) / product.quantityStep;
  if (Math.abs(steps - Math.round(steps)) > 1e-8) return `Enter a quantity in steps of ${product.quantityStep} ${plural(product, product.quantityStep)}.`;
  return '';
}

// Checks run in this order: missing, unprintable on the permit, too short, too long. `label` starts each message.
function textRule({ label, required = '', min = 0, tooShort = '', max }) {
  return (el) => {
    const val = (el.value || '').trim();
    if (!val) return required;
    const unprintable = unprintableMessage(label, val);
    if (unprintable) return unprintable;
    if (val.length < min) return tooShort;
    if (val.length > max) return `${label} must be ${max} characters or fewer.`;
    return '';
  };
}

// Field labels as visitors see them; messages and the PDF fallback both use these names.
export const FIELD_LABELS = {
  FirstName: 'First name',
  MiddleName: 'Middle name',
  LastName: 'Last name',
  AddressLine1: 'Street address',
  AddressLine2: 'Apartment, suite or unit',
  City: 'City',
  AddrState: 'State',
  Zip: 'ZIP code',
  DeliveryEmail: 'Email',
  ConfirmEmail: 'Confirm email',
};

function emailRule(id, required) {
  return (el) => {
    const val = (el.value || '').trim();
    if (!val) return required;
    if (!EMAIL_PATTERN.test(val)) return 'Enter an email address like name@example.com.';
    // The delivery email is printed on the permit; the confirmation must only match it.
    if (id === 'DeliveryEmail') {
      const unprintable = unprintableMessage(FIELD_LABELS.DeliveryEmail, val);
      if (unprintable) return unprintable;
    }
    if (val.length > LENGTH_LIMITS[id]) return `Email must be ${LENGTH_LIMITS[id]} characters or fewer.`;
    return '';
  };
}

export function createFieldValidators({ model, permitHolder }) {
  const confirmEmail = emailRule('ConfirmEmail', 'Enter your email address again.');
  return {
    qty: (el) => quantityError(model.product, el.value),
    FirstName: textRule({ label: FIELD_LABELS.FirstName, required: 'Enter your first name.', max: LENGTH_LIMITS.FirstName }),
    MiddleName: textRule({ label: FIELD_LABELS.MiddleName, max: LENGTH_LIMITS.MiddleName }),
    LastName: textRule({ label: FIELD_LABELS.LastName, required: 'Enter your last name.', max: LENGTH_LIMITS.LastName }),
    AddressLine1: textRule({ label: FIELD_LABELS.AddressLine1, required: 'Enter your street address.', min: 5, tooShort: 'Enter your full street address.', max: LENGTH_LIMITS.AddressLine1 }),
    AddressLine2: textRule({ label: FIELD_LABELS.AddressLine2, max: LENGTH_LIMITS.AddressLine2 }),
    City: textRule({ label: FIELD_LABELS.City, required: 'Enter your city.', min: 2, tooShort: 'City must be at least 2 letters.', max: LENGTH_LIMITS.City }),
    AddrState: (el) => ((el.value || '').trim() ? '' : 'Choose your state.'),
    Zip: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter your ZIP code.';
      if (!/^\d{5}(-\d{4})?$/.test(val)) return 'Enter a ZIP code like 99501 or 99501-1234.';
      return '';
    },
    DeliveryEmail: emailRule('DeliveryEmail', 'Enter your email address.'),
    ConfirmEmail: (el) => {
      const message = confirmEmail(el);
      if (message) return message;
      const val = el.value.trim();
      const primary = (permitHolder.DeliveryEmail.value || '').trim();
      if (primary && primary.toLowerCase() !== val.toLowerCase()) return 'The email addresses must match.';
      return '';
    }
  };
}
