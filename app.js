import { PRODUCT_TYPE_OPTIONS, validateCatalog, resolveCatalogDates, getProductKey, isSaleActive, isSaleComingSoon, parseDate, getTodayStart, calculatePermitValidity, haulTagCount, HAUL_TAG_UNITS } from './js/catalog.js';
import { sanitizeUrl } from './js/links.js';
import { createFieldValidators, quantityError } from './js/validation.js';
import { getProductEligibility, productRequiresEligibility } from './js/eligibility.js';
import { createSelectionStorage } from './js/state.js';
import { MAX_PAYLOAD_BYTES, createCheckoutIdentity, readPermitHolder, buildCheckoutPayload, payloadSizeBytes } from './js/checkout.js';
import { buildPermitPackagePdf } from './js/permit-pdf.js';
import { TYPE_DOCUMENTS, AREA_DOCUMENTS, documentIdFromUrl } from './js/permit-documents.js';
import { renderProductTypes, buildOption, syncSelectedOptions, money, feeLabelForUnit, totalLabelFor, unitLabel, quantityLabel, quantityRangeLabel, shortProductName, formatDate, validityText, buildDocLinks, buildRequiredDocs, buildDocumentLink, renderPayload } from './js/ui.js';

// A start page, then one question per screen. "done" follows the five numbered steps once a permit has been prepared.
const SCREENS = ['start', 'what', 'where', 'permit', 'details', 'review', 'done'];
const STEP_COUNT = 5;
const AGENCY = 'Bureau of Wandering Lands';
const SERVICE_TITLE = `Forest product permit | ${AGENCY}`;
const CATALOG_SOURCE = 'products.json';
const COMING_SOON_DAYS = 15;
const LOAD_ERROR = 'We could not load available permits right now. Refresh the page to try again.';

let catalogData = {};
let catalogReady = false;
let restoring = false;
const selectionStorage = createSelectionStorage();
const byId = id => document.getElementById(id);

// Banner toggle
const bannerToggle = byId('bannerToggle');
const bannerDetails = byId('bannerDetails');
bannerToggle.addEventListener('click', () => {
  const open = bannerToggle.getAttribute('aria-expanded') === 'true';
  bannerDetails.hidden = open;
  bannerToggle.setAttribute('aria-expanded', String(!open));
});

// Elements
const screens = Object.fromEntries(SCREENS.map(name => [name, byId(`screen-${name}`)]));
const startButton = byId('startButton');
const screenTop = byId('screenTop');
const backLink = byId('backLink');
const stepCount = byId('stepCount');
const progressBar = byId('progressBar');
const errorBox = byId('errorBox');
const errorList = byId('errorList');
const stepLiveRegion = byId('stepLiveRegion');

const productTypeGroup = byId('ptypeGroup');
const productTypeOptions = byId('ptypeOptions');
let productTypeRadios = [];

const stateEl = byId('state');
const noAreas = byId('noAreas');
const areaGroup = byId('areaGroup');
const areaOptions = byId('areaOptions');
const locationNotice = byId('locationNotice');
const locationNoticeBody = byId('locationNoticeBody');

const permitLede = byId('permitLede');
const noProducts = byId('noProducts');
const productGroup = byId('productGroup');
const productListEl = byId('productList');
const qtyPanel = byId('qtyPanel');
const qtyEl = byId('qty');
const qtyLabel = byId('qtyLabel');
const qtyHint = byId('qtyHint');
const qtyDec = byId('qtyDec');
const qtyInc = byId('qtyInc');
const totalAmount = byId('totalAmount');
const totalFor = byId('totalFor');
const qtyValidity = byId('qtyValidity');
const qtyDocs = byId('qtyDocs');
const comingSoonSection = byId('comingSoonSection');
const comingSoonList = byId('comingSoonList');

const reviewTitle = byId('reviewTitle');
const reviewSummary = byId('reviewSummary');
const eligibilityAgreement = byId('eligibilityAgreement');
const ackEligibility = byId('ackEligibility');
const eligibilityLabel = byId('eligibilityLabel');
const eligibilityBody = byId('eligibilityBody');
const agreeEl = byId('agree');
const confirmPaygovBtn = byId('confirmPaygov');
const payNote = byId('payNote');
const resetAllBtn = byId('resetAll');

const doneNote = byId('doneNote');
const permitCard = byId('permitCard');
const permitDownloadBtn = byId('permitDownloadBtn');
const packageHint = byId('packageHint');
const nextStepsList = byId('nextStepsList');
const handoff = byId('handoff');
const startAnotherBtn = byId('startAnother');

// Permit holder fields
const permitHolder = {
  FirstName: byId('FirstName'),
  MiddleName: byId('MiddleName'),
  LastName: byId('LastName'),
  AddressLine1: byId('AddressLine1'),
  AddressLine2: byId('AddressLine2'),
  City: byId('City'),
  AddrState: byId('AddrState'),
  Zip: byId('Zip'),
  DeliveryEmail: byId('DeliveryEmail'),
  ConfirmEmail: byId('ConfirmEmail'),
};

// Last committed value per field, so unchanged change/blur events do not discard a prepared permit.
const lastValues = new WeakMap([...Object.values(permitHolder), qtyEl].map(el => [el, el.value]));

// Model
const model = {
  productType: '',
  state: '',
  officeId: '',
  officeName: '',
  productKey: '',
  product: null,
  qty: 0
};

let currentScreen = 'what';
// Set by the review screen's Change links so Continue can return there once everything is complete again.
let returnToReview = false;

