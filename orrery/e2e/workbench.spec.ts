import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Workbench Desk planet (#/workbench), end to end, on a production build.
 * Playwright CSS locators pierce open shadow roots, which is how the html-modules components (each with a shadow root) are reached.
 * Nothing here depends on the external standalone site: real mode is exercised against a route-fulfilled copy of its HTML.
 * The one live check (tagged @live) is skipped unless WORKBENCH_LIVE=1.
 */

const STANDALONE = 'https://johnhenry.github.io/workbench/';
const FIXTURE = readFileSync(new URL('./fixtures/standalone.html', import.meta.url), 'utf8');
const FIXTURE_CSP = FIXTURE.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)![1];
const DESK = '#/workbench';

/** Collect page errors and console errors so every test can assert the planet ran clean. */
function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
/**
 * Errors that are about this planet. Not counted: the favicon, and the 404 a static host gives the seed notes' hostile
 * <img src="x"> (the sanitizer keeps the <img>, strips its onerror, and the browser still asks for "x").
 */
const mine = (errors: string[]) => errors.filter((e) => !/favicon|manifest|apple-touch|Failed to load resource: the server responded with a status of 404/i.test(e));

/** A full, clean page load at a URL that names nothing (not a hash change followed by a reload, which can race a boot in flight). */
async function fresh(page: Page) {
  await page.goto('about:blank');
  await page.goto(`./${DESK}`);
}

async function openDesk(page: Page, hash = DESK) {
  await page.goto(`./${hash}`);
  await expect(page.locator('wb--note-card').first()).toBeVisible();
  await expect(page.locator('.wb-stage-chip', { hasText: 'window-algebra' })).toBeVisible();
}
const canary = (page: Page) => page.evaluate(() => ((window as any).__orreryWorkbenchPwned as unknown[] | undefined)?.length ?? -1);
const pressed = (page: Page, attr: string, value: string) => page.locator(`.wb-controls [${attr}="${value}"]`);
const noteHeadings = (page: Page) => page.locator('wb--note-card').evaluateAll((els) => els.map((e) => e.getAttribute('heading')));
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** What a rendered note actually contains: hazards counted in the live DOM that safe-fragment produced. */
const hazards = (card: import('@playwright/test').Locator) =>
  card.evaluate((el) => {
    const frag = el.shadowRoot!.querySelector('safe-fragment') as any;
    const root: ParentNode = frag.getRenderedRoot();
    const all = [...root.querySelectorAll('*')];
    return {
      scripts: root.querySelectorAll('script, iframe, object, embed, frame').length,
      onAttrs: all.reduce((n, e) => n + [...e.attributes].filter((a) => /^on/i.test(a.name)).length, 0),
      jsUrls: all.filter((e) => [...e.attributes].some((a) => /^(href|src|action|formaction|srcdoc)$/i.test(a.name) && /^\s*javascript:/i.test(a.value.replace(/[\u0000- ]/g, '')))).length,
      forms: root.querySelectorAll('form, input, button').length,
      strong: root.querySelectorAll('strong').length,
      httpsLinks: root.querySelectorAll('a[href^="https://"]').length,
      text: (root as Element).textContent ?? '',
    };
  });

