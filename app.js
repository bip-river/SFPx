import { PRODUCT_TYPE_OPTIONS, validateCatalog, getProductKey, isSaleActive, isSaleComingSoon, parseDate } from './js/catalog.js';
import { sanitizeUrl } from './js/links.js';
import { createFieldValidators, quantityError } from './js/validation.js';
import { getProductEligibility, productRequiresEligibility } from './js/eligibility.js';
import { createSelectionStorage } from './js/state.js';
import { MAX_PAYLOAD_BYTES, createCheckoutIdentity, readPermitHolder, buildCheckoutPayload, payloadSizeBytes } from './js/checkout.js';
import { buildDemoPermitPdf } from './js/permit-pdf.js';
import { renderProductTypes, money, feeLabelForUnit, totalLabelFor, formatDate, getValidityLabels, buildRequiredDocs, buildDocLinks, buildProductAlert, buildProductCard, renderPayload } from './js/ui.js';

let catalogData = {};
let catalogReady = false;
let restoring = false;
const selectionStorage = createSelectionStorage();
const CATALOG_SOURCE = 'products.json';

// Banner toggle
const bannerToggle = document.getElementById('bannerToggle');
const bannerDetails = document.getElementById('bannerDetails');
bannerToggle.addEventListener('click', () => {
  const open = bannerDetails.style.display === 'block';
  bannerDetails.style.display = open ? 'none' : 'block';
  bannerToggle.setAttribute('aria-expanded', String(!open));
});

// Elements
const stateEl = document.getElementById('state');
const stateRow = document.getElementById('stateRow');
const officeInput = document.getElementById('officeInput');
const officeIdEl = document.getElementById('officeId');
const officeRow = document.getElementById('officeRow');
const officeCombo = document.getElementById('officeCombo');
const officeList = document.getElementById('officeList');
const productTypeGroup = document.getElementById('ptypeGroup');
const productTypeOptions = document.getElementById('ptypeOptions');
let productTypeRadios = [];

const productListEl = document.getElementById('productList');
const qtyEl = document.getElementById('qty');
const qtyHint = document.getElementById('qtyHint');
const qtyGuard = document.getElementById('qtyGuard');
const totalEl = document.getElementById('total');
const totalAmount = document.getElementById('totalAmount');
const totalCalc = document.getElementById('totalCalc');

const qtySection = document.getElementById('qtySection');
const comingSoonSection = document.getElementById('comingSoonSection');
const comingSoonList = document.getElementById('comingSoonList');

const ackPrivacy = document.getElementById('ackPrivacy');
const ackTerms = document.getElementById('ackTerms');

const eligibilityAgreement = document.getElementById('eligibilityAgreement');
const ackEligibility = document.getElementById('ackEligibility');
const eligibilityLabel = document.getElementById('eligibilityLabel');
const eligibilityBody = document.getElementById('eligibilityBody');

const nextStepsList = document.getElementById('nextStepsList');
const confirmation = document.getElementById('confirmation');
const permitRefEl = document.getElementById('permitRef');
const permitDownloadBtn = document.getElementById('permitDownloadBtn');

const errorBox = document.getElementById('errorBox');
const errorList = document.getElementById('errorList');

const stepSections = [
  document.getElementById('step1'),
  document.getElementById('step2'),
  document.getElementById('step3')
];
const stepToggles = Array.from(document.querySelectorAll('.step-toggle'));
const stepStatuses = [
  document.getElementById('status1'),
  document.getElementById('status2'),
  document.getElementById('status3')
];

const locationNotice = document.getElementById('locationNotice');
const reviewSummary = document.getElementById('reviewSummary');
const reviewNotice = document.getElementById('reviewNotice');
const reviewActions = document.getElementById('reviewActions');
const confirmPaygovBtn = document.getElementById('confirmPaygov');
const handoff = document.getElementById('handoff');
const postStep3 = document.getElementById('postStep3');
const permitHolderFieldset = document.getElementById('permitHolderFieldset');
const permitHolderBlockedHint = document.getElementById('permitHolderBlockedHint');
const stepLiveRegion = document.getElementById('stepLiveRegion');
const lockNotes = [null, document.getElementById('step2LockNote'), document.getElementById('step3LockNote')];

const checkoutIdentity = createCheckoutIdentity();
let checkoutRevision = 0;
let checkoutPending = false;

function invalidateCheckout() {
  checkoutRevision += 1;
  clearConfirmation();
  handoff.replaceChildren();
  handoff.style.display = 'none';
  checkoutIdentity.clear();
  selectionStorage.clearLegacyTransaction();
}

const resetAllBtn = document.getElementById('resetAll');

let permitDownloadUrl = '';

let lastAnnouncedStep = null;

// Permit holder fields
const permitHolder = {
  FirstName: document.getElementById('FirstName'),
  MiddleName: document.getElementById('MiddleName'),
  LastName: document.getElementById('LastName'),
  AddressLine1: document.getElementById('AddressLine1'),
  AddressLine2: document.getElementById('AddressLine2'),
  City: document.getElementById('City'),
  AddrState: document.getElementById('AddrState'),
  Zip: document.getElementById('Zip'),
  DeliveryEmail: document.getElementById('DeliveryEmail'),
  ConfirmEmail: document.getElementById('ConfirmEmail'),
};

// Model
const model = {
  step: 0,
  state: '',
  officeId: '',
  officeName: '',
  productType: '',
  productKey: '',
  product: null,
  qty: 0
};

const stepState = {
  available: [true, false, false],
  completed: [false, false, false],
  open: [true, false, false]
};
let prevAvailability = [...stepState.available];

function hasSelectionForReview() {
  if (!model.product) return false;
  return validateQty();
}

function setControlEnabled(el, enabled) {
  if (!el) return;
  el.disabled = !enabled;
  if (enabled) el.removeAttribute('aria-disabled');
  else el.setAttribute('aria-disabled', 'true');
}

function persistState() {
  if (restoring) return;
  const payload = {
    model: {
      state: model.state,
      officeId: model.officeId,
      officeName: model.officeName,
      officeInput: officeInput.value,
      productType: model.productType,
      productKey: model.productKey,
      qty: model.qty,
    },
    acknowledgements: {
      privacy: ackPrivacy.checked,
      terms: ackTerms.checked,
      eligibility: ackEligibility ? ackEligibility.checked : false
    }
  };
  selectionStorage.write(payload);
}

