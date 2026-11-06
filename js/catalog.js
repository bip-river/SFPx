import { unprintableCharacters, describeCharacters } from './printable.js';

// The catalog keeps the official "fuelwood" key; visitors see the everyday word.
export const PRODUCT_TYPE_OPTIONS = [
  { id: 'fuelwood', label: 'Firewood', noun: 'firewood', description: 'Cut and gather wood to heat or cook at home.' },
  { id: 'christmas', label: 'Christmas tree', noun: 'Christmas tree', description: 'Cut a tree for the holidays.' },
  { id: 'mushrooms', label: 'Mushrooms', noun: 'mushroom', description: 'Gather morels, chanterelles and more.' }
];

// Only these collection types can use haul tags; a state, office or listing can still decide they are not required.
// Each tag covers this much of the permit's unit: half a cord of firewood, or one tree.
export const HAUL_TAG_UNITS = { fuelwood: 0.5, christmas: 1 };
export const HAUL_TAG_TYPES = Object.keys(HAUL_TAG_UNITS);

// The most specific rule wins: listing, then office, then state. Without a rule, tagged types require tags.
export function haulTagsRequired(type, product, office, state) {
  if (!HAUL_TAG_TYPES.includes(type)) return false;
  for (const rule of [product?.haulTags, office?.haulTags?.[type], state?.haulTags?.[type]]) {
    if (typeof rule === 'boolean') return rule;
  }
  return true;
}

// A quantity that does not divide evenly still needs a tag for its last part.
export function haulTagCount(type, product, office, state, quantity) {
  return haulTagsRequired(type, product, office, state) ? Math.ceil(quantity / HAUL_TAG_UNITS[type] - 1e-9) : 0;
}

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

// Every problem in the catalog, each naming where it is, what is wrong and the value found, so one run of
// npm run check lists everything to fix. Locations read like AK › AK-ANCH › fuelwood[0] ak-anch-fuelwood-01.
export class CatalogError extends Error {
  constructor(problems) {
    super(`The permit catalog has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map(problem => `- ${problem}`).join('\n')}`);
    this.name = 'CatalogError';
    this.problems = problems;
  }
}

const found = value => {
  if (value === undefined) return 'it is missing';
  const text = JSON.stringify(value);
  return `found ${text.length > 60 ? `${text.slice(0, 57)}...` : text}`;
};
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';
const DATE_FORMAT = 'a date like 2026-10-01, or "today", "today+30" or "today-7"';

