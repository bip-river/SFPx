// Pay.ure is a demo. It accepts only these published test numbers, so a real card or bank account typed into
// the page is refused before anything else happens. Nothing typed into a payment field is ever stored.

export const TEST_CARDS = [
  { number: '4111111111111111', brand: 'Visa', outcome: 'approve', label: 'Approves' },
  { number: '5555555555554444', brand: 'Mastercard', outcome: 'approve', label: 'Approves' },
  { number: '6011111111111117', brand: 'Discover', outcome: 'approve', label: 'Approves' }
];

// No bank has a routing number starting 55: the first two digits name a Federal Reserve district or a special
// use, and 13–20, 33–60, 73–79 and 81–99 are unassigned. The number still passes the routing checksum.
export const TEST_ROUTING_NUMBERS = ['551234561'];

export const TEST_BANK_ACCOUNTS = [
  { number: '1234567890', outcome: 'approve', label: 'Approves' }
];

export const digitsOnly = value => String(value).replace(/[\s-]/g, '');

export function groupCardNumber(number) {
  return number.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function findTestCard(value) {
  return TEST_CARDS.find(card => card.number === digitsOnly(value)) || null;
}

export function findTestAccount(value) {
  return TEST_BANK_ACCOUNTS.find(account => account.number === digitsOnly(value)) || null;
}

// Routing numbers carry a check digit: weights 3, 7, 1 repeated, and the sum must be a multiple of 10.
export function routingChecksumValid(routing) {
  if (!/^\d{9}$/.test(routing)) return false;
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  return [...routing].reduce((sum, digit, i) => sum + Number(digit) * weights[i], 0) % 10 === 0;
}

// Accepts 08/29, 8/29, 08 / 29, 0829 and 08/2029. Returns { month, year } with a four-digit year, or null.
export function parseExpiry(value) {
  const match = String(value).trim().match(/^(\d{1,2})\s*\/?\s*(\d{2}|\d{4})$/);
  if (!match) return null;
  const [, month, year] = match;
  return { month: Number(month), year: year.length === 2 ? 2000 + Number(year) : Number(year) };
}

// A card is good through the last day of its expiry month.
export function expiryError(value, today = new Date()) {
  if (!String(value).trim()) return 'Enter the expiry date.';
  const expiry = parseExpiry(value);
  if (!expiry) return 'Enter the expiry date as month and year, like 08/29.';
  if (expiry.month < 1 || expiry.month > 12) return 'Enter a month from 01 to 12.';
  const thisMonth = today.getFullYear() * 12 + today.getMonth();
  if (expiry.year * 12 + expiry.month - 1 < thisMonth) return 'This card has expired. Enter a future expiry date.';
  return '';
}

export function formatExpiry(value) {
  const expiry = parseExpiry(value);
  return expiry ? `${String(expiry.month).padStart(2, '0')}/${String(expiry.year).slice(-2)}` : '';
}

export function cardNumberError(value) {
  const digits = digitsOnly(value);
  if (!digits) return 'Enter the card number.';
  if (!/^\d+$/.test(digits)) return 'Card number can only include numbers and spaces.';
  if (!findTestCard(digits)) return 'This demo only accepts the test card numbers listed on this page. Don’t enter a real card number.';
  return '';
}

export function securityCodeError(value) {
  const code = String(value).trim();
  if (!code) return 'Enter the security code.';
  if (!/^\d{3}$/.test(code)) return 'Enter the 3-digit security code from the back of the card.';
  return '';
}

export function routingNumberError(value) {
  const digits = digitsOnly(value);
  if (!digits) return 'Enter the routing number.';
  if (!/^\d{9}$/.test(digits)) return 'Enter a 9-digit routing number.';
  if (!routingChecksumValid(digits)) return 'Check the routing number. One of the digits is wrong.';
  if (!TEST_ROUTING_NUMBERS.includes(digits)) return 'This demo only accepts the test routing number listed on this page. Don’t enter a real bank account.';
  return '';
}

export function accountNumberError(value) {
  const digits = digitsOnly(value);
  if (!digits) return 'Enter the account number.';
  if (!/^\d{4,17}$/.test(digits)) return 'Enter an account number of 4 to 17 digits.';
  if (!findTestAccount(digits)) return 'This demo only accepts the test account numbers listed on this page. Don’t enter a real account number.';
  return '';
}

export function confirmAccountError(value, account) {
  const digits = digitsOnly(value);
  if (!digits) return 'Enter the account number again.';
  if (digits !== digitsOnly(account)) return 'The account numbers don’t match. Check both and try again.';
  return '';
}