function restoreState() {
  const saved = selectionStorage.read();
  if (!saved) return;

  const savedModel = saved?.model || {};
  const savedAcknowledgements = saved?.acknowledgements || {};

  if (savedModel.state && catalogData[savedModel.state]) {
    stateEl.value = savedModel.state;
    model.state = savedModel.state;
  }

  const savedProductType = savedModel.productType || savedModel.ptype;
  if (savedProductType) {
    setProductType(savedProductType);
  }

  if (savedModel.officeId) {
    const offices = getOfficesForState(model.state);
    const match = offices.find(o => o.id === savedModel.officeId);
    if (match) {
      officeIdEl.value = match.id;
      model.officeId = match.id;
      model.officeName = match.name;
      officeInput.value = match.name;
    }
  } else if (savedModel.officeInput) {
    officeInput.value = savedModel.officeInput;
  }

  syncSelectionAvailability();
  attemptAdvanceFromStep1();

  const products = getProductsForSelection();
  const savedKey = savedModel.productKey || '';
  const matchedIndex = savedKey
    ? products.findIndex(p => getProductKey(p) === savedKey)
    : -1;
  // Old index-only selections cannot be restored safely after catalog changes.
  const resolvedIndex = matchedIndex;
  if (products.length && Number.isInteger(resolvedIndex) && products[resolvedIndex]) {
    const p = products[resolvedIndex];

    model.productKey = getProductKey(p);
    model.product = p;
    const radio = document.getElementById(`prod_${resolvedIndex}`);
    if (radio) {
      radio.checked = true;
      updateProductCardSelection();
    }
    const minQty = Number.isFinite(p.minQty) ? p.minQty : 1;
    qtyHint.textContent = `Enter ${minQty}–${p.maxQty} ${p.unit}(s). Price: ${feeLabelForUnit(p.price, p.unit)}.`;
    qtyEl.min = minQty;
    qtyEl.max = p.maxQty;
    qtyEl.step = p.quantityStep;
    setControlEnabled(qtyEl, true);
    qtySection.style.display = 'block';
    if (savedModel.qty) {
      qtyEl.value = savedModel.qty;
    }
    commitQuantity({ showErrors: false });
  }

  ackPrivacy.checked = Boolean(model.product && savedAcknowledgements.privacy);
  ackTerms.checked = Boolean(model.product && savedAcknowledgements.terms);
  if (ackEligibility) ackEligibility.checked = Boolean(model.product && savedAcknowledgements.eligibility);

  renderEligibilityAgreement();

  evaluateFinalStep();
  syncPermitHolderAccess();
}

function setProductType(value) {
  const hasMatch = productTypeRadios.some(r => r.value === value);
  model.productType = hasMatch ? (value || '') : '';
  productTypeRadios.forEach(r => { r.checked = r.value === value; });
}

function validateProductType({ showErrors = true } = {}) {
  const hasType = Boolean(model.productType);
  const msg = hasType ? '' : 'Select what you are collecting to view available permits.';
  if (showErrors) setFieldError(productTypeGroup, msg);
  return hasType;
}

function resetOfficeSelection() {
  officeInput.value = '';
  officeIdEl.value = '';
  model.officeId = '';
  model.officeName = '';
  officeOptions = [];
  renderOfficeList([], '');
  setOfficeExpanded(false);
  setFieldError(officeInput, '');
}

function resetStateSelection() {
  stateEl.value = '';
  model.state = '';
  resetOfficeSelection();
}

function resetProductSelection() {
  invalidateCheckout();

  model.productKey = '';
  model.product = null;
  qtyEl.value = '';
  totalEl.value = '';
  if (totalAmount) totalAmount.textContent = '—';
  totalCalc.textContent = '';
  qtyGuard.textContent = '';
  model.qty = 0;
  setControlEnabled(qtyEl, false);
  qtySection.style.display = 'none';
  productListEl.innerHTML = '';
  if (comingSoonSection) comingSoonSection.style.display = 'none';
  if (comingSoonList) comingSoonList.innerHTML = '';
}

function syncSelectionAvailability() {
  const hasType = Boolean(model.productType);
  const hasState = hasType && Boolean(model.state);
  const canUseData = catalogReady && Object.keys(catalogData || {}).length > 0;

  if (!hasType) resetStateSelection();
  if (!hasState) resetOfficeSelection();

  if (stateRow) stateRow.classList.toggle('hidden', !hasType);
  if (officeRow) officeRow.classList.toggle('hidden', !hasState);

  // Only enable controls once the catalog is available.
  setControlEnabled(stateEl, canUseData && hasType);
  setControlEnabled(officeInput, canUseData && hasState);
}

// Populate state dropdown
function populateStates() {
  // Keep the first placeholder option, remove any prior dynamic options.
  while (stateEl.options.length > 1) stateEl.remove(1);
  const codes = Object.keys(catalogData).sort((a,b) => catalogData[a].name.localeCompare(catalogData[b].name));
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
  for (const [code,name] of states) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    selectEl.appendChild(opt);
  }
}

async function loadProductData() {
  setControlEnabled(stateEl, false);
  setControlEnabled(officeInput, false);

  try {
    const res = await fetch(CATALOG_SOURCE);
    if (!res.ok) throw new Error('Unable to load product catalog.');
    const json = await res.json();

    catalogData = validateCatalog(json);
    catalogReady = true;
    populateStates();
    hideErrors();
  } catch (err) {
    console.error(err);
    catalogReady = false;

    // Uses the shared error summary so it is focusable and consistent.
    showErrors(['We could not load available products right now. Please refresh and try again.']);
  } finally {
    syncSelectionAvailability();
  }
}

// Office combobox
let officeOptions = [];
let activeIndex = -1;

function setOfficeExpanded(expanded) {
  officeInput.setAttribute('aria-expanded', String(expanded));
  officeList.setAttribute('aria-hidden', String(!expanded));
  if (!expanded) {
    officeInput.removeAttribute('aria-activedescendant');
  }
}

function getOfficesForState(code) {
  const base = catalogData[code]?.offices || [];
  const filtered = (!model.productType)
    ? base
    : base.filter(o => Array.isArray(o.products?.[model.productType]) && o.products[model.productType].length > 0);
  return filtered.map(o => ({ id:o.id, name:o.name }));
}

