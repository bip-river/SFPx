const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LENGTH_LIMITS = {
  FirstName: 50,
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

export function createFieldValidators({ model, permitHolder }) {
  return {
    qty: (el) => quantityError(model.product, el.value),
    FirstName: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter your first name.';
      if (val.length > LENGTH_LIMITS.FirstName) return `First name must be ${LENGTH_LIMITS.FirstName} characters or fewer.`;
      return '';
    },
    LastName: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter your last name.';
      if (val.length > LENGTH_LIMITS.LastName) return `Last name must be ${LENGTH_LIMITS.LastName} characters or fewer.`;
      return '';
    },
    AddressLine1: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter your street address.';
      if (val.length < 5) return 'Enter your full street address.';
      if (val.length > LENGTH_LIMITS.AddressLine1) return `Street address must be ${LENGTH_LIMITS.AddressLine1} characters or fewer.`;
      return '';
    },
    AddressLine2: (el) => {
      const val = (el.value || '').trim();
      if (val && val.length > LENGTH_LIMITS.AddressLine2) return `Apartment, suite or unit must be ${LENGTH_LIMITS.AddressLine2} characters or fewer.`;
      return '';
    },
    City: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter your city.';
      if (val.length < 2) return 'City must be at least 2 letters.';
      if (val.length > LENGTH_LIMITS.City) return `City must be ${LENGTH_LIMITS.City} characters or fewer.`;
      return '';
    },
    AddrState: (el) => ((el.value || '').trim() ? '' : 'Choose your state.'),
    Zip: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter your ZIP code.';
      if (!/^\d{5}(-\d{4})?$/.test(val)) return 'Enter a ZIP code like 99501 or 99501-1234.';
      return '';
    },
    DeliveryEmail: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter your email address.';
      if (!EMAIL_PATTERN.test(val)) return 'Enter an email address like name@example.com.';
      if (val.length > LENGTH_LIMITS.DeliveryEmail) return `Email must be ${LENGTH_LIMITS.DeliveryEmail} characters or fewer.`;
      return '';
    },
    ConfirmEmail: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter your email address again.';
      if (!EMAIL_PATTERN.test(val)) return 'Enter an email address like name@example.com.';
      const primary = (permitHolder.DeliveryEmail.value || '').trim();
      if (primary && primary.toLowerCase() !== val.toLowerCase()) return 'The email addresses must match.';
      if (val.length > LENGTH_LIMITS.ConfirmEmail) return `Email must be ${LENGTH_LIMITS.ConfirmEmail} characters or fewer.`;
      return '';
    }
  };
}
