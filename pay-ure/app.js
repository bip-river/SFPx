import { createCollectionStore, AGENCIES } from './js/collections.js';
import { navigate } from './js/navigate.js';
import {
  TEST_CARDS, TEST_ROUTING_NUMBERS, TEST_BANK_ACCOUNTS, digitsOnly, groupCardNumber, findTestCard,
  cardNumberError, expiryError, formatExpiry, securityCodeError, routingNumberError, accountNumberError, confirmAccountError
} from './js/test-instruments.js';

// Long enough to notice that something happened, short enough not to test anyone's patience.
export const PROCESSING_MS = 800;
const SITE = 'Pay.ure';

const byId = id => document.getElementById(id);
const store = createCollectionStore();

const bannerToggle = byId('bannerToggle');
const bannerDetails = byId('bannerDetails');
bannerToggle.addEventListener('click', () => {
  const open = bannerToggle.getAttribute('aria-expanded') === 'true';
  bannerDetails.hidden = open;
  bannerToggle.setAttribute('aria-expanded', String(!open));
});

const title = byId('title');
const stepCount = byId('stepCount');
const errorBox = byId('errorBox');
const errorList = byId('errorList');
const liveRegion = byId('liveRegion');
const views = { none: byId('view-none'), finished: byId('view-finished'), pay: byId('view-pay'), review: byId('view-review') };
const order = byId('order');
const orderSummary = byId('orderSummary');
const testPanel = byId('testPanel');
const demoData = byId('demoData');
const demoDataBody = byId('demoDataBody');
const methodGroup = byId('methodGroup');
const cardFields = byId('cardFields');
const bankFields = byId('bankFields');
const accountTypeGroup = byId('accountTypeGroup');
const methodSummary = byId('methodSummary');
const authorize = byId('authorize');
const authorizeLabel = byId('authorizeLabel');
const payButton = byId('payButton');
const fields = Object.fromEntries(['cardName', 'cardNumber', 'cardExpiry', 'cardCode', 'routingNumber', 'accountNumber', 'confirmAccount'].map(id => [id, byId(id)]));

let collection = null;
let currentView = 'none';
let paying = false;

const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const agencyName = () => collection?.request.agencyName || AGENCIES['BWL-SFP'].name;
const checked = name => document.querySelector(`input[name=${name}]:checked`)?.value || '';
const method = () => checked('method');

// Each validator returns the message for its field, or '' when the entry is fine.
const VALIDATORS = {
  cardName: el => (el.value.trim() ? '' : 'Enter the name on the card.'),
  cardNumber: el => cardNumberError(el.value),
  cardExpiry: el => expiryError(el.value, new Date()),
  cardCode: el => securityCodeError(el.value),
  routingNumber: el => routingNumberError(el.value),
  accountNumber: el => accountNumberError(el.value),
  confirmAccount: el => confirmAccountError(el.value, fields.accountNumber.value)
};

function announce(message) {
  liveRegion.textContent = '';
  requestAnimationFrame(() => { liveRegion.textContent = message; });
}

// Errors sit above their control, as on the agency's site. A group is described by its error.
function setFieldError(el, message) {
  const container = el.closest('.pu-field');
  let target = container.querySelector(':scope > .pu-error');
  if (!target) {
    if (!message) return;
    target = document.createElement('p');
    target.className = 'pu-error';
    target.id = `${el.id}-error`;
    container.insertBefore(target, container.querySelector(':scope > .pu-input'));
  }
  target.textContent = message;
  container.classList.toggle('has-error', Boolean(message));
  const described = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== target.id);
  if (message) described.push(target.id);
  if (described.length) el.setAttribute('aria-describedby', described.join(' '));
  else el.removeAttribute('aria-describedby');
  if (el.matches('fieldset')) return;
  if (message) el.setAttribute('aria-invalid', 'true');
  else el.removeAttribute('aria-invalid');
}

function showErrors(errors) {
  errorList.replaceChildren(...errors.map(({ text, field }) => {
    const li = document.createElement('li');
    if (!field) { li.textContent = text; return li; }
    const link = document.createElement('a');
    link.href = `#${field.id}`;
    link.textContent = text;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      (field.matches('fieldset') ? field.querySelector('input:checked') || field.querySelector('input') : field).focus();
    });
    li.appendChild(link);
    return li;
  }));
  errorBox.hidden = false;
  errorBox.focus();
}

