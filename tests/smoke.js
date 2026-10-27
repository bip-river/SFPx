const frame = document.getElementById('appFrame');
const results = document.getElementById('results');

function addResult(name, ok, details = '') {
  const div = document.createElement('div');
  div.className = `status ${ok ? 'pass' : 'fail'}`;
  div.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}${details ? ` — ${details}` : ''}`;
  results.appendChild(div);
}

frame.addEventListener('load', () => {
  results.replaceChildren();
  const doc = frame.contentDocument;
  if (!doc) {
    addResult('Document loaded', false, 'Unable to access iframe document.');
    return;
  }
  const check = () => {
    const screens = [...doc.querySelectorAll('.screen')];
    const checks = [
      ['Catalog loaded', doc.getElementById('state').options.length > 1],
      ['Start page and six screens present', screens.length === 7 && !!doc.getElementById('screen-start')],
      ['One screen visible', screens.filter(screen => !screen.hidden).length === 1],
      ['Screens are named by a focusable heading', screens.every(screen => doc.getElementById(screen.getAttribute('aria-labelledby'))?.getAttribute('tabindex') === '-1')],
      ['Three collection types offered', doc.querySelectorAll('input[name="ptype"]').length === 3],
      ['Every label has a control', [...doc.querySelectorAll('label')].every(label => label.control)],
      ['Quantity input describes its limits', (doc.getElementById('qty')?.getAttribute('aria-describedby') || '').includes('qtyHint')],
      ['Help section present', !!doc.getElementById('need-help')]
    ];
    checks.forEach(([label, ok]) => addResult(label, ok));
  };
  if (doc.documentElement.dataset.appReady === 'true') check();
  else doc.addEventListener('sfpx:ready', check, { once: true });
});
