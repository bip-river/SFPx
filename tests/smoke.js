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
    const checks = [
      ['Catalog loaded', doc.getElementById('state').options.length > 1],
      ['Hero band present', !!doc.querySelector('.hero-band')],
      ['Three form steps present', doc.querySelectorAll('.flow-step').length === 3],
      ['Step controls reference their panels', [...doc.querySelectorAll('.step-toggle')].every(button => doc.getElementById(button.getAttribute('aria-controls')))],
      ['Locked panels are inert', [...doc.querySelectorAll('.flow-step.collapsed .step-body')].every(body => body.hasAttribute('inert'))],
      ['Products list has radiogroup', doc.getElementById('productList')?.getAttribute('role') === 'radiogroup'],
      ['Quantity input describes hints', (doc.getElementById('qty')?.getAttribute('aria-describedby') || '').includes('qtyHint')],
      ['Help stack present', !!doc.querySelector('.help-stack')]
    ];
    checks.forEach(([label, ok]) => addResult(label, ok));
  };
  if (doc.documentElement.dataset.appReady === 'true') check();
  else doc.addEventListener('sfpx:ready', check, { once: true });
});
