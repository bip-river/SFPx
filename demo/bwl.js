// What the Demo tools drawer offers on each screen of the permit service. Fills act the way a visitor does (typing
// and leaving a field, clicking an option, pressing Continue), so every message and rule is the app's own.
export const startPage = './';

const $ = selector => document.querySelector(selector);
const screen = () => [...document.querySelectorAll('.screen')].find(el => !el.hidden)?.id.replace('screen-', '') || '';
const visible = el => Boolean(el) && !el.hidden && !el.closest('[hidden]');

export const VALID_HOLDER = {
  FirstName: 'Test', MiddleName: '', LastName: 'Purchaser', AddressLine1: '123 Test Street', AddressLine2: '', City: 'Test City',
  AddrState: 'UT', Zip: '84037', DeliveryEmail: 'test@example.com', ConfirmEmail: 'test@example.com'
};

// Typing a value and leaving the field, so the field's own check runs.
function type(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function click(selector) {
  const el = typeof selector === 'string' ? $(selector) : selector;
  if (el && !(el.type === 'radio' && el.checked)) el.click();
}

const cont = () => $(`#screen-${screen()} button[type=submit]`)?.click();

function goToScreen(name) {
  if (screen() === 'start' && name !== 'start') { click('#startButton'); if (name === 'what') return; }
  window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: name } }));
}

function productCards() {
  return [...document.querySelectorAll('#productList input[name=product]')].map(input => {
    const card = input.closest('.option');
    return { input, free: card.querySelector('.option-aside')?.textContent.trim() === 'No fee', subsistence: /eligib/i.test(card.querySelector('.option-sub')?.textContent || '') };
  });
}

const PERMITS = {
  paid: cards => cards.find(card => !card.free && !card.subsistence),
  free: cards => cards.find(card => card.free && !card.subsistence),
  subsistence: cards => cards.find(card => card.subsistence)
};

function choosePermit(kind) {
  const card = PERMITS[kind](productCards());
  if (!card) return false;
  click(card.input);
  const ack = $('#ackEligibility');
  if (visible($('#eligibilityAgreement')) && !ack.checked) ack.click();
  return true;
}

function fillHolder(values = VALID_HOLDER) {
  for (const [id, value] of Object.entries(values)) type(id, value);
}

// Answers every screen up to `target` with valid entries and stops there. `permit` picks a paid, free or
// subsistence permit in Anchorage, Alaska, where all three are on sale.
export function jumpTo(target, permit = 'paid') {
  const order = ['start', 'what', 'where', 'permit', 'details', 'review', 'done'];
  const canonical = order.indexOf(target) >= order.indexOf('review');
  if (target === 'start') { goToScreen('start'); return; }
  goToScreen('what');
  if (canonical || !$('input[name=ptype]:checked')) click('#ptype_fuelwood');
  if (target === 'what') return;
  cont();
  if (screen() !== 'where') return;
  if (canonical || !$('input[name=office]:checked')) {
    if ($('#state').value !== 'AK') { $('#state').value = 'AK'; $('#state').dispatchEvent(new Event('change', { bubbles: true })); }
    click('input[name=office][value="AK-ANCH"]') ;
    if (!$('input[name=office]:checked')) click('input[name=office]');
  }
  if (target === 'where') return;
  cont();
  if (screen() !== 'permit') return;
  if (canonical || !$('input[name=product]:checked')) choosePermit(permit);
  if (target === 'permit') return;
  cont();
  if (screen() !== 'details') return;
  if (canonical || [...Object.keys(VALID_HOLDER)].some(id => document.getElementById(id).getAttribute('aria-invalid') === 'true' || (VALID_HOLDER[id] && !document.getElementById(id).value))) fillHolder();
  if (target === 'details') return;
  cont();
  if (target === 'done' && screen() === 'review') {
    click('#agree');
    $('#confirmPay').click();
  }
}