function hideErrors() {
  errorBox.hidden = true;
  errorList.replaceChildren();
}

function summaryRow(key, lines, change) {
  const row = document.createElement('div');
  row.className = 'pu-summary-row';
  const dt = document.createElement('dt');
  dt.textContent = key;
  const dd = document.createElement('dd');
  lines.filter(Boolean).forEach((line, i) => {
    const span = document.createElement('span');
    span.className = i === 0 ? 'pu-summary-main' : 'pu-summary-line';
    span.textContent = line;
    dd.appendChild(span);
  });
  row.append(dt, dd);
  if (change) {
    const action = document.createElement('dd');
    action.className = 'pu-summary-action';
    const link = document.createElement('a');
    link.href = '#pay';
    link.append('Change');
    const context = document.createElement('span');
    context.className = 'sr-only';
    context.textContent = ` ${change}`;
    link.appendChild(context);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      history.back();
    });
    action.appendChild(link);
    row.appendChild(action);
  }
  return row;
}

function renderOrder() {
  const { request } = collection;
  orderSummary.replaceChildren(
    summaryRow('Paying', [request.agencyName]),
    summaryRow('For', [request.description]),
    summaryRow('Agency reference', [request.transactionReference]),
    summaryRow('Amount', [money(request.amount)])
  );
  orderSummary.lastElementChild.classList.add('pu-summary-total');
}

function renderTestPanel() {
  const item = (number, description, useLabel, onUse) => {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.className = 'pu-test-text';
    const num = document.createElement('span');
    num.className = 'pu-test-number';
    num.textContent = number;
    const desc = document.createElement('span');
    desc.className = 'pu-test-desc';
    desc.textContent = description;
    text.append(num, desc);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pu-use';
    button.append('Use');
    const context = document.createElement('span');
    context.className = 'sr-only';
    context.textContent = ` ${useLabel}`;
    button.appendChild(context);
    button.addEventListener('click', onUse);
    li.append(text, button);
    return li;
  };
  byId('testCards').replaceChildren(...TEST_CARDS.map(card => item(
    groupCardNumber(card.number), `${card.brand} · ${card.label}`, `${card.brand} test card ending ${card.number.slice(-4)}`,
    () => useTestCard(card)
  )));
  const routing = TEST_ROUTING_NUMBERS[0];
  byId('testAccounts').replaceChildren(...TEST_BANK_ACCOUNTS.map(account => item(
    `${routing} / ${account.number}`, `Routing / account · ${account.label}`, `test bank account ending ${account.number.slice(-4)}`,
    () => useTestAccount(routing, account)
  )));
}

function chooseMethod(value) {
  document.getElementById(`method_${value}`).checked = true;
  syncMethod();
}

function fill(el, value) {
  el.value = value;
  if (el.getAttribute('aria-invalid') === 'true') validateField(el);
}

function useTestCard(card) {
  chooseMethod('card');
  fill(fields.cardNumber, groupCardNumber(card.number));
  fields.cardNumber.focus();
  announce(`${card.brand} test card number filled in.`);
}

function useTestAccount(routing, account) {
  chooseMethod('bank');
  fill(fields.routingNumber, routing);
  fill(fields.accountNumber, account.number);
  fill(fields.confirmAccount, account.number);
  if (!checked('accountType')) document.getElementById('accountType_checking').checked = true;
  setFieldError(accountTypeGroup, '');
  fields.routingNumber.focus();
  announce('Test bank account filled in.');
}

function syncMethod() {
  cardFields.hidden = method() !== 'card';
  bankFields.hidden = method() !== 'bank';
  if (method()) setFieldError(methodGroup, '');
}

function validateField(el) {
  const message = VALIDATORS[el.id]?.(el) || '';
  setFieldError(el, message);
  return message;
}

function payErrors() {
  if (!method()) return [{ text: 'Choose how you want to pay.', field: methodGroup }];
  const errors = [];
  if (method() === 'bank' && !checked('accountType')) errors.push({ text: 'Choose checking or savings.', field: accountTypeGroup });
  const ids = method() === 'card' ? ['cardName', 'cardNumber', 'cardExpiry', 'cardCode'] : ['routingNumber', 'accountNumber', 'confirmAccount'];
  for (const id of ids) {
    const text = VALIDATORS[id](fields[id]);
    if (text) errors.push({ text, field: fields[id] });
  }
  return errors;
}

