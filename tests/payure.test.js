import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPayure, sleep } from './dom.mjs';
import { createCollectionStore, COLLECTIONS_KEY, CollectionError } from '../pay-ure/js/collections.js';
import { TEST_CARDS, TEST_ROUTING_NUMBERS, TEST_BANK_ACCOUNTS, routingChecksumValid, parseExpiry, expiryError, cardNumberError } from '../pay-ure/js/test-instruments.js';

const AGENCY = 'http://localhost/';
const REQUEST = {
  agencyId: 'BWL-SFP', amount: 12.5, description: 'Firewood permit: Anchorage North, 2 cords', transactionReference: 'TX-test-reference',
  successUrl: `${AGENCY}?payure=success#review`, cancelUrl: `${AGENCY}?payure=cancel#review`
};

function memoryStorage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), data };
}

// Starts a collection the way the agency's server would, and returns the tab storage that holds it.
function startCollection(request = REQUEST, change) {
  const storage = memoryStorage();
  const store = createCollectionStore({ getStorage: () => storage, location: { href: AGENCY } });
  const token = store.startCollection(request);
  if (change) change(store, token);
  return { token, storage: Object.fromEntries(storage.data), store };
}

async function payure(t, { request, change, query } = {}) {
  const { token, storage } = startCollection(request, change);
  const p = await openPayure(t, `${AGENCY}pay-ure/${query ?? `?token=${token}`}`, { storage });
  return { ...p, token, collection: () => JSON.parse(p.w.sessionStorage.getItem(COLLECTIONS_KEY))[token] };
}

const links = p => [...p.w.document.querySelectorAll('#errorList a')].map(link => [link.getAttribute('href'), link.textContent]);

test('opening Pay.ure without a payment in progress points back to the agency', async t => {
  for (const query of ['', '?token=unknown']) {
    const p = await payure(t, { query });
    assert.equal(p.view(), 'none', query);
    assert.equal(p.w.document.title, 'There’s no payment in progress – Pay.ure');
    assert.equal(p.$('#view-none a').getAttribute('href'), '../');
    for (const id of ['order', 'testPanel', 'demoData', 'stepCount']) assert.equal(p.$(`#${id}`).hidden, true, id);
  }
});

test('the payment step shows what is being paid, the test numbers and the collection data', async t => {
  const p = await payure(t);
  assert.equal(p.view(), 'pay');
  assert.equal(p.w.document.title, 'Pay the Bureau of Wandering Lands – Step 1 of 2 – Pay.ure');
  assert.equal(p.$('#stepCount').textContent, 'Step 1 of 2');
  assert.deepEqual([...p.w.document.querySelectorAll('#orderSummary .pu-summary-row')].map(row => row.textContent), [
    'PayingBureau of Wandering Lands', 'ForFirewood permit: Anchorage North, 2 cords', 'Agency referenceTX-test-reference', 'Amount$12.50'
  ]);
  assert.deepEqual([...p.w.document.querySelectorAll('#testCards li')].map(li => li.textContent), [
    '4111 1111 1111 1111Visa · ApprovesUse Visa test card ending 1111',
    '5555 5555 5555 4444Mastercard · ApprovesUse Mastercard test card ending 4444',
    '6011 1111 1111 1117Discover · ApprovesUse Discover test card ending 1117'
  ]);
  assert.equal(p.$('#testAccounts li').textContent, '551234561 / 1234567890Routing / account · ApprovesUse test bank account ending 7890');
  assert.equal(p.$('#cardFields').hidden, true, 'no fields until a method is chosen');
  assert.equal(p.$('#bankFields').hidden, true);
  assert.equal(JSON.parse(p.$('#demoData pre').textContent).token, p.token);
  for (const input of p.w.document.querySelectorAll('#view-pay input[type=text]')) assert.equal(input.getAttribute('autocomplete'), 'off', `${input.id}: browsers must not offer saved real cards`);
  p.cont();
  assert.deepEqual(links(p), [['#methodGroup', 'Choose how you want to pay.']]);
  assert.equal(p.w.document.activeElement, p.$('#errorBox'));
});

