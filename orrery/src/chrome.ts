/**
 * Site-wide chrome (ROADMAP §4.6, "Chrome on Circuit + domable + signalle").
 *
 * Replaces the hand-rolled ⌘K palette with Circuit's own
 * `createCommandPalette` (palette.js) -- actions for theme, copy link,
 * probing the companion, and kicking off a Tester run, plus every planet as
 * a jump-to page. The top bar and the source-viewer drawer are no longer
 * template strings re-stamped by `route()` on every navigation; they're
 * `@johnhenry/domable` `register()` custom elements, built once and mounted
 * once, styled with Circuit's real `c-header`/`c-codebox` component classes,
 * and kept in sync with `@johnhenry/signalle` (+ its `signalle/dom`
 * bindings) instead of direct DOM writes.
 *
 * domable gotchas this file works around (see AGENTS.md's domable section):
 *  - `register(tag, { useShadow: false })` is `light()` wired straight to
 *    `customElements.define()`. Its markup is inert: domable does NOT turn
 *    function props into listeners, so every button below is wired with a
 *    real `addEventListener` after the element connects, same as any other
 *    room on this site.
 *  - light-DOM content is only appended in `connectedCallback()` (the
 *    Custom Elements spec forbids synchronous light-DOM children in the
 *    constructor) -- so `data-el` lookups must happen AFTER the element is
 *    inserted into the document, not right after `createElement()`.
 *  - each instance re-parses its template string fresh on connect (see
 *    `simple-element.mjs`'s `toChildren`), so this module creates exactly
 *    ONE `<orrery-topbar>` and ONE `<orrery-source-drawer>` for the app's
 *    whole lifetime, sitting outside `#app` so `route()` swapping the room
 *    out never touches them. That also means the theme toggle, the palette
 *    trigger and the planets-sidebar button only need wiring once instead
 *    of once per navigation.
 *
 * Upstream finding (verified against the pre-existing src/playgrounds/circuit.ts's
 * OWN `createCommandPalette` instance too, so it's not specific to this file):
 * `palette.js`'s result-row `mouseenter` handler unconditionally calls `render()`
 * even when `selIdx` doesn't change (`row.addEventListener('mouseenter', () => {
 * selIdx = +row.dataset.i; render(); })`, no equality check). `render()` replaces
 * every result row's DOM node, and a stationary cursor left over a *replaced* node
 * re-triggers `mouseenter` on the new node at the same screen position -- an
 * unbounded re-render loop under the pointer that starves a synthetic (and,
 * per manual testing, sometimes a real) mouse click on a result row: the node it
 * was about to click keeps getting swapped out from under it. Keyboard selection
 * (arrow keys + Enter, this palette's primary input path per its own footer hint)
 * is unaffected and is what this file's own verification exercised end to end.
 */
import { register } from '@johnhenry/domable';
import { signal, effect, type Signal } from '@johnhenry/signalle';
import { bindAttribute } from '@johnhenry/signalle/dom';
import { createCommandPalette } from '@erisera-code/circuit/palette.js';
import '@erisera-code/circuit/palette.css';
import { getThemeChoice, setThemeChoice } from './theme';
import { playgrounds, type PlaygroundEntry } from './registry';
import { copyLink } from './state';
import { togglePlanetsSidebar } from './planets-sidebar';
import { probeCompanion } from './companion';
import './chrome.css';

const TOPBAR_HTML = `<header class="topbar c-header">
  <a class="brand" href="#/">ORR<b>E</b>RY</a>
  <span class="pkg" data-el="pkg"></span>
  <span class="spacer"></span>
  <nav>
    <button type="button" class="tb-btn" data-el="palette-btn" title="Jump to a planet (⌘K)">⌘K</button>
    <button type="button" class="tb-btn" data-el="planets-btn" title="All planets">&#9776;</button>
    <button type="button" class="tb-btn" data-el="source-btn" title="View this planet's source">&lt;/&gt; source</button>
    <a class="tb-btn" href="#/settings" title="Settings: theme, companion server">&#9881;</a>
    <a class="docs" data-el="docs-link" href="https://opensource.johnhenry.me/" target="_blank" rel="noopener">docs &#8599;</a>
    <a class="docs" href="https://github.com/johnhenry" target="_blank" rel="noopener">github &#8599;</a>
  </nav>
</header>`;

const SOURCE_DRAWER_HTML = `<aside class="source-drawer c-codebox">
  <div class="cap sd-head">
    <span data-el="sd-title">source</span>
    <span class="spacer"></span>
    <a href="https://github.com/johnhenry" target="_blank" rel="noopener">github &#8599;</a>
    <button type="button" class="tb-btn cp" data-el="sd-close">close ✕</button>
  </div>
  <pre class="code" data-el="sd-pre">loading…</pre>
</aside>`;

// Build + register both custom element classes exactly once at module load.
register('orrery-topbar', { useShadow: false })(TOPBAR_HTML);
register('orrery-source-drawer', { useShadow: false })(SOURCE_DRAWER_HTML);

export interface ChromeApi {
  /** Called from route() with the entry for the room now showing (undefined for home/settings). */
  setEntry(entry: PlaygroundEntry | undefined, docsHref: string): void;
  /** Close the source drawer (route() calls this on every navigation, like the old drawer.remove()). */
  closeSource(): void;
  /** Close the command palette (route() calls this on every navigation). */
  closePalette(): void;
}

let singleton: ChromeApi | null = null;