const checkoutIdentity = createCheckoutIdentity();
let checkoutRevision = 0;
let checkoutPending = false;
// The permit package prepared for the current entries: { reference, permitNumber, url, payload, noFee, pageCount, tagCount }.
let issued = null;

function clearIssued() {
  if (issued?.url) {
    try { URL.revokeObjectURL(issued.url); } catch (err) { /* no-op */ }
  }
  issued = null;
  permitDownloadBtn.disabled = true;
  handoff.replaceChildren();
}

function invalidateCheckout() {
  checkoutRevision += 1;
  clearIssued();
  checkoutIdentity.clear();
  selectionStorage.clearLegacyTransaction();
}

function typeOption(id = model.productType) {
  return PRODUCT_TYPE_OPTIONS.find(t => t.id === id) || null;
}

function stateName(code = model.state) {
  return catalogData[code]?.name || code || '';
}

function persistState() {
  if (restoring) return;
  selectionStorage.write({
    model: {
      productType: model.productType,
      state: model.state,
      officeId: model.officeId,
      officeName: model.officeName,
      productKey: model.productKey,
      qty: model.qty
    }
  });
}

function restoreState() {
  const saved = selectionStorage.read()?.model;
  if (!saved || typeof saved !== 'object') return;

  setProductType(saved.productType || saved.ptype || '');
  if (!model.productType) return;
  if (catalogData[saved.state]) {
    model.state = saved.state;
    stateEl.value = saved.state;
  }

  const office = officesFor(model.state).find(o => o.id === saved.officeId);
  if (!office) return;
  model.officeId = office.id;
  model.officeName = office.name;

  // Only an active product with the saved ID is restored; old index-only selections are ignored.
  const product = saved.productKey ? getProductsForSelection().find(p => getProductKey(p) === saved.productKey) : null;
  if (!product) return;
  model.product = product;
  model.productKey = getProductKey(product);
  configureQuantity(product);
  qtyEl.value = String(saved.qty && !quantityError(product, saved.qty) ? saved.qty : product.minQty);
  lastValues.set(qtyEl, qtyEl.value);
  updateTotal();
}

function setProductType(value) {
  model.productType = productTypeRadios.some(r => r.value === value) ? value : '';
  productTypeRadios.forEach(r => { r.checked = r.value === model.productType; });
  syncSelectedOptions(productTypeOptions);
}

function clearOffice() {
  model.officeId = '';
  model.officeName = '';
}

function clearProduct() {
  model.product = null;
  model.productKey = '';
  model.qty = 0;
  qtyEl.value = '';
  lastValues.set(qtyEl, '');
  setFieldError(qtyEl, '');
  productGroup.after(qtyPanel);
  qtyPanel.hidden = true;
  ackEligibility.checked = false;
  setFieldError(ackEligibility, '');
}

// Populate state dropdown
function populateStates() {
  // Keep the first placeholder option, remove any prior dynamic options.
  while (stateEl.options.length > 1) stateEl.remove(1);
  const codes = Object.keys(catalogData).sort((a, b) => catalogData[a].name.localeCompare(catalogData[b].name));
  for (const code of codes) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = catalogData[code].name;
    stateEl.appendChild(opt);
  }
}