test('card details accept only the test numbers, a future expiry and a 3-digit code', async t => {
  const p = await payure(t);
  p.enterCard({ number: '4242 4242 4242 4242', name: '', expiry: '09/26', code: '12' });
  p.cont();
  assert.equal(p.view(), 'pay');
  assert.deepEqual(links(p), [
    ['#cardName', 'Enter the name on the card.'],
    ['#cardNumber', 'This demo only accepts the test card numbers listed on this page. Don’t enter a real card number.'],
    ['#cardExpiry', 'This card has expired. Enter a future expiry date.'],
    ['#cardCode', 'Enter the 3-digit security code from the back of the card.']
  ]);
  assert.equal(p.$('#cardNumber').getAttribute('aria-invalid'), 'true');
  assert.equal(p.$('#cardNumber-error').textContent, 'This demo only accepts the test card numbers listed on this page. Don’t enter a real card number.');
  p.fill('#cardExpiry', '13/27');
  assert.equal(p.$('#cardExpiry-error').textContent, 'Enter a month from 01 to 12.');
  p.fill('#cardExpiry', 'soon');
  assert.equal(p.$('#cardExpiry-error').textContent, 'Enter the expiry date as month and year, like 08/29.');
  p.fill('#cardExpiry', '10/26');
  assert.equal(p.$('#cardExpiry').hasAttribute('aria-invalid'), false, 'a card is good through its expiry month');

  p.$('#testCards button').click();
  assert.equal(p.$('#cardNumber').value, '4111 1111 1111 1111');
  assert.equal(p.$('#cardNumber').hasAttribute('aria-invalid'), false, 'filling a test number clears the error');
  assert.equal(p.w.document.activeElement, p.$('#cardNumber'));
  p.fill('#cardName', 'Test Purchaser'); p.fill('#cardCode', '123');
  p.cont();
  assert.equal(p.view(), 'review');
  assert.equal(p.w.document.title, 'Check your payment – Step 2 of 2 – Pay.ure');
  assert.equal(p.$('#methodSummary dd').textContent, 'Visa ending 1111Expires 10/26Test Purchaser');
  assert.equal(p.$('#authorizeLabel').textContent, 'I authorize Pay.ure to charge $12.50 to this card for my payment to the Bureau of Wandering Lands.');
  assert.equal(p.$('#payButton').textContent, 'Pay $12.50');
});

test('bank account details need an account type, a valid test routing number and matching account numbers', async t => {
  const p = await payure(t);
  p.enterBank({ type: '', routing: '551234560', account: '12', confirm: '99' });
  p.cont();
  assert.deepEqual(links(p), [
    ['#accountTypeGroup', 'Choose checking or savings.'],
    ['#routingNumber', 'Check the routing number. One of the digits is wrong.'],
    ['#accountNumber', 'Enter an account number of 4 to 17 digits.'],
    ['#confirmAccount', 'The account numbers don’t match. Check both and try again.']
  ]);
  p.$('#errorList a').click();
  assert.equal(p.w.document.activeElement, p.$('#accountType_checking'), 'a group link moves to its first option');
  // A real bank’s routing number passes the checksum but is still refused.
  p.fill('#routingNumber', '011000015');
  assert.equal(p.$('#routingNumber-error').textContent, 'This demo only accepts the test routing number listed on this page. Don’t enter a real bank account.');
  p.$('#testAccounts button').click();
  assert.equal(p.$('#accountType_checking').checked, true);
  assert.equal(p.$('#confirmAccount').value, '1234567890');
  p.cont();
  assert.equal(p.view(), 'review');
  assert.equal(p.$('#methodSummary dd').textContent, 'Checking account ending 7890Routing number 551234561');
  assert.match(p.$('#authorizeLabel').textContent, /^I authorize Pay\.ure to debit \$12\.50 from this account .* URE TREASURY BWL-SFP\.$/);
});

test('paying needs authorization, stores only the last four digits and returns with the token', async t => {
  const p = await payure(t);
  p.enterCard(); p.cont();
  p.$('#payButton').click();
  assert.deepEqual(links(p), [['#authorize', 'Confirm that you authorize this payment.']]);
  assert.equal(p.navigations.length, 0);
  // Change returns to step 1 with the entries kept.
  p.$('#methodSummary a').click();
  await new Promise(resolve => p.w.addEventListener('popstate', () => setTimeout(resolve, 0), { once: true }));
  assert.equal(p.view(), 'pay');
  assert.equal(p.$('#cardNumber').value, '4111 1111 1111 1111');
  p.cont();
  p.$('#authorize').click();
  p.$('#payButton').click();
  assert.equal(p.$('#payButton').getAttribute('aria-busy'), 'true');
  assert.equal(p.$('#payButton').textContent, 'Paying…');
  p.$('#payButton').click();
  for (let n = 0; n < 100 && !p.navigations.length; n++) await sleep(5);
  assert.deepEqual(p.navigations, [{ url: `${AGENCY}?payure=success&token=${p.token}#review`, replace: true }], 'one payment, one return');
  const { status, result } = p.collection();
  assert.equal(status, 'success');
  assert.deepEqual(Object.keys(result).sort(), ['cardBrand', 'completedAt', 'last4', 'method', 'trackingId']);
  assert.equal(result.last4, '1111');
  const stored = p.w.sessionStorage.getItem(COLLECTIONS_KEY);
  for (const secret of ['4111111111111111', '4111 1111', 'Test Purchaser', '12/30']) assert.ok(!stored.includes(secret), secret);
  assert.equal(p.$('#cardNumber').value, '', 'payment fields are emptied');
});

