import './styles/base.css';
import './styles/home.css';
import { playgrounds, type PlaygroundEntry } from './registry';
import { renderHome } from './home';
import { renderSettings } from './settings';
import { initThemeToggle } from '@erisera-code/circuit/theme-toggle.js';
// ROADMAP 4.2: one global, site-wide Tensor Telemetry dock (fixed position, outside #app so it
// survives route changes) — owns the single math-plus-telemetry sink slot for the whole page.
import { mountTelemetryDock } from './telemetry-dock';

const app = document.getElementById('app')!;
let cleanup: (() => void) | void;

mountTelemetryDock();

/** Raw source of every playground module, for the "view source" drawer. */
const sources = import.meta.glob('./playgrounds/*.ts', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

const DOCS: Record<string, string> = {
  signals: 'css-signals', chunker: 'semantic-chunker', fields: 'http-fields', converter: 'http-converter',
  mesh: 'browsermesh', jj: 'isomorphic-jj', studio: 'servable', mcpq: 'agent-query', laya: 'laya-js', objectify: 'objectify', toolcode: 'aimatey-middleware-andbox', tensor: 'math', grapher: 'math', afm: 'apple-foundation-models',
};
export function docsUrl(id: string) { return `https://opensource.johnhenry.me/${DOCS[id] ?? id}/`; }

function setHue(h: number) { document.documentElement.style.setProperty('--hue', String(h)); }

function topbar(entry?: PlaygroundEntry) {
  return `<header class="topbar">
    <a class="brand" href="#/">ORR<b>E</b>RY</a>
    ${entry ? `<span class="pkg">${entry.pkg}</span>` : `<span class="pkg">@johnhenry/* · live</span>`}
    <span class="spacer"></span>
    <button class="tb-btn" id="palette-btn" title="Jump to a planet (⌘K)">⌘K</button>
    ${entry ? `<button class="tb-btn" id="source-btn" title="View this planet's source">&lt;/&gt; source</button>` : ''}
    <a class="tb-btn" href="#/settings" title="Settings: companion server">⚙ settings</a>
    <button class="tb-btn" id="theme-btn" title="Theme"></button>
    <a class="docs" href="${entry ? docsUrl(entry.id) : 'https://opensource.johnhenry.me/'}" target="_blank" rel="noopener">docs ↗</a>
    <a class="docs" href="https://github.com/johnhenry" target="_blank" rel="noopener">github ↗</a>
  </header>`;
}

/* ---- theme ---- */
let theme: { get(): string; set(m: string): void } | undefined;
function wireTheme() {
  const btn = document.getElementById('theme-btn') as HTMLElement | null;
  if (!btn) return;
  theme = initThemeToggle({ root: document.documentElement, button: btn });
  // Default to dark the first time (Circuit defaults to system).
  if (!localStorage.getItem('circuit-theme')) theme.set('dark');
}

/* ---- command palette ---- */
let palette: HTMLElement | null = null;
function openPalette() {
  if (palette) { closePalette(); return; }
  palette = document.createElement('div');
  palette.className = 'palette';
  palette.innerHTML = `<div class="palette-box">
    <input type="search" placeholder="Jump to a planet…" autofocus />
    <ul>${['home', ...playgrounds.map(p => p.id), 'settings'].map(id => {
      const p = playgrounds.find(x => x.id === id);
      const title = id === 'settings' ? '⚙ Settings' : (p?.title ?? 'Home orrery');
      const sub = id === 'settings' ? 'companion server' : (p ? p.pkg + (p.companion ? ' · ⚡ companion' : '') : 'all planets');
      return `<li data-id="${id === 'home' ? '' : id}" style="--h:${p?.hue ?? 25}"><b>${title}</b><span>${sub}</span></li>`;
    }).join('')}</ul></div>`;
  document.body.appendChild(palette);
  const input = palette.querySelector('input')!;
  const items = [...palette.querySelectorAll('li')];
  let sel = 0;
  const filter = () => {
    const q = input.value.toLowerCase();
    let first = -1;
    items.forEach((li, i) => {
      const hit = !q || li.textContent!.toLowerCase().includes(q);
      li.hidden = !hit; if (hit && first < 0) first = i;
    });
    sel = first; paint();
  };
  const paint = () => items.forEach((li, i) => li.classList.toggle('sel', i === sel));
  const go = () => { const li = items[sel]; if (!li) return; location.hash = `#/${li.dataset.id}`; closePalette(); };
  input.addEventListener('input', filter);
  input.addEventListener('keydown', e => {
    const vis = items.map((li, i) => (li.hidden ? -1 : i)).filter(i => i >= 0);
    const at = vis.indexOf(sel);
    if (e.key === 'ArrowDown') { sel = vis[Math.min(at + 1, vis.length - 1)] ?? sel; paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = vis[Math.max(at - 1, 0)] ?? sel; paint(); e.preventDefault(); }
    else if (e.key === 'Enter') go();
    else if (e.key === 'Escape') closePalette();
  });
  items.forEach((li, i) => li.addEventListener('click', () => { sel = i; go(); }));
  palette.addEventListener('click', e => { if (e.target === palette) closePalette(); });
  filter(); input.focus();
}
function closePalette() { palette?.remove(); palette = null; }
addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
});

