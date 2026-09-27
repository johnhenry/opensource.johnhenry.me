/**
 * Deep-linkable planet state. The hash is `#/<planet>?k=v&k2=v2`.
 * Values that aren't plain strings are JSON-encoded.
 */
function parse(): URLSearchParams {
  const q = location.hash.split('?')[1] ?? '';
  return new URLSearchParams(q);
}

export function readState<T extends Record<string, unknown>>(defaults: T): T {
  const p = parse();
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of p) {
    if (!(k in defaults)) continue;
    const d = defaults[k];
    if (typeof d === 'string') out[k] = v;
    else { try { out[k] = JSON.parse(v); } catch { out[k] = v; } }
  }
  return out as T;
}

let t: number | undefined;
/** Replace the hash query without triggering navigation (debounced). */
export function writeState(state: Record<string, unknown>, defaults?: Record<string, unknown>): void {
  clearTimeout(t);
  t = window.setTimeout(() => {
    const planet = location.hash.replace(/^#\/?/, '').split('?')[0];
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) {
      if (v === undefined || v === null) continue;
      if (defaults && JSON.stringify(defaults[k]) === JSON.stringify(v)) continue;
      p.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    const q = p.toString();
    history.replaceState(null, '', `#/${planet}${q ? '?' + q : ''}`);
  }, 150);
}

/** Copy the current deep link to the clipboard; returns the URL. */
export async function copyLink(): Promise<string> {
  const url = location.href;
  try { await navigator.clipboard.writeText(url); } catch {}
  return url;
}
