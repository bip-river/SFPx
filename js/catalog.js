// The catalog keeps the official "fuelwood" key; visitors see the everyday word.
export const PRODUCT_TYPE_OPTIONS = [
  { id: 'fuelwood', label: 'Firewood', noun: 'firewood', description: 'Cut and gather wood to heat or cook at home.' },
  { id: 'christmas', label: 'Christmas tree', noun: 'Christmas tree', description: 'Cut a tree for the holidays.' },
  { id: 'mushrooms', label: 'Mushrooms', noun: 'mushroom', description: 'Gather morels, chanterelles and more.' }
];

export function parseDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
}

export function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const RELATIVE_DATE_PATTERN = /^today(?:([+-])(\d{1,5}))?$/;

// The shipped demo writes sale dates as "today", "today+N" or "today-N" days so the live prototype never expires.
export function resolveDate(value, today = getTodayStart()) {
  const match = typeof value === 'string' ? RELATIVE_DATE_PATTERN.exec(value) : null;
  if (!match) return value;
  const date = new Date(today.getTime());
  date.setDate(date.getDate() + (match[1] === '-' ? -1 : 1) * Number(match[2] || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Runs once at load, before validation, so an open tab still reaches each sale's end date.
export function resolveCatalogDates(catalog, today = getTodayStart()) {
  const resolved = JSON.parse(JSON.stringify(catalog ?? null));
  for (const state of Object.values(resolved && typeof resolved === 'object' ? resolved : {})) {
    for (const office of Array.isArray(state?.offices) ? state.offices : []) {
      for (const products of Object.values(office?.products && typeof office.products === 'object' ? office.products : {})) {
        for (const product of Array.isArray(products) ? products : []) {
          if (!product || typeof product !== 'object') continue;
          product.saleStartDate = resolveDate(product.saleStartDate, today);
          product.saleEndDate = resolveDate(product.saleEndDate, today);
        }
      }
    }
  }
  return resolved;
}

export function isSaleActive(product, today = getTodayStart()) {
  const start = parseDate(product?.saleStartDate);
  const end = parseDate(product?.saleEndDate);
  if (!start || !end || start > end) return false;
  return start <= today && end >= today;
}

export function isSaleComingSoon(product, days = 15, today = getTodayStart()) {
  const start = parseDate(product?.saleStartDate);
  if (!start) return false;
  const endWindow = new Date(today.getTime());
  endWindow.setDate(endWindow.getDate() + days);
  return start > today && start <= endWindow;
}

export function calculatePermitValidity(product, today = getTodayStart()) {
  const validForDays = Number.isFinite(product.validForDays) ? Number(product.validForDays) : 30;
  const startCandidate = parseDate(product.saleStartDate);
  const startDate = (startCandidate && startCandidate > today) ? startCandidate : today;
  const endByDuration = new Date(startDate.getTime());
  endByDuration.setDate(endByDuration.getDate() + validForDays);
  const saleEnd = parseDate(product.saleEndDate);
  const expirationDate = saleEnd ? new Date(Math.min(endByDuration.getTime(), saleEnd.getTime())) : endByDuration;
  const msPerDay = 1000 * 60 * 60 * 24;
  // Both dates are local midnights, so a DST change makes the span an hour off whole days; round, don't ceil.
  const actualDays = Math.max(1, Math.round((expirationDate.getTime() - startDate.getTime()) / msPerDay));
  const shortened = Boolean(saleEnd && saleEnd.getTime() < endByDuration.getTime());
  return { validForDays, expirationDate, startDate, actualDays, shortened };
}

export function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) || !Object.keys(catalog).length) throw new Error('Catalog must contain states.');
  const ids = new Set();
  const checkDocs = (docs = []) => {
    if (!Array.isArray(docs) || docs.some(doc => !doc || typeof doc.label !== 'string' || typeof doc.url !== 'string')) throw new Error('Invalid catalog attachments.');
  };
  for (const [state, data] of Object.entries(catalog)) {
    if (!data || typeof data.name !== 'string' || !Array.isArray(data.offices)) throw new Error(`Invalid state: ${state}`);
    checkDocs(data.attachments);
    const officeIds = new Set();
    for (const office of data.offices) {
      if (!office || typeof office.id !== 'string' || !office.id || officeIds.has(office.id) || typeof office.name !== 'string' || !office.products || typeof office.products !== 'object' || Array.isArray(office.products)) throw new Error(`Invalid office in ${state}`);
      officeIds.add(office.id);
      checkDocs(office.attachments);
      for (const [type, products] of Object.entries(office.products)) {
        if (!PRODUCT_TYPE_OPTIONS.some(option => option.id === type) || !Array.isArray(products)) throw new Error(`Invalid product type: ${office.id}/${type}`);
        for (const product of products) {
          if (!product || typeof product.id !== 'string' || !product.id || ids.has(product.id)) throw new Error(`Missing or duplicate product ID in ${office.id}`);
          ids.add(product.id);
          if (typeof product.name !== 'string' || !product.name.trim() || typeof product.unit !== 'string' || !product.unit.trim()) throw new Error(`Invalid product labels: ${product.id}`);
          if (!Number.isFinite(product.price) || product.price < 0 || !Number.isFinite(product.minQty) || product.minQty <= 0 || !Number.isFinite(product.maxQty) || product.maxQty < product.minQty || !Number.isFinite(product.quantityStep) || product.quantityStep <= 0 || !Number.isInteger(product.validForDays) || product.validForDays <= 0) throw new Error(`Invalid price, quantity or validity: ${product.id}`);
          const start = parseDate(product.saleStartDate), end = parseDate(product.saleEndDate);
          if (!start || !end || start > end) throw new Error(`Invalid sale dates: ${product.id}`);
          if (product.eligibilityRule !== null && product.eligibilityRule !== 'anilca-subsistence') throw new Error(`Unknown eligibility rule: ${product.id}`);
          checkDocs(product.requiredDocs);
        }
      }
    }
  }
  return catalog;
}

export function getProductKey(product) {
  return product?.id || '';
}
