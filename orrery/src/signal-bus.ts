/**
 * Signal Bus (ROADMAP §4.11).
 *
 * `@johnhenry/signalle/broadcast`'s `createBroadcastSignal` keeps a value in
 * sync across tabs on the same origin via `BroadcastChannel`. This module
 * uses it two ways, both site-wide and neither touching a playground file:
 *
 *   1. **One broadcast signal per planet, mirroring `writeState`.** Every
 *      planet's deep-link query string (what `src/state.ts`'s `writeState()`
 *      writes into the URL hash via `history.replaceState`) is mirrored,
 *      live, to a `createBroadcastSignal('', 'orrery:signal:state:<id>')`
 *      for that planet — without any playground importing this module.
 *      `history.replaceState` is wrapped exactly once (module load), the
 *      same pattern `har-recorder.ts` uses for `fetch`: call straight
 *      through with the caller's original arguments, then read the
 *      resulting `location.hash` back out and mirror it. A room mounted in
 *      another tab, editing its own state, shows up here as a real
 *      `BroadcastSignal` value change — visible from a small per-room
 *      corner widget — even though this module has never imported that
 *      room's code.
 *   2. **Presence**, so the home page can report "live in N tabs": each tab
 *      keeps a `{ planet, at }` entry in one shared
 *      `createBroadcastSignal({}, 'orrery:signal:presence')`, refreshed on
 *      navigation and by a heartbeat, expired if stale.
 *
 * **The late-joiner bug.** `@johnhenry/signalle/broadcast`'s
 * `BroadcastSignal` starts every instance's version counter at 0 and only
 * updates on a `BroadcastChannel` message — there is no request/response for
 * "what's the value right now," so a tab that opens after others have
 * already changed a signal shows the stale `initialValue` until the next
 * unrelated change happens to fire (filed upstream; see ROADMAP.md §5,
 * "signalle/broadcast: late-joining tabs diverge"). For presence counts —
 * the one place staleness would visibly lie about how many tabs are open —
 * this module adds the "hello/resync side channel" the roadmap names as the
 * workaround: a tiny raw `BroadcastChannel` (bypassing `BroadcastSignal`'s
 * own versioned protocol entirely) on which a newly-mounted tab announces
 * itself and every existing tab replies with its current presence map. The
 * new tab merges what it receives into its own `BroadcastSignal`, which
 * — because setting a value always re-broadcasts — brings every other tab
 * (including ones who otherwise wouldn't have needed to know about the
 * newcomer yet) to the same state within one round trip.
 */
import { createBroadcastSignal, type BroadcastSignal } from '@johnhenry/signalle/broadcast';
import './signal-bus.css';

/* ------------------------------------------------------------------ */
/* location parsing — mirrors main.ts's own hash-route parsing         */
/* ------------------------------------------------------------------ */
function currentPlanetId(): string {
  return location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
}
function currentQuery(): string {
  return location.hash.split('?')[1] ?? '';
}

/* ------------------------------------------------------------------ */
/* 1. per-planet state mirror                                          */
/* ------------------------------------------------------------------ */
const stateSignals = new Map<string, BroadcastSignal<string>>();
function stateSignalFor(planet: string): BroadcastSignal<string> {
  let s = stateSignals.get(planet);
  if (!s) { s = createBroadcastSignal('', `orrery:signal:state:${planet}`); stateSignals.set(planet, s); }
  return s;
}

/** Mirror the CURRENT location's planet+query into that planet's signal. Idempotent (no-op if unchanged, per BroadcastSignal's own Object.is check). */
function mirrorCurrentState(): void {
  const planet = currentPlanetId();
  if (!planet) return;
  stateSignalFor(planet).value = currentQuery();
}

function installHistoryPatch(): void {
  const g = globalThis as typeof globalThis & { __orreryHistoryPatched?: boolean };
  if (g.__orreryHistoryPatched) return;
  const original = history.replaceState.bind(history);
  history.replaceState = ((...args: Parameters<History['replaceState']>) => {
    original(...args);
    // Read the URL back out rather than parsing `args` — writeState() only
    // ever changes location.hash this way, but this stays correct even if
    // a future caller passes a relative/partial URL argument.
    mirrorCurrentState();
  }) as History['replaceState'];
  g.__orreryHistoryPatched = true;
}

/** Subscribe to state-mirror updates for one planet (cross-tab only in practice — same-tab writes are already visible in the DOM). Returns an unsubscribe function. */
export function onPlanetStateChanged(planet: string, cb: (query: string) => void): () => void {
  return stateSignalFor(planet).subscribe(cb);
}

/* ------------------------------------------------------------------ */
/* 2. presence ("live in N tabs")                                      */
/* ------------------------------------------------------------------ */
interface PresenceEntry { planet: string; at: number }
type PresenceMap = Record<string, PresenceEntry>;

const TAB_ID = (crypto as { randomUUID?: () => string }).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const STALE_MS = 11_000; // ~2.5 missed 4s heartbeats
const HEARTBEAT_MS = 4_000;

const presence = createBroadcastSignal<PresenceMap>({}, 'orrery:signal:presence');
const RESYNC_CHANNEL = 'orrery:signal:resync';

function myEntry(): PresenceEntry {
  return { planet: currentPlanetId(), at: Date.now() };
}

function freshEntries(map: PresenceMap, now = Date.now()): PresenceMap {
  const out: PresenceMap = {};
  for (const [id, e] of Object.entries(map)) {
    if (now - e.at <= STALE_MS) out[id] = e;
  }
  return out;
}