// Address state select
function populateUSStates(selectEl) {
  const states = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],
    ['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],
    ['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],
    ['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],
    ['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
    ['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],
    ['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
  ];
  selectEl.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Select';
  selectEl.appendChild(blank);
  for (const [code, name] of states) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    selectEl.appendChild(opt);
  }
}

async function loadProductData() {
  try {
    const res = await fetch(CATALOG_SOURCE);
    if (!res.ok) throw new Error('Unable to load product catalog.');
    const json = await res.json();

    catalogData = validateCatalog(resolveCatalogDates(json));
    catalogReady = true;
    populateStates();
  } catch (err) {
    console.error(err);
    catalogReady = false;
    stateEl.disabled = true;
    showErrors([LOAD_ERROR]);
  }
}

// Areas are BWL offices that have a permit of the chosen type on sale or coming soon.
function officesFor(code, type = model.productType) {
  return (catalogData[code]?.offices || []).filter(office => (office.products?.[type] || []).some(p => isSaleActive(p) || isSaleComingSoon(p, COMING_SOON_DAYS)));
}

function getSelectedOffice() {
  return officesFor(model.state).find(o => o.id === model.officeId) || null;
}

function getProductsForSelection({ includeInactive = false } = {}) {
  const office = getSelectedOffice();
  if (!office || !model.productType) return [];
  const products = office.products?.[model.productType] || [];
  if (includeInactive) return products;
  return products.filter(p => isSaleActive(p));
}

function getLocationAttachments() {
  const stateDocs = catalogData[model.state]?.attachments || [];
  const officeDocs = getSelectedOffice()?.attachments || [];
  return [...stateDocs, ...officeDocs];
}

function buildLinkList(docs) {
  const list = document.createElement('ul');
  list.className = 'link-list';
  docs.forEach((doc) => {
    const li = document.createElement('li');
    li.appendChild(buildDocumentLink(doc));
    list.appendChild(li);
  });
  return list;
}

// Firewood tags each cover half a cord; Christmas tree tags one tree.
const TAG_EACH = { fuelwood: 'half cord', christmas: 'tree' };
const TAG_QUANTITY = { fuelwood: '½ cord', christmas: '1 tree' };

function currentTagCount() {
  return haulTagCount(model.productType, model.product, getSelectedOffice(), catalogData[model.state], model.qty);
}

function tagSummary(count) {
  if (count) return `Includes ${count} haul tag${count === 1 ? '' : 's'}, one for each ${TAG_EACH[model.productType]}`;
  return HAUL_TAG_UNITS[model.productType] ? 'No haul tags needed for this permit' : '';
}

function noAreasMessage() {
  return `No areas in ${stateName()} sell ${typeOption()?.noun || ''} permits online right now. Choose another state, or contact a local BWL office.`;
}

function renderAreas() {
  const offices = model.state ? officesFor(model.state) : [];
  noAreas.hidden = !model.state || offices.length > 0;
  if (!noAreas.hidden) noAreas.textContent = noAreasMessage();
  areaGroup.hidden = offices.length === 0;
  areaOptions.replaceChildren();
  offices.forEach((office, idx) => {
    const products = office.products[model.productType] || [];
    const active = products.filter(p => isSaleActive(p)).length;
    const soon = products.filter(p => isSaleComingSoon(p, COMING_SOON_DAYS)).length;
    const sub = [active ? `${active} permit${active === 1 ? '' : 's'} online` : '', soon ? `${soon} opening soon` : ''].filter(Boolean).join(' · ');
    const { card, input } = buildOption({ name: 'office', id: `office_${idx}`, value: office.id, title: office.name, sub });
    input.required = true;
    input.checked = office.id === model.officeId;
    input.addEventListener('change', () => selectOffice(office));
    areaOptions.appendChild(card);
  });
  syncSelectedOptions(areaOptions);
}

function renderLocationNotice() {
  const descriptions = [catalogData[model.state]?.description, getSelectedOffice()?.description].filter(Boolean);
  const docs = getLocationAttachments();
  locationNoticeBody.replaceChildren();
  locationNotice.hidden = !model.state || (!descriptions.length && !docs.length);
  descriptions.forEach((text) => {
    const p = document.createElement('p');
    p.textContent = text;
    locationNoticeBody.appendChild(p);
  });
  if (docs.length) locationNoticeBody.appendChild(buildLinkList(docs));
}

function selectOffice(office) {
  if (office.id === model.officeId) return;
  model.officeId = office.id;
  model.officeName = office.name;
  clearProduct();
  invalidateCheckout();
  setFieldError(areaGroup, '');
  syncSelectedOptions(areaOptions);
  renderLocationNotice();
  persistState();
}

function renderComingSoon(products) {
  comingSoonList.replaceChildren();
  comingSoonSection.hidden = !products.length;
  products.forEach((p) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'coming-soon-name';
    name.textContent = shortProductName(p);
    const date = document.createElement('span');
    date.className = 'coming-soon-date';
    const startDate = parseDate(p.saleStartDate);
    date.textContent = startDate ? `Opens ${formatDate(startDate)}` : 'Opening date to be announced';
    li.append(name, date);
    comingSoonList.appendChild(li);
  });
}

function renderProducts() {
  const all = getProductsForSelection({ includeInactive: true });
  const products = all.filter(p => isSaleActive(p));
  // An open tab can cross a sale's end date; the expired selection must go.
  if (model.product && !products.includes(model.product)) clearProduct();

  permitLede.textContent = `${typeOption()?.label || ''} at ${model.officeName}, ${stateName()}.`;
  noProducts.hidden = products.length > 0;
  noProducts.textContent = `No ${typeOption()?.noun || ''} permits are on sale here right now. Go back to choose another area.`;
  productGroup.hidden = !products.length;

  // Park the quantity panel before the cards are replaced so it is not discarded with them.
  productGroup.after(qtyPanel);
  productListEl.replaceChildren();
  products.forEach((p, idx) => {
    const eligibility = getProductEligibility(p);
    const { card, input } = buildOption({
      name: 'product', id: `prod_${idx}`, value: p.id,
      title: shortProductName(p),
      sub: [quantityRangeLabel(p), eligibility?.summary].filter(Boolean).join(' · '),
      aside: feeLabelForUnit(p.price, p.unit)
    });
    input.required = true;
    if (p === model.product) {
      input.checked = true;
      card.appendChild(qtyPanel);
    }
    input.addEventListener('change', () => selectProduct(p, card));
    productListEl.appendChild(card);
  });
  qtyPanel.hidden = !model.product;
  syncSelectedOptions(productListEl);
  renderComingSoon(all.filter(p => isSaleComingSoon(p, COMING_SOON_DAYS)));
}

function configureQuantity(p) {
  const units = unitLabel(p.unit, 2);
  qtyLabel.textContent = `How many ${units}?`;
  qtyHint.textContent = quantityRangeLabel(p);
  qtyEl.min = p.minQty;
  qtyEl.max = p.maxQty;
  qtyEl.step = p.quantityStep;
  qtyEl.inputMode = Number.isInteger(p.quantityStep) && Number.isInteger(p.minQty) ? 'numeric' : 'decimal';
  qtyDec.setAttribute('aria-label', `Fewer ${units}`);
  qtyInc.setAttribute('aria-label', `More ${units}`);
  qtyValidity.textContent = validityText(p);
  qtyDocs.replaceChildren(buildDocLinks(buildRequiredDocs(p, model.productType), shortProductName(p)));
  renderEligibilityAgreement(p);
}

function selectProduct(p, card) {
  invalidateCheckout();
  model.product = p;
  model.productKey = getProductKey(p);
  card.appendChild(qtyPanel);
  qtyPanel.hidden = false;
  configureQuantity(p);
  qtyEl.value = String(p.minQty);
  lastValues.set(qtyEl, qtyEl.value);
  ackEligibility.checked = false;
  setFieldError(ackEligibility, '');
  setFieldError(qtyEl, '');
  setFieldError(productGroup, '');
  syncSelectedOptions(productListEl);
  updateTotal();
  persistState();
}

// Rewriting a live region with identical text can make screen readers repeat it.
function setLiveText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function updateTotal() {
  const p = model.product;
  const valid = Boolean(p) && !quantityError(p, qtyEl.value);
  model.qty = valid ? Number(qtyEl.value) : 0;
  setLiveText(totalFor, valid ? ` for ${quantityLabel(p, model.qty)}` : '');
  setLiveText(totalAmount, valid ? totalLabelFor(p.price, p.price * model.qty) : '—');
  // aria-disabled keeps the buttons focusable, so reaching a limit does not drop keyboard focus.
  const current = Number(qtyEl.value);
  qtyDec.setAttribute('aria-disabled', String(!p || (valid && current <= p.minQty)));
  qtyInc.setAttribute('aria-disabled', String(!p || (valid && current >= p.maxQty)));
}

function stepQuantity(direction) {
  const p = model.product;
  if (!p) return;
  const current = Number(qtyEl.value);
  let next = qtyEl.value.trim() === '' || !Number.isFinite(current) ? p.minQty : current + direction * p.quantityStep;
  next = Math.min(p.maxQty, Math.max(p.minQty, next));
  next = p.minQty + Math.round((next - p.minQty) / p.quantityStep) * p.quantityStep;
  qtyEl.value = String(Number(next.toFixed(6)));
  onQuantityEdit();
}

function announce(message) {
  if (!stepLiveRegion || !message) return;
  stepLiveRegion.textContent = '';
  requestAnimationFrame(() => { stepLiveRegion.textContent = message; });
}

function renderEligibilityAgreement(product) {
  const required = productRequiresEligibility(product);
  eligibilityAgreement.hidden = !required;
  ackEligibility.required = required;
  eligibilityBody.replaceChildren();
  if (!required) {
    ackEligibility.checked = false;
    return;
  }

  const elig = getProductEligibility(product);
  eligibilityLabel.textContent = elig.label;
  if (elig.intro) {
    const p = document.createElement('p');
    p.textContent = elig.intro;
    eligibilityBody.appendChild(p);
  }
  if (elig.bullets?.length) {
    const ul = document.createElement('ul');
    elig.bullets.forEach((b) => {
      const li = document.createElement('li');
      li.textContent = b;
      ul.appendChild(li);
    });
    eligibilityBody.appendChild(ul);
  }
  if (elig.citations?.length) {
    const title = document.createElement('p');
    title.textContent = 'Read the legal text:';
    const list = buildLinkList(elig.citations.map(c => ({ label: c.label || 'Legal reference', url: c.url })));
    list.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
    eligibilityBody.append(title, list);
  }
}

function holderName() {
  return [permitHolder.FirstName, permitHolder.MiddleName, permitHolder.LastName].map(el => el.value.trim()).filter(Boolean).join(' ');
}

function holderAddressLines() {
  return [
    permitHolder.AddressLine1.value.trim(),
    permitHolder.AddressLine2.value.trim(),
    `${permitHolder.City.value.trim()}, ${permitHolder.AddrState.value} ${permitHolder.Zip.value.trim()}`
  ].filter(Boolean);
}

function appendProductionNote(container, text) {
  const label = document.createElement('span');
  label.className = 'production-label';
  label.textContent = 'In production:';
  container.append(label, ` ${text}`);
}

function summaryRow({ key, lines, change, changeLabel }) {
  const row = document.createElement('div');
  row.className = 'summary-row';
  const dt = document.createElement('dt');
  dt.textContent = key;
  const dd = document.createElement('dd');
  lines.forEach((line, i) => {
    const span = document.createElement('span');
    span.className = i === 0 ? 'summary-main' : 'summary-line';
    span.textContent = line;
    dd.appendChild(span);
  });
  row.append(dt, dd);
  if (change) {
    const action = document.createElement('dd');
    action.className = 'summary-action';
    const link = document.createElement('a');
    link.href = `#${change}`;
    link.textContent = 'Change';
    const context = document.createElement('span');
    context.className = 'sr-only';
    context.textContent = ` ${changeLabel}`;
    link.appendChild(context);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      returnToReview = true;
      showScreen(change);
    });
    action.appendChild(link);
    row.appendChild(action);
  }
  return row;
}