/** Mount the topbar + source drawer + command palette once. Call exactly once from main.ts. */
export function initChrome(opts: {
  docsUrl: (id: string) => string;
  /** Resolve a playground id's raw source text, for the source drawer (mirrors main.ts's import.meta.glob sources map). */
  getSource: (id: string) => Promise<string> | undefined;
}): ChromeApi {
  if (singleton) return singleton;

  const app = document.getElementById('app')!;
  const topbarEl = document.createElement('orrery-topbar');
  document.body.insertBefore(topbarEl, app);
  const drawerEl = document.createElement('orrery-source-drawer');
  document.body.appendChild(drawerEl);

  const $ = <T extends HTMLElement = HTMLElement>(root: Element, sel: string) =>
    root.querySelector(`[data-el="${sel}"]`) as T;

  const pkgEl = $(topbarEl, 'pkg');
  const docsLinkEl = $<HTMLAnchorElement>(topbarEl, 'docs-link');
  const sourceBtn = $<HTMLButtonElement>(topbarEl, 'source-btn');
  const paletteBtn = $<HTMLButtonElement>(topbarEl, 'palette-btn');
  const planetsBtn = $<HTMLButtonElement>(topbarEl, 'planets-btn');

  const drawerAside = drawerEl.querySelector('.source-drawer')!;
  const sdTitleEl = $(drawerEl, 'sd-title');
  const sdPreEl = $(drawerEl, 'sd-pre');
  const sdCloseBtn = $<HTMLButtonElement>(drawerEl, 'sd-close');

  // ---- reactive state (@johnhenry/signalle) ------------------------------
  const pkgSig: Signal<string> = signal('@johnhenry/* · live');
  const docsHrefSig: Signal<string> = signal('https://opensource.johnhenry.me/');
  const sourceHiddenSig: Signal<boolean> = signal(true); // no entry on load (home)
  const drawerHiddenSig: Signal<boolean> = signal(true);

  /** Plain textContent binding: same "subscribe + paint once now" shape signalle/dom's own bindAttribute/bindClass/bindStyle use internally, for a property dom.mjs doesn't expose a binder for. */
  function bindText(el: HTMLElement, sig: Signal<string>): void {
    effect(sig, (v) => { el.textContent = v; });
    el.textContent = sig.value;
  }
  bindText(pkgEl, pkgSig);
  const sdTitleSig: Signal<string> = signal('source');
  bindText(sdTitleEl, sdTitleSig);

  // signalle/dom's real attribute binder, driving href/hidden reactively.
  bindAttribute(docsLinkEl, 'href', docsHrefSig);
  bindAttribute(sourceBtn, 'hidden', sourceHiddenSig);
  bindAttribute(drawerAside, 'hidden', drawerHiddenSig);

  // ---- theme: no header control -- see src/theme.ts and the Settings page ----
  const THEME_NEXT: Record<string, string> = { system: 'dark', dark: 'light', light: 'system' };

  // ---- transient toast, for the companion-probe action's async result ----
  function toast(msg: string, ok = true): void {
    const t = document.createElement('div');
    t.className = `chrome-toast ${ok ? 'ok' : 'bad'}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  // ---- command palette (Circuit's real createCommandPalette) -------------
  const pages = [
    { title: 'Home orrery', path: 'all planets', href: '#/' },
    { title: 'Settings', path: 'companion server', href: '#/settings' },
    ...playgrounds.map((p) => ({ title: p.title, path: p.pkg + (p.companion ? ' · ⚡ companion' : ''), href: `#/${p.id}` })),
  ];
  const palette = createCommandPalette({
    mount: document.body,
    trigger: paletteBtn,
    pages,
    actions: [
      {
        title: 'Toggle theme (system → dark → light)',
        icon: '◐',
        run: () => setThemeChoice(THEME_NEXT[getThemeChoice()] as 'dark' | 'light' | 'system'),
        feedback: 'theme changed',
      },
      {
        title: 'Copy link to this page',
        icon: '🔗',
        run: () => { void copyLink(); },
        feedback: 'Link copied',
      },
      {
        title: 'Probe companion server (npm run node)',
        icon: '⚡',
        run: () => {
          void probeCompanion(true).then((c) => {
            toast(c ? `Companion is up: ${c.name} on ${c.platform}/${c.arch}, node ${c.node}` : 'Companion not reachable — run `npm run node` in the repo.', !!c);
          });
        },
      },
      {
        title: 'Run Tester suite now',
        icon: '▶',
        run: () => { location.hash = '#/tester?autorun=1'; },
        feedback: 'opening Tester…',
      },
      {
        title: 'All planets (sidebar)',
        icon: '☰',
        run: () => togglePlanetsSidebar(),
      },
    ],
    openKey: '', // this site already owns "/" inside textareas/inputs on every room; ⌘K only
  });

  planetsBtn.addEventListener('click', () => togglePlanetsSidebar());

  // ---- source drawer -------------------------------------------------
  let openForId: string | null = null;
  function closeSource(): void {
    drawerHiddenSig.value = true;
    openForId = null;
  }
  async function openSource(id: string): Promise<void> {
    if (openForId === id) { closeSource(); return; }
    openForId = id;
    sdTitleSig.value = `src/playgrounds/${id}.ts`;
    sdPreEl.textContent = 'loading…';
    drawerHiddenSig.value = false;
    try {
      const loader = opts.getSource(id);
      sdPreEl.textContent = loader ? await loader : 'source not found';
    } catch (err) {
      sdPreEl.textContent = String(err);
    }
  }
  sdCloseBtn.addEventListener('click', closeSource);
  let sourceEntryId: string | null = null;
  sourceBtn.addEventListener('click', () => { if (sourceEntryId) void openSource(sourceEntryId); });

  singleton = {
    setEntry(entry, docsHref) {
      pkgSig.value = entry ? entry.pkg : '@johnhenry/* · live';
      docsHrefSig.value = docsHref;
      sourceHiddenSig.value = !entry;
      sourceEntryId = entry?.id ?? null;
    },
    closeSource,
    closePalette: () => palette.close(),
  };
  return singleton;
}