function renderOfficeList(items, query) {
  const fragment = document.createDocumentFragment();
  if (!items.length) {
    const div = document.createElement('div');
    div.className = 'opt';
    div.setAttribute('role','option');
    div.id = 'officeOptionEmpty';
    div.setAttribute('aria-selected','false');
    div.setAttribute('aria-disabled','true');
    if (!model.productType && !query) {
      div.textContent = 'Start typing to search offices.';
    } else if (model.productType && !query) {
      div.textContent = 'No BWL offices in this state offer that collection type online.';
    } else {
      div.textContent = 'No matches. Try another search.';
    }
    fragment.appendChild(div);
    officeList.replaceChildren(fragment);
    officeInput.removeAttribute('aria-activedescendant');
    return;
  }
  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'opt';
    div.setAttribute('role','option');
    div.id = `officeOption_${idx}`;
    div.dataset.index = String(idx);

    const nameDiv = document.createElement('div');
    nameDiv.textContent = item.name;
    const idSpan = document.createElement('span');
    idSpan.className = 'small';
    idSpan.textContent = item.id;

    div.appendChild(nameDiv);
    div.appendChild(idSpan);
    // Use click (not mousedown) so the selection works even if the input
    // itself is disabled or blocked from taking focus.
    div.addEventListener('click', (e) => {
      e.preventDefault();
      selectOffice(idx);
    });
    fragment.appendChild(div);
  });
  officeList.replaceChildren(fragment);
}

function filterOfficeOptions(q) {
  const query = (q || '').trim().toLowerCase();
  const base = getOfficesForState(model.state);
  if (!query) return base.slice(0, 60);
  return base.filter(o => o.name.toLowerCase().includes(query)).slice(0, 60);
}

function highlightOffice(idx) {
  const items = Array.from(officeList.querySelectorAll('.opt'));
  items.forEach((el, i) => {
    const selected = (i === idx);
    el.setAttribute('aria-selected', String(selected));
    if (selected) el.scrollIntoView({ block:'nearest' });
  });
  if (idx >= 0 && items[idx]) {
    officeInput.setAttribute('aria-activedescendant', items[idx].id);
  } else {
    officeInput.removeAttribute('aria-activedescendant');
  }
}

function selectOffice(idx) {
  const item = officeOptions[idx];
  if (!item) return;
  officeInput.value = item.name;
  officeIdEl.value = item.id;
  model.officeId = item.id;
  model.officeName = item.name;
  officeInput.removeAttribute('aria-activedescendant');
  validateField(officeInput);
  activeIndex = -1;
  setOfficeExpanded(false);

  // Reset downstream selections
  resetProductSelection();
  resetFollowingSteps(0);
  stepState.open = [true, false, false];
  attemptAdvanceFromStep1();
}

// Products
function getSelectedOffice() {
  const offices = catalogData[model.state]?.offices || [];
  return offices.find(o => o.id === model.officeId) || null;
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

function hideLocationNotice() {
  if (!locationNotice) return;
  locationNotice.style.display = 'none';
  locationNotice.innerHTML = '';
}

function renderLocationNotice() {
  if (!locationNotice) return;
  const stateData = catalogData[model.state];
  const office = getSelectedOffice();
  const attachments = getLocationAttachments();
  const hasStateDesc = Boolean(stateData?.description);
  const hasOfficeDesc = Boolean(office?.description);
  const hasDocs = attachments.length > 0;

  if (!hasStateDesc && !hasOfficeDesc && !hasDocs) {
    hideLocationNotice();
    return;
  }

  locationNotice.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'title';
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = 'i';
  const titleText = document.createElement('span');
  titleText.textContent = 'Local details for your selection';
  title.appendChild(badge);
  title.appendChild(titleText);
  locationNotice.appendChild(title);

  if (hasStateDesc) {
    const detail = document.createElement('div');
    detail.className = 'detail';
    const strong = document.createElement('strong');
    strong.textContent = `${stateData.name}:`;
    detail.appendChild(strong);
    detail.append(' ', stateData.description);
    locationNotice.appendChild(detail);
  }

  if (hasOfficeDesc) {
    const detail = document.createElement('div');
    detail.className = 'detail';
    const strong = document.createElement('strong');
    strong.textContent = `${office.name}:`;
    detail.appendChild(strong);
    detail.append(' ', office.description);
    locationNotice.appendChild(detail);
  }

  if (hasDocs) {
    const wrapper = document.createElement('div');
    wrapper.className = 'detail';
    const strong = document.createElement('strong');
    strong.textContent = 'Attachments for this area:';
    wrapper.appendChild(strong);
    const list = document.createElement('ul');
    attachments.forEach((doc) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = sanitizeUrl(doc.url);
      a.textContent = doc.label;
      li.appendChild(a);
      list.appendChild(li);
    });
    wrapper.appendChild(list);
    locationNotice.appendChild(wrapper);
  }
  locationNotice.style.display = 'block';
}

function hideReview() {
  if (postStep3) postStep3.style.display = 'none';
  clearConfirmation();
  reviewSummary.style.display = 'none';
  reviewNotice.style.display = 'none';
  reviewActions.style.display = 'none';
  handoff.style.display = 'none';
  stepState.completed[2] = false;
  confirmPaygovBtn.disabled = true;
}

function renderReviewSummary() {
  if (!hasSelectionForReview()) {
    reviewSummary.style.display = 'none';
    return;
  }
  const stateName = catalogData[model.state]?.name || model.state || '—';
  const fullName = [permitHolder.FirstName.value.trim(), permitHolder.MiddleName.value.trim(), permitHolder.LastName.value.trim()].filter(Boolean).join(' ');
  const addressParts = [
    permitHolder.AddressLine1.value.trim(),
    permitHolder.AddressLine2.value.trim(),
    [permitHolder.City.value.trim(), permitHolder.AddrState.value, permitHolder.Zip.value.trim()].filter(Boolean).join(' ')
  ].filter(Boolean).join(', ');
  const deliveryEmail = permitHolder.DeliveryEmail.value.trim();
  const total = (model.product?.price || 0) * (model.qty || 0);
  const totalLabel = totalLabelFor(model.product?.price || 0, total);
  const qtyLabel = model.qty ? `${model.qty} ${model.product?.unit || 'unit'}${model.qty === 1 ? '' : 's'}` : '—';
  const { durationLabel, expirationLabel } = getValidityLabels(model.product);

  handoff.style.display = 'none';
  reviewSummary.innerHTML = '';
  const custKey = document.createElement('div');
  custKey.className = 'k';
  custKey.textContent = 'Permit holder';
  const custVal = document.createElement('div');
  custVal.className = 'v';
  [fullName || '—', addressParts || '—', `Delivery email: ${deliveryEmail}`].forEach((line) => {
    const span = document.createElement('div');
    span.className = 'summary-line';
    span.textContent = line;
    custVal.appendChild(span);
  });

  const prodKey = document.createElement('div');
  prodKey.className = 'k summary-group';
  prodKey.textContent = 'Product';
  const prodVal = document.createElement('div');
  prodVal.className = 'v';
  [
    `${stateName} — ${model.officeName || '—'}`,
    model.product?.name || '—',
    qtyLabel,
    durationLabel,
    expirationLabel,
    `Estimated total: ${totalLabel}`
  ].forEach((line) => {
    const span = document.createElement('div');
    span.className = 'summary-line';
    span.textContent = line;
    prodVal.appendChild(span);
  });

  reviewSummary.appendChild(custKey);
  reviewSummary.appendChild(custVal);
  reviewSummary.appendChild(prodKey);
  reviewSummary.appendChild(prodVal);

  reviewSummary.style.display = 'block';
}