test.describe('in-page mode', () => {
  test('the desk renders its windows, and the components render inside shadow roots', async ({ page }) => {
    const errors = watch(page);
    await openDesk(page);

    // three windows, each a window-algebra view with its chrome
    await expect(page.locator('wa-stage wm-view[data-view]')).toHaveCount(3);
    await expect(page.locator('wa-stage wm-view[data-view="notes"] [data-wa-chrome]')).toBeVisible();
    await expect(page.locator('.wb-stage-chip', { hasText: '3 windows' })).toBeVisible();

    // html-modules components: defined, with shadow roots, nesting kit components inside the tool components
    await expect(page.locator('wb--note-card')).toHaveCount(3);
    const shape = await page.evaluate(() => {
      const tool = document.querySelector('wb--notes-tool') as HTMLElement;
      const submit = tool.shadowRoot!.querySelector('kit--submit-button') as HTMLElement;
      return {
        toolShadow: !!tool.shadowRoot,
        formInShadow: !!tool.shadowRoot!.querySelector('form'),
        submitShadow: !!submit.shadowRoot,
        buttonInSubmitShadow: !!submit.shadowRoot!.querySelector('button'),
        light: document.querySelector('form') === null, // none of it is in the light DOM
        defined: ['wb--notes-tool', 'wb--note-card', 'wb--clips-tool', 'wb--report-tool', 'kit--button', 'clip--card'].every((t) => !!customElements.get(t)),
      };
    });
    expect(shape).toEqual({ toolShadow: true, formInShadow: true, submitShadow: true, buttonInSubmitShadow: true, light: true, defined: true });
    // piercing locators reach the same nodes
    await expect(page.locator('wb--notes-tool kit--field input')).toBeVisible();
    await expect(page.locator('wb--notes-tool kit--submit-button button')).toBeVisible();

    // the three seed notes render through safe-fragment: the newsletter note's hostile bits are already gone
    await expect(page.locator('.wb-stage-chip', { hasText: 'safe-fragment' })).toContainText('0 ran');
    expect(mine(errors)).toEqual([]);
  });

  test('the HTML modules are real static files fetched over HTTP, and the Module source window shows the same files', async ({ page }) => {
    const gets: string[] = [];
    // a static host may redirect /x.html to /x (the production `serve` does); either way each file is one real HTTP 200
    page.on('response', (r) => { if (/\/workbench\/components\//.test(r.url())) gets.push(`${new URL(r.url()).pathname.replace(/\.html$/, '')} ${r.status()}`); });
    await openDesk(page, `${DESK}?w=notes,clips,source`);
    await expect(page.locator('.wb-stage-chip', { hasText: 'html-modules' })).toContainText('5 modules');
    for (const f of ['kit.html', 'notes.html', 'clips.html', 'untrusted/clip.html', 'report.html']) {
      expect(gets, `GET ${f}`).toContain(`/orrery/workbench/components/${f.replace(/\.html$/, '')} 200`); // under the /orrery/ base
    }
    const src = page.locator('.wb-src');
    await expect(src.locator('.wb-map-meta')).toContainText('GET /orrery/workbench/components/notes.html');
    const shown = await src.locator('pre').innerText();
    const real = await page.evaluate(() => fetch('/orrery/workbench/components/notes.html').then((r) => r.text()));
    expect(shown.trim()).toBe(real.trim());
    expect(shown).toContain('<html-export name="notes-tool"');
    await src.locator('[data-src="untrusted/clip.html"]').click();
    await expect(src.locator('pre')).toContainText('<script>window.__orreryWorkbenchPwned');
  });

  test('the less-trusted Clips module is sanitized before its component is defined', async ({ page }) => {
    await openDesk(page);
    const clip = page.locator('clip--card');
    await expect(clip).toBeVisible();
    const found = await clip.evaluate((el) => {
      const root = el.shadowRoot!;
      const all = [...root.querySelectorAll('*')];
      return {
        scripts: root.querySelectorAll('script, iframe, svg, form, input').length,
        onAttrs: all.reduce((n, e) => n + [...e.attributes].filter((a) => /^on/i.test(a.name)).length, 0),
        jsUrls: all.filter((e) => /^\s*javascript:/i.test(e.getAttribute('href') ?? '')).length,
        strong: root.querySelectorAll('strong').length,
        heading: root.querySelector('h3')?.textContent,
        link: root.querySelector('a[href^="https://opensource.johnhenry.me"]') !== null,
      };
    });
    expect(found).toMatchObject({ scripts: 0, onAttrs: 0, jsUrls: 0, heading: 'A clip from elsewhere', link: true });
    expect(found.strong).toBeGreaterThan(0);
    // ...and the sanitize hook reported what it removed
    const removed = Number(await page.locator('wb--clips-tool').getAttribute('removed'));
    expect(removed).toBeGreaterThan(3);
    expect(await canary(page)).toBe(0);
  });

  test('the XSS preset is neutralised: the canary stays unset and nothing live is in the rendered notes', async ({ page }) => {
    const errors = watch(page);
    await openDesk(page);
    expect(await canary(page)).toBe(0);
    await page.locator('[data-preset="xss"]').click();
    await expect(page.locator('.wb-status')).toContainText('payload neutralised', { timeout: 20_000 });
    const card = page.locator('wb--note-card', { has: page.locator('h3', { hasText: 'helpful' }) });
    await expect(card).toHaveCount(1);
    // give an onerror/onload that would have fired time to fire
    await page.waitForTimeout(1200);
    expect(await canary(page)).toBe(0);
    expect(await page.evaluate(() => (window as any).__orreryWorkbenchPwned)).toEqual([]);
    const h = await hazards(card);
    expect(h).toMatchObject({ scripts: 0, onAttrs: 0, jsUrls: 0, forms: 0 });
    expect(h.strong).toBeGreaterThan(0);        // the harmless formatting survived...
    expect(h.httpsLinks).toBeGreaterThan(0);    // ...and so did the real link
    expect(h.text).toContain('Q3 planning notes');
    // the page's own audit and the report window agree
    await expect(page.locator('.wb-stage-chip', { hasText: 'safe-fragment' })).toContainText('0 ran');
    await expect(page.locator('wb--report-tool')).toBeVisible();
    await expect(page.locator('wb--report-tool kit--stat[label="handlers that ran"]')).toHaveAttribute('value', '0');
    expect(mine(errors)).toEqual([]);
  });

  test('a deep link reloads into the same state, in a fresh browser too', async ({ page, browser }) => {
    await openDesk(page, `${DESK}?l=grid&w=notes,map,source`);
    await expect(pressed(page, 'data-layout', 'grid')).toHaveAttribute('aria-pressed', 'true');
    for (const id of ['notes', 'map', 'source']) await expect(pressed(page, 'data-open', id)).toHaveAttribute('aria-pressed', 'true');
    for (const id of ['clips', 'report']) await expect(pressed(page, 'data-open', id)).toHaveAttribute('aria-pressed', 'false');
    // change something, wait for the link to catch up, then reload the very URL
    await pressed(page, 'data-layout', 'spiral').click();
    await expect.poll(() => page.url()).toContain('l=spiral');
    const url = page.url();
    expect(url).toContain('w=notes%2Cmap%2Csource');
    await page.reload();
    await expect(pressed(page, 'data-layout', 'spiral')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(page, 'data-open', 'source')).toHaveAttribute('aria-pressed', 'true');
    // a fresh context has no storage: the link alone carries the state
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(url);
    await expect(other.locator('wb--note-card').first()).toBeVisible();
    await expect(pressed(other, 'data-layout', 'spiral')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(other, 'data-open', 'map')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(other, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'false');
    await fresh.close();
  });

  test('windows and notes persist across a reload, under planet-specific keys; Reset desk clears them', async ({ page }) => {
    const errors = watch(page);
    await openDesk(page);
    expect(await noteHeadings(page)).toHaveLength(3);

    // add a note through the real form: form-associated fields and the submit-button component
    await page.locator('wb--notes-tool kit--field input').fill('Persist me');
    await page.locator('wb--notes-tool kit--area textarea').fill('<p>kept <strong>across</strong> reloads</p>');
    await page.locator('wb--notes-tool kit--submit-button button').click();
    await expect.poll(() => noteHeadings(page)).toContain('Persist me');
    // rearrange the desk
    await pressed(page, 'data-layout', 'rows').click();
    await pressed(page, 'data-open', 'clips').click();
    await expect(pressed(page, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'false');

    // saved with window-algebra's serialize(), under this planet's keys only
    await expect.poll(async () => JSON.parse((await stored(page, 'orrery:workbench:wm')) ?? '{}').windows?.clips).toBeUndefined();
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /workbench/i.test(k)).sort());
    expect(keys).toEqual(['orrery:workbench:data', 'orrery:workbench:wm']);

    // reload at a URL that names nothing: only storage can restore this
    await fresh(page);
    await expect(page.locator('wb--note-card').first()).toBeVisible();
    await expect.poll(() => noteHeadings(page)).toContain('Persist me');
    expect(await noteHeadings(page)).toHaveLength(4);
    await expect(pressed(page, 'data-layout', 'rows')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(page, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'false');
    await expect(pressed(page, 'data-open', 'notes')).toHaveAttribute('aria-pressed', 'true');
    const card = page.locator('wb--note-card', { has: page.locator('h3', { hasText: 'Persist me' }) });
    expect((await hazards(card)).strong).toBeGreaterThan(0); // restored note renders through safe-fragment again

    // reset
    await page.locator('[data-act="reset"]').click();
    await expect(page.locator('.wb-status')).toContainText('desk reset');
    await expect.poll(async () => (await noteHeadings(page)).sort()).toEqual(['Pasted from a newsletter', 'Plain text stays plain', 'Welcome to the desk']);
    expect(await noteHeadings(page)).not.toContain('Persist me');
    await expect(pressed(page, 'data-layout', 'master-stack')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(page, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse((await stored(page, 'orrery:workbench:data'))!).notes).toHaveLength(3);
    await fresh(page);
    await expect(page.locator('wb--note-card').first()).toBeVisible();
    expect(await noteHeadings(page)).toHaveLength(3);
    await expect(pressed(page, 'data-layout', 'master-stack')).toHaveAttribute('aria-pressed', 'true');
    expect(mine(errors)).toEqual([]);
  });

  test('two tabs sync: layout through attachSync, notes through storage, and Reset desk reaches the other tab', async ({ context }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    const errors = [...watch(a), ...watch(b)];
    await openDesk(a);
    await openDesk(b);
    // each tab finds the other (peers are counted by window-algebra's attachSync)
    await expect(a.locator('[data-tabs]')).toHaveAttribute('data-tabs', '2', { timeout: 20_000 });
    await expect(b.locator('[data-tabs]')).toHaveAttribute('data-tabs', '2', { timeout: 20_000 });

    // layout: A changes, B follows (the BroadcastChannel is named orrery-workbench)
    await pressed(a, 'data-layout', 'columns').click();
    await expect(pressed(b, 'data-layout', 'columns')).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    // a window: B closes Source/Map, A follows
    await pressed(b, 'data-open', 'map').click();
    await expect(pressed(a, 'data-open', 'map')).toHaveAttribute('aria-pressed', 'false', { timeout: 20_000 });

    // notes: A adds one, B shows it
    await a.locator('wb--notes-tool kit--field input').fill('From tab A');
    await a.locator('wb--notes-tool kit--area textarea').fill('plain words');
    await a.locator('wb--notes-tool kit--submit-button button').click();
    await expect.poll(() => noteHeadings(a)).toContain('From tab A');
    await expect.poll(() => noteHeadings(b), { timeout: 20_000 }).toContain('From tab A');
    // a delete in B reaches A
    await b.locator('wb--note-card', { has: b.locator('h3', { hasText: 'From tab A' }) }).locator('kit--button[data-action="delete"] button').click();
    await expect.poll(() => noteHeadings(a), { timeout: 20_000 }).not.toContain('From tab A');

    // reset in A resets B's windows and notes
    await a.locator('[data-act="reset"]').click();
    await expect(pressed(b, 'data-layout', 'master-stack')).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    await expect(pressed(b, 'data-open', 'map')).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    await expect.poll(async () => (await noteHeadings(b)).length).toBe(3);

    // closing a tab drops the count
    await b.close();
    await expect(a.locator('[data-tabs]')).toHaveAttribute('data-tabs', '1', { timeout: 20_000 });
    expect(mine(errors)).toEqual([]);
  });
});

test.describe('shortcuts and cleanup', () => {
  test('Ctrl/Cmd+Shift+P is the desk palette, Ctrl/Cmd+K is still the orrery palette, and they do not cross', async ({ page }) => {
    await openDesk(page);
    const deskPalette = page.locator('[data-wm-palette-backdrop]:not([hidden])');
    const orreryPalette = page.locator('.c-palette-backdrop.open');
    await page.locator('wb--notes-tool kit--field input').focus();

    await page.keyboard.press('ControlOrMeta+Shift+P');
    await expect(deskPalette).toBeVisible();
    await expect(orreryPalette).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(deskPalette).toHaveCount(0);

    await page.keyboard.press('ControlOrMeta+k');
    await expect(orreryPalette).toBeVisible();
    await expect(deskPalette).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(orreryPalette).toHaveCount(0);

    // the button opens the same palette (Firefox reserves Ctrl+Shift+P for a private window on some platforms)
    await page.locator('[data-act="palette"]').click();
    await expect(deskPalette).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('leaving the planet removes its handlers, timers and styles', async ({ page }) => {
    const errors = watch(page);
    await openDesk(page);
    await expect(page.locator('style[data-pg-workbench]')).toHaveCount(1);
    await page.evaluate(() => { location.hash = '#/spintax'; });
    await expect(page.locator('.pg-workbench')).toHaveCount(0);
    await expect(page.locator('style[data-pg-workbench]')).toHaveCount(0);
    await expect(page.locator('[data-wm-palette-backdrop]')).toHaveCount(0);

    // the desk's document-level key handlers are gone: Ctrl/Cmd+Shift+P is nobody's now, and the orrery's own palette is intact
    const result = await page.evaluate(() => {
      const ev = new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, metaKey: false, shiftKey: true, bubbles: true, cancelable: true });
      const ev2 = new KeyboardEvent('keydown', { key: 'p', ctrlKey: false, metaKey: true, shiftKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(ev); document.dispatchEvent(ev2);
      return { ctrl: ev.defaultPrevented, meta: ev2.defaultPrevented, canary: (window as any).__orreryWorkbenchPwned };
    });
    expect(result).toEqual({ ctrl: false, meta: false, canary: undefined });
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator('.c-palette-backdrop.open')).toBeVisible();
    await page.keyboard.press('Escape');

    // a note added in another tab no longer touches this page (the storage listener is gone): no errors, no desk DOM
    const other = await page.context().newPage();
    await openDesk(other);
    await other.locator('wb--notes-tool kit--field input').fill('after you left');
    await other.locator('wb--notes-tool kit--submit-button button').click();
    await other.waitForTimeout(500);
    await other.close();
    await expect(page.locator('wb--note-card')).toHaveCount(0);

    // coming back restores the desk, including the note the other tab added
    await page.evaluate(() => { location.hash = '#/workbench'; });
    await expect(page.locator('wb--note-card').first()).toBeVisible();
    await expect.poll(() => noteHeadings(page)).toContain('after you left');
    expect(mine(errors)).toEqual([]);
  });
});

test.describe('real mode (the standalone app in a frame)', () => {
  /** The external site is replaced by a copy of its real HTML, so a gating test never depends on it. */
  async function stubStandalone(context: BrowserContext, fail = false) {
    await context.route(`${STANDALONE}**`, (route) => {
      if (fail) return route.abort('internetdisconnected');
      const url = route.request().url();
      if (url === STANDALONE) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: FIXTURE });
      // the page's module entry and its other files: an empty module, so the frame stays inert and quiet
      return route.fulfill({ status: 200, contentType: /\.(m?js)$/.test(url) ? 'text/javascript' : /\.css$/.test(url) ? 'text/css' : 'text/plain', body: '' });
    });
  }

  test('?mode=real embeds the standalone URL and lists what the frame proves', async ({ page, context }) => {
    await stubStandalone(context);
    const errors = watch(page);
    await page.goto('./#/workbench?mode=real');
    const frame = page.locator('iframe[data-frame]');
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute('src', STANDALONE);
    await expect(frame).toHaveAttribute('loading', 'lazy');
    expect(((await frame.getAttribute('title')) ?? '').length).toBeGreaterThan(10);
    expect(await frame.getAttribute('allow')).toBeNull();      // nothing needed, so nothing granted
    expect(await frame.getAttribute('sandbox')).toBeNull();    // it runs as itself
    await expect(page.locator('.wb-real')).toHaveAttribute('data-frame', 'loaded');
    // sized to the desk area
    const box = (await frame.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(560);
    expect(box.width).toBeGreaterThan(500);

    // full screen link
    const full = page.locator('a[data-fullscreen]');
    await expect(full).toHaveAttribute('href', STANDALONE);
    await expect(full).toHaveAttribute('target', '_blank');
    await expect(full).toHaveAttribute('rel', /noopener/);

    // the five claims, in order, each from the fetched HTML
    const claims = page.locator('[data-claims] [data-claim]');
    await expect(claims).toHaveCount(5);
    expect(await claims.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.claim))).toEqual(['origin', 'csp', 'trusted-types', 'import-map', 'integrity']);
    await expect(page.locator('.wb-claims-src')).toContainText('just now');
    await expect(page.locator('[data-claim="origin"]')).toContainText('https://johnhenry.github.io');
    await expect(page.locator('[data-claim="origin"]')).toContainText(new URL(page.url()).origin);
    // the CSP is quoted verbatim, directive by directive
    const quoted = await page.locator('[data-claim="csp"] [data-csp]').innerText();
    expect(quoted.split(';\n').map((s) => s.trim().replace(/;$/, ''))).toEqual(FIXTURE_CSP.split(';').map((s) => s.trim()));
    await expect(page.locator('[data-claim="csp"]')).toContainText('sends no Content-Security-Policy header');
    await expect(page.locator('[data-claim="trusted-types"]')).toContainText("require-trusted-types-for 'script'");
    await expect(page.locator('[data-claim="trusted-types"]')).toContainText('trusted-types html-modules dompurify');
    await expect(page.locator('[data-claim="import-map"]')).toContainText('11');
    await expect(page.locator('[data-claim="import-map"] [data-importmap]')).toContainText('@johnhenry/window-algebra/element');
    await expect(page.locator('[data-claim="import-map"]')).toContainText('app/main.js');
    await expect(page.locator('[data-claim="integrity"] [data-integrity]')).toContainText('sha384-');
    await expect(page.locator('[data-claim="integrity"] [data-integrity]')).toContainText('https://esm.sh/dayjs@1.11.23/es2022/dayjs.mjs');
    // real mode does not boot the in-page desk
    await expect(page.locator('wa-stage')).toHaveCount(0);
    expect(mine(errors)).toEqual([]);
  });

  test('the mode switch round-trips and is deep-linkable', async ({ page, context }) => {
    await stubStandalone(context);
    await openDesk(page);
    await expect(page.locator('button[data-mode="inpage"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('iframe[data-frame]')).toHaveCount(0);

    await page.locator('button[data-mode="real"]').click();
    await expect(page.locator('iframe[data-frame]')).toBeVisible();
    await expect(page.locator('wa-stage')).toHaveCount(0);
    await expect.poll(() => page.url()).toContain('mode=real');
    await page.reload();
    await expect(page.locator('button[data-mode="real"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('iframe[data-frame]')).toHaveAttribute('src', STANDALONE);

    await page.locator('button[data-mode="inpage"]').click();
    await expect(page.locator('wb--note-card').first()).toBeVisible();
    await expect(page.locator('iframe[data-frame]')).toHaveCount(0);
    await expect.poll(() => page.url()).not.toContain('mode=');
    // the default is the in-page mode
    await fresh(page);
    await expect(page.locator('button[data-mode="inpage"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('when the standalone cannot be reached it says so, keeps a link, and falls back to a recorded copy of the claims', async ({ page, context }) => {
    await stubStandalone(context, true);
    await page.goto('./#/workbench?mode=real');
    const fail = page.locator('[data-frame-fail]');
    await expect(fail).toBeVisible();
    await expect(fail).toContainText('did not load');
    await expect(fail.locator('a')).toHaveAttribute('href', STANDALONE);
    await expect(page.locator('.wb-real')).toHaveAttribute('data-frame', 'failed');
    await expect(page.locator('.wb-claims-src')).toContainText('recorded copy');
    await expect(page.locator('[data-claim]')).toHaveCount(5);
    await expect(page.locator('[data-claim="csp"] [data-csp]')).toContainText("require-trusted-types-for 'script'");

    // back online: the retry button reloads the frame and re-reads the page
    await context.unroute(`${STANDALONE}**`);
    await stubStandalone(context);
    await fail.locator('[data-retry]').click();
    await expect(page.locator('.wb-real')).toHaveAttribute('data-frame', 'loaded');
    await expect(page.locator('.wb-claims-src')).toContainText('just now');
    await expect(fail).toBeHidden();
  });
});

/** Optional, non-gating: the real standalone, over the real network. Run with WORKBENCH_LIVE=1 (CI runs it in a separate, allowed-to-fail job). */
test.describe('live standalone @live', () => {
  test.skip(!process.env.WORKBENCH_LIVE, 'set WORKBENCH_LIVE=1 to run against the real https://johnhenry.github.io/workbench/');

  test('real mode loads the real app and reads its real policy', async ({ page }) => {
    await page.goto('./#/workbench?mode=real');
    await expect(page.locator('.wb-claims-src')).toContainText('just now', { timeout: 30_000 });
    await expect(page.locator('[data-claim="csp"] [data-csp]')).toContainText("require-trusted-types-for 'script'");
    await expect(page.locator('[data-claim="integrity"] [data-integrity]')).toContainText('sha384-');
    await expect(page.locator('.wb-real')).toHaveAttribute('data-frame', 'loaded', { timeout: 30_000 });
    // (the harness may look inside the cross-origin frame; the page under test never does)
    const inner = page.frameLocator('iframe[data-frame]');
    await expect(inner.locator('wa-stage')).toBeVisible({ timeout: 30_000 });
    await expect(inner.locator('#sanitizer')).toContainText('Sanitizer:', { timeout: 30_000 });
  });
});
