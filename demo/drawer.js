// The Demo tools drawer. It lists only what applies to the screen on view: switches that can break something
// here (and any already on, so they can be turned off), fills for the fields on this screen, shortcuts to other
// screens, what the tab has stored, and a reset. A site's provider (bwl.js or payure.js) describes the screen.
import { readDemo, updateDemo, BREAKS, STORAGE_KEYS, DEMO_KEY } from './state.js';
import { navigate, reload } from './navigate.js';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'className') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value === true ? '' : value);
  }
  node.append(...children.filter(child => child !== null && child !== undefined && child !== false));
  return node;
}

const srOnly = text => el('span', { className: 'demo-sr-only' }, text);

function storedData() {
  const out = {};
  for (const key of Object.keys(STORAGE_KEYS)) {
    let value = null;
    try { value = sessionStorage.getItem(key); } catch { /* Storage blocked. */ }
    if (value === null) continue;
    try { out[key] = JSON.parse(value); } catch { out[key] = value; }
  }
  return out;
}

export function mountDrawer(provider, { fixAll, refreshBanner }) {
  const body = el('div', { className: 'demo-drawer-body', id: 'demoDrawerBody' });
  const tab = el('button', { type: 'button', className: 'demo-drawer-tab', 'aria-controls': 'demoDrawerBody', 'aria-expanded': 'false' }, 'Demo tools');
  const root = el('aside', { className: 'demo-drawer', id: 'demoDrawer', 'aria-label': 'Demo tools' }, tab, body);
  document.body.appendChild(root);

  let signature = '';
  let scheduled = false;
  let stateView = null;

  function setOpen(open) {
    updateDemo((state) => { state.open = open; });
    sync();
  }

  function sync() {
    const { open } = readDemo();
    body.hidden = !open;
    tab.hidden = open;
    tab.setAttribute('aria-expanded', String(open));
    root.classList.toggle('is-open', open);
  }

  async function run(action) {
    await action();
    refresh(true);
  }

  function breakControls(tags) {
    const { breaks } = readDemo();
    const names = Object.keys(BREAKS).filter(name => breaks[name] || BREAKS[name].when.some(tag => tags.includes(tag)));
    if (!names.length) return [el('p', { className: 'demo-empty' }, 'Nothing to break on this screen.')];
    return names.map((name) => {
      const info = BREAKS[name];
      const on = Boolean(breaks[name]);
      const id = `demoBreak-${name}`;
      const toggle = el('button', {
        type: 'button', role: 'switch', id, className: 'demo-switch', 'aria-checked': String(on), 'data-demo-key': `break:${name}`,
        onclick: () => {
          updateDemo((state) => {
            if (state.breaks[name]) delete state.breaks[name];
            else state.breaks[name] = info.modes ? Object.keys(info.modes)[0] : true;
          });
          if (info.reload) { reload(); return; }
          refreshBanner();
          refresh(true);
        }
      }, el('span', { className: 'demo-switch-track', 'aria-hidden': 'true' }), el('span', { className: 'demo-switch-label' }, info.label));
      const parts = [toggle];
      if (info.modes) {
        const selectId = `demoBreakMode-${name}`;
        const select = el('select', { id: selectId, 'data-demo-key': `mode:${name}`,
          onchange: (event) => {
            const mode = event.target.value;
            // Choosing how it fails also turns the switch on.
            updateDemo((state) => { state.breaks[name] = mode; });
            reload();
          } },
        ...Object.entries(info.modes).map(([value, label]) => el('option', { value, selected: breaks[name] === value }, label)));
        parts.push(el('div', { className: 'demo-mode' }, el('label', { for: selectId }, 'How it fails'), select));
      }
      if (info.reload) parts.push(el('p', { className: 'demo-hint' }, 'Switching reloads the page. Choices are kept; typed details are not.'));
      return el('div', { className: 'demo-break' }, ...parts);
    });
  }

  function fillControls(groups) {
    if (!groups.length) return [el('p', { className: 'demo-empty' }, 'Nothing to fill on this screen.')];
    return groups.map(group => el('div', { className: 'demo-group' },
      el('h4', {}, group.group),
      el('div', { className: 'demo-buttons' }, ...group.items.map(item => el('button', {
        type: 'button', className: `demo-fill${item.error ? ' is-error' : ''}`, 'data-demo-key': `fill:${group.group}:${item.label}`,
        title: item.value === undefined ? undefined : `Fills “${item.value}”`,
        onclick: () => run(item.run)
      }, srOnly(`${group.group}: `), item.label, item.error ? srOnly(' (shows an error)') : null)))
    ));
  }

  function render() {
    const context = provider.context();
    const demo = readDemo();
    const next = JSON.stringify([context.signature, demo.breaks]);
    if (stateView) stateView.textContent = JSON.stringify(storedData(), null, 2);
    if (next === signature) return;
    signature = next;

    const focusedKey = root.contains(document.activeElement) ? document.activeElement.dataset.demoKey : null;
    stateView = el('pre', { className: 'demo-state' }, JSON.stringify(storedData(), null, 2));
    body.replaceChildren(
      el('div', { className: 'demo-head' },
        el('h2', {}, 'Demo tools'),
        el('button', { type: 'button', className: 'demo-close', 'data-demo-key': 'close', onclick: () => { setOpen(false); tab.focus(); } }, 'Close', srOnly(' demo tools'))),
      el('p', { className: 'demo-hint' }, `${context.where}. For facilitators and developers; turn off with “Demo tools” in the footer.`),
      el('section', { 'aria-labelledby': 'demoBreakTitle' }, el('h3', { id: 'demoBreakTitle' }, 'Break on purpose'), ...breakControls(context.tags),
        Object.keys(demo.breaks).length ? el('button', { type: 'button', className: 'demo-action', 'data-demo-key': 'fixall', onclick: fixAll }, 'Fix all') : null),
      el('section', { 'aria-labelledby': 'demoFillTitle' }, el('h3', { id: 'demoFillTitle' }, 'Fill this screen'),
        el('p', { className: 'demo-hint' }, 'Red buttons fill something that shows an error.'), ...fillControls(context.fills)),
      context.jumps.length ? el('section', { 'aria-labelledby': 'demoJumpTitle' }, el('h3', { id: 'demoJumpTitle' }, 'Go to'),
        el('div', { className: 'demo-buttons' }, ...context.jumps.map(jump => el('button', { type: 'button', className: 'demo-fill', 'data-demo-key': `jump:${jump.label}`, onclick: () => run(jump.run) }, jump.label)))) : null,
      el('section', { 'aria-labelledby': 'demoStateTitle' }, el('h3', { id: 'demoStateTitle' }, 'Stored in this tab'),
        el('details', { className: 'demo-details' }, el('summary', {}, 'Show stored data'), stateView),
        el('button', { type: 'button', className: 'demo-action', 'data-demo-key': 'reset', onclick: reset }, 'Reset demo state'),
        el('p', { className: 'demo-hint' }, 'Clears every switch, saved choice, checkout and payment in this tab, then starts again. The tools stay on.'))
    );
    if (focusedKey) [...body.querySelectorAll('[data-demo-key]')].find(node => node.dataset.demoKey === focusedKey)?.focus({ preventScroll: true });
  }

  function reset() {
    for (const key of Object.keys(STORAGE_KEYS)) {
      if (key === DEMO_KEY) continue;
      try { sessionStorage.removeItem(key); } catch { /* Storage blocked. */ }
    }
    updateDemo((state) => { state.breaks = {}; });
    navigate(new URL(provider.startPage, location.href).href);
  }

  function refresh(force = false) {
    if (force) signature = '';
    render();
  }

  // The drawer follows the page: screen changes, field edits and the browser's Back button.
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  }
  const observer = new MutationObserver(schedule);
  const main = document.querySelector('main');
  if (main) observer.observe(main, { subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-invalid'], childList: true });
  const events = ['change', 'input', 'click', 'popstate'];
  events.forEach(type => window.addEventListener(type, schedule, true));
  tab.addEventListener('click', () => { setOpen(true); focusFirst(); });

  function focusFirst() {
    if (readDemo().open) body.querySelector('h2')?.parentElement.querySelector('button')?.focus({ preventScroll: true });
    else tab.focus({ preventScroll: true });
  }

  sync();
  render();
  return {
    refresh,
    focusFirst,
    unmount() {
      observer.disconnect();
      events.forEach(type => window.removeEventListener(type, schedule, true));
      root.remove();
    }
  };
}