/* ---- source drawer ---- */
async function openSource(entry: PlaygroundEntry) {
  const existing = document.querySelector('.source-drawer');
  if (existing) { existing.remove(); return; }
  const loader = sources[`./playgrounds/${entry.id}.ts`];
  const d = document.createElement('aside');
  d.className = 'source-drawer';
  d.innerHTML = `<div class="sd-head"><b>src/playgrounds/${entry.id}.ts</b><span class="spacer"></span><a href="https://github.com/johnhenry" target="_blank" rel="noopener">github ↗</a><button class="tb-btn sd-close">✕</button></div><pre class="code">loading…</pre>`;
  document.body.appendChild(d);
  d.querySelector('.sd-close')!.addEventListener('click', () => d.remove());
  const pre = d.querySelector('pre')!;
  try { pre.textContent = loader ? await loader() : 'source not found'; } catch (e) { pre.textContent = String(e); }
}

let routeToken = 0;
async function route() {
  const token = ++routeToken;
  if (cleanup) { try { cleanup(); } catch {} cleanup = undefined; }
  closePalette(); document.querySelector('.source-drawer')?.remove();
  const id = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const entry = playgrounds.find(p => p.id === id);
  window.scrollTo(0, 0);

  if (id === 'settings') {
    setHue(25);
    document.title = 'Settings · ORRERY';
    app.innerHTML = topbar();
    wireTheme();
    document.getElementById('palette-btn')!.addEventListener('click', openPalette);
    cleanup = renderSettings(app);
    return;
  }

  if (!entry) {
    setHue(25);
    app.innerHTML = topbar();
    wireTheme();
    document.getElementById('palette-btn')!.addEventListener('click', openPalette);
    cleanup = renderHome(app, playgrounds);
    document.title = 'ORRERY · the @johnhenry ecosystem, live';
    return;
  }

  setHue(entry.hue);
  document.title = `${entry.title} · ORRERY`;
  app.innerHTML = topbar(entry) + `<main class="room">
    <div class="room-head"><h1>${entry.title}</h1><span class="chip">${entry.pkg}</span><p>${entry.blurb}</p></div>
    <div id="host" class="loading">loading ${entry.pkg}…</div>
  </main>`;
  wireTheme();
  document.getElementById('palette-btn')!.addEventListener('click', openPalette);
  document.getElementById('source-btn')!.addEventListener('click', () => openSource(entry));
  const host = document.getElementById('host')!;
  try {
    const mod = await entry.load();
    if (token !== routeToken) return; // superseded by a newer navigation
    host.className = '';
    host.innerHTML = '';
    const c = await mod.default.mount(host);
    if (token !== routeToken) { if (typeof c === 'function') { try { c(); } catch {} } return; }
    if (typeof c === 'function') cleanup = c;
  } catch (err) {
    if (token !== routeToken) return;
    host.className = 'error';
    host.textContent = `This planet failed to load.\n\n${(err as Error)?.stack ?? err}`;
    console.error(err);
  }
}

addEventListener('hashchange', () => {
  // Same-planet query changes (deep-link state) must not remount.
  const id = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  if (id === currentRoom) return;
  currentRoom = id; route();
});
let currentRoom = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
route();