// What Pay.ure keeps: the method, brand or account type, and the last four digits.
function paymentDetails() {
  if (method() === 'card') {
    const card = findTestCard(fields.cardNumber.value);
    return { method: 'card', cardBrand: card.brand, last4: card.number.slice(-4), outcome: card.outcome };
  }
  const account = digitsOnly(fields.accountNumber.value);
  return { method: 'bank', accountType: checked('accountType'), routingNumber: digitsOnly(fields.routingNumber.value), last4: account.slice(-4), outcome: 'approve' };
}

function describeMethod(details) {
  if (details.method === 'card') {
    return [`${details.cardBrand} ending ${details.last4}`, `Expires ${formatExpiry(fields.cardExpiry.value)}`, fields.cardName.value.trim()];
  }
  const type = details.accountType === 'savings' ? 'Savings' : 'Checking';
  return [`${type} account ending ${details.last4}`, `Routing number ${details.routingNumber}`];
}

function renderReview() {
  const details = paymentDetails();
  const amount = money(collection.request.amount);
  methodSummary.replaceChildren(summaryRow('Pay with', describeMethod(details), 'payment method'));
  authorizeLabel.textContent = details.method === 'card'
    ? `I authorize ${SITE} to charge ${amount} to this card for my payment to the ${agencyName()}.`
    : `I authorize ${SITE} to debit ${amount} from this account for my payment to the ${agencyName()}. The debit will show on my statement as URE TREASURY ${collection.request.agencyId}.`;
  payButton.textContent = `Pay ${amount}`;
}

function renderDemoData() {
  const note = document.createElement('p');
  note.className = 'pu-hint';
  note.textContent = `The ${agencyName()} started this collection and sent you here with its token. In production that happens server to server; this demo keeps it in your browser tab. Card and account numbers are never saved. When you pay, ${SITE} sends you back with the token, and the agency looks up the result: a tracking ID, the method and the last 4 digits.`;
  const pre = document.createElement('pre');
  pre.className = 'pu-payload';
  pre.textContent = JSON.stringify(collection, null, 2);
  demoDataBody.replaceChildren(note, pre);
}

const VIEW_TITLES = {
  none: 'There’s no payment in progress',
  pay: () => `Pay the ${agencyName()}`,
  review: 'Check your payment'
};

function showView(name, { history: mode = 'none', focus = true } = {}) {
  currentView = name;
  for (const [viewName, el] of Object.entries(views)) el.hidden = viewName !== name;
  const inProgress = name === 'pay' || name === 'review';
  order.hidden = !inProgress;
  testPanel.hidden = !inProgress;
  demoData.hidden = !collection;
  stepCount.hidden = !inProgress;
  hideErrors();

  if (name === 'review') renderReview();
  if (name === 'finished') renderFinished();
  const heading = typeof VIEW_TITLES[name] === 'function' ? VIEW_TITLES[name]() : VIEW_TITLES[name] || title.textContent;
  title.textContent = heading;
  if (inProgress) {
    const step = name === 'pay' ? 1 : 2;
    stepCount.textContent = `Step ${step} of 2`;
    document.title = `${heading} – Step ${step} of 2 – ${SITE}`;
  } else {
    document.title = `${heading} – ${SITE}`;
  }
  if (mode === 'push') history.pushState({ view: name }, '', `#${name}`);
  else if (mode === 'replace') history.replaceState({ view: name }, '', name === 'pay' ? location.pathname + location.search : `#${name}`);
  if (focus) {
    window.scrollTo(0, 0);
    title.focus({ preventScroll: true });
  }
}

function renderFinished() {
  const paid = collection.status === 'success';
  VIEW_TITLES.finished = paid ? 'You’ve already paid' : 'This payment was cancelled';
  byId('finishedText').textContent = paid
    ? `${SITE} received this payment of ${money(collection.request.amount)}. Tracking ID ${collection.result.trackingId}. You won’t be charged again.`
    : 'You cancelled this payment, so nothing was charged. To pay, go back to the agency’s website and start again.';
}

