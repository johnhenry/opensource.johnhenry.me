/**
 * Proactive stale-deploy detection.
 *
 * src/main.ts's `route()` already recovers if a lazy-loaded planet's chunk
 * fails to load because its hash no longer exists after a newer deploy
 * overwrote `dist/assets/` (see the `isStaleChunkError`/`recoverFromStaleChunk`
 * reload-once logic there) — but that's a REACTIVE fix: a visitor still has
 * to actually hit the failure first. On a public site, the better fix is to
 * notice a new deploy happened and tell the visitor *before* they navigate
 * into a room whose chunk might already be gone.
 *
 * Mechanism: periodically re-fetch this page's own HTML with `cache:
 * 'no-store'` and extract the hashed main-entry script filename from it —
 * that filename changes on every build (Vite content-hashes it), so a
 * mismatch against the filename captured at load time means a newer deploy
 * exists. On mismatch, show a small dismissible banner with a manual
 * "Reload" button.
 *
 * Deliberately never auto-reloads on its own: this session already hit a
 * real complaint (the Almanac's scheduled Tester run) about a mechanism
 * silently navigating a tab away from whatever the visitor was doing
 * without consent. A visitor mid-animation in ecmanim or mid-session in the
 * jth Conductor shouldn't lose that state without choosing to.
 */

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes -- frequent enough to catch a deploy within a normal visit, not so frequent it's a meaningful load on the server
const ENTRY_RE = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/index-[\w-]+\.js)"/;

async function currentEntryScript(): Promise<string | null> {
  try {
    const res = await fetch(location.pathname, { cache: 'no-store' });
    if (!res.ok) return null;
    const html = await res.text();
    return ENTRY_RE.exec(html)?.[1] ?? null;
  } catch {
    return null; // offline, or a transient network hiccup -- just skip this check
  }
}

function showBanner(onReload: () => void): void {
  if (document.querySelector('.version-banner')) return; // already shown
  const bar = document.createElement('div');
  bar.className = 'version-banner';
  bar.innerHTML = `
    <span>A new version of this site is available.</span>
    <button type="button" class="btn primary" data-el="vb-reload">Reload</button>
    <button type="button" class="tb-btn" data-el="vb-dismiss" aria-label="Dismiss">&#10005;</button>`;
  document.body.appendChild(bar);
  bar.querySelector('[data-el="vb-reload"]')!.addEventListener('click', onReload);
  bar.querySelector('[data-el="vb-dismiss"]')!.addEventListener('click', () => bar.remove());
}

let installed = false;

/** Call once from main.ts. Safe to call more than once -- a second call is a no-op. */
export function installVersionCheck(): void {
  if (installed) return;
  installed = true;

  void currentEntryScript().then((knownEntry) => {
    if (!knownEntry) return; // couldn't establish a baseline -- don't false-positive later
    const check = async () => {
      if (document.querySelector('.version-banner')) return; // already told them
      const latest = await currentEntryScript();
      if (latest && latest !== knownEntry) {
        showBanner(() => location.reload());
      }
    };
    setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void check();
    });
  });
}