test('a bank account payment records the account type and routing number, not the account number', async t => {
  const p = await payure(t);
  p.enterBank({ type: 'savings' }); p.cont();
  await p.pay();
  assert.deepEqual({ ...p.collection().result, trackingId: '', completedAt: '' }, { method: 'bank', accountType: 'savings', routingNumber: '551234561', last4: '7890', trackingId: '', completedAt: '' });
  assert.ok(!p.w.sessionStorage.getItem(COLLECTIONS_KEY).includes('1234567890'));
});

test('Cancel marks the collection cancelled and returns to the agency’s cancel address', async t => {
  const p = await payure(t);
  p.enterCard(); p.cont();
  p.$('#cancelReview').click();
  assert.deepEqual(p.navigations, [{ url: `${AGENCY}?payure=cancel&token=${p.token}#review`, replace: true }]);
  assert.equal(p.collection().status, 'cancelled');
});

test('a finished payment cannot be paid again', async t => {
  const paid = await payure(t, { change: (store, token) => store.completeCollection(token, { method: 'card', cardBrand: 'Visa', last4: '1111' }) });
  assert.equal(paid.view(), 'finished');
  assert.equal(paid.w.document.title, 'You’ve already paid – Pay.ure');
  assert.match(paid.$('#finishedText').textContent, /^Pay\.ure received this payment of \$12\.50\. Tracking ID PU-[A-Z2-9]{10}\. You won’t be charged again\.$/);
  assert.equal(paid.$('#testPanel').hidden, true);
  paid.$('#finishedReturn').click();
  assert.equal(paid.navigations[0].url, `${AGENCY}?payure=success&token=${paid.token}#review`);
  const cancelled = await payure(t, { change: (store, token) => store.cancelCollection(token) });
  assert.equal(cancelled.view(), 'finished');
  assert.equal(cancelled.$('#title').textContent, 'This payment was cancelled');
  cancelled.$('#finishedReturn').click();
  assert.match(cancelled.navigations[0].url, /\?payure=cancel&token=/);
});

test('the collection store accepts only registered agencies, whole cents and return addresses on its own site', () => {
  const storage = memoryStorage();
  let n = 0;
  const store = createCollectionStore({ getStorage: () => storage, location: { href: AGENCY }, makeId: () => `token-${n++}`, now: () => new Date(Date.UTC(2026, 9, 21, 12, 0, n)) });
  assert.throws(() => store.startCollection({ ...REQUEST, agencyId: 'NOPE' }), CollectionError);
  for (const amount of [0, -5, 10.005, Number.NaN]) assert.throws(() => store.startCollection({ ...REQUEST, amount }), CollectionError, String(amount));
  assert.equal(typeof store.startCollection({ ...REQUEST, amount: 0.1 * 3 }), 'string', 'floating-point cents are fine');
  assert.throws(() => store.startCollection({ ...REQUEST, successUrl: 'https://elsewhere.example/' }), /not registered/);
  const token = store.startCollection(REQUEST);
  const first = store.completeCollection(token, { method: 'card', last4: '1111' });
  assert.equal(store.completeCollection(token, { method: 'card', last4: '4444' }).result.trackingId, first.result.trackingId, 'a second payment changes nothing');
  assert.equal(store.cancelCollection(token).status, 'success', 'a paid collection cannot be cancelled');
  assert.equal(store.returnUrl(first, 'success'), `${AGENCY}?payure=success&token=${token}#review`);
  for (let i = 0; i < 25; i++) store.startCollection(REQUEST);
  assert.equal(Object.keys(JSON.parse(storage.getItem(COLLECTIONS_KEY))).length, 20, 'old collections are dropped');
  assert.throws(() => createCollectionStore({ getStorage: () => { throw new Error('blocked'); }, location: { href: AGENCY } }).startCollection(REQUEST), /blocked/);
});

test('the published test numbers are well formed and none is a real bank routing number', () => {
  for (const routing of TEST_ROUTING_NUMBERS) {
    assert.equal(routingChecksumValid(routing), true, routing);
    const district = Number(routing.slice(0, 2));
    assert.ok(!(district <= 12 || (district >= 21 && district <= 32) || (district >= 61 && district <= 72) || district === 80), `${routing} uses an unassigned prefix`);
  }
  assert.equal(new Set(TEST_CARDS.map(card => card.number)).size, TEST_CARDS.length);
  for (const card of TEST_CARDS) assert.equal(cardNumberError(card.number), '', card.number);
  assert.equal(new Set(TEST_BANK_ACCOUNTS.map(account => account.number)).size, TEST_BANK_ACCOUNTS.length);
  assert.deepEqual(parseExpiry('8 / 2029'), { month: 8, year: 2029 });
  assert.deepEqual(parseExpiry('0829'), { month: 8, year: 2029 });
  assert.equal(expiryError('10/26', new Date(2026, 9, 31)), '');
  assert.equal(expiryError('10/26', new Date(2026, 10, 1)), 'This card has expired. Enter a future expiry date.');
});
