/**
 * The optional Node companion (`npm run node`, http://localhost:7777).
 * probeCompanion() resolves to its manifest when it's running, or null. Never throws.
 */
export interface CompanionDemo { id: string; describe: string; ok: boolean; error: string | null }
export interface Companion { name: string; port: number; node: string; platform: string; arch: string; demos: CompanionDemo[]; base: string; wsBase: string }

export const DEFAULT_COMPANION_URL = 'http://localhost:7777';
const KEY = 'orrery:companion-url';

/** The configured companion origin (Settings page), falling back to the default. */
export function getCompanionUrl(): string {
  try { return (localStorage.getItem(KEY) || DEFAULT_COMPANION_URL).replace(/\/+$/, ''); } catch { return DEFAULT_COMPANION_URL; }
}
export function setCompanionUrl(url: string): void {
  const v = url.trim().replace(/\/+$/, '');
  try { if (!v || v === DEFAULT_COMPANION_URL) localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch {}
  cached = null;
}
/** Kept for callers that referenced the old constant; prefer getCompanionUrl(). */
export const COMPANION_URL = DEFAULT_COMPANION_URL;
let cached: Promise<Companion | null> | null = null;

export function probeCompanion(force = false): Promise<Companion | null> {
  if (cached && !force) return cached;
  cached = (async () => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1200);
      const base = getCompanionUrl();
      const r = await fetch(`${base}/orrery.json`, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) return null;
      const j = await r.json();
      return { ...j, base, wsBase: base.replace(/^http/, 'ws') } as Companion;
    } catch { return null; }
  })();
  return cached;
}

/** Does the companion host a given demo id (and did it mount without error)? */
export function hasDemo(c: Companion | null, id: string): boolean {
  return !!c?.demos.find((d) => d.id === id && d.ok);
}

/** Banner for a planet: live (green) or fallback (neutral) with the instruction. */
export function companionBanner(c: Companion | null, demoId: string, fallbackNote: string): HTMLElement {
  const live = hasDemo(c, demoId);
  const err = c?.demos.find((d) => d.id === demoId)?.error;
  const d = document.createElement('div');
  d.className = `companion-banner ${live ? 'live' : 'fallback'}`;
  d.innerHTML = live
    ? `<span class="dot"></span><b>Live</b> — talking to the real server in the Node companion at <code>${c!.base.replace(/^https?:\/\//, '')}</code>. <a href="#/settings">settings</a>`
    : `<span class="dot"></span><b>In-page stand-in</b> — ${fallbackNote} Run <code>npm run node</code> in the repo and reload to use the real server, or point the site at one in <a href="#/settings">settings</a>.${err ? `<div class="err">companion is up but this demo failed to mount: ${err.split('\n')[0]}</div>` : ''}`;
  return d;
}
