/**
 * The "All planets" grid, moved out of the home page and into a
 * header-toggleable sidebar (openable from every route, not just "/").
 * Renders the same room cards the home page used to show inline, via the
 * helpers home.ts already owns (badgeFor()/plugFor() live there).
 */
import { playgrounds } from './registry';
import { getRoomTests } from './bus';
import { roomCardHtml, wireRoomCardInteractions, applyBuildTimeFallback } from './home';
import './planets-sidebar.css';

let root: HTMLElement | null = null;
let ac: AbortController | null = null;

function close(): void {
  ac?.abort();
  ac = null;
  root?.remove();
  root = null;
  document.removeEventListener('keydown', onKeydown);
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') close();
}

/** Open the sidebar, or close it if it's already open (a toggle, matching the header button). */
export function togglePlanetsSidebar(): void {
  if (root) { close(); return; }

  ac = new AbortController();
  const roomTests = getRoomTests();

  root = document.createElement('div');
  root.className = 'planets-sidebar-overlay';
  root.innerHTML = `
    <aside class="planets-sidebar" role="dialog" aria-label="All planets">
      <div class="ps-head">
        <b>All planets</b>
        <span class="spacer"></span>
        <button class="tb-btn ps-close" type="button" aria-label="Close">&#10005;</button>
      </div>
      <div class="ps-body">
        <div class="rooms">
          ${playgrounds.map(e => roomCardHtml(e, roomTests)).join('')}
        </div>
      </div>
    </aside>`;
  document.body.appendChild(root);

  const aside = root.querySelector('.planets-sidebar') as HTMLElement;
  root.addEventListener('click', ev => { if (ev.target === root) close(); }, { signal: ac.signal });
  root.querySelector('.ps-close')!.addEventListener('click', close, { signal: ac.signal });
  document.addEventListener('keydown', onKeydown);

  wireRoomCardInteractions(aside, ac.signal);
  const main = aside.querySelector('.ps-body') as HTMLElement;
  void applyBuildTimeFallback(main, playgrounds, roomTests, ac.signal);

  // Picking a planet (or its test badge / companion plug, both of which
  // also navigate elsewhere) should dismiss the menu, not leave it sitting
  // open over the room you just chose.
  aside.addEventListener('click', ev => {
    if ((ev.target as Element | null)?.closest('.room-card')) close();
  }, { signal: ac.signal });
}