function renderReview() {
  const p = model.product;
  if (!p) return;
  const total = p.price * model.qty;
  const noFee = p.price === 0;
  reviewTitle.textContent = noFee ? 'Check and confirm' : 'Check and pay';
  reviewSummary.replaceChildren(
    summaryRow({ key: 'Permit', lines: [`${typeOption()?.label}: ${shortProductName(p)}`, quantityLabel(p, model.qty), validityText(p), productRequiresEligibility(p) ? getProductEligibility(p).certified : '', tagSummary(currentTagCount())].filter(Boolean), change: 'permit', changeLabel: 'permit' }),
    summaryRow({ key: 'Where', lines: [model.officeName, stateName()], change: 'where', changeLabel: 'area' }),
    summaryRow({ key: 'Permit holder', lines: [holderName(), ...holderAddressLines(), permitHolder.DeliveryEmail.value.trim()], change: 'details', changeLabel: 'your details' }),
    summaryRow({ key: 'Total', lines: [totalLabelFor(p.price, total)] })
  );
  reviewSummary.lastElementChild.classList.add('summary-total');

  const label = noFee ? 'Get my free permit' : `Pay ${money(total)} on Pay.gov`;
  // Rewriting identical text would replace the node a pending click or screen reader is using.
  if (confirmPaygovBtn.textContent !== label) confirmPaygovBtn.textContent = label;
  payNote.replaceChildren();
  if (noFee) payNote.textContent = 'No payment is needed. You can download your permit package right away.';
  else appendProductionNote(payNote, 'you’ll pay on Pay.gov, then come back here for your permit. This demo skips payment.');
}