function updateReviewPanels() {
  const hasSelection = hasSelectionForReview();
  if (postStep3) postStep3.style.display = hasSelection ? 'block' : 'none';
  if (!hasSelection) {
    reviewSummary.style.display = 'none';
    reviewNotice.style.display = 'none';
    reviewActions.style.display = 'none';
    handoff.style.display = 'none';
    confirmPaygovBtn.disabled = true;
    clearConfirmation();
    return;
  }

  renderReviewSummary();
  configureCheckoutCopy();
  reviewActions.style.display = 'flex';
  const ready = stepState.completed[2];
  confirmPaygovBtn.disabled = !ready || checkoutPending;
  reviewNotice.style.display = ready ? 'flex' : 'none';
}

function renderComingSoon(products) {
  if (!comingSoonSection || !comingSoonList) return;
  comingSoonList.innerHTML = '';
  if (!products.length) {
    comingSoonSection.style.display = 'none';
    return;
  }

  const title = document.createElement('div');
  title.className = 'coming-soon-title';
  title.textContent = 'Coming soon';
  const subtitle = document.createElement('div');
  subtitle.className = 'coming-soon-subtitle';
  subtitle.textContent = 'Sales that open within the next 15 days.';
  const list = document.createElement('div');
  list.className = 'coming-soon-items';
  products.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'coming-soon-item';
    const name = document.createElement('div');
    name.className = 'coming-soon-name';
    name.textContent = p.name;
    const date = document.createElement('div');
    date.className = 'coming-soon-date';
    const startDate = parseDate(p.saleStartDate);
    date.textContent = startDate ? `Starts ${formatDate(startDate)}` : 'Start date to be announced';
    item.appendChild(name);
    item.appendChild(date);
    list.appendChild(item);
  });

  comingSoonList.appendChild(title);
  comingSoonList.appendChild(subtitle);
  comingSoonList.appendChild(list);
  comingSoonSection.style.display = 'block';
}

function renderProducts() {
  const office = getSelectedOffice();
  const allProducts = getProductsForSelection({ includeInactive: true });
  const products = allProducts.filter(p => isSaleActive(p));
  const comingSoonProducts = allProducts.filter(p => isSaleComingSoon(p, 15));
  productListEl.innerHTML = '';

  model.product = null;
  qtySection.style.display = 'none';
  setControlEnabled(qtyEl, false);
  stepState.completed[1] = false;
  stepState.available[2] = false;

  renderLocationNotice();
  renderComingSoon(comingSoonProducts);

  const hasAnyOfficeProducts = (office?.products && Object.values(office.products).some(arr => (arr || []).length > 0));

  if (!products.length) {
    const productTypeLabel = PRODUCT_TYPE_OPTIONS.find(t => t.id === model.productType)?.label || 'this permit type';
    const msg = hasAnyOfficeProducts
      ? `${office?.name || 'This office'} does not offer ${productTypeLabel.toLowerCase()} permits online right now. Try another collection type or office.`
      : `${office?.name || 'This office'} does not have online permits available right now. Please choose another office or check back later.`;
    productListEl.appendChild(buildProductAlert(msg));
    return;
  }

  products.forEach((p, idx) => {
    productListEl.appendChild(buildProductCard(p, idx, {
      docs: buildRequiredDocs(p, model.productType, getLocationAttachments()),
      onSelect: () => selectProduct(p, idx)
    }));
  });
  updateProductCardSelection();
}

function selectProduct(p, idx) {
  invalidateCheckout();
  updateProductCardSelection();

  model.productKey = getProductKey(p);
  model.product = p;
  const minQty = Number.isFinite(p.minQty) ? p.minQty : 1;
  qtyHint.textContent = `Enter ${minQty}–${p.maxQty} ${p.unit}(s). Price: ${feeLabelForUnit(p.price, p.unit)}.`;
  const maxLine = p.maxQty ? `Maximum allowed per permit: ${p.maxQty} ${p.unit}${p.maxQty === 1 ? '' : 's'}` : '';
  qtyGuard.textContent = maxLine || '';
  qtyEl.min = minQty;
  qtyEl.max = p.maxQty;
  qtyEl.step = p.quantityStep;
  qtyEl.value = '';
  totalEl.value = '';
  if (totalAmount) totalAmount.textContent = '—';
  totalCalc.textContent = '';
  setControlEnabled(qtyEl, true);
  qtySection.style.display = 'block';
  model.qty = 0;
  stepState.completed[1] = false;
  stepState.available[2] = false;
  stepState.completed[2] = false;
  resetAcknowledgements();
  renderEligibilityAgreement();
  clearConfirmation();
  hideReview();
  setFieldError(qtyEl, '');

  updateReviewPanels();
  persistState();
}

// Provide a cross-browser fallback for "selected" styles.
// Some browsers may not support :has(), so we apply a class on the label.
function updateProductCardSelection() {
  const cards = Array.from(productListEl.querySelectorAll('.prod'));
  cards.forEach((card) => {
    const input = card.querySelector('input[type="radio"]');
    const selected = Boolean(input && input.checked);
    card.classList.toggle('is-selected', selected);
  });
}

function announce(message) {
  if (!stepLiveRegion || !message) return;
  stepLiveRegion.textContent = '';
  requestAnimationFrame(() => { stepLiveRegion.textContent = message; });
}

const prefersReducedMotion = (() => {
  try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (err) { return false; }
})();

function isElementInView(el, margin = 12) {
  if (!el) return true;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  return rect.top >= margin && rect.bottom <= (vh - margin);
}