const item = (label, run, { error = false, value } = {}) => ({ label, run, error, value });
const typeItem = (id, label, value, error = false) => item(label, () => type(id, value), { error, value });

const HOLDER_FILLS = [
  ['FirstName', 'First name', [['Valid', 'Test'], ['Greek and Cyrillic', 'Ελένη Борис'], ['Empty', '', true], ['Emoji (can’t print)', 'Test 🌲', true], ['Too long', 'A'.repeat(51), true]]],
  ['MiddleName', 'Middle name', [['Valid', 'Quinn'], ['Empty (optional)', ''], ['Emoji (can’t print)', 'Q 🌲', true]]],
  ['LastName', 'Last name', [['Valid', 'Purchaser'], ['Accented', 'Muñoz Żółć'], ['Empty', '', true], ['Emoji (can’t print)', 'Purchaser 🌲', true]]],
  ['AddressLine1', 'Street address', [['Valid', '123 Test Street'], ['Empty', '', true], ['Too short', '1 St', true], ['Too long', `1 ${'Long '.repeat(24)}Road`, true]]],
  ['AddressLine2', 'Apartment, suite or unit', [['Valid', 'Apt 4'], ['Empty (optional)', '']]],
  ['City', 'City', [['Valid', 'Test City'], ['Empty', '', true], ['Too short', 'X', true], ['Chinese (can’t print)', '東京', true]]],
  ['AddrState', 'State', [['Utah', 'UT'], ['Alaska', 'AK'], ['None', '', true]]],
  ['Zip', 'ZIP code', [['Valid', '84037'], ['ZIP+4', '84037-1234'], ['Empty', '', true], ['Too short', '8403', true]]],
  ['DeliveryEmail', 'Email', [['Valid', 'test@example.com'], ['Empty', '', true], ['No domain ending', 'test@example', true], ['Emoji (can’t print)', 'te🌲st@example.com', true]]]
];