function renderDone() {
  if (!issued) return;
  const p = model.product;
  doneNote.replaceChildren(issued.noFee ? 'No payment was needed. ' : 'This demo skipped payment, so nothing was charged. ');
  appendProductionNote(doneNote, `we’d also email the package to ${permitHolder.DeliveryEmail.value.trim()}.`);

  const line = (className, text) => {
    const el = document.createElement(className === 'permit-card-title' ? 'strong' : 'span');
    el.className = className;
    el.textContent = text;
    return el;
  };
  permitCard.replaceChildren(
    line('permit-card-type', `${typeOption()?.label} permit`),
    line('permit-card-title', `${shortProductName(p)} · ${quantityLabel(p, model.qty)}`),
    line('permit-card-line', `${model.officeName}, ${stateName()}`),
    line('permit-card-line', validityText(p)),
    line('permit-card-line', `Issued to ${holderName()}`),
    ...(tagSummary(issued.tagCount) ? [line('permit-card-line', tagSummary(issued.tagCount))] : []),
    line('permit-card-ref', `Permit number ${issued.permitNumber}`)
  );
  permitDownloadBtn.disabled = false;
  packageHint.textContent = `PDF, ${issued.pageCount} pages.`;

  const steps = [
    'Print every page.',
    'Sign and date the permit on page 1. It isn’t valid until you sign it.',
    ...(issued.tagCount ? [`Before you load, cut or tear out the month, day and AM or PM on one haul tag for each ${TAG_EACH[model.productType]}, and attach it where it can be seen.`] : []),
    'Check the area notices and maps before your trip.',
    'Carry the signed permit while collecting.'
  ];
  nextStepsList.replaceChildren(...steps.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    if (text.startsWith('Check the area')) {
      const docs = getLocationAttachments();
      if (docs.length) li.appendChild(buildLinkList(docs));
    }
    return li;
  }));

  renderPayload(handoff, issued.payload, {
    note: issued.noFee
      ? 'In production, the site would request permit issuance from the permitting system and return a signed permit PDF for download.'
      : 'In production, the site would create a Sale ID and redirect the visitor to Pay.gov with this transaction context, then issue the permit after verifying payment.'
  });
}

function renderScreen(name) {
  if (name === 'where') {
    renderAreas();
    renderLocationNotice();
  } else if (name === 'permit') {
    renderProducts();
  } else if (name === 'review') {
    renderReview();
  } else if (name === 'done') {
    renderDone();
  }
}

function screenComplete(name) {
  switch (name) {
    case 'start': return true;
    case 'what': return catalogReady && Boolean(model.productType);
    case 'where': return Boolean(model.state && getSelectedOffice());
    case 'permit': return Boolean(model.product) && !quantityError(model.product, qtyEl.value) && !eligibilityError();
    case 'details': return Object.values(permitHolder).every(el => !getFieldErrorMessage(el));
    case 'review': return Boolean(issued);
    default: return false;
  }
}

// A screen can be shown only when every screen before it is complete.
function furthestReachable() {
  let index = 0;
  while (index < SCREENS.length - 1 && screenComplete(SCREENS[index])) index += 1;
  return index;
}

function showScreen(name, { history: mode = 'push', focus = true } = {}) {
  const index = Math.min(Math.max(SCREENS.indexOf(name), 0), furthestReachable());
  const target = SCREENS[index];
  currentScreen = target;
  if (target === 'review') returnToReview = false;
  renderScreen(target);
  for (const [screenName, el] of Object.entries(screens)) el.hidden = screenName !== target;

  // The start page and the finished permit sit outside the numbered steps, so they have no step count or Back link.
  const numbered = index > 0 && index <= STEP_COUNT;
  screenTop.hidden = !numbered;
  backLink.hidden = !numbered;
  if (numbered) {
    backLink.href = `#${SCREENS[index - 1]}`;
    stepCount.textContent = `Step ${index} of ${STEP_COUNT}`;
    progressBar.style.width = `${(index / STEP_COUNT) * 100}%`;
  }

  const heading = screens[target].querySelector('h1');
  if (target === 'start') document.title = `${heading.textContent} | ${AGENCY}`;
  else if (!numbered) document.title = `${heading.textContent} – ${SERVICE_TITLE}`;
  else document.title = `${heading.textContent} – Step ${index} of ${STEP_COUNT} – ${SERVICE_TITLE}`;
  if (mode === 'push') history.pushState({ screen: target }, '', `#${target}`);
  else if (mode === 'replace') history.replaceState({ screen: target }, '', `#${target}`);

  // Moving focus to the new question tells screen reader users the screen changed; the first load keeps the browser's focus.
  if (focus) {
    hideErrors();
    window.scrollTo(0, 0);
    heading.focus({ preventScroll: true });
  }
}

function getFieldContainer(el) {
  return el?.closest('.field');
}

function updateAriaDescribedBy(el, id, add) {
  if (!el || !id) return;
  const current = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  const has = current.includes(id);
  if (add && !has) current.push(id);
  if (!add && has) current.splice(current.indexOf(id), 1);
  if (current.length) {
    el.setAttribute('aria-describedby', current.join(' '));
  } else {
    el.removeAttribute('aria-describedby');
  }
}

