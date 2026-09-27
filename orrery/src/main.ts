import './styles/base.css';
import './styles/home.css';
import { playgrounds, pkgDocsUrl, type PlaygroundEntry } from './registry';
import { renderHome } from './home';
import { openSiteDrawer } from './site-drawer';
// Site theme, bridged into the root docs site's own `starlight-theme`
// mechanism (see src/theme.ts) -- applied first, before anything paints.
import { initSiteTheme } from './theme';
initSiteTheme();
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

// Proactive stale-deploy detection: tells a visitor a new deploy exists
// (with a manual reload button) before they navigate into a room whose
// lazy-loaded chunk might already be gone. See src/version-check.ts --
// works alongside, not instead of, the reactive recovery below.
import { installVersionCheck } from './version-check';

// Stale-deploy recovery: every push to main rebuilds and overwrites
// orrery/dist/assets/ with freshly content-hashed filenames, so a tab left
// open (or a cached copy of the JS entry) across a deploy ends up asking for
// a chunk/CSS file that no longer exists on the server -- Vite's own dynamic
// `import()` (used for every planet's `entry.load()` below) then rejects
// with e.g. "Unable to preload CSS for /orrery/assets/<name>-<hash>.css" or
// "Failed to fetch dynamically imported module". The fix isn't in the code
// that failed -- it's stale, so a full reload (fetching the current
// index.html, which references the current hashes) is the real recovery,
// not a normal error to show in the room's error pane. Guarded against a
// reload loop (e.g. the asset is ACTUALLY missing/the deploy is broken) by
// only auto-reloading once per browser session.
const STALE_CHUNK_RE = /unable to preload css|failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;
const RELOAD_GUARD_KEY = 'orrery-stale-chunk-reload-at';
const RELOAD_GUARD_WINDOW_MS = 30_000; // long enough to break a tight loop if the deploy is actually broken server-side, short enough that a tab left open across a LATER deploy still self-heals
function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return STALE_CHUNK_RE.test(msg);
}
function recoverFromStaleChunk(): boolean {
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
  if (Date.now() - last < RELOAD_GUARD_WINDOW_MS) return false; // just tried -- don't loop
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  location.reload();
  return true;
}
// Vite also dispatches this event directly for module-preload failures that
// don't always surface as a rejected import() (see Vite's "Load Error
// Handling" docs) -- belt-and-braces alongside the route()-level catch below.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  recoverFromStaleChunk();
});

const app = document.getElementById('app')!;
let cleanup: (() => void) | void;

mountTelemetryDock();
mountIdentityPanel();
mountSignalBus();
mountLayaJudge();
mountAlmanac();
mountConductor();
installCodeHighlighter();
installVersionCheck();

/** Raw source of every playground module, for the "view source" drawer. */
const sources = import.meta.glob('./playgrounds/*.ts', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

const DOCS: Record<string, string> = {
  signals: 'css-signals', chunker: 'semantic-chunker', fields: 'http-fields', converter: 'http-converter',
  mesh: 'browsermesh', jj: 'isomorphic-jj', studio: 'servable', mcpq: 'agent-query', laya: 'laya-js', objectify: 'objectify', toolcode: 'aimatey-middleware-andbox', tensor: 'math', grapher: 'math', afm: 'apple-foundation-models',
  // @johnhenry/iteration is a page under /math/, not its own top-level docs section
  // (see registry.ts's PKG_DOCS, which is the ground-truthed source for this fold).
  iteration: 'math',
};
export function docsUrl(id: string) { return `https://opensource.johnhenry.me/${DOCS[id] ?? id}/`; }

/** Room-head chips: primary pkg first, then any secondaryPkgs, each linking to
 *  its real docs section (registry.ts's PKG_DOCS) when known, or an unlinked
 *  `.chip` span when it isn't — never a link to a URL we can't confirm exists. */
function chipsHtml(entry: PlaygroundEntry): string {
  const pkgs = [entry.pkg, ...(entry.secondaryPkgs ?? [])];
  return pkgs.map((pkg) => {
    const href = pkgDocsUrl(pkg);
    return href
      ? `<a class="chip" href="${href}" target="_blank" rel="noopener">${pkg}</a>`
      : `<span class="chip">${pkg}</span>`;
  }).join('');
}

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
    // #/settings is no longer its own room with its own #app content -- it's
    // the site drawer's Settings tab. Open the drawer on that tab and let
    // #app fall back to showing home underneath, same as any other
    // unrecognised hash (the `!entry` branch below), rather than leaving
    // #app blank. Bookmark/refresh at #/settings still works: this runs on
    // every route() call, including the very first one on page load.
    openSiteDrawer('settings');
  }

  if (!entry) {
    setHue(25);
    siteChrome.setEntry(undefined, 'https://opensource.johnhenry.me/');
    app.innerHTML = '';
    cleanup = renderHome(app, playgrounds);
    document.title = id === 'settings' ? 'Settings · ORRERY' : 'ORRERY · the @johnhenry ecosystem, live';
    return;
  }

  setHue(entry.hue);
  document.title = `${entry.title} · ORRERY`;
  siteChrome.setEntry(entry, docsUrl(entry.id));
  app.innerHTML = `<main class="room">
    <div class="room-head"><h1>${entry.title}</h1><div class="chips">${chipsHtml(entry)}</div><p>${entry.blurb}</p></div>
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
    if (isStaleChunkError(err) && recoverFromStaleChunk()) return; // reloading -- don't paint the error pane at all
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
