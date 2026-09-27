import './styles/base.css';
import './styles/home.css';
import { playgrounds } from './registry';
import { renderHome } from './home';
import { renderSettings } from './settings';
// Site-wide HAR recorder (ROADMAP 4.3): patches fetch at import time, then mounts its drawer UI.
import { installHarRecorder } from './har-recorder';
installHarRecorder();

import { registerEdgeServiceWorker } from './edge-client';

// ROADMAP.md §4.1: one Service Worker relays real /__edge/<planet>/... requests
// to whichever tab has that planet's room open. See src/edge-client.ts.
void registerEdgeServiceWorker();

// ROADMAP 4.2: one global, site-wide Tensor Telemetry dock (fixed position, outside #app so it
// survives route changes) — owns the single math-plus-telemetry sink slot for the whole page.
import { mountTelemetryDock } from './telemetry-dock';

// ROADMAP 4.9: one key, many identities — a single Ed25519 keypair shown as
// four real derived identities (wsh, browsermesh, dialback, OAT), with a
// single "revoke" reacting across all four. See src/identity-panel.ts.
import { mountIdentityPanel } from './identity-panel';

// ROADMAP 4.11: Signal Bus — one createBroadcastSignal per planet mirroring
// writeState()'s deep-link query across tabs, plus cross-tab presence for
// "live in N tabs" (read by src/home.ts). See src/signal-bus.ts.
import { mountSignalBus } from './signal-bus';

// ROADMAP 4.10: Laya as a judge everywhere — guardQuestions() pre-passes MCP
// tool-call arguments before approval and the results of an aimatey
// Router.dispatchParallel(strategy:'all') call. See src/laya-judge.ts.
import { mountLayaJudge } from './laya-judge';

// ROADMAP 4.6: the top bar, the source drawer and the ⌘K palette are now one
// site-wide "chrome" module — domable custom elements + Circuit's real
// command palette, mounted once outside #app. See src/chrome.ts.
import { initChrome } from './chrome';

// ROADMAP 4.7: the Orrery Almanac — recurrence rules over every planet's
// orbit period, conjunction windows, .ics export, a scheduled Tester run.
import { mountAlmanac } from './almanac';

// ROADMAP 4.8: the jth Conductor — a persistent JthContext REPL with
// spin/recur/dedupe/goto custom operators bridging spintax/temporals/hashish/bus.
import { mountConductor } from './conductor';

// Site-wide syntax highlighting (JS/TS/JSX/TSX/HTML/CSS/JSON/YAML) for every
// pre.code block and the source drawer. See src/code-highlight.ts.
import { installCodeHighlighter } from './code-highlight';

const app = document.getElementById('app')!;
let cleanup: (() => void) | void;

mountTelemetryDock();
mountIdentityPanel();
mountSignalBus();
mountLayaJudge();
mountAlmanac();
mountConductor();
installCodeHighlighter();

/** Raw source of every playground module, for the "view source" drawer. */
const sources = import.meta.glob('./playgrounds/*.ts', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

const DOCS: Record<string, string> = {
  signals: 'css-signals', chunker: 'semantic-chunker', fields: 'http-fields', converter: 'http-converter',
  mesh: 'browsermesh', jj: 'isomorphic-jj', studio: 'servable', mcpq: 'agent-query', laya: 'laya-js', objectify: 'objectify', toolcode: 'aimatey-middleware-andbox', tensor: 'math', grapher: 'math', afm: 'apple-foundation-models',
};
export function docsUrl(id: string) { return `https://opensource.johnhenry.me/${DOCS[id] ?? id}/`; }

function setHue(h: number) { document.documentElement.style.setProperty('--hue', String(h)); }

const siteChrome = initChrome({
  docsUrl,
  getSource: (id) => sources[`./playgrounds/${id}.ts`]?.(),
});

let routeToken = 0;
async function route() {
  const token = ++routeToken;
  if (cleanup) { try { cleanup(); } catch {} cleanup = undefined; }
  siteChrome.closePalette();
  siteChrome.closeSource();
  const id = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const entry = playgrounds.find(p => p.id === id);
  window.scrollTo(0, 0);

  if (id === 'settings') {
    setHue(25);
    document.title = 'Settings · ORRERY';
    siteChrome.setEntry(undefined, 'https://opensource.johnhenry.me/');
    app.innerHTML = '';
    cleanup = renderSettings(app);
    return;
  }

  if (!entry) {
    setHue(25);
    siteChrome.setEntry(undefined, 'https://opensource.johnhenry.me/');
    app.innerHTML = '';
    cleanup = renderHome(app, playgrounds);
    document.title = 'ORRERY · the @johnhenry ecosystem, live';
    return;
  }

  setHue(entry.hue);
  document.title = `${entry.title} · ORRERY`;
  siteChrome.setEntry(entry, docsUrl(entry.id));
  app.innerHTML = `<main class="room">
    <div class="room-head"><h1>${entry.title}</h1><span class="chip">${entry.pkg}</span><p>${entry.blurb}</p></div>
    <div id="host" class="loading">loading ${entry.pkg}…</div>
  </main>`;
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