// Errors sit above their control. A fieldset is described by its error; aria-invalid is not allowed on a group.
function setFieldError(el, message) {
  const container = getFieldContainer(el);
  if (!container) return;
  let target = container.querySelector(':scope > .field-error');
  if (!target) {
    if (!message) return;
    target = document.createElement('p');
    target.className = 'field-error';
    target.id = `${el.id}-error`;
    target.setAttribute('aria-live', 'polite');
    container.insertBefore(target, container.querySelector(':scope > .field-input'));
  }
  const isGroup = el.matches('fieldset');
  container.classList.toggle('has-error', Boolean(message));
  target.textContent = message;
  updateAriaDescribedBy(el, target.id, Boolean(message));
  if (isGroup) return;
  if (message) el.setAttribute('aria-invalid', 'true');
  else el.removeAttribute('aria-invalid');
}

function clearAllFieldErrors() {
  document.querySelectorAll('.field-error').forEach((target) => {
    const field = target.closest('.field');
    field?.classList.remove('has-error');
    target.textContent = '';
  });
  document.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
  document.querySelectorAll('[aria-describedby]').forEach((el) => {
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const filtered = ids.filter(id => !id.endsWith('-error'));
    if (filtered.length) {
      el.setAttribute('aria-describedby', filtered.join(' '));
    } else {
      el.removeAttribute('aria-describedby');
    }
  });
}

function focusField(field) {
  const target = field.matches('fieldset') ? (field.querySelector('input:checked') || field.querySelector('input')) : field;
  target?.focus();
}

// Messages are strings, or { text, field } so the summary can link each field error to its control.
function showErrors(messages) {
  errorList.replaceChildren();
  for (const m of messages) {
    const li = document.createElement('li');
    if (m?.field) {
      const link = document.createElement('a');
      link.href = `#${m.field.id}`;
      link.textContent = m.text;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        focusField(m.field);
      });
      li.appendChild(link);
    } else {
      li.textContent = m?.text ?? m;
    }
    errorList.appendChild(li);
  }
  errorBox.hidden = false;
  errorBox.focus();
}

function hideErrors() {
  errorBox.hidden = true;
  errorList.replaceChildren();
}

const FIELD_VALIDATORS = createFieldValidators({ model, permitHolder });

function getFieldErrorMessage(el) {
  if (!el) return '';
  const validator = FIELD_VALIDATORS[el.id];
  return validator ? validator(el) : '';
}

function validateField(el) {
  const msg = getFieldErrorMessage(el);
  if (el) setFieldError(el, msg);
  return !msg;
}

function validatePermitHolder() {
  return Object.values(permitHolder)
    .map(el => ({ text: getFieldErrorMessage(el), field: el }))
    .filter(error => error.text);
}

// The certification sits with the permit it applies to, so someone who doesn't qualify stops before entering details.
function eligibilityError() {
  return productRequiresEligibility(model.product) && !ackEligibility.checked
    ? { text: 'Confirm that you qualify for this subsistence permit.', field: ackEligibility }
    : null;
}

function reviewErrors() {
  return agreeEl.checked ? [] : [{ text: 'Agree to the permit terms.', field: agreeEl }];
}

function screenErrors(name) {
  switch (name) {
    case 'what':
      if (!catalogReady) return [LOAD_ERROR];
      return model.productType ? [] : [{ text: 'Select what you are collecting.', field: productTypeGroup }];
    case 'where':
      if (!model.state) return [{ text: 'Choose a state.', field: stateEl }];
      if (!officesFor(model.state).length) return [{ text: noAreasMessage(), field: stateEl }];
      return getSelectedOffice() ? [] : [{ text: 'Choose an area.', field: areaGroup }];
    case 'permit': {
      if (!getProductsForSelection().length) return [noProducts.textContent];
      if (!model.product) return [{ text: 'Choose a permit.', field: productGroup }];
      const msg = quantityError(model.product, qtyEl.value);
      return [msg ? { text: msg, field: qtyEl } : null, eligibilityError()].filter(Boolean);
    }
    case 'details':
      return validatePermitHolder();
    case 'review':
      return reviewErrors();
    default:
      return [];
  }
}

function continueFrom(name) {
  continuePressedAt = -Infinity;
  const errors = screenErrors(name);
  if (name === 'details') Object.values(permitHolder).forEach(validateField);
  else errors.forEach(error => { if (error?.field) setFieldError(error.field, error.text); });
  if (errors.length) {
    showErrors(errors);
    return;
  }
  hideErrors();
  if (name === 'review') {
    confirmCheckout().catch((error) => {
      console.error(error);
      showErrors(['We could not prepare your permit. Your entries are still here. Please try again.']);
    });
    return;
  }
  const reviewIndex = SCREENS.indexOf('review');
  const next = returnToReview && furthestReachable() >= reviewIndex ? 'review' : SCREENS[SCREENS.indexOf(name) + 1];
  showScreen(next);
}

function handleProductTypeChange(value) {
  if (value === model.productType) return;
  setProductType(value);
  setFieldError(productTypeGroup, '');
  // Keep the location that still applies: the state always does, the area only if it offers the new type.
  if (model.officeId && !getSelectedOffice()) clearOffice();
  clearProduct();
  invalidateCheckout();
  persistState();
}

// Events
for (const name of SCREENS) {
  if (screens[name].tagName !== 'FORM') continue;
  screens[name].addEventListener('submit', (event) => {
    event.preventDefault();
    continueFrom(name);
  });
}

stateEl.addEventListener('change', () => {
  if (stateEl.value === model.state) return;
  model.state = stateEl.value;
  clearOffice();
  clearProduct();
  invalidateCheckout();
  setFieldError(stateEl, '');
  setFieldError(areaGroup, '');
  renderAreas();
  renderLocationNotice();
  persistState();
});

startButton.addEventListener('click', (event) => {
  event.preventDefault();
  showScreen('what');
});

