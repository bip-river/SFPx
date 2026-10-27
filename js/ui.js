import { PRODUCT_TYPE_OPTIONS, calculatePermitValidity } from './catalog.js';
import { sanitizeUrl } from './links.js';

const DOCS_BY_PRODUCT_TYPE = {
  fuelwood: [{ label: 'How to Measure Fuelwood', url: '#' }],
  christmas: [{ label: 'Planning Your Trip', url: '#' }],
  mushrooms: [{ label: 'Foraging Guidelines', url: '#' }]
};

// Constant markup only; nothing from the catalog or the visitor is inserted here.
const TYPE_ICONS = {
  fuelwood: '<circle cx="7.5" cy="16.5" r="3.6"/><circle cx="16.5" cy="16.5" r="3.6"/><circle cx="12" cy="9.2" r="3.6"/><circle cx="7.5" cy="16.5" r="1.2"/><circle cx="16.5" cy="16.5" r="1.2"/><circle cx="12" cy="9.2" r="1.2"/>',
  christmas: '<path d="M12 2.8l4.6 5.6h-2.6l3.9 4.9h-2.7l3.6 4.6H5.2l3.6-4.6H6.1l3.9-4.9H7.4z"/><path d="M12 17.9v3.3"/>',
  mushrooms: '<path d="M3.5 11.5a8.5 7 0 0 1 17 0z"/><path d="M9.6 11.5v6.3a2.4 2.4 0 0 0 4.8 0v-6.3"/><circle cx="9" cy="7.8" r="0.9"/><circle cx="14.6" cy="6.9" r="0.9"/>'
};

export function money(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function feeLabelForUnit(unitPrice, unit) {
  return unitPrice === 0 ? 'No fee' : `${money(unitPrice)} per ${unit}`;
}

export function totalLabelFor(unitPrice, total) {
  return unitPrice === 0 ? 'No fee' : money(total);
}

export function unitLabel(unit, n) {
  return `${unit}${n === 1 ? '' : 's'}`;
}

export function quantityLabel(product, n) {
  return `${n} ${unitLabel(product.unit, n)}`;
}

export function quantityRangeLabel(p) {
  if (p.minQty === p.maxQty) return quantityLabel(p, p.minQty);
  if (p.minQty === 1) return `Up to ${quantityLabel(p, p.maxQty)}`;
  return `${p.minQty} to ${quantityLabel(p, p.maxQty)}`;
}

// Catalog names repeat the collection type ("Fuelwood Permit — Anchorage North"); the screen already says it.
export function shortProductName(p) {
  const name = p?.name || '';
  const separator = name.indexOf(' — ');
  return (separator === -1 ? name : name.slice(separator + 3)).replace(/\s*\(No fee\)$/i, '');
}

export function formatDate(isoOrDate) {
  if (!isoOrDate) return '';
  const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate + 'T00:00:00');
  // Fixed to en-US: the page is English, and the demo PDF's embedded font cannot render every locale's date characters.
  return d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}

export function validityText(product) {
  if (!product) return '';
  const { validForDays, expirationDate, actualDays, shortened } = calculatePermitValidity(product);
  const days = shortened ? actualDays : validForDays;
  return `Valid for ${days} day${days === 1 ? '' : 's'}, until ${formatDate(expirationDate)}`;
}

function typeIcon(id) {
  const icon = document.createElement('span');
  icon.className = 'option-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${TYPE_ICONS[id] || ''}</svg>`;
  return icon;
}

// One selectable card: the radio is named by its title and described by the other lines.
export function buildOption({ name, id, value, title, sub = '', aside = '', icon = null }) {
  const card = document.createElement('div');
  card.className = 'option';
  const label = document.createElement('label');
  label.className = 'option-label';
  label.htmlFor = id;
  const input = document.createElement('input');
  input.type = 'radio';
  input.className = 'option-input';
  input.name = name;
  input.id = id;
  input.value = value;
  input.setAttribute('aria-labelledby', `${id}_name`);
  label.appendChild(input);
  if (icon) label.appendChild(icon);

  const text = document.createElement('span');
  text.className = 'option-text';
  const titleEl = document.createElement('span');
  titleEl.className = 'option-title';
  titleEl.id = `${id}_name`;
  titleEl.textContent = title;
  text.appendChild(titleEl);
  const described = [];
  if (sub) {
    const subEl = document.createElement('span');
    subEl.className = 'option-sub';
    subEl.id = `${id}_sub`;
    subEl.textContent = sub;
    text.appendChild(subEl);
    described.push(subEl.id);
  }
  label.appendChild(text);
  if (aside) {
    const asideEl = document.createElement('span');
    asideEl.className = 'option-aside';
    asideEl.id = `${id}_price`;
    asideEl.textContent = aside;
    label.appendChild(asideEl);
    described.unshift(asideEl.id);
  }
  if (described.length) input.setAttribute('aria-describedby', described.join(' '));
  card.appendChild(label);
  return { card, input };
}

// Cards style the checked option with :has(); this class covers browsers without it.
export function syncSelectedOptions(container) {
  container.querySelectorAll('.option').forEach((card) => {
    card.classList.toggle('is-selected', Boolean(card.querySelector('.option-input')?.checked));
  });
}

export function renderProductTypes(container, onChange) {
  container.replaceChildren();
  return PRODUCT_TYPE_OPTIONS.map((type) => {
    const { card, input } = buildOption({
      name: 'ptype', id: `ptype_${type.id}`, value: type.id,
      title: type.label, sub: type.description, icon: typeIcon(type.id)
    });
    input.required = true;
    input.addEventListener('change', () => onChange(type.id));
    container.appendChild(card);
    return input;
  });
}

export function buildDocLinks(docs = [], productName = '') {
  const details = document.createElement('details');
  details.className = 'disclosure docs';
  const summary = document.createElement('summary');
  summary.textContent = 'Maps and rules for this permit';
  // Screen reader users moving between permits need to hear which one these documents belong to.
  if (productName) {
    const context = document.createElement('span');
    context.className = 'sr-only';
    context.textContent = ` (${productName})`;
    summary.appendChild(context);
  }
  details.appendChild(summary);

  const list = document.createElement('ul');
  list.className = 'link-list';
  docs.forEach((doc) => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = sanitizeUrl(doc.url);
    link.textContent = doc.label;
    li.appendChild(link);
    list.appendChild(li);
  });
  details.appendChild(list);
  return details;
}

export function buildRequiredDocs(product, productType, locationDocs = []) {
  const base = [
    { label: 'Map', url: '#' },
    { label: 'Stipulations', url: '#' }
  ];
  const typed = DOCS_BY_PRODUCT_TYPE[productType] || [];
  const all = [...(product.requiredDocs || []), ...locationDocs, ...base, ...typed];
  // De-dupe by a stable key. Label-only de-duping can drop distinct docs that share a name.
  const seen = new Set();
  return all.filter((doc) => {
    const label = (doc.label || '').trim().toLowerCase();
    const url = (doc.url || '').trim();
    const key = `${label}|${url}`;
    if (!label) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function renderPayload(container, payload, { note }) {
  const value = document.createElement('pre');
  value.className = 'payload-content';
  value.textContent = JSON.stringify(payload, null, 2);
  const explanation = document.createElement('p');
  explanation.className = 'hint';
  explanation.textContent = note;
  container.replaceChildren(explanation, value);
}
