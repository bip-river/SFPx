// Loaded on every page of both sites. It wires the footer's "Demo tools" toggle, shows the "Broken on purpose"
// banner whenever a switch is on (tools open or not, so nobody forgets one), and loads the drawer only when the
// tools are on. The page says which site it is with <html data-demo-site="bwl"> or "payure".
import { readDemo, updateDemo, BREAKS, breakDescription } from './state.js';
import { reload } from './navigate.js';

const site = document.documentElement.dataset.demoSite;
let drawer = null;

function addStyles() {
  if (document.getElementById('demoStyles')) return;
  const link = document.createElement('link');
  link.id = 'demoStyles';
  link.rel = 'stylesheet';
  link.href = new URL('demo.css', import.meta.url).href;
  document.head.appendChild(link);
}

export function fixAll() {
  const { breaks } = readDemo();
  const needsReload = Object.keys(breaks).some(name => BREAKS[name].reload);
  updateDemo((state) => { state.breaks = {}; });
  if (needsReload) reload();
  else refreshDemo();
}

function renderBanner() {
  const { breaks } = readDemo();
  const names = Object.keys(breaks);
  let banner = document.getElementById('demoBanner');
  if (!names.length) { banner?.remove(); return; }
  addStyles();
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'demoBanner';
    banner.className = 'demo-banner';
    const skip = document.querySelector('.skip-link');
    (skip ? skip.after(banner) : document.body.prepend(banner));
  }
  const label = document.createElement('strong');
  label.textContent = 'Broken on purpose:';
  const list = document.createElement('span');
  list.textContent = ` ${names.map(name => breakDescription(name, breaks[name])).join('; ')}. `;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'demo-banner-fix';
  button.textContent = 'Fix all';
  button.addEventListener('click', fixAll);
  banner.replaceChildren(label, list, button);
}

async function syncDrawer() {
  const { tools } = readDemo();
  const toggle = document.getElementById('demoToolsToggle');
  toggle?.setAttribute('aria-pressed', String(tools));
  if (tools && !drawer) {
    addStyles();
    const [{ mountDrawer }, provider] = await Promise.all([
      import('./drawer.js'),
      import(site === 'payure' ? './payure.js' : './bwl.js')
    ]);
    if (!drawer && readDemo().tools) drawer = mountDrawer(provider, { fixAll, refreshBanner: renderBanner });
  } else if (!tools && drawer) {
    drawer.unmount();
    drawer = null;
  }
}

export function refreshDemo() {
  renderBanner();
  drawer?.refresh(true);
}

document.getElementById('demoToolsToggle')?.addEventListener('click', () => {
  updateDemo((state) => { state.tools = !state.tools; state.open = true; });
  syncDrawer().then(() => drawer?.focusFirst());
});

renderBanner();
export const ready = syncDrawer();