function returnToAgency(outcome) {
  navigate(store.returnUrl(collection, outcome), { replace: true });
}

function cancel() {
  if (paying) return;
  collection = store.cancelCollection(collection.token);
  // Another tab may have paid meanwhile; the agency then hears about the payment, not a cancellation.
  returnToAgency(collection.status === 'success' ? 'success' : 'cancel');
}

async function pay() {
  if (paying) return;
  if (!authorize.checked) {
    setFieldError(authorize, 'Confirm that you authorize this payment.');
    showErrors([{ text: 'Confirm that you authorize this payment.', field: authorize }]);
    return;
  }
  paying = true;
  payButton.setAttribute('aria-busy', 'true');
  payButton.setAttribute('aria-disabled', 'true');
  payButton.textContent = 'Paying…';
  announce('Processing your payment. Don’t close this page.');
  await new Promise(resolve => setTimeout(resolve, PROCESSING_MS));
  const { outcome, ...details } = paymentDetails();
  collection = store.completeCollection(collection.token, details);
  clearPaymentFields();
  returnToAgency(collection.status === 'cancelled' ? 'cancel' : 'success');
}

function clearPaymentFields() {
  Object.values(fields).forEach((el) => { el.value = ''; });
  document.querySelectorAll('input[type=radio], input[type=checkbox]').forEach((el) => { el.checked = false; });
}

views.pay.addEventListener('submit', (event) => {
  event.preventDefault();
  const errors = payErrors();
  Object.values(fields).forEach(el => setFieldError(el, ''));
  setFieldError(methodGroup, '');
  setFieldError(accountTypeGroup, '');
  errors.forEach(({ text, field }) => setFieldError(field, text));
  if (errors.length) {
    showErrors(errors);
    return;
  }
  authorize.checked = false;
  setFieldError(authorize, '');
  showView('review', { history: 'push' });
});

views.review.addEventListener('submit', (event) => {
  event.preventDefault();
  pay();
});

document.querySelectorAll('input[name=method]').forEach(el => el.addEventListener('change', syncMethod));
document.querySelectorAll('input[name=accountType]').forEach(el => el.addEventListener('change', () => setFieldError(accountTypeGroup, '')));
authorize.addEventListener('change', () => { if (authorize.checked) setFieldError(authorize, ''); });
// Errors appear once a field is left, then follow each keystroke until fixed.
Object.values(fields).forEach((el) => {
  el.addEventListener('change', () => validateField(el));
  el.addEventListener('input', () => {
    if (el.getAttribute('aria-invalid') === 'true') validateField(el);
    if (el === fields.accountNumber && fields.confirmAccount.getAttribute('aria-invalid') === 'true') validateField(fields.confirmAccount);
  });
});
byId('cancelPay').addEventListener('click', cancel);
byId('cancelReview').addEventListener('click', cancel);
byId('finishedReturn').addEventListener('click', () => returnToAgency(collection.status === 'success' ? 'success' : 'cancel'));

// The review step needs the entries from step 1, which live only in memory.
window.addEventListener('popstate', () => {
  if (!collection || collection.status !== 'pending') return;
  const wanted = history.state?.view === 'review' && method() && !payErrors().length ? 'review' : 'pay';
  showView(wanted, { history: wanted === 'review' ? 'none' : 'replace' });
});

// A page restored from the back-forward cache must not show card details or offer a finished payment again.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted || !collection) return;
  clearPaymentFields();
  syncMethod();
  paying = false;
  payButton.removeAttribute('aria-busy');
  payButton.removeAttribute('aria-disabled');
  collection = store.getCollection(collection.token);
  showView(collection?.status === 'pending' ? 'pay' : collection ? 'finished' : 'none', { history: 'replace' });
});

function boot() {
  clearPaymentFields();
  const token = new URLSearchParams(location.search).get('token');
  collection = store.getCollection(token);
  if (!collection) {
    showView('none', { focus: false });
  } else if (collection.status !== 'pending') {
    showView('finished', { focus: false });
  } else {
    renderOrder();
    renderTestPanel();
    renderDemoData();
    syncMethod();
    showView('pay', { history: 'replace', focus: false });
  }
  document.documentElement.dataset.appReady = 'true';
}

boot();
export const ready = Promise.resolve();