backLink.addEventListener('click', (event) => {
  event.preventDefault();
  returnToReview = false;
  showScreen(SCREENS[SCREENS.indexOf(currentScreen) - 1]);
});

// The browser's own Back and Forward buttons move between screens too.
window.addEventListener('popstate', (event) => {
  const name = event.state?.screen;
  if (!SCREENS.includes(name) || name === currentScreen) return;
  showScreen(name, { history: 'none' });
  if (currentScreen !== name) history.replaceState({ screen: currentScreen }, '', `#${currentScreen}`);
});

// While Continue is being pressed, an error appearing on blur could push the button out from under the
// pointer before release and swallow the click. The click reports every error anyway, so those errors wait.
let continuePressedAt = -Infinity;
document.querySelectorAll('.screen button[type="submit"]').forEach((button) => {
  button.addEventListener('pointerdown', () => { continuePressedAt = performance.now(); });
});
const continueBeingPressed = () => performance.now() - continuePressedAt < 1000;
const showsError = el => el.getAttribute('aria-invalid') === 'true';

function valueChanged(el) {
  if (lastValues.get(el) === el.value) return false;
  lastValues.set(el, el.value);
  return true;
}

function onQuantityEdit({ committed = false } = {}) {
  const reveal = committed && !continueBeingPressed();
  if (reveal || showsError(qtyEl)) validateField(qtyEl);
  updateTotal();
  if (!valueChanged(qtyEl)) return;
  invalidateCheckout();
  persistState();
}

qtyEl.addEventListener('input', () => onQuantityEdit());
qtyEl.addEventListener('change', () => onQuantityEdit({ committed: true }));
qtyDec.addEventListener('click', () => { if (qtyDec.getAttribute('aria-disabled') !== 'true') stepQuantity(-1); });
qtyInc.addEventListener('click', () => { if (qtyInc.getAttribute('aria-disabled') !== 'true') stepQuantity(1); });

// Errors appear once an entry is committed (the field is left or a select changes), then follow each keystroke until fixed.
function onPermitHolderEdit(el, { committed = false } = {}) {
  const reveal = committed && !continueBeingPressed();
  if (reveal || showsError(el)) validateField(el);
  // Confirm email is judged against the delivery email, so its message must follow edits to either field.
  const confirmEmail = permitHolder.ConfirmEmail;
  if (el === permitHolder.DeliveryEmail && confirmEmail.value.trim() && (reveal || showsError(confirmEmail))) validateField(confirmEmail);
  if (valueChanged(el)) invalidateCheckout();
}

Object.values(permitHolder).forEach(el => {
  el.addEventListener('input', () => onPermitHolderEdit(el));
  el.addEventListener('change', () => onPermitHolderEdit(el, { committed: true }));
  // Rebuilding checkout on blur can cancel the pending pointer click in WebKit.
  el.addEventListener('blur', () => { if (!continueBeingPressed()) validateField(el); });
});

[agreeEl, ackEligibility].forEach((el) => {
  el.addEventListener('change', () => {
    invalidateCheckout();
    if (el.checked) setFieldError(el, '');
  });
});

