/**
 * Dev Drawer — one site-wide header-toggleable drawer that hosts every
 * "site-wide dock" module that used to mount its own floating toggle+panel
 * directly to a corner of the viewport (telemetry, HAR recorder, almanac,
 * conductor, identity panel, signal bus). Mirrors src/planets-sidebar.ts's
 * overlay+drawer pattern (`.dd-overlay` fixed inset, a slide-in-from-the-
 * right panel, closes on outside-click/Escape/re-toggle), but unlike that
 * sidebar the shell is created ONCE and kept in the DOM (just hidden) for
 * the app's whole lifetime, rather than created/destroyed on every toggle.
 *
 * Why: `registerDevTool()` must call `tool.mount(container)` immediately and
 * synchronously, the moment each dock module loads — background effects like
 * the HAR recorder's fetch-patching or the telemetry dock's `setSink()` call
 * have to keep starting the moment the app loads, exactly as they did when
 * each dock mounted itself directly to `document.body`. The ONLY thing
 * changing is where their DOM renders, not when their side effects start.
 * That means every registered tool's pane has to exist in real DOM from the
 * first `registerDevTool()` call, whether or not the drawer has ever been
 * opened — so the shell can't be create-on-open/destroy-on-close the way
 * planets-sidebar.ts's overlay is. Instead the overlay is created once (on
 * whichever happens first: the first `registerDevTool()` call, or a
 * `toggleDevDrawer()` call with zero tools registered) and toggles via the
 * `hidden` attribute, exactly the "zero floating widgets when closed"
 * behaviour the corner docks had at their most-collapsed state — just with
 * no visible circle left behind at all.
 *
 * Tab persistence: the last-selected tab stays selected across closes/opens
 * (the module-level `activeId` is never reset by closeDrawer()) since the
 * shell — and every tool's live pane inside it — never actually unmounts.
 * The very first registered tool becomes the initially-active tab.
 */
import './dev-drawer.css';

export interface DevTool {
  /** Stable id, also used as the tab's `data-tool-id`. */
  id: string;
  /** Tab label. */
  label: string;
  /** Optional glyph shown before the label. */
  icon?: string;
  /**
   * Build the tool's UI into `container` (a fresh `<div class="dev-tool-pane">`).
   * Called immediately and synchronously from `registerDevTool()` — do not
   * defer any side effects that used to run at mount-time. Return a cleanup
   * function if you allocate anything that should be torn down (not called
   * today — the drawer's tools live for the app's whole lifetime, same as
   * the standalone docks they replaced — but stored for completeness).
   */
  mount(container: HTMLElement): void | (() => void);
}

interface Registered {
  tool: DevTool;
  pane: HTMLElement;
  tabBtn: HTMLButtonElement;
  cleanup?: () => void;
}

let overlay: HTMLElement | null = null;
let tabStripEl: HTMLElement | null = null;
let contentEl: HTMLElement | null = null;
const registered: Registered[] = [];
let activeId: string | null = null;
let isOpen = false;
let ac: AbortController | null = null;

/** Build the (initially hidden) shell exactly once. Safe to call any number of times. */
function ensureShell(): void {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.className = 'dd-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <aside class="dd-panel" role="dialog" aria-label="Dev tools">
      <div class="dd-head">
        <b>Dev tools</b>
        <span class="spacer"></span>
        <button class="tb-btn dd-close" type="button" aria-label="Close">&#10005;</button>
      </div>
      <div class="dd-tabs" data-el="dd-tabs"></div>
      <div class="dd-content" data-el="dd-content"></div>
    </aside>`;
  document.body.appendChild(overlay);

  tabStripEl = overlay.querySelector('[data-el="dd-tabs"]') as HTMLElement;
  contentEl = overlay.querySelector('[data-el="dd-content"]') as HTMLElement;
  overlay.querySelector('.dd-close')!.addEventListener('click', () => closeDrawer());
}

function setActive(id: string): void {
  activeId = id;
  for (const r of registered) {
    const active = r.tool.id === id;
    r.pane.hidden = !active;
    r.tabBtn.classList.toggle('active', active);
    r.tabBtn.setAttribute('aria-selected', String(active));
  }
}

/**
 * Register a dev tool: builds its pane, mounts it immediately (synchronously —
 * see the file-level comment for why), and adds a tab. Self-initializes the
 * shared drawer shell on its own first call, so callers (main.ts's six
 * `mount*()` calls) need no particular ordering relative to each other or to
 * `toggleDevDrawer()`.
 */
export function registerDevTool(tool: DevTool): void {
  ensureShell();
  if (registered.some((r) => r.tool.id === tool.id)) return; // idempotency guard, mirrors each dock's own `mounted` flag

  const pane = document.createElement('div');
  pane.className = 'dev-tool-pane';
  pane.dataset.toolId = tool.id;
  pane.hidden = true;
  contentEl!.appendChild(pane);

  const tabBtn = document.createElement('button');
  tabBtn.type = 'button';
  tabBtn.className = 'dd-tab';
  tabBtn.dataset.toolId = tool.id;
  tabBtn.setAttribute('role', 'tab');
  tabBtn.innerHTML = `${tool.icon ? `<span class="dd-tab-icon">${tool.icon}</span>` : ''}<span class="dd-tab-label">${tool.label}</span>`;
  tabBtn.addEventListener('click', () => setActive(tool.id));
  tabStripEl!.appendChild(tabBtn);

  const entry: Registered = { tool, pane, tabBtn };
  registered.push(entry);

  // Mount NOW, synchronously — the whole point of this module: a tool's
  // background effects (fetch patching, global sink installation, timers,
  // BroadcastChannel subscriptions, …) must start the instant the owning
  // module loads, exactly as before, regardless of whether the drawer is
  // ever opened.
  const cleanup = tool.mount(pane);
  if (typeof cleanup === 'function') entry.cleanup = cleanup;

  if (activeId === null) activeId = tool.id; // first-registered tool defaults active
  setActive(activeId);
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') closeDrawer();
}

function openDrawer(): void {
  ensureShell();
  if (isOpen) return;
  isOpen = true;
  overlay!.hidden = false;
  ac = new AbortController();
  overlay!.addEventListener('click', (ev) => { if (ev.target === overlay) closeDrawer(); }, { signal: ac.signal });
  document.addEventListener('keydown', onKeydown, { signal: ac.signal });
}

function closeDrawer(): void {
  if (!isOpen) return;
  isOpen = false;
  overlay!.hidden = true;
  ac?.abort();
  ac = null;
}

/** Open the drawer, or close it if it's already open — matches togglePlanetsSidebar()'s exact toggle-current-state behavior. */
export function toggleDevDrawer(): void {
  if (isOpen) { closeDrawer(); return; }
  openDrawer();
}
