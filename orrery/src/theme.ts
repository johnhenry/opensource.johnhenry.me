/**
 * Site theme, bridged into the root Starlight docs site's own mechanism
 * instead of maintaining a second, separate one.
 *
 * The root site (outside orrery/, see src/components/ThemeProvider via
 * Starlight) persists the choice under localStorage key `starlight-theme`
 * ('dark' | 'light' | '' for "follow the OS"), and applies it as
 * `document.documentElement.dataset.theme`. Since `/` and `/orrery/` are
 * the same origin, that key is already shared storage — orrery previously
 * ran Circuit's `initThemeToggle()` instead, which uses its own unrelated
 * `circuit-theme` key and `.dark`/`.light` classes, so picking a theme on
 * one subpath had no effect on the other. This module makes
 * `starlight-theme` the single source of truth site-wide: it reads/writes
 * that key directly, mirrors Starlight's own resolution semantics (empty
 * string = follow `prefers-color-scheme`), and applies BOTH signals so
 * nothing else in orrery has to change — `data-theme` (what the root site's
 * CSS keys off) and `.dark`/`.light` classes on `documentElement` (what
 * orrery's own `base.css` keys off, e.g. `html.dark { --bg: ...; }`).
 */

const KEY = 'starlight-theme';

export type ThemeChoice = 'dark' | 'light' | 'system';

function systemPrefersLight(): boolean {
  return matchMedia('(prefers-color-scheme: light)').matches;
}

/** Raw stored value -> a resolved 'dark' | 'light' (never 'system' — same as Starlight's own script). */
function resolve(stored: string | null): 'dark' | 'light' {
  if (stored === 'dark' || stored === 'light') return stored;
  return systemPrefersLight() ? 'light' : 'dark';
}

function apply(resolved: 'dark' | 'light'): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
}

/** What's actually stored right now: 'dark' | 'light' | 'system' (system = Starlight's '' sentinel). */
export function getThemeChoice(): ThemeChoice {
  const stored = localStorage.getItem(KEY);
  return stored === 'dark' || stored === 'light' ? stored : 'system';
}

const listeners = new Set<(choice: ThemeChoice) => void>();
/** Subscribe to theme changes from ANY source: this tab's own setThemeChoice(), another tab/the
 *  docs site changing `starlight-theme` (via the `storage` event), or the OS scheme flipping while
 *  the choice is 'system'. Returns an unsubscribe function. */
export function onThemeChange(fn: (choice: ThemeChoice) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify(): void {
  const choice = getThemeChoice();
  for (const fn of listeners) fn(choice);
}

/** Set the choice, persist it under Starlight's own key, repaint both signals, and notify subscribers. */
export function setThemeChoice(choice: ThemeChoice): void {
  localStorage.setItem(KEY, choice === 'system' ? '' : choice);
  apply(resolve(localStorage.getItem(KEY)));
  notify();
}

let installed = false;

/** Apply the current theme immediately and wire up cross-tab / OS-scheme reactivity. Call once. */
export function initSiteTheme(): void {
  apply(resolve(localStorage.getItem(KEY)));
  if (installed) return;
  installed = true;

  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) { apply(resolve(localStorage.getItem(KEY))); notify(); }
  });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (getThemeChoice() === 'system') apply(resolve(localStorage.getItem(KEY)));
    notify();
  });
}
