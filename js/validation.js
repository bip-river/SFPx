const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LENGTH_LIMITS = {
  FirstName: 50,
  MiddleName: 50,
  LastName: 50,
  AddressLine1: 120,
  AddressLine2: 120,
  City: 80,
  Zip: 10,
  DeliveryEmail: 120,
  ConfirmEmail: 120,
};

export function quantityError(product, value) {
  if (!product) return 'Choose a product first.';
  if (String(value).trim() === '') return 'Enter a quantity to continue.';
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 'Enter a quantity using numbers only.';
  if (quantity < product.minQty) return `Enter ${product.minQty} or more ${product.unit}(s).`;
  if (quantity > product.maxQty) return `Enter ${product.maxQty} or fewer ${product.unit}(s).`;
  const steps = (quantity - product.minQty) / product.quantityStep;
  if (Math.abs(steps - Math.round(steps)) > 1e-8) return `Enter a quantity in increments of ${product.quantityStep} ${product.unit}(s).`;
  return '';
}

export function createFieldValidators({ model, permitHolder }) {
  return {
    ptypeGroup: () => (model.productType ? '' : 'Select what you are collecting to view available permits.'),
    state: (el) => ((el.value || '').trim() ? '' : 'Choose a state to see offices in that area.'),
    officeInput: () => {
      if (!model.state) return 'Select a state to choose a BWL office.';
      if (!model.officeId) return 'Select a BWL office from the list to continue.';
      return '';
    },
    qty: (el) => quantityError(model.product, el.value),
    FirstName: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter a first name.';
      if (val.length > LENGTH_LIMITS.FirstName) return `First name must be ${LENGTH_LIMITS.FirstName} characters or fewer.`;
      return '';
    },
    MiddleName: (el) => {
      const val = (el.value || '').trim();
      if (val.length > LENGTH_LIMITS.MiddleName) return `Middle name must be ${LENGTH_LIMITS.MiddleName} characters or fewer.`;
      return '';
    },
    LastName: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter a last name.';
      if (val.length > LENGTH_LIMITS.LastName) return `Last name must be ${LENGTH_LIMITS.LastName} characters or fewer.`;
      return '';
    },
    AddressLine1: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter a street address.';
      if (val.length < 5) return 'Enter a full street address (5 characters or more).';
      if (val.length > LENGTH_LIMITS.AddressLine1) return `Street address line 1 must be ${LENGTH_LIMITS.AddressLine1} characters or fewer.`;
      return '';
    },
    AddressLine2: (el) => {
      const val = (el.value || '').trim();
      if (val && val.length > LENGTH_LIMITS.AddressLine2) return `Street address line 2 must be ${LENGTH_LIMITS.AddressLine2} characters or fewer.`;
      return '';
    },
    City: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter a city.';
      if (val.length < 2) return 'City name must be at least 2 letters.';
      if (val.length > LENGTH_LIMITS.City) return `City name must be ${LENGTH_LIMITS.City} characters or fewer.`;
      return '';
    },
    AddrState: (el) => ((el.value || '').trim() ? '' : 'Choose a state.'),
    Zip: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter a ZIP code.';
      if (!/^\d{5}(-\d{4})?$/.test(val)) return 'Enter a ZIP in 5-digit or ZIP+4 format (##### or #####-####).';
      if (val.length > LENGTH_LIMITS.Zip) return `ZIP must be ${LENGTH_LIMITS.Zip} characters or fewer.`;
      return '';
    },
    DeliveryEmail: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Enter an email address for delivery.';
      if (!EMAIL_PATTERN.test(val)) return 'Enter an email in the format name@example.com.';
      if (val.length > LENGTH_LIMITS.DeliveryEmail) return `Email must be ${LENGTH_LIMITS.DeliveryEmail} characters or fewer.`;
      return '';
    },
    ConfirmEmail: (el) => {
      const val = (el.value || '').trim();
      if (!val) return 'Confirm your email address.';
      if (!EMAIL_PATTERN.test(val)) return 'Enter an email in the format name@example.com.';
      const primary = (permitHolder.DeliveryEmail.value || '').trim();
      if (primary && primary.toLowerCase() !== val.toLowerCase()) return 'Confirm email must match the delivery email.';
      if (val.length > LENGTH_LIMITS.ConfirmEmail) return `Email must be ${LENGTH_LIMITS.ConfirmEmail} characters or fewer.`;
      return '';
    }
  };
}
