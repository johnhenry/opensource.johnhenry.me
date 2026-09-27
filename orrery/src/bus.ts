/**
 * Handoff bus: any planet can send a typed payload to another planet.
 * The payload is stored in sessionStorage and the app navigates; the target
 * planet calls receive() inside mount() to pick it up (once).
 */
export interface Handoff<T = unknown> { from: string; kind: string; payload: T; at: number }

const KEY = 'orrery:handoff';

export function send<T>(from: string, toRoom: string, kind: string, payload: T): void {
  const h: Handoff<T> = { from, kind, payload, at: Date.now() };
  try { sessionStorage.setItem(KEY, JSON.stringify(h)); } catch {}
  location.hash = `#/${toRoom}`;
}

/** Returns the pending handoff for this planet (and clears it), or null. */
export function receive<T = unknown>(): Handoff<T> | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as Handoff<T>;
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
