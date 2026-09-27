/**
 * The site drawer: one header-toggleable, slide-in-from-the-right overlay
 * with a tab strip -- "Planets" | "Settings" -- combining what used to be
 * two separate UI entry points:
 *  - the ☰ button, which opened planets-sidebar.ts's "All planets" grid
 *    (now this drawer's Planets tab, same room cards/behaviour, verbatim);
 *  - the ⚙ link, which navigated to the #/settings ROUTE and had
 *    settings.ts's renderSettings() replace whatever was showing in #app
 *    (now this drawer's Settings tab -- renderSettings() mounts into this
 *    drawer's own pane instead of #app; see settings.ts's doc comment).
 *
 * Reuses the exact overlay+slide-in-panel CSS shape (open/close/Escape/
 * outside-click) planets-sidebar.ts had, just renamed .planets-sidebar-*
 * -> .site-drawer-* (see site-drawer.css) since the drawer is no longer
 * planets-only. The tab strip itself mirrors the shape of the earlier
 * (since-reverted, see git history of dev-drawer.ts before "orrery: revert
 * Dev Drawer to a floating widget...") Dev Drawer's .dd-tabs/.dd-tab.
 *
 * Unlike planets-sidebar.ts's old overlay (created fresh on every open,
 * destroyed on close), this drawer keeps the same create/destroy-on-close
 * lifecycle -- the Settings tab's renderSettings() call and its cleanup fn
 * both happen inside open()/close(), so the companion probe's fetch and the
 * theme-change subscription only run while the drawer is actually open.
 */
import { playgrounds } from './registry';
import { getRoomTests } from './bus';
import { roomCardHtml, wireRoomCardInteractions, applyBuildTimeFallback } from './home';
import { renderSettings } from './settings';
import './site-drawer.css';

export type SiteDrawerTab = 'planets' | 'settings';

let root: HTMLElement | null = null;
let ac: AbortController | null = null;
let settingsCleanup: (() => void) | null = null;
let activeTab: SiteDrawerTab = 'planets';

function close(): void {
  ac?.abort();
  ac = null;
  if (settingsCleanup) { try { settingsCleanup(); } catch {} settingsCleanup = null; }
  root?.remove();
  root = null;
  document.removeEventListener('keydown', onKeydown);
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') close();
}

function setActiveTab(tab: SiteDrawerTab): void {
  if (!root) return;
  activeTab = tab;
  const tabs = root.querySelectorAll<HTMLButtonElement>('.sdw-tab');
  tabs.forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  const panes = root.querySelectorAll<HTMLElement>('.sdw-pane');
  panes.forEach((pane) => { pane.hidden = pane.dataset.tab !== tab; });
}

/** Open the drawer to a given tab (defaults to whichever tab was last active, 'planets' on first open). */
export function openSiteDrawer(tab?: SiteDrawerTab): void {
  if (tab) activeTab = tab;

  if (root) { setActiveTab(activeTab); return; }

  ac = new AbortController();
  const signal = ac.signal;
  const roomTests = getRoomTests();

  root = document.createElement('div');
  root.className = 'site-drawer-overlay';
  // Start the drawer (backdrop + panel) right below the real, currently-rendered
  // topbar height -- not overlapping it -- so the topbar's own drawer-toggle
  // button stays clickable (re-toggle) at the same time as this drawer's own
  // .sdw-close button, which lives in the same top-right corner. Measured live
  // (not a fixed px) since the topbar can wrap to two lines on narrow viewports
  // (base.css's `.topbar { flex-wrap: wrap; }`). See site-drawer.css's comment.
  const topbarH = document.querySelector('orrery-topbar .topbar')?.getBoundingClientRect().height;
  if (topbarH) root.style.top = `${topbarH}px`;
  root.innerHTML = `
    <aside class="site-drawer" role="dialog" aria-label="Planets and settings">
      <div class="sdw-head">
        <b>ORRERY</b>
        <span class="spacer"></span>
        <button class="tb-btn sdw-close" type="button" aria-label="Close">&#10005;</button>
      </div>
      <div class="sdw-tabs" role="tablist">
        <button class="sdw-tab" type="button" role="tab" data-tab="planets">Planets</button>
        <button class="sdw-tab" type="button" role="tab" data-tab="settings">Settings</button>
      </div>
      <div class="sdw-body">
        <div class="sdw-pane" data-tab="planets">
          <div class="rooms">
            ${playgrounds.map(e => roomCardHtml(e, roomTests)).join('')}
          </div>
        </div>
        <div class="sdw-pane settings-pane" data-tab="settings"></div>
      </div>
    </aside>`;
  document.body.appendChild(root);

  const aside = root.querySelector('.site-drawer') as HTMLElement;
  root.addEventListener('click', ev => { if (ev.target === root) close(); }, { signal });
  root.querySelector('.sdw-close')!.addEventListener('click', close, { signal });
  root.querySelectorAll<HTMLButtonElement>('.sdw-tab').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab as SiteDrawerTab), { signal });
  });
  document.addEventListener('keydown', onKeydown);

  const planetsPane = aside.querySelector('.sdw-pane[data-tab="planets"]') as HTMLElement;
  wireRoomCardInteractions(planetsPane, signal);
  void applyBuildTimeFallback(planetsPane, playgrounds, roomTests, signal);

  // Picking a planet (or its test badge / companion plug, both of which
  // also navigate elsewhere) should dismiss the drawer, not leave it
  // sitting open over the room you just chose.
  planetsPane.addEventListener('click', ev => {
    if ((ev.target as Element | null)?.closest('.room-card')) close();
  }, { signal });

  const settingsPane = aside.querySelector('.sdw-pane[data-tab="settings"]') as HTMLElement;
  settingsCleanup = renderSettings(settingsPane);

  setActiveTab(activeTab);
}

/** Open the drawer, or close it if it's already open (a toggle, matching the old togglePlanetsSidebar()'s behaviour) -- opens to whichever tab was last active. */
export function toggleSiteDrawer(): void {
  if (root) { close(); return; }
  openSiteDrawer();
}
