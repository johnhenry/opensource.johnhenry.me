/**
 * Handoff bus: any planet can send a typed payload to another planet.
 * The payload is stored in sessionStorage and the app navigates; the target
 * planet calls receive() inside mount() to pick it up (once).
 */
export interface Handoff<T = unknown> { from: string; to: string; kind: string; payload: T; at: number }

const KEY = 'orrery:handoff';

export function send<T>(from: string, toRoom: string, kind: string, payload: T): void {
  const h: Handoff<T> = { from, to: toRoom, kind, payload, at: Date.now() };
  try { sessionStorage.setItem(KEY, JSON.stringify(h)); } catch {}
  location.hash = `#/${toRoom}`;
}

/**
 * Returns the pending handoff addressed to `myRoomId` (and clears it), or null.
 * If a handoff is pending but addressed to a *different* room (e.g. the user
 * navigated through an intermediate planet on the way to the real target),
 * it is left untouched in storage so the real target can still pick it up.
 */
export function receive<T = unknown>(myRoomId: string): Handoff<T> | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as Handoff<T>;
    if (h.to !== myRoomId) return null;
    sessionStorage.removeItem(KEY);
    return h;
  } catch { return null; }
}

/** Render a "send to →" button. getPayload is called on click. */
export function handoffButton<T>(opts: { from: string; to: string; kind: string; label: string; getPayload: () => T }): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn handoff';
  b.innerHTML = `${opts.label} <span class="arrow">→</span>`;
  b.title = `Send to the ${opts.to} planet`;
  b.addEventListener('click', () => send(opts.from, opts.to, opts.kind, opts.getPayload()));
  return b;
}

/** Banner shown by a receiving planet to acknowledge a handoff. */
export function handoffBanner(h: Handoff, note: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'handoff-banner';
  d.innerHTML = `<span class="chip">from #/${h.from}</span> ${note}`;
  return d;
}

/* ---- test badges (Tester Console writes, home page reads) ---- */
export interface RoomTests { pass: number; fail: number; at: number }
const TKEY = 'orrery:tests';

export function setRoomTests(roomId: string, r: Omit<RoomTests, 'at'>): void {
  try {
    const all = JSON.parse(localStorage.getItem(TKEY) || '{}');
    all[roomId] = { ...r, at: Date.now() };
    localStorage.setItem(TKEY, JSON.stringify(all));
  } catch {}
}
export function getRoomTests(): Record<string, RoomTests> {
  try { return JSON.parse(localStorage.getItem(TKEY) || '{}'); } catch { return {}; }
}

/* ------------------------------------------------------------------ */
/* Cross-tab bus: same idea as send()/receive() above, but for OTHER  */
/* browser tabs on the same origin instead of an in-tab hash          */
/* navigation. Built on @johnhenry/browsermesh-pod's                  */
/* BroadcastChannelTransport (a thin wrapper over the browser's       */
/* native BroadcastChannel) rather than the full Pod handshake        */
/* protocol -- we just want an unaddressed fan-out pipe, not peer      */
/* discovery.                                                          */
/*                                                                      */
/* Usage:                                                              */
/*   sendToTab('studio', 'packfile', 'fileable-tree', { files })       */
/*   const off = onTabHandoff('packfile', (h) => applyHandoff(h));     */
/*   // later: off();                                                  */
/* ------------------------------------------------------------------ */
import { BroadcastChannelTransport } from '@johnhenry/browsermesh-pod';

const TAB_CHANNEL = 'orrery:bus:tabs';

// BroadcastChannelTransport#onMessage only holds a single handler (it's a
// bare field, not a subscriber list -- see its source), so the bus keeps its
// own fan-out list and installs exactly one handler on the transport.
let tabTransport: BroadcastChannelTransport | null = null;
let tabTransportOpen: Promise<BroadcastChannelTransport> | null = null;
const tabListeners = new Set<(h: Handoff<unknown>) => void>();

function getTabTransport(): Promise<BroadcastChannelTransport> {
  if (!tabTransportOpen) {
    tabTransportOpen = (async () => {
      const t = new BroadcastChannelTransport(TAB_CHANNEL);
      t.onMessage((msg: unknown) => {
        const h = msg as Handoff<unknown>;
        if (!h || typeof h.to !== 'string') return;
        for (const cb of tabListeners) {
          try { cb(h); } catch (err) { console.error(err); }
        }
      });
      await t.open();
      tabTransport = t;
      return t;
    })();
  }
  return tabTransportOpen;
}

/** Broadcasts a handoff to OTHER browser tabs on the same origin (not this one -- BroadcastChannel never echoes to its own sender). */
export function sendToTab<T>(from: string, toRoom: string, kind: string, payload: T): void {
  const h: Handoff<T> = { from, to: toRoom, kind, payload, at: Date.now() };
  void getTabTransport().then((t) => t.send(h));
}

/** Subscribes to incoming cross-tab handoffs addressed to `myRoomId`. Returns an unsubscribe function. */
export function onTabHandoff<T = unknown>(myRoomId: string, cb: (h: Handoff<T>) => void): () => void {
  const listener = (h: Handoff<unknown>) => {
    if (h.to === myRoomId) cb(h as Handoff<T>);
  };
  tabListeners.add(listener as (h: Handoff<unknown>) => void);
  void getTabTransport(); // make sure the channel is open even if sendToTab is never called locally
  return () => { tabListeners.delete(listener as (h: Handoff<unknown>) => void); };
}