function scrollIntoViewSafe(el, { force = false } = {}) {
  if (!el) return;
  if (!force && isElementInView(el)) return; // prevents rapid “jump” scrolling
  el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function applyLockState() {
  stepSections.forEach((sec, i) => {
    const available = stepState.available[i];
    if (lockNotes[i]) lockNotes[i].style.display = available ? 'none' : 'block';
    sec.querySelectorAll('.step-body input, .step-body select, .step-body textarea, .step-body button').forEach(el => {
      let enabled = available;
      if (el === stateEl) enabled = catalogReady && Boolean(model.productType);
      else if (el === officeInput) enabled = catalogReady && Boolean(model.productType && model.state);
      else if (el === qtyEl) enabled = available && Boolean(model.product);
      else if (el.closest('#permitHolderFieldset')) enabled = available && ackRequirementsMet();
      else if (el === ackEligibility) enabled = available && productRequiresEligibility(model.product);
      setControlEnabled(el, enabled);
    });
  });
  syncPermitHolderAccess();
}

function updateStepUI(activeIdx = model.step) {
  model.step = activeIdx;
  stepState.open = stepState.open.map((open, i) => (stepState.available[i] ? open : false));
  const activeStepIndex = stepState.open.findIndex(Boolean);

  stepSections.forEach((sec, i) => {
    const open = stepState.open[i] && stepState.available[i];
    sec.classList.toggle('collapsed', !open);
    const body = sec.querySelector('.step-body');
    const toggle = sec.querySelector('.step-toggle');
    if (body) {
      body.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) {
        body.removeAttribute('inert');
      } else {
        body.setAttribute('inert', '');
      }
    }
    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.disabled = !stepState.available[i];
      toggle.setAttribute('aria-disabled', String(!stepState.available[i]));
    }
    const statusEl = stepStatuses[i];
    if (statusEl) {
      const status = !stepState.available[i]
        ? 'Locked'
        : stepState.completed[i]
          ? 'Completed'
          : 'In progress';
      statusEl.textContent = status;
    }
  });
  updateLockNotes();
  applyLockState();
  stepState.available.forEach((available, i) => {
    if (available && !prevAvailability[i]) {
      announce(`Step ${i + 1} unlocked. You can now complete this section.`);
    }
  });
  prevAvailability = [...stepState.available];

  if (activeStepIndex !== -1 && activeStepIndex !== lastAnnouncedStep) {
    announce(`Now viewing Step ${activeStepIndex + 1}. ${stepSections[activeStepIndex]?.getAttribute('aria-label') || ''}`.trim());
    lastAnnouncedStep = activeStepIndex;
  }
}

function ackRequirementsMet() {
  const base = ackPrivacy.checked && ackTerms.checked;
  if (productRequiresEligibility(model.product)) {
    return base && Boolean(ackEligibility && ackEligibility.checked);
  }
  return base;
}

function clearConfirmation() {
  if (confirmation) confirmation.style.display = 'none';
  if (permitDownloadBtn) permitDownloadBtn.disabled = true;
  if (permitRefEl) permitRefEl.textContent = '—';
  if (permitDownloadUrl) {
    try { URL.revokeObjectURL(permitDownloadUrl); } catch (err) { /* no-op */ }
    permitDownloadUrl = '';
  }
}

function renderEligibilityAgreement() {
  if (!eligibilityAgreement || !ackEligibility || !eligibilityLabel || !eligibilityBody) return;

  const required = productRequiresEligibility(model.product);
  ackEligibility.required = required;
  if (!required) {
    eligibilityAgreement.style.display = 'none';
    eligibilityBody.innerHTML = '';
    eligibilityLabel.textContent = 'I certify that I meet the eligibility requirements for this permit.';
    ackEligibility.checked = false;
    return;
  }

  const elig = getProductEligibility(model.product) || {};
  eligibilityAgreement.style.display = 'block';
  eligibilityLabel.textContent = elig.label || 'I certify that I meet the eligibility requirements for this permit.';

  eligibilityBody.innerHTML = '';
  if (elig.intro) {
    const p = document.createElement('div');
    p.textContent = elig.intro;
    eligibilityBody.appendChild(p);
  }

  if (Array.isArray(elig.bullets) && elig.bullets.length) {
    const ul = document.createElement('ul');
    elig.bullets.forEach((b) => {
      const li = document.createElement('li');
      li.textContent = b;
      ul.appendChild(li);
    });
    eligibilityBody.appendChild(ul);
  }

  if (Array.isArray(elig.citations) && elig.citations.length) {
    const citeWrap = document.createElement('div');
    citeWrap.style.marginTop = '8px';
    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.textContent = 'Read the legal text';
    citeWrap.appendChild(title);

    const list = document.createElement('ul');
    elig.citations.forEach((c) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = c.url || '#';
      a.textContent = c.label || 'Legal reference';
      a.target = '_blank';
      a.rel = 'noopener';
      li.appendChild(a);
      list.appendChild(li);
    });
    citeWrap.appendChild(list);
    eligibilityBody.appendChild(citeWrap);
  }
}

function configureCheckoutCopy() {
  if (!model.product || !model.qty) return;
  const unitPrice = model.product?.price || 0;
  const total = unitPrice * (model.qty || 0);
  const noFee = unitPrice === 0 && total === 0;

  if (confirmPaygovBtn) confirmPaygovBtn.textContent = noFee ? 'Confirm and get permit' : 'Continue to Pay.gov';

  if (nextStepsList) {
    nextStepsList.innerHTML = '';
    const items = noFee
      ? [
          'No payment is required.',
          'After you confirm, you will be able to download and save your permit.',
          'This demo does not send email.'
        ]
      : [
          'You will be redirected to Pay.gov to complete payment.',
          'After payment, you will return here to download and save your permit.',
          'This demo does not send email.'
        ];
    items.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      nextStepsList.appendChild(li);
    });
  }
}

function syncPermitHolderAccess() {
  const unlocked = ackRequirementsMet();
  if (permitHolderFieldset) {
    permitHolderFieldset.disabled = !unlocked;
    permitHolderFieldset.classList.toggle('locked', !unlocked);
    permitHolderFieldset.style.display = unlocked ? 'block' : 'none';
  }
  if (permitHolderBlockedHint) {
    permitHolderBlockedHint.style.display = unlocked ? 'none' : 'block';
  }
  if (!unlocked) {
    Object.values(permitHolder).forEach(el => setFieldError(el, ''));
  }
}

function resetAcknowledgements() {
  ackPrivacy.checked = false;
  ackTerms.checked = false;
  if (ackEligibility) ackEligibility.checked = false;
  ackPrivacy.disabled = false;
  ackTerms.disabled = false;
  ackPrivacy.removeAttribute('aria-disabled');
  ackTerms.removeAttribute('aria-disabled');
  syncPermitHolderAccess();
  renderEligibilityAgreement();
}

