import { PRODUCT_TYPE_OPTIONS, parseDate, calculatePermitValidity } from './catalog.js';
import { sanitizeUrl } from './links.js';

const DOCS_BY_PRODUCT_TYPE = {
  fuelwood: [{ label: 'How to Measure Fuelwood', url: '#' }],
  christmas: [{ label: 'Planning Your Trip', url: '#' }],
  mushrooms: [{ label: 'Foraging Guidelines', url: '#' }]
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

export function formatDate(isoOrDate) {
  if (!isoOrDate) return '';
  const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}

export function getAvailableUntilLabel(product) {
  const endDate = parseDate(product?.saleEndDate);
  if (!endDate) return 'Available until —';
  return `Available until ${formatDate(endDate)}`;
}

export function getValidityLine(product) {
  if (!product) {
    return 'Valid — • Expires —';
  }

  const { validForDays, expirationDate, actualDays, shortened } = calculatePermitValidity(product);
  const durationDays = shortened ? actualDays : validForDays;
  return `Valid ${durationDays} day${durationDays === 1 ? '' : 's'} • Expires ${formatDate(expirationDate)}`;
}

export function getValidityLabels(product) {
  if (!product) {
    return { durationLabel: 'Valid —', expirationLabel: 'Expires —' };
  }

  const { validForDays, expirationDate, actualDays, shortened } = calculatePermitValidity(product);
  const durationDays = shortened ? actualDays : validForDays;
  return {
    durationLabel: `Valid ${durationDays} day${durationDays === 1 ? '' : 's'}`,
    expirationLabel: `Expires ${formatDate(expirationDate)}`
  };
}

export function buildProductAlert(message) {
  const alert = document.createElement('div');
  alert.className = 'alert';
  alert.setAttribute('role', 'status');
  alert.setAttribute('aria-live', 'polite');
  const icon = document.createElement('div');
  icon.className = 'icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'i';
  const txt = document.createElement('div');
  txt.className = 'txt';
  const strong = document.createElement('strong');
  strong.textContent = 'Nothing to select';
  const msgNode = document.createElement('div');
  msgNode.textContent = message;
  txt.appendChild(strong);
  txt.appendChild(msgNode);
  alert.appendChild(icon);
  alert.appendChild(txt);
  return alert;
}

export function buildDocLinks(docs = []) {
  const details = document.createElement('details');
  details.className = 'docs';
  const summary = document.createElement('summary');
  summary.className = 'docs-action';
  summary.setAttribute('aria-label', 'Maps and permit rules');
  const summaryTitle = document.createElement('span');
  summaryTitle.className = 'docs-title';
  summaryTitle.textContent = 'Maps & permit rules';
  const summaryText = document.createElement('span');
  summaryText.className = 'docs-text';
  summaryText.appendChild(summaryTitle);
  summary.appendChild(summaryText);
  details.appendChild(summary);

  const docsWrap = document.createElement('div');
  docsWrap.className = 'doc-links';

  if (!docs.length) {
    const empty = document.createElement('div');
    empty.className = 'doc-empty';
    empty.textContent = 'No additional documents for this permit.';
    docsWrap.appendChild(empty);
  } else {
    docs.forEach((doc) => {
      const link = document.createElement('a');
      link.href = sanitizeUrl(doc.url);
      link.textContent = doc.label;
      link.addEventListener('click', (event) => event.stopPropagation());
      docsWrap.appendChild(link);
    });
  }

  details.appendChild(docsWrap);
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

export function renderProductTypes(productTypeOptions, onChange) {
  if (!productTypeOptions) return [];
  productTypeOptions.innerHTML = '';
  PRODUCT_TYPE_OPTIONS.forEach((type) => {
    const label = document.createElement('label');
    label.className = 'ptype-card';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'ptype';
    input.value = type.id;
    input.required = true;
    label.appendChild(input);

    const body = document.createElement('div');
    body.className = 'ptype-card-body';

    const img = document.createElement('img');
    img.src = `images/${type.image}`;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    const name = document.createElement('div');
    name.className = 'ptype-card-name';
    name.textContent = type.label;

    body.appendChild(img);
    body.appendChild(name);
    label.appendChild(body);

    productTypeOptions.appendChild(label);
  });

  const productTypeRadios = Array.from(productTypeOptions.querySelectorAll('input[name="ptype"]'));
  productTypeRadios.forEach((radio) => {
    radio.addEventListener('change', () => onChange(radio.value));
  });
  return productTypeRadios;
}

export function buildProductCard(p, idx, { docs, onSelect }) {
  const id = `prod_${idx}`;
  const priceLine = feeLabelForUnit(p.price, p.unit);
  const validityLine = getValidityLine(p);
  const availableUntil = getAvailableUntilLabel(p);

  const card = document.createElement('div');
  card.className = 'prod';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'product';
  input.id = id;
  input.value = String(idx);
  input.className = 'prod-radio';

  const body = document.createElement('div');
  body.className = 'prod-body';
  const header = document.createElement('label');
  header.className = 'prod-header';
  header.htmlFor = id;
  const headerLeft = document.createElement('div');
  headerLeft.className = 'prod-header-left';
  headerLeft.appendChild(input);
  const info = document.createElement('div');
  info.className = 'prod-info';
  const name = document.createElement('div');
  name.className = 'name';
  name.id = `${id}_name`;
  input.setAttribute('aria-labelledby', name.id);
  input.setAttribute('aria-describedby', `${id}_validity ${id}_availability`);
  name.textContent = p.name;
  info.appendChild(name);
  headerLeft.appendChild(info);
  const price = document.createElement('div');
  price.className = 'price';
  price.textContent = priceLine;
  header.appendChild(headerLeft);
  header.appendChild(price);

  const validity = document.createElement('div');
  validity.className = 'validity';
  validity.id = `${id}_validity`;
  validity.textContent = validityLine;

  const availability = document.createElement('div');
  availability.className = 'availability';
  availability.id = `${id}_availability`;
  availability.textContent = availableUntil;

  const docsDiv = buildDocLinks(docs);

  [header, validity, availability, docsDiv].forEach((node) => body.appendChild(node));
  card.appendChild(body);

  input.addEventListener('change', onSelect);

  return card;
}

export function renderPayload(container, payload, { title, note }) {
  container.style.display = 'block';
  container.className = 'summary';
  container.replaceChildren();
  const key = document.createElement('div');
  key.className = 'k';
  key.textContent = title;
  const value = document.createElement('pre');
  value.className = 'v payload-content';
  value.textContent = JSON.stringify(payload, null, 2);
  const explanation = document.createElement('div');
  explanation.className = 'k payload-note';
  explanation.textContent = note;
  container.append(key, value, explanation);
}