/** Present counts per planet id, from non-stale presence entries. */
function computeCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of Object.values(freshEntries(presence.value))) {
    if (!e.planet) continue; // home page / no planet
    counts[e.planet] = (counts[e.planet] ?? 0) + 1;
  }
  return counts;
}

function heartbeat(): void {
  presence.value = { ...freshEntries(presence.value), [TAB_ID]: myEntry() };
}

let resyncChannel: BroadcastChannel | null = null;
function installResync(): void {
  resyncChannel = new BroadcastChannel(RESYNC_CHANNEL);
  resyncChannel.onmessage = (ev) => {
    const data = ev.data as { type: string; from?: string; to?: string; presence?: PresenceMap };
    if (!data || typeof data !== 'object') return;
    if (data.type === 'hello' && data.from && data.from !== TAB_ID) {
      resyncChannel!.postMessage({ type: 'welcome', to: data.from, presence: presence.value });
    } else if (data.type === 'welcome' && data.to === TAB_ID && data.presence) {
      // Merge what the incumbent tabs already knew, then stamp our own entry
      // back in (a set always re-broadcasts, which is what finishes
      // converging every OTHER tab too, not just this one).
      presence.value = { ...freshEntries(data.presence), ...freshEntries(presence.value), [TAB_ID]: myEntry() };
    }
  };
  resyncChannel.postMessage({ type: 'hello', from: TAB_ID });
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */
const countListeners = new Set<(counts: Record<string, number>) => void>();
let pollTimer: number | undefined;

function notifyCounts(): void {
  const counts = computeCounts();
  for (const cb of countListeners) { try { cb(counts); } catch (err) { console.error(err); } }
}

/**
 * Live per-planet "how many tabs have this open" counts. Calls `cb`
 * immediately and again whenever presence changes (a real cross-tab
 * broadcast) or, absent any new message, every few seconds so stale entries
 * still expire visibly. Returns an unsubscribe function.
 */
export function subscribeLiveCounts(cb: (counts: Record<string, number>) => void): () => void {
  countListeners.add(cb);
  cb(computeCounts());
  if (!pollTimer) pollTimer = window.setInterval(notifyCounts, 3_000);
  return () => {
    countListeners.delete(cb);
    if (countListeners.size === 0 && pollTimer) { clearInterval(pollTimer); pollTimer = undefined; }
  };
}

/** How many OTHER tabs currently have `planet` open (excludes this tab). */
export function otherTabsOn(planet: string): number {
  const counts = computeCounts();
  const mine = currentPlanetId() === planet ? 1 : 0;
  return Math.max(0, (counts[planet] ?? 0) - mine);
}

/* ------------------------------------------------------------------ */
/* corner widget: shown while a room is mounted                        */
/* ------------------------------------------------------------------ */
let widgetRoot: HTMLElement | null = null;
let widgetPlanet = '';
let widgetOff: (() => void) | null = null;

function renderWidget(): void {
  if (!widgetRoot) return;
  const others = otherTabsOn(widgetPlanet);
  const linkedEl = widgetRoot.querySelector('.sb-linked')!;
  linkedEl.textContent = others > 0 ? `linked · ${others} other tab${others === 1 ? '' : 's'} here` : 'no other tabs here';
  widgetRoot.classList.toggle('sb-has-others', others > 0);
}

function teardownWidget(): void {
  widgetOff?.(); widgetOff = null;
  widgetRoot?.remove(); widgetRoot = null;
  widgetPlanet = '';
}

function setupWidgetFor(planet: string): void {
  if (widgetPlanet === planet) return;
  teardownWidget();
  if (!planet) return;
  widgetPlanet = planet;

  const root = document.createElement('div');
  root.className = 'signal-widget';
  root.innerHTML = `
    <span class="sb-dot"></span>
    <span class="sb-linked">linked · checking…</span>
    <span class="sb-changed" hidden>state changed in another tab — <button type="button" class="sb-sync">sync &amp; reload</button></span>`;
  document.body.appendChild(root);
  widgetRoot = root;
  renderWidget();

  const offCount = subscribeLiveCounts(() => renderWidget());
  const changedEl = root.querySelector<HTMLElement>('.sb-changed')!;
  const syncBtn = root.querySelector<HTMLButtonElement>('.sb-sync')!;
  let pendingQuery: string | null = null;
  const offState = onPlanetStateChanged(planet, (query) => {
    if (query === currentQuery()) return; // our own echo, or already matches
    pendingQuery = query;
    changedEl.hidden = false;
    root.classList.add('sb-pulse');
    setTimeout(() => root.classList.remove('sb-pulse'), 900);
  });
  syncBtn.addEventListener('click', () => {
    if (pendingQuery === null) return;
    history.replaceState(null, '', `#/${planet}${pendingQuery ? '?' + pendingQuery : ''}`);
    location.reload();
  });

  widgetOff = () => { offCount(); offState(); };
}

/* ------------------------------------------------------------------ */
/* mount                                                               */
/* ------------------------------------------------------------------ */
let mounted = false;

export function mountSignalBus(): void {
  if (mounted) return;
  mounted = true;

  installHistoryPatch();
  installResync();
  mirrorCurrentState();
  heartbeat();
  setInterval(heartbeat, HEARTBEAT_MS);
  presence.subscribe(() => notifyCounts());

  const onRoute = () => {
    mirrorCurrentState();
    heartbeat();
    setupWidgetFor(currentPlanetId());
  };
  addEventListener('hashchange', onRoute);
  onRoute();

  addEventListener('pagehide', () => {
    const rest = freshEntries(presence.value);
    delete rest[TAB_ID];
    presence.value = rest;
  });
}