function getFieldContainer(el) {
  return el?.closest('.row') || el?.closest('.agreement-item') || el?.parentElement;
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

function setFieldError(el, message) {
  if (!el) return;
  const container = getFieldContainer(el);
  if (!container) return;
  let target = container.querySelector('.field-error');
  if (!target) {
    target = document.createElement('div');
    target.className = 'field-error';
    target.setAttribute('aria-live', 'polite');
    container.appendChild(target);
  }
  if (!target.id) {
    const baseId = el.id || el.name || 'field';
    target.id = `${baseId}-error`;
  }
  if (message) {
    target.textContent = message;
    target.classList.add('active');
    el.setAttribute('aria-invalid', 'true');
    updateAriaDescribedBy(el, target.id, true);
  } else {
    target.textContent = '';
    target.classList.remove('active');
    el.removeAttribute('aria-invalid');
    updateAriaDescribedBy(el, target.id, false);
  }
}

function clearAllFieldErrors() {
  document.querySelectorAll('.field-error').forEach(el => {
    el.textContent = '';
    el.classList.remove('active');
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

function showErrors(messages) {
  errorList.innerHTML = '';
  for (const m of messages) {
    const li = document.createElement('li');
    li.textContent = m;
    errorList.appendChild(li);
  }
  errorBox.setAttribute('aria-hidden', 'false');
  errorBox.style.display = 'block';
  errorBox.focus();
}

function hideErrors() {
  errorBox.setAttribute('aria-hidden', 'true');
  errorBox.style.display = 'none';
  errorList.innerHTML = '';
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

function validateStep1() {
  const ok = Boolean(model.state) && Boolean(model.officeId) && Boolean(model.productType);
  stepState.completed[0] = ok;
  return ok;
}

function validateQty() {
  const p = model.product;

  const v = Number(qtyEl.value);
  const invalid = Boolean(quantityError(p, qtyEl.value));
  if (invalid) {
    // Keep model/UI consistent so downstream logic does not rely on stale quantities/totals.
    model.qty = 0;
    totalEl.value = '';
    if (totalAmount) totalAmount.textContent = '—';
    totalCalc.textContent = '';
    return false;
  }

  model.qty = v;
  const unitPrice = p.price || 0;
  const total = v * unitPrice;

  totalEl.value = unitPrice === 0 ? 'No fee' : money(total);
  const amountLabel = totalLabelFor(unitPrice, total);
  const amountChanged = totalAmount && totalAmount.textContent !== amountLabel;
  if (totalAmount) totalAmount.textContent = amountLabel;

  totalCalc.textContent = unitPrice === 0
    ? 'No-fee permit'
    : `${money(unitPrice)} × ${v} ${p.unit}${v === 1 ? '' : 's'} = ${totalEl.value}`;
  if (amountChanged) animateTotalUpdate();
  return true;
}

function animateTotalUpdate() {
  if (!totalAmount || prefersReducedMotion) return;
  totalAmount.classList.remove('is-updating');
  void totalAmount.offsetWidth;
  totalAmount.classList.add('is-updating');
  window.setTimeout(() => totalAmount.classList.remove('is-updating'), 180);
}

function resetQuantityState() {
  model.qty = 0;
  totalEl.value = '';
  if (totalAmount) totalAmount.textContent = '—';
  totalCalc.textContent = '';
  stepState.completed[1] = false;
  stepState.available[2] = false;
  stepState.completed[2] = false;
  stepState.open[2] = false;
  hideReview();
  updateStepUI(model.step);
  updateReviewPanels();
}

function commitQuantity({ showErrors = true } = {}) {
  const wasCompleted = stepState.completed[1];
  const msg = getFieldErrorMessage(qtyEl);
  if (showErrors) {
    setFieldError(qtyEl, msg);
  } else {
    setFieldError(qtyEl, '');
  }

  if (msg) {
    resetQuantityState();
    persistState();
    return false;
  }

  const ok = validateQty();
  stepState.completed[1] = ok;
  stepState.available[2] = ok;
  if (ok && !wasCompleted) {
    stepState.open[2] = true;
  }
  updateStepUI(model.step);
  updateReviewPanels();
  persistState();
  return ok;
}

function validatePermitHolder({ touchFields = false } = {}) {
  const msgs = [];
  const required = Object.keys(permitHolder);
  for (const k of required) {
    const el = permitHolder[k];
    const msg = getFieldErrorMessage(el);
    if (msg) msgs.push(msg);
    if (touchFields) setFieldError(el, msg);
  }
  return msgs;
}

function setStepOpenState(idx, open, { collapseOthers = false, scroll = false, scrollIfNeeded = false } = {}) {
  if (!stepState.available[idx]) return;

  if (collapseOthers) {
    stepState.open = stepState.open.map((_, i) => (i === idx ? open : false));
  } else {
    stepState.open[idx] = open;
  }

  updateStepUI(idx);
  hideErrors();

  if (open && (scroll || scrollIfNeeded)) {
    const head = stepSections[idx]?.querySelector('.step-head');
    if (head) scrollIntoViewSafe(head, { force: scroll });
  }
}

function resetFollowingSteps(startIdx) {
  for (let i = startIdx + 1; i < stepState.available.length; i++) {
    stepState.available[i] = false;
    stepState.completed[i] = false;
    stepState.open[i] = false;
  }
  if (startIdx <= 1) {
    resetAcknowledgements();
  }
  updateStepUI(startIdx);
}

function attemptAdvanceFromStep1() {
  const wasCompleted = stepState.completed[0];
  validateProductType({ showErrors: false });
  const ok = validateStep1();
  stepState.available[1] = ok;
  if (!ok) {
    resetFollowingSteps(0);
    stepState.open = [true, false, false];
    hideLocationNotice();
    productListEl.innerHTML = '';
    qtySection.style.display = 'none';
    updateReviewPanels();
    persistState();
    return;
  }

  if (ok && !wasCompleted) {
    stepState.open[1] = true;
  }
  renderProducts();

  updateStepUI(model.step);

  updateReviewPanels();
  persistState();
}

function handleProductTypeChange(value) {
  setProductType(value);
  resetStateSelection();
  resetProductSelection();
  hideReview();
  hideLocationNotice();
  resetFollowingSteps(0);
  stepState.open = [true, false, false];
  validateProductType({ showErrors: false });
  setFieldError(stateEl, '');
  setFieldError(officeInput, '');
  syncSelectionAvailability();
  updateReviewPanels();
  persistState();
  attemptAdvanceFromStep1();
}

function updateLockNotes() {
  const humanJoin = (items) => {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  };

  if (lockNotes[1]) {
    const needs = [];
    if (!model.productType) needs.push('select what you are collecting');
    if (!model.state) needs.push('choose a state');
    if (!model.officeId) needs.push('pick a BWL office');

    lockNotes[1].textContent = needs.length
      ? `To unlock Step 2, ${humanJoin(needs)}.`
      : '';
  }

  if (lockNotes[2]) {
    if (!model.product) {
      lockNotes[2].textContent = 'To unlock Step 3, choose a product and enter a quantity.';
    } else if (!model.qty) {
      lockNotes[2].textContent = 'To unlock Step 3, enter a quantity within the allowed range.';
    } else {
      lockNotes[2].textContent = '';
    }
  }
}

function evaluateFinalStep({ showErrorsOnFail = false } = {}) {
  const ackOk = ackRequirementsMet();
  const selectionOk = validateStep1() && Boolean(model.product && isSaleActive(model.product)) && validateQty();
  const permitHolderErrors = ackOk ? validatePermitHolder({ touchFields: showErrorsOnFail }) : [];
  const permitHolderValid = permitHolderErrors.length === 0;

  syncPermitHolderAccess();

  if (!selectionOk || !ackOk || !permitHolderValid) {
    stepState.completed[2] = false;
    handoff.style.display = 'none';
    confirmPaygovBtn.disabled = true;
    if (showErrorsOnFail) {
      const errs = [];
      if (!ackOk) {
        if (!ackPrivacy.checked) errs.push('You must acknowledge the Privacy Act notification.');
        if (!ackTerms.checked) errs.push('You must agree to the Terms and Conditions.');
        if (productRequiresEligibility(model.product) && !(ackEligibility && ackEligibility.checked)) {
          errs.push('You must certify you meet the eligibility requirements for this permit.');
        }
      }
      showErrors(errs.concat(permitHolderErrors));
    }
    updateStepUI(model.step);
    updateReviewPanels();
    persistState();
    return false;
  }

  hideErrors();
  stepState.completed[2] = true;
  updateStepUI(2);
  updateReviewPanels();
  persistState();
  return true;
}

// Events
stateEl.addEventListener('change', () => {
  if (!model.productType) {
    stateEl.value = '';
    syncSelectionAvailability();
    return;
  }

  model.state = stateEl.value;

  resetOfficeSelection();
  resetProductSelection();

  stepState.completed[0] = false;
  resetFollowingSteps(0);
  stepState.open = [true, false, false];

  if (model.state) {
    officeOptions = filterOfficeOptions('');
    renderOfficeList(officeOptions, '');
    setOfficeExpanded(true);
    activeIndex = officeOptions.length ? 0 : -1;
  } else {
    activeIndex = -1;
  }

  validateField(stateEl);
  setFieldError(officeInput, '');
  validateStep1();
  hideReview();
  hideLocationNotice();
  syncSelectionAvailability();
  updateStepUI(0);
  updateReviewPanels();
  persistState();
});

stateEl.addEventListener('blur', () => validateField(stateEl));

officeInput.addEventListener('focus', () => {
  if (!model.state) return;
  officeOptions = filterOfficeOptions(officeInput.value);
  renderOfficeList(officeOptions, officeInput.value);
  setOfficeExpanded(true);
  activeIndex = officeOptions.length ? 0 : -1;
  highlightOffice(activeIndex);
});

officeInput.addEventListener('input', () => {
  if (!model.state) return;
  const priorOfficeId = model.officeId;
  const text = officeInput.value.trim();
  const exact = getOfficesForState(model.state).find(o => o.name.toLowerCase() === text.toLowerCase());
  if (exact) {
    officeIdEl.value = exact.id;
    model.officeId = exact.id;
    model.officeName = exact.name;
    setFieldError(officeInput, '');
  } else {
    officeIdEl.value = '';
    model.officeId = '';
    model.officeName = '';
  }

  officeOptions = filterOfficeOptions(officeInput.value);
  renderOfficeList(officeOptions, officeInput.value);
  setOfficeExpanded(true);
  activeIndex = officeOptions.length ? 0 : -1;
  highlightOffice(activeIndex);

  // Rendering products can be expensive; only re-evaluate step gating when selection state changes.
  if (priorOfficeId !== model.officeId) {
    resetProductSelection();
    resetFollowingSteps(0);
    attemptAdvanceFromStep1();
  }
});

officeInput.addEventListener('blur', () => {
  setTimeout(() => setOfficeExpanded(false), 120);
  validateField(officeInput);
});

officeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    setOfficeExpanded(false);
    activeIndex = -1;
    officeInput.removeAttribute('aria-activedescendant');
    return;
  }

  if (officeInput.getAttribute('aria-expanded') !== 'true') {
    setOfficeExpanded(true);
  }
  if (!officeOptions.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, officeOptions.length - 1);
    highlightOffice(activeIndex);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    highlightOffice(activeIndex);
  } else if (e.key === 'Enter') {
    if (officeInput.getAttribute('aria-expanded') === 'true' && activeIndex >= 0) {
      e.preventDefault();
      selectOffice(activeIndex);
    }
  }
});

document.addEventListener('click', (e) => {
  if (!officeCombo.contains(e.target)) setOfficeExpanded(false);
});

stepToggles.forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    if (!stepState.available[idx]) return;
    setStepOpenState(idx, !stepState.open[idx], { collapseOthers: false, scrollIfNeeded: !stepState.open[idx] });
  });
});

