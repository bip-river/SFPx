// What the Demo tools drawer offers on Pay.ure. Card fills appear once "Debit or credit card" is chosen and bank
// fills once "Bank account" is, both only on step 1; step 2 offers the authorization.
import { TEST_CARDS, TEST_BANK_ACCOUNTS, TEST_ROUTING_NUMBERS, groupCardNumber } from '../pay-ure/js/test-instruments.js';
import { navigate } from './navigate.js';

export const startPage = '../';

const $ = selector => document.querySelector(selector);
const view = () => ['none', 'finished', 'unavailable', 'pay', 'review'].find(name => !$(`#view-${name}`)?.hidden) || '';
const method = () => $('input[name=method]:checked')?.value || '';

function type(id, value) {
  const el = document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function choose(id) {
  const el = document.getElementById(id);
  if (!el.checked) el.click();
}

const cont = () => $('#view-pay button[type=submit]').click();
const item = (label, run, { error = false, value } = {}) => ({ label, run, error, value });
const typeItem = (id, label, value, error = false) => item(label, () => type(id, value), { error, value });

function thisMonth() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getFullYear()).slice(-2)}`;
}

export function fillValidCard() {
  choose('method_card');
  type('cardName', 'Test Purchaser'); type('cardNumber', groupCardNumber(TEST_CARDS[0].number)); type('cardExpiry', '12/30'); type('cardCode', '123');
}

export function fillValidBank() {
  choose('method_bank'); choose('accountType_checking');
  type('routingNumber', TEST_ROUTING_NUMBERS[0]); type('accountNumber', TEST_BANK_ACCOUNTS[0].number); type('confirmAccount', TEST_BANK_ACCOUNTS[0].number);
}

function payFills() {
  const groups = [
    { group: 'Everything valid', items: [item('Card that approves', fillValidCard), item('Bank account that approves', fillValidBank)] },
    { group: 'How do you want to pay?', items: [
      item('Debit or credit card', () => choose('method_card')),
      item('Bank account', () => choose('method_bank')),
      ...(method() ? [] : [item('Continue with nothing chosen', cont, { error: true })])
    ] }
  ];
  if (method() === 'card') {
    groups.push(
      { group: 'Name on card', items: [typeItem('cardName', 'Valid', 'Test Purchaser'), typeItem('cardName', 'Empty', '', true)] },
      { group: 'Card number', items: [
        ...TEST_CARDS.map(card => typeItem('cardNumber', `${card.brand} · ${card.label}`, groupCardNumber(card.number))),
        typeItem('cardNumber', 'Real-looking number (refused)', '4242 4242 4242 4242', true),
        typeItem('cardNumber', 'Letters', 'abcd efgh', true),
        typeItem('cardNumber', 'Empty', '', true)
      ] },
      { group: 'Expiry date', items: [
        typeItem('cardExpiry', 'Valid', '12/30'), typeItem('cardExpiry', 'This month (still valid)', thisMonth()),
        typeItem('cardExpiry', 'Expired', '01/25', true), typeItem('cardExpiry', 'Month 13', '13/27', true),
        typeItem('cardExpiry', 'Not a date', 'soon', true), typeItem('cardExpiry', 'Empty', '', true)
      ] },
      { group: 'Security code', items: [typeItem('cardCode', 'Valid', '123'), typeItem('cardCode', 'Two digits', '12', true), typeItem('cardCode', 'Empty', '', true)] }
    );
  }
  if (method() === 'bank') {
    groups.push(
      { group: 'Account type', items: [item('Checking', () => choose('accountType_checking')), item('Savings', () => choose('accountType_savings'))] },
      { group: 'Routing number', items: [
        typeItem('routingNumber', 'Test number', TEST_ROUTING_NUMBERS[0]),
        typeItem('routingNumber', 'One wrong digit', '551234560', true),
        typeItem('routingNumber', 'A real bank’s (refused)', '011000015', true),
        typeItem('routingNumber', 'Too short', '1234', true),
        typeItem('routingNumber', 'Empty', '', true)
      ] },
      { group: 'Account number', items: [
        ...TEST_BANK_ACCOUNTS.map(account => item(`${account.number} · ${account.label}`, () => { type('accountNumber', account.number); type('confirmAccount', account.number); }, { value: account.number })),
        typeItem('accountNumber', 'Not on the list', '9876543210', true),
        typeItem('accountNumber', 'Too short', '12', true),
        typeItem('accountNumber', 'Empty', '', true)
      ] },
      { group: 'Confirm account number', items: [
        item('Matching', () => type('confirmAccount', $('#accountNumber').value)),
        typeItem('confirmAccount', 'Different', '1111111111', true),
        typeItem('confirmAccount', 'Empty', '', true)
      ] }
    );
  }
  return groups;
}

function reviewFills() {
  return [{ group: 'Authorization', items: [
    item('Authorize', () => choose('authorize')),
    item('Don’t authorize, then press Pay', () => { const box = $('#authorize'); if (box.checked) box.click(); $('#payButton').click(); }, { error: true })
  ] }];
}

const VIEW_NAMES = { none: 'No payment in progress', finished: 'Payment finished', unavailable: 'Pay.ure is down', pay: 'Step 1, payment details', review: 'Step 2, check your payment' };

export function context() {
  const name = view();
  const tags = name === 'review' ? ['review-payure'] : [name];
  const fills = name === 'pay' ? payFills() : name === 'review' ? reviewFills() : [];
  const jumps = [];
  if (name === 'pay') {
    jumps.push({ label: 'Step 2 with a card that approves', run: () => { fillValidCard(); cont(); } });
    jumps.push({ label: 'Cancel and return to the permit service', run: () => $('#cancelPay').click() });
  } else if (name === 'review') {
    jumps.push({ label: 'Cancel and return to the permit service', run: () => $('#cancelReview').click() });
  } else {
    jumps.push({ label: 'Permit service start page', run: () => navigate(new URL('../', location.href).href) });
  }
  const signature = JSON.stringify([name, method(), fills.map(group => [group.group, group.items.map(entry => entry.label)])]);
  return { where: `Pay.ure · ${VIEW_NAMES[name] || name}`, tags, fills, jumps, signature };
}