export function catalogProblems(catalog) {
  const problems = [];
  const report = (where, message) => problems.push(`${where}: ${message}`);
  if (!isRecord(catalog) || !Object.keys(catalog).length) {
    return ['The catalog must be a JSON object with at least one state, like { "AK": { "name": "Alaska", "offices": [] } }.'];
  }
  // Text the permit PDF prints must use characters its font has, or the visitor's permit fails at the last step.
  const printable = (where, field, value) => {
    const characters = unprintableCharacters(value);
    if (characters.length) report(where, `${field} uses ${describeCharacters(characters)}, which the permit PDF cannot print`);
  };
  const text = (where, owner, field, { optional = false } = {}) => {
    const value = owner[field];
    if (optional && value === undefined) return;
    if (!isText(value)) report(where, `${field} must be ${optional ? 'text when present' : 'non-empty text'} (${found(value)})`);
    else printable(where, field, value);
  };
  const docs = (where, owner, field) => {
    const list = owner[field];
    if (list === undefined) return;
    if (!Array.isArray(list)) { report(where, `${field} must be a list of { "label", "url" } links (${found(list)})`); return; }
    list.forEach((doc, index) => {
      const at = `${where} › ${field}[${index}]`;
      if (!isRecord(doc)) { report(at, `each link must be an object with "label" and "url" (${found(doc)})`); return; }
      text(at, doc, 'label');
      if (typeof doc.url !== 'string' || !doc.url.trim()) report(at, `url must be non-empty text (${found(doc.url)})`);
    });
  };
  const tagRules = (where, rules) => {
    if (rules === undefined) return;
    if (!isRecord(rules)) { report(where, `haulTags must be an object like { "fuelwood": false } (${found(rules)})`); return; }
    for (const [type, value] of Object.entries(rules)) {
      if (!HAUL_TAG_TYPES.includes(type)) report(where, `haulTags can only set ${HAUL_TAG_TYPES.join(' or ')} (${found(type)})`);
      else if (typeof value !== 'boolean') report(where, `haulTags.${type} must be true or false (${found(value)})`);
    }
  };
  const productIds = new Map();
  for (const [code, state] of Object.entries(catalog)) {
    if (!/^[A-Z]{2}$/.test(code)) report(code, 'state keys must be two-letter codes like "AK"');
    if (!isRecord(state)) { report(code, `each state must be an object with "name" and "offices" (${found(state)})`); continue; }
    text(code, state, 'name');
    text(code, state, 'description', { optional: true });
    docs(code, state, 'attachments');
    tagRules(code, state.haulTags);
    if (!Array.isArray(state.offices)) { report(code, `offices must be a list (${found(state.offices)})`); continue; }
    const officeIds = new Set();
    state.offices.forEach((office, index) => {
      const officeAt = `${code} › ${typeof office?.id === 'string' && office.id ? office.id : `offices[${index}]`}`;
      if (!isRecord(office)) { report(officeAt, `each office must be an object (${found(office)})`); return; }
      // Office IDs start permit numbers (AK-ANCH-26-048213), so they need the state prefix.
      if (typeof office.id !== 'string' || !new RegExp(`^${code}-[A-Z0-9]{2,8}$`).test(office.id)) report(officeAt, `id must look like ${code}-CODE, with 2 to 8 capital letters or digits after the dash (${found(office.id)})`);
      else if (officeIds.has(office.id)) report(officeAt, `office id ${JSON.stringify(office.id)} is used more than once in ${code}`);
      officeIds.add(office.id);
      text(officeAt, office, 'name');
      text(officeAt, office, 'description', { optional: true });
      docs(officeAt, office, 'attachments');
      tagRules(officeAt, office.haulTags);
      if (!isRecord(office.products)) { report(officeAt, `products must be an object keyed by collection type, like { "fuelwood": [] } (${found(office.products)})`); return; }
      for (const [type, products] of Object.entries(office.products)) {
        const typeAt = `${officeAt} › ${type}`;
        if (!PRODUCT_TYPE_OPTIONS.some(option => option.id === type)) { report(typeAt, `unknown collection type; use ${PRODUCT_TYPE_OPTIONS.map(option => option.id).join(', ')}`); continue; }
        if (!Array.isArray(products)) { report(typeAt, `must be a list of products (${found(products)})`); continue; }
        products.forEach((product, productIndex) => {
          // The list position tells two products with the same ID apart.
          const at = `${typeAt}[${productIndex}]${typeof product?.id === 'string' && product.id ? ` ${product.id}` : ''}`;
          if (!isRecord(product)) { report(at, `each product must be an object (${found(product)})`); return; }
          if (!isText(product.id)) report(at, `id must be non-empty text (${found(product.id)})`);
          else if (productIds.has(product.id)) report(at, `duplicate product id ${JSON.stringify(product.id)}; it is also used at ${productIds.get(product.id)}. Product IDs must be unique across the whole catalog`);
          else productIds.set(product.id, at);
          text(at, product, 'name');
          text(at, product, 'unit');
          const number = (field, rule, ok) => { if (typeof product[field] !== 'number' || !Number.isFinite(product[field]) || !ok(product[field])) report(at, `${field} must be ${rule} (${found(product[field])})`); };
          number('price', 'a number of 0 or more, where 0 means no fee', value => value >= 0);
          number('minQty', 'a number above 0', value => value > 0);
          number('quantityStep', 'a number above 0', value => value > 0);
          number('validForDays', 'a whole number of days above 0', value => Number.isInteger(value) && value > 0);
          if (Number.isFinite(product.minQty)) number('maxQty', `a number of at least minQty (${product.minQty})`, value => value >= product.minQty);
          else number('maxQty', 'a number above 0', value => value > 0);
          const start = parseDate(product.saleStartDate), end = parseDate(product.saleEndDate);
          const dateProblem = (field, value) => RELATIVE_DATE_PATTERN.test(value)
            ? `${field} ${JSON.stringify(value)} was not resolved to a calendar date; pass the catalog through resolveCatalogDates before validating it`
            : `${field} must be ${DATE_FORMAT} (${found(value)})`;
          if (!start) report(at, dateProblem('saleStartDate', product.saleStartDate));
          if (!end) report(at, dateProblem('saleEndDate', product.saleEndDate));
          if (start && end && start > end) report(at, `saleStartDate (${product.saleStartDate}) must not be after saleEndDate (${product.saleEndDate})`);
          if (product.eligibilityRule !== null && product.eligibilityRule !== 'anilca-subsistence') report(at, `eligibilityRule must be null or "anilca-subsistence" (${found(product.eligibilityRule)})`);
          if (product.haulTags !== undefined) {
            if (typeof product.haulTags !== 'boolean') report(at, `haulTags must be true or false (${found(product.haulTags)})`);
            else if (product.haulTags && !HAUL_TAG_TYPES.includes(type)) report(at, `haulTags cannot be true for ${type}; only ${HAUL_TAG_TYPES.join(' and ')} use haul tags`);
          }
          docs(at, product, 'requiredDocs');
        });
      }
    });
  }
  return problems;
}

export function validateCatalog(catalog) {
  const problems = catalogProblems(catalog);
  if (problems.length) throw new CatalogError(problems);
  return catalog;
}

export function getProductKey(product) {
  return product?.id || '';
}