qtyEl.addEventListener('input', () => {
  invalidateCheckout();
  const wasCompleted = stepState.completed[1];
  setFieldError(qtyEl, '');
  totalCalc.textContent = '';
  const ok = validateQty();
  if (!ok && totalAmount) totalAmount.textContent = '—';
  stepState.completed[1] = ok;
  stepState.available[2] = ok;
  if (ok && !wasCompleted) {
    stepState.open[2] = true;
  }
  stepState.completed[2] = false;
  clearConfirmation();
  hideReview();
  updateLockNotes();
  updateStepUI(model.step);
  persistState();
  updateReviewPanels();
});

qtyEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    // Explicit action: allow opening the next step.
    commitQuantity();
  } else if (e.key === 'Tab') {
    // Normal navigation: validate, but do NOT auto-advance or trap focus.
    commitQuantity({ showErrors: true });
  }
});

qtyEl.addEventListener('blur', () => {
  // Leaving the field should not auto-advance or yank focus back.
  commitQuantity({ showErrors: true });
});

function onAckChange() { invalidateCheckout(); syncPermitHolderAccess(); evaluateFinalStep(); }
ackPrivacy.addEventListener('change', onAckChange);
ackTerms.addEventListener('change', onAckChange);
if (ackEligibility) ackEligibility.addEventListener('change', onAckChange);

Object.values(permitHolder).forEach((el) => {
  el.addEventListener('input', () => { invalidateCheckout(); validateField(el); evaluateFinalStep(); });
  el.addEventListener('blur', () => { validateField(el); evaluateFinalStep(); });
  if (el.tagName === 'SELECT') {
    el.addEventListener('change', () => { invalidateCheckout(); validateField(el); evaluateFinalStep(); });
  }
});