permitDownloadBtn.addEventListener('click', () => {
  if (!issued?.url) return;
  const a = document.createElement('a');
  a.href = issued.url;
  a.download = `${issued.permitNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

function checkoutSnapshot() {
  return {
    state: model.state, officeId: model.officeId, productId: model.product?.id,
    quantity: model.qty, unitPrice: model.product?.price,
    permitHolder: Object.fromEntries(Object.entries(permitHolder).map(([key, el]) => [key, el.value.trim()])),
    agreed: agreeEl.checked, eligibility: ackEligibility.checked
  };
}

// Everything the permit package shows. Area documents come from the catalog's state and office attachments.
function packageSpec({ permitNumber, noFee, total, tagCount }) {
  const p = model.product;
  const office = getSelectedOffice();
  const stateData = catalogData[model.state];
  const { startDate, expirationDate, validForDays, actualDays, shortened } = calculatePermitValidity(p);
  const eligibility = productRequiresEligibility(p) ? getProductEligibility(p) : null;
  const attachments = scope => (scope?.attachments || []).map(doc => ({ ...doc, id: documentIdFromUrl(doc.url) }));
  const stateDocs = attachments(stateData);
  const officeDocs = attachments(office);
  const areaDocs = [...stateDocs, ...officeDocs].filter(doc => AREA_DOCUMENTS[doc.id]);
  const hasNotice = docs => docs.some(doc => AREA_DOCUMENTS[doc.id]?.kind === 'notice');
  return {
    permitNumber,
    typeId: model.productType,
    typeLabel: typeOption().label,
    productName: p.name,
    quantityLabel: quantityLabel(p, model.qty),
    areaName: office.name,
    officeId: office.id,
    stateName: stateName(),
    validFrom: formatDate(startDate),
    validUntil: formatDate(expirationDate),
    validDays: shortened ? actualDays : validForDays,
    fee: noFee ? 'No fee' : `${money(total)} (demo: no payment was taken)`,
    tagCount,
    tagLine: tagCount ? `${tagCount} included, one for each ${TAG_EACH[model.productType]}` : 'Not required for this permit',
    tagEach: TAG_EACH[model.productType],
    tagQuantity: TAG_QUANTITY[model.productType],
    holder: { name: holderName(), addressLines: holderAddressLines(), email: permitHolder.DeliveryEmail.value.trim() },
    issued: formatDate(getTodayStart()),
    eligibility: eligibility?.label || null,
    eligibilityBasis: eligibility?.basis || '',
    documents: Object.fromEntries(TYPE_DOCUMENTS[model.productType].map(doc => [doc.kind, doc.id])),
    area: {
      // A notice document repeats its state's or office's description, so only uncovered ones are listed.
      descriptions: [
        stateData?.description && !hasNotice(stateDocs) ? { scope: stateData.name, text: stateData.description } : null,
        office?.description && !hasNotice(officeDocs) ? { scope: office.name, text: office.description } : null
      ].filter(Boolean),
      maps: areaDocs.filter(doc => AREA_DOCUMENTS[doc.id].kind === 'map').map(doc => doc.id),
      notices: areaDocs.filter(doc => AREA_DOCUMENTS[doc.id].kind === 'notice').map(doc => doc.id),
      links: [...stateDocs, ...officeDocs].filter(doc => !AREA_DOCUMENTS[doc.id]).map(({ label, url }) => ({ label, url }))
    }
  };
}

function setCheckoutPending(pending) {
  checkoutPending = pending;
  // aria-disabled rather than disabled, so focus stays on the button while the permit is prepared.
  if (pending) {
    confirmPaygovBtn.setAttribute('aria-busy', 'true');
    confirmPaygovBtn.setAttribute('aria-disabled', 'true');
  } else {
    confirmPaygovBtn.removeAttribute('aria-busy');
    confirmPaygovBtn.removeAttribute('aria-disabled');
  }
}

async function confirmCheckout() {
  if (checkoutPending) return;
  const current = getProductsForSelection().find(product => product.id === model.product?.id);
  if (!current || current !== model.product || quantityError(model.product, qtyEl.value)) {
    clearProduct();
    invalidateCheckout();
    persistState();
    showScreen('permit');
    showErrors(['This permit is no longer available. Choose another permit.']);
    return;
  }

  const unitPrice = model.product.price;
  const total = unitPrice * model.qty;
  const noFee = unitPrice === 0;
  const reference = checkoutIdentity.referenceFor(checkoutSnapshot(), noFee ? 'PERMIT' : 'TX');
  const permitNumber = checkoutIdentity.permitNumberFor(checkoutSnapshot(), model.officeId, getTodayStart());
  const tagCount = currentTagCount();
  const eligibility = productRequiresEligibility(model.product)
    ? { certified: ackEligibility.checked, basis: getProductEligibility(model.product).basis }
    : null;
  const payload = buildCheckoutPayload({ model, holder: readPermitHolder(permitHolder), reference, permitNumber, haulTags: tagCount, eligibility });
  const payloadSize = payloadSizeBytes(payload);
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    showErrors([`Form data is too large (${payloadSize} bytes). Shorten text entries and try again.`]);
    return;
  }

  const revision = checkoutRevision;
  const snapshot = JSON.stringify(checkoutSnapshot());
  setCheckoutPending(true);
  announce('Preparing your permit package. Please wait.');
  let blob, pageCount;
  try {
    ({ blob, pageCount } = await buildPermitPackagePdf(packageSpec({ permitNumber, noFee, total, tagCount })));
    if (revision !== checkoutRevision || snapshot !== JSON.stringify(checkoutSnapshot())) return;
  } catch (error) {
    if (revision === checkoutRevision) showErrors([`We could not create your permit. Your entries are still here. ${error.message}`]);
    return;
  } finally {
    setCheckoutPending(false);
  }

  clearIssued();
  issued = { reference, permitNumber, url: URL.createObjectURL(blob), payload, noFee, pageCount, tagCount };
  showScreen('done');
  document.dispatchEvent(new CustomEvent('sfpx:pdf-ready'));
}

function clearPermitHolder() {
  Object.values(permitHolder).forEach(el => { el.value = ''; lastValues.set(el, ''); });
}

// Firefox restores form values on reload, so an agreement or quantity from before the reload could reappear.
function clearRestoredFormState() {
  clearPermitHolder();
  agreeEl.checked = false;
  ackEligibility.checked = false;
  qtyEl.value = '';
  lastValues.set(qtyEl, '');
}

function resetAll() {
  invalidateCheckout();
  clearPermitHolder();
  clearAllFieldErrors();
  setProductType('');
  model.state = '';
  stateEl.value = '';
  clearOffice();
  clearProduct();
  agreeEl.checked = false;
  returnToReview = false;
  selectionStorage.clear();
  showScreen('what');
}

resetAllBtn.addEventListener('click', resetAll);
startAnotherBtn.addEventListener('click', resetAll);

// Firefox may restore native form values independently of sessionStorage.
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  clearPermitHolder();
  agreeEl.checked = false;
  ackEligibility.checked = false;
  invalidateCheckout();
  if (SCREENS.indexOf(currentScreen) > SCREENS.indexOf('details')) showScreen('details', { history: 'replace' });
});

async function boot() {
  productTypeRadios = renderProductTypes(productTypeOptions, handleProductTypeChange);
  populateUSStates(permitHolder.AddrState);
  clearRestoredFormState();
  await loadProductData();
  restoring = true;
  try { restoreState(); } finally { restoring = false; }
  // A reload keeps the screen when its earlier answers were restored; purchaser details never are.
  // Without a screen in the URL (a first visit, #need-help, the skip link's #main), a visitor with
  // restored answers resumes at the furthest screen and everyone else sees the start page.
  const requested = history.state?.screen || location.hash.slice(1);
  const furthest = furthestReachable();
  const resume = furthest > SCREENS.indexOf('what') ? SCREENS[furthest] : 'start';
  showScreen(SCREENS.includes(requested) ? requested : resume, { history: 'replace', focus: false });
  document.documentElement.dataset.appReady = 'true';
  document.dispatchEvent(new CustomEvent('sfpx:ready'));
}

export const ready = boot();
