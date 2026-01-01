const frame = document.getElementById('appFrame');
const results = document.getElementById('results');

function addResult(name, ok, details = '') {
  const div = document.createElement('div');
  div.className = `status ${ok ? 'pass' : 'fail'}`;
  div.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}${details ? ` — ${details}` : ''}`;
  results.appendChild(div);
}

frame.addEventListener('load', () => {
  const doc = frame.contentDocument;
  if (!doc) {
    addResult('Document loaded', false, 'Unable to access iframe document.');
    return;
  }

  const checks = [
    ['Hero band present', !!doc.querySelector('.hero-band')],
    ['Progress header present', !!doc.querySelector('.progress-header')],
    ['Progress dot labels', doc.querySelectorAll('.progress-dot-labels span').length === 3],
    ['Products list has radiogroup', doc.getElementById('productList')?.getAttribute('role') === 'radiogroup'],
    ['Quantity input describes hints', (doc.getElementById('qty')?.getAttribute('aria-describedby') || '').includes('qtyHint')],
    ['Help stack present', !!doc.querySelector('.help-stack')]
  ];

  checks.forEach(([label, ok]) => addResult(label, ok));
});