if (permitDownloadBtn) {
  permitDownloadBtn.addEventListener('click', () => {
    if (!permitDownloadUrl) return;
    const ref = permitRefEl ? permitRefEl.textContent.trim() : 'permit';
    const a = document.createElement('a');
    a.href = permitDownloadUrl;
    a.download = `${ref || 'permit'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

function checkoutSnapshot() {
  return {
    state: model.state, officeId: model.officeId, productId: model.product?.id,
    quantity: model.qty, unitPrice: model.product?.price,
    permitHolder: Object.fromEntries(Object.entries(permitHolder).map(([key, el]) => [key, el.value.trim()])),
    privacy: ackPrivacy.checked, terms: ackTerms.checked, eligibility: Boolean(ackEligibility?.checked)
  };
}

confirmPaygovBtn.addEventListener('click', async () => {
  if (checkoutPending) return;
  const current = getProductsForSelection().find(product => product.id === model.product?.id);
  if (!validateStep1() || !current || current !== model.product || !validateQty()) {
    resetProductSelection();
    resetFollowingSteps(0);
    attemptAdvanceFromStep1();
    hideReview();
    showErrors(['This selection is no longer available. Choose an available product and quantity.']);
    return;
  }
  const ok = evaluateFinalStep({ showErrorsOnFail: true });
  if (!ok) return;
  clearConfirmation();

  const unitPrice = model.product?.price || 0;
  const quantity = model.qty || 0;
  const total = unitPrice * quantity;
  const permitHolderName = [permitHolder.FirstName.value.trim(), permitHolder.MiddleName.value.trim(), permitHolder.LastName.value.trim()].filter(Boolean).join(' ');
  const permitHolderEmail = permitHolder.DeliveryEmail.value.trim();

  if (unitPrice === 0 && total === 0) {
    const permitReference = checkoutIdentity.referenceFor(checkoutSnapshot(), 'PERMIT');

    const payload = buildCheckoutPayload({
      model, holder: readPermitHolder(permitHolder), reference: permitReference,
      eligibility: productRequiresEligibility(model.product)
        ? { certified: Boolean(ackEligibility?.checked), basis: getProductEligibility(model.product).basis }
        : null
    });

    const payloadSize = payloadSizeBytes(payload);
    if (payloadSize > MAX_PAYLOAD_BYTES) {
      showErrors([`Form data is too large (${payloadSize} bytes). Shorten text entries and try again.`]);
      return;
    }

    const lines = [
      'Bureau of Wandering Lands — Forest Product Permit (DEMO)',
      '',
      `Permit reference: ${permitReference}`,
      `Issued to: ${permitHolderName || '—'}`,
      `Delivery email: ${permitHolderEmail || '—'}`,
      '',
      `Office: ${model.officeName || '—'} (${model.officeId || '—'})`,
      `Product: ${model.product?.name || '—'}`,
      `Quantity: ${quantity} ${model.product?.unit || 'unit'}${quantity === 1 ? '' : 's'}`,
      'Fee: No fee',
      '',
      'This is a prototype-generated demo permit. Do not use for actual harvesting.'
    ];
    const revision = checkoutRevision;
    const snapshot = JSON.stringify(checkoutSnapshot());
    checkoutPending = true;
    confirmPaygovBtn.disabled = true;
    confirmPaygovBtn.setAttribute('aria-busy', 'true');
    announce('Generating your demo permit. Please wait.');
    let blob;
    try {
      blob = await buildDemoPermitPdf(lines);
      if (revision !== checkoutRevision || snapshot !== JSON.stringify(checkoutSnapshot())) return;
    } catch (error) {
      if (revision === checkoutRevision) showErrors([`We could not generate the demo permit. Your entries are still here. ${error.message}`]);
      return;
    } finally {
      checkoutPending = false;
      confirmPaygovBtn.removeAttribute('aria-busy');
      confirmPaygovBtn.disabled = !stepState.completed[2];
    }
    permitDownloadUrl = URL.createObjectURL(blob);

    if (permitRefEl) permitRefEl.textContent = permitReference;
    if (confirmation) confirmation.style.display = 'flex';
    if (permitDownloadBtn) permitDownloadBtn.disabled = false;

    renderPayload(handoff, payload, {
      title: 'Demo issuance payload (no fee)',
      note: 'In production, the site would request permit issuance from the permitting system and return a signed permit PDF for download.'
    });

    scrollIntoViewSafe(confirmation || handoff, { force: true });
    confirmation?.focus({ preventScroll: true });
    announce('Demo permit generated. The download button is ready.');
    document.dispatchEvent(new CustomEvent('sfpx:pdf-ready'));
    return;
  }

  const transactionReference = checkoutIdentity.referenceFor(checkoutSnapshot(), 'TX');

  const payload = buildCheckoutPayload({ model, holder: readPermitHolder(permitHolder), reference: transactionReference });

  const payloadSize = payloadSizeBytes(payload);
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    showErrors([`Form data is too large (${payloadSize} bytes). Shorten text entries and try again.`]);
    return;
  }

  renderPayload(handoff, payload, {
    title: 'Demo handoff payload',
    note: 'In production, the site would create a Sale ID and redirect the user to Pay.gov with that transaction context.'
  });
  scrollIntoViewSafe(handoff);
});

resetAllBtn.addEventListener('click', () => {
  clearPermitHolder();
  resetStateSelection();
  setProductType('');
  resetProductSelection();
  setOfficeExpanded(false);
  stepState.available = [true, false, false];
  stepState.completed = [false, false, false];
  stepState.open = [true, false, false];
  resetAcknowledgements();
  hideReview();
  hideErrors();
  hideLocationNotice();
  clearAllFieldErrors();
  syncSelectionAvailability();
  updateStepUI(0);
  updateReviewPanels();
  selectionStorage.clear();
});

function clearPermitHolder() {
  Object.values(permitHolder).forEach(el => { el.value = ''; });
}

// Firefox may restore native form values independently of sessionStorage.
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    clearPermitHolder();
    invalidateCheckout();
    evaluateFinalStep();
  }
});

async function boot() {
  productTypeRadios = renderProductTypes(productTypeOptions, handleProductTypeChange);
  syncSelectionAvailability();
  await loadProductData();
  clearPermitHolder();
  populateUSStates(permitHolder.AddrState);
  restoring = true;
  try { restoreState(); } finally { restoring = false; }
  syncPermitHolderAccess();
  updateReviewPanels();
  syncSelectionAvailability();
  updateStepUI(0);
  document.documentElement.dataset.appReady = 'true';
  document.dispatchEvent(new CustomEvent('sfpx:ready'));
}

export const ready = boot();