function screenFills(name) {
  if (name === 'what') {
    const groups = [{ group: 'What are you collecting?', items: [
      item('Firewood', () => click('#ptype_fuelwood')), item('Christmas tree', () => click('#ptype_christmas')), item('Mushrooms', () => click('#ptype_mushrooms'))
    ] }];
    if (!$('input[name=ptype]:checked')) groups[0].items.push(item('Continue with nothing chosen', cont, { error: true }));
    return groups;
  }
  if (name === 'where') {
    const setState = value => { const el = $('#state'); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
    return [
      { group: 'State', items: [
        item('Alaska', () => setState('AK')),
        item('A state with no areas online', () => {
          const current = $('#state').value;
          for (const option of [...$('#state').options].slice(1)) {
            setState(option.value);
            if (visible($('#noAreas'))) return;
          }
          setState(current);
        }, { error: true }),
        item('None, then Continue', () => { setState(''); cont(); }, { error: true })
      ] },
      { group: 'Area', items: [
        item('First area', () => click('input[name=office]')),
        item('None, then Continue', () => { const state = $('#state').value || 'AK'; setState(''); setState(state); cont(); }, { error: true })
      ] }
    ];
  }
  if (name === 'permit') {
    const groups = [{ group: 'Permit', items: [
      item('Paid', () => choosePermit('paid')), item('Free', () => choosePermit('free')), item('Subsistence (needs certification)', () => choosePermit('subsistence'))
    ].filter((entry, i) => PERMITS[['paid', 'free', 'subsistence'][i]](productCards())) }];
    if (!$('input[name=product]:checked')) groups[0].items.push(item('Continue with none chosen', cont, { error: true }));
    if (visible($('#qtyPanel'))) {
      const qty = $('#qty');
      const min = Number(qty.min), max = Number(qty.max), step = Number(qty.step) || 1;
      groups.push({ group: 'How many', items: [
        typeItem('qty', `Minimum (${min})`, String(min)),
        typeItem('qty', `Maximum (${max})`, String(max)),
        typeItem('qty', 'Empty', '', true),
        typeItem('qty', 'Zero', '0', true),
        typeItem('qty', `Too many (${max + step})`, String(max + step), true),
        ...(Number.isInteger(step) ? [typeItem('qty', 'Not a whole number', String(min + 0.5), true)] : [typeItem('qty', 'Not a step', String(min + step / 2), true)])
      ] });
    }
    if (visible($('#eligibilityAgreement'))) {
      groups.push({ group: 'Eligibility', items: [
        item('Certify', () => { if (!$('#ackEligibility').checked) click('#ackEligibility'); }),
        item('Don’t certify, then Continue', () => { if ($('#ackEligibility').checked) click('#ackEligibility'); cont(); }, { error: true })
      ] });
    }
    return groups;
  }
  if (name === 'details') {
    return [
      { group: 'All fields', items: [item('All valid', () => fillHolder()), item('All empty, then Continue', () => { fillHolder(Object.fromEntries(Object.keys(VALID_HOLDER).map(id => [id, '']))); cont(); }, { error: true })] },
      ...HOLDER_FILLS.map(([id, group, variants]) => ({ group, items: variants.map(([label, value, error]) => typeItem(id, label, value, error)) })),
      { group: 'Confirm email', items: [
        item('Matching', () => type('ConfirmEmail', $('#DeliveryEmail').value || VALID_HOLDER.ConfirmEmail)),
        typeItem('ConfirmEmail', 'Empty', '', true),
        typeItem('ConfirmEmail', 'Different', 'typo@example.com', true)
      ] }
    ];
  }
  if (name === 'review') {
    const groups = [{ group: 'Agreement', items: [
      item('Agree', () => { if (!$('#agree').checked) click('#agree'); }),
      item('Don’t agree, then press Pay', () => { if ($('#agree').checked) click('#agree'); $('#confirmPay').click(); }, { error: true })
    ] }];
    if (visible($('#reissue'))) {
      const record = latestPaidPermit();
      groups.push({ group: 'Tracking ID or permit number', items: [
        ...(record ? [typeItem('paidReference', 'Permit number', record.permitNumber), typeItem('paidReference', 'Tracking ID', record.result.trackingId)] : []),
        typeItem('paidReference', 'Empty', '', true),
        typeItem('paidReference', 'Wrong', 'PU-WRONG00000', true)
      ] });
    }
    return groups;
  }
  return [];
}

function latestPaidPermit() {
  try { return JSON.parse(sessionStorage.getItem('sfp-paid-permits') || '[]').at(-1) || null; } catch { return null; }
}

const SCREEN_NAMES = { start: 'Start page', what: 'What are you collecting?', where: 'Where will you collect?', permit: 'Choose a permit', details: 'Your details', review: 'Check and pay', done: 'Finished permit' };

// Whether the check screen is about to send the visitor to Pay.ure, which is when the payment switches matter.
const aboutToPay = () => screen() === 'review' && /^Pay \$/.test($('#confirmPay').textContent);

export function context() {
  const name = screen();
  const tags = [name, ...(aboutToPay() ? ['review:paid'] : [])];
  const fills = screenFills(name);
  const jumps = [
    ...['start', 'what', 'where', 'permit', 'details'].filter(target => target !== name).map(target => ({ label: SCREEN_NAMES[target], run: () => jumpTo(target) })),
    { label: 'Check and pay: paid permit', run: () => jumpTo('review', 'paid') },
    { label: 'Check and pay: free permit', run: () => jumpTo('review', 'free') },
    { label: 'Check and pay: subsistence permit', run: () => jumpTo('review', 'subsistence') },
    { label: 'Finished free permit', run: () => jumpTo('done', 'free') }
  ];
  const signature = JSON.stringify([name, tags, fills.map(group => [group.group, group.items.map(entry => entry.label)])]);
  return { where: `Permit service · ${SCREEN_NAMES[name] || name}`, tags, fills, jumps, signature };
}
