import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Untrusted Desk planet (#/workbench), end to end, on a production build.
 * Playwright CSS locators pierce open shadow roots, which is how the html-modules components (each with a shadow root) are reached.
 * Nothing here depends on an external site.
 */

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
 * <img src="x"> (the sanitizer keeps the <img>, strips its onerror, and the browser still asks for "x"), and the one console error the
 * strict-CSP frame makes ON PURPOSE: its raw-innerHTML control is refused by Trusted Types ("requires a TrustedHTML"), and WebKit's
 * benign "ResizeObserver loop completed with undelivered notifications" (a layout notice, not an exception) when a window is popped out.
 */
const mine = (errors: string[]) => errors.filter((e) => !/favicon|manifest|apple-touch|Failed to load resource: the server responded with a status of 404|TrustedHTML|require-trusted-types-for|ResizeObserver loop/i.test(e));

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
const hazards = (card: Locator) =>
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

test.describe('the desk', () => {
  test('the desk renders its windows, and the components render inside shadow roots', async ({ page }) => {
    const errors = watch(page);
    await openDesk(page);

    // two windows, each a window-algebra view with its chrome (the pop-out button is part of it)
    await expect(page.locator('wa-stage wm-view[data-view]')).toHaveCount(2);
    await expect(page.locator('wa-stage wm-view[data-view="notes"] [data-wa-chrome]')).toBeVisible();
    await expect(page.locator('.wb-stage-chip', { hasText: '2 windows' })).toBeVisible();
    await expect(page.locator('wa-stage wm-view[data-view="notes"] [data-wm-command="window/pop-out"]')).toHaveCount(1);

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
    // no link to the retired standalone app, and nothing of the removed mport / real-app machinery
    await expect(page.locator('a[data-standalone], .wb-callout')).toHaveCount(0);
    await expect(page.locator('a[href*="johnhenry.github.io/workbench"]')).toHaveCount(0);
    await expect(page.locator('.wb-controls [data-mode], [data-tamper], iframe[data-frame], .wb-map-pre, [data-src]')).toHaveCount(0);
    expect(mine(errors)).toEqual([]);
  });

  test('the html-modules components are plain static files served over HTTP', async ({ page }) => {
    const gets: string[] = [];
    // a static host may redirect /x.html to /x (the production `serve` does); either way each file is one real HTTP 200
    page.on('response', (r) => { if (/\/workbench\/components\//.test(r.url())) gets.push(`${new URL(r.url()).pathname.replace(/\.html$/, '')} ${r.status()}`); });
    await openDesk(page);
    for (const f of ['kit.html', 'notes.html', 'clips.html', 'untrusted/clip.html', 'report.html']) {
      expect(gets, `GET ${f}`).toContain(`/orrery/workbench/components/${f.replace(/\.html$/, '')} 200`); // under the /orrery/ base
    }
    await expect(page.locator('.wb-stage-chip', { hasText: 'html-modules' })).toContainText('components');
  });

  test('the untrusted Clips template is sanitized (html-modules sanitize hook) before its component is defined', async ({ page }) => {
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
    await openDesk(page, `${DESK}?l=grid&w=notes,report&pf=ui-v1`);
    await expect(pressed(page, 'data-layout', 'grid')).toHaveAttribute('aria-pressed', 'true');
    for (const id of ['notes', 'report']) await expect(pressed(page, 'data-open', id)).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(page, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'false');
    await expect(pressed(page, 'data-profile', 'ui-v1')).toHaveAttribute('aria-pressed', 'true');
    // change something, wait for the link to catch up, then reload the very URL
    await pressed(page, 'data-layout', 'spiral').click();
    await expect.poll(() => page.url()).toContain('l=spiral');
    const url = page.url();
    expect(url).toContain('w=notes%2Creport');
    expect(url).toContain('pf=ui-v1');
    await page.reload();
    await expect(pressed(page, 'data-layout', 'spiral')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(page, 'data-open', 'report')).toHaveAttribute('aria-pressed', 'true');
    // a fresh context has no storage: the link alone carries the state
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(url);
    await expect(other.locator('wb--note-card').first()).toBeVisible();
    await expect(pressed(other, 'data-layout', 'spiral')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(other, 'data-open', 'report')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(other, 'data-profile', 'ui-v1')).toHaveAttribute('aria-pressed', 'true');
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
    // a window: B closes Clips, A follows
    await pressed(b, 'data-open', 'clips').click();
    await expect(pressed(a, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'false', { timeout: 20_000 });
    // undo is synced too: B undoes the close, A gets the window back
    await b.locator('[data-act="undo"]').click();
    await expect(pressed(a, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });

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
    await expect(pressed(b, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
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

test.describe('window-algebra: history, keyboard and pop-out', () => {
  const layoutPressed = (page: Page, id: string) => pressed(page, 'data-layout', id);

  test('Undo and Redo walk the desk history: a layout change, a closed window', async ({ page }) => {
    const errors = watch(page);
    await openDesk(page);
    const undo = page.locator('[data-act="undo"]');
    const redo = page.locator('[data-act="redo"]');
    const steps = page.locator('[data-history]');
    // a fresh desk has no history: the initial windows are the baseline, not steps
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    await expect(steps).toHaveAttribute('data-steps', '0');

    await layoutPressed(page, 'grid').click();
    await expect(layoutPressed(page, 'grid')).toHaveAttribute('aria-pressed', 'true');
    await expect(steps).toHaveAttribute('data-steps', '1');
    await expect(undo).toBeEnabled();
    await pressed(page, 'data-open', 'clips').click(); // close Clips
    await expect(pressed(page, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('wa-stage wm-view[data-view]')).toHaveCount(1);
    await expect(steps).toHaveAttribute('data-steps', '2');

    // undo the close: the window is back, and it still renders (its component was not rebuilt from nothing)
    await undo.click();
    await expect(pressed(page, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('wa-stage wm-view[data-view]')).toHaveCount(2);
    await expect(page.locator('clip--card')).toBeVisible();
    await expect(redo).toBeEnabled();
    // undo the layout
    await undo.click();
    await expect(layoutPressed(page, 'master-stack')).toHaveAttribute('aria-pressed', 'true');
    await expect(undo).toBeDisabled();
    // redo both
    await redo.click();
    await expect(layoutPressed(page, 'grid')).toHaveAttribute('aria-pressed', 'true');
    await redo.click();
    await expect(pressed(page, 'data-open', 'clips')).toHaveAttribute('aria-pressed', 'false');
    await expect(redo).toBeDisabled();
    // a new command after an undo drops the redo branch
    await undo.click();
    await pressed(page, 'data-layout', 'rows').click();
    await expect(redo).toBeDisabled();
    expect(mine(errors)).toEqual([]);
  });

  test('a floating window moves and resizes from the keyboard (Alt+Shift+Arrows, Ctrl+Alt+Shift+Arrows)', async ({ page }) => {
    const errors = watch(page);
    await openDesk(page);
    await pressed(page, 'data-open', 'report').click(); // the report opens floating
    const view = page.locator('wa-stage wm-view[data-view="report"]');
    await expect(view).toBeVisible();
    await expect(page.locator('wb--report-tool')).toBeVisible();
    await view.locator('[data-wm-handle="move"]').click(); // focus it by its title bar
    const read = async () => {
      const [x, y, w, h] = ((await page.locator('[data-floatbox]').getAttribute('data-float')) ?? '').split(',').map(Number);
      return { x, y, w, h };
    };
    await expect.poll(async () => (await read()).w).toBeGreaterThan(0);
    const before = await read();

    await page.keyboard.press('Alt+Shift+ArrowRight');
    await expect.poll(async () => (await read()).x).toBe(before.x + 10);
    await page.keyboard.press('Alt+Shift+ArrowDown');
    await expect.poll(async () => (await read()).y).toBe(before.y + 10);
    await page.keyboard.press('Control+Alt+Shift+ArrowLeft'); // resize: left shrinks the width
    await expect.poll(async () => (await read()).w).toBe(before.w - 10);
    await page.keyboard.press('Control+Alt+Shift+ArrowDown');
    await expect.poll(async () => (await read()).h).toBe(before.h + 10);
    expect(await read()).toMatchObject({ x: before.x + 10, y: before.y + 10 });

    // every keyboard step is a history step, so Undo takes the window back
    await page.locator('[data-act="undo"]').click();
    await expect.poll(async () => (await read()).h).toBe(before.h);
    expect(mine(errors)).toEqual([]);
  });

  test('"Float focused" turns a tiled window into one the keyboard can move', async ({ page }) => {
    await openDesk(page);
    await expect(page.locator('[data-floatbox]')).toContainText('Notes');
    await expect(page.locator('[data-floatbox]')).toContainText('tiled');
    await page.locator('wa-stage wm-view[data-view="notes"] [data-wm-handle="move"]').click();
    await page.locator('[data-act="float"]').click();
    await expect(page.locator('[data-floatbox]')).toHaveAttribute('data-float', /^\d+,\d+,\d+,\d+$/);
    const x = Number(((await page.locator('[data-floatbox]').getAttribute('data-float')) ?? '').split(',')[0]);
    // the button handed keyboard focus back to the window, so the keys work without clicking it
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('wm-view[data-view="notes"]'))).toBe(true);
    await page.keyboard.press('Alt+Shift+ArrowLeft');
    await expect.poll(async () => Number(((await page.locator('[data-floatbox]').getAttribute('data-float')) ?? '').split(',')[0])).toBe(x - 10);
  });

  test('pop-out moves a window into a real browser window and Pop back in returns it', async ({ page, context }) => {
    const errors = watch(page);
    await openDesk(page);
    await pressed(page, 'data-open', 'report').click();
    await expect(page.locator('wb--report-tool')).toBeVisible();
    await page.locator('wa-stage wm-view[data-view="report"] [data-wm-handle="move"]').click();

    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-act="popout"]').click();
    const popup = await popupPromise;
    await expect(popup.locator('wb--report-tool')).toBeVisible();
    await expect(page.locator('[data-act="popout"]')).toHaveText('Pop back in');
    await expect(page.locator('.wb-status')).toContainText('own browser window');
    await expect(page.locator('wa-stage wb--report-tool')).toHaveCount(0); // it left this document...
    await expect(popup.locator('wb--report-tool')).toHaveCount(1);          // ...with its live DOM, shadow root and all
    expect(await popup.locator('wb--report-tool').evaluate((el) => !!el.shadowRoot)).toBe(true);

    await page.locator('[data-act="popout"]').click(); // Pop back in
    await expect(page.locator('wa-stage wb--report-tool')).toBeVisible();
    await expect(page.locator('[data-act="popout"]')).toHaveText('Pop out');
    await expect.poll(() => popup.isClosed()).toBe(true);
    expect(mine(errors)).toEqual([]);
  });
});

test.describe('safe-fragment: the profile switcher', () => {
  const card = (page: Page, title: string) => page.locator('wb--note-card', { has: page.locator('h3', { hasText: title }) });
  const profileOf = (page: Page, title: string) => card(page, title).getAttribute('profile');

  test('every note re-renders under the chosen profile, and auto restores the per-note choice', async ({ page }) => {
    const errors = watch(page);
    await openDesk(page);
    const welcome = card(page, 'Welcome to the desk');
    const plain = card(page, 'Plain text stays plain');
    // auto: markup -> article-v1, none -> plain-text-v1
    expect(await profileOf(page, 'Welcome to the desk')).toBe('article-v1');
    expect(await profileOf(page, 'Plain text stays plain')).toBe('plain-text-v1');
    expect((await hazards(welcome)).strong).toBeGreaterThan(0);
    await expect(pressed(page, 'data-profile', 'auto')).toHaveAttribute('aria-pressed', 'true');

    // plain-text-v1 on everything: the markup is shown as text, nothing is bold
    await pressed(page, 'data-profile', 'plain-text-v1').click();
    await expect(pressed(page, 'data-profile', 'plain-text-v1')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => profileOf(page, 'Welcome to the desk')).toBe('plain-text-v1');
    await expect.poll(async () => (await hazards(welcome)).strong).toBe(0);
    expect((await hazards(welcome)).text).toContain('<strong>window-algebra</strong>');
    await expect(page.locator('.wb-stage-chip', { hasText: 'safe-fragment' })).toContainText('plain-text-v1');
    await expect.poll(() => page.url()).toContain('pf=plain-text-v1');

    // the profiles differ on the same input: article-v1 keeps the link, ui-v1 and email-v1 each render the newsletter note
    const news = card(page, 'Pasted from a newsletter');
    for (const profile of ['article-v1', 'ui-v1', 'email-v1'] as const) {
      await pressed(page, 'data-profile', profile).click();
      await expect.poll(() => profileOf(page, 'Pasted from a newsletter')).toBe(profile);
      await expect.poll(async () => (await hazards(news)).strong).toBeGreaterThan(0);
      await expect(news.locator('safe-fragment')).toHaveAttribute('profile', profile);
      const h = await hazards(news);
      expect(h).toMatchObject({ scripts: 0, onAttrs: 0, jsUrls: 0 });
      expect(h.httpsLinks, `${profile} keeps the https link`).toBeGreaterThan(0);
    }
    await page.waitForTimeout(800);
    expect(await canary(page)).toBe(0);

    // back to auto
    await pressed(page, 'data-profile', 'auto').click();
    await expect.poll(() => profileOf(page, 'Plain text stays plain')).toBe('plain-text-v1');
    await expect.poll(() => profileOf(page, 'Welcome to the desk')).toBe('article-v1');
    await expect.poll(async () => (await hazards(welcome)).strong).toBeGreaterThan(0);
    await expect.poll(() => page.url()).not.toContain('pf=');
    expect(mine(errors)).toEqual([]);
  });

  test('the report window follows the profile, and the XSS preset runs nothing under any of them', async ({ page }) => {
    await openDesk(page);
    await page.locator('[data-preset="xss"]').click();
    await expect(page.locator('.wb-status')).toContainText('payload neutralised', { timeout: 20_000 });
    const xss = card(page, 'helpful');
    for (const profile of ['ui-v1', 'email-v1', 'plain-text-v1', 'article-v1'] as const) {
      await pressed(page, 'data-profile', profile).click();
      await expect.poll(() => xss.getAttribute('profile')).toBe(profile);
      await expect(page.locator('wb--report-tool')).toHaveAttribute('profile', profile);
      await page.waitForTimeout(500);
      expect(await canary(page), `canary under ${profile}`).toBe(0);
      if (profile !== 'plain-text-v1') expect(await hazards(xss)).toMatchObject({ scripts: 0, onAttrs: 0, jsUrls: 0 });
    }
    await expect(page.locator('wb--report-tool kit--stat[label="handlers that ran"]')).toHaveAttribute('value', '0');
  });
});

test.describe('safe-fragment: strict CSP and Trusted Types, in a separate document', () => {
  const frameOf = (page: Page) => page.frameLocator('iframe[data-tt-frame]');
  const stat = (page: Page, id: string) => frameOf(page).locator(`#${id} b`);

  test('safe-fragment renders under require-trusted-types-for with zero violations; a raw innerHTML is refused', async ({ page }, info) => {
    const errors = watch(page);
    await openDesk(page);
    const status = page.locator('[data-tt-status]');
    await expect(frameOf(page).locator('body[data-tt-state="done"]')).toBeAttached({ timeout: 30_000 });

    // the policy is the frame's own <meta>, and it is the strict one
    const csp = await frameOf(page).locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("require-trusted-types-for 'script'");
    expect(csp).toContain('trusted-types dompurify');
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    await expect(frameOf(page).locator('#csp')).toContainText("require-trusted-types-for 'script'");

    // the engine: native Sanitizer API where it exists, DOMPurify (the one allowed policy name) in WebKit
    const engine = await frameOf(page).locator('#stat-engine b').innerText();
    if (info.project.name === 'webkit') expect(engine).toBe('dompurify');
    else expect(['native', 'dompurify']).toContain(engine);

    // notes were rendered, hostile parts are gone, nothing ran
    const notes = frameOf(page).locator('#notes safe-fragment');
    await expect(notes).toHaveCount(3);
    await expect(frameOf(page).locator('#notes strong').first()).toBeVisible();
    expect(await frameOf(page).locator('#notes script, #notes iframe, #notes form, #notes [onerror], #notes [onclick]').count()).toBe(0);
    await expect(stat(page, 'stat-canary')).toHaveText('0');

    // the two counters: safe-fragment 0, the control at least 1 (a refused innerHTML is itself a violation)
    await expect(stat(page, 'stat-sf')).toHaveText('0');
    const controlViolations = Number(await stat(page, 'stat-control').innerText());
    expect(controlViolations).toBeGreaterThanOrEqual(1);
    await expect(frameOf(page).locator('#verdict')).toContainText('Control: blocked, TypeError');
    await expect(frameOf(page).locator('#samples')).toContainText('[control] require-trusted-types-for');
    await expect(frameOf(page).locator('#samples')).not.toContainText('[safe-fragment]');

    // the planet outside the frame shows the same numbers
    await expect(status).toHaveAttribute('data-sf', '0');
    await expect(status).toHaveAttribute('data-blocked', 'true');
    await expect(status).toHaveAttribute('data-ran', '0');
    await expect(status).toContainText('0 violations');
    await expect(status).toContainText('blocked');
    expect(mine(errors).filter((e) => !/TrustedHTML|Trusted ?Types|require-trusted-types-for|violates the following Content Security Policy/i.test(e))).toEqual([]);
  });

  test('re-rendering under every profile adds no safe-fragment violations; the control adds exactly its own', async ({ page }) => {
    await openDesk(page);
    const frame = frameOf(page);
    await expect(frame.locator('body[data-tt-state="done"]')).toBeAttached({ timeout: 30_000 });
    const control0 = Number(await stat(page, 'stat-control').innerText());
    // an independent counter, in the frame's own document, not the page's one
    const frameHandle = await page.locator('iframe[data-tt-frame]').elementHandle();
    const f = (await frameHandle!.contentFrame())!;
    await f.evaluate(() => { (window as any).__violations = []; document.addEventListener('securitypolicyviolation', (e) => (window as any).__violations.push(e.violatedDirective)); });

    for (const profile of ['ui-v1', 'email-v1', 'plain-text-v1', 'article-v1']) {
      await frame.locator(`button[data-profile="${profile}"]`).click();
      await expect(frame.locator('body[data-tt-state="idle"]')).toBeAttached({ timeout: 15_000 });
      await expect(frame.locator(`button[data-profile="${profile}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(frame.locator('#notes safe-fragment').first()).toHaveAttribute('profile', profile);
    }
    expect(await f.evaluate(() => (window as any).__violations)).toEqual([]);
    await expect(stat(page, 'stat-sf')).toHaveText('0');
    await expect(stat(page, 'stat-control')).toHaveText(String(control0));
    await expect(page.locator('[data-tt-status]')).toHaveAttribute('data-sf', '0');

    // the control again: it is refused, and now the control counter (only) goes up
    await frame.locator('#raw-try').click();
    await expect.poll(async () => Number(await stat(page, 'stat-control').innerText()), { timeout: 10_000 }).toBeGreaterThan(control0);
    expect(await f.evaluate(() => (window as any).__violations)).toContain('require-trusted-types-for');
    await expect(stat(page, 'stat-sf')).toHaveText('0');
    await expect(page.locator('[data-tt-status]')).toHaveAttribute('data-sf', '0');
  });

  test('the frame is served by the orrery itself, with the policy in the document and nothing inline', async ({ page }) => {
    await openDesk(page);
    const src = await page.locator('iframe[data-tt-frame]').getAttribute('src');
    expect(src).toBe('/orrery/workbench/tt.html');
    const html = await page.evaluate((u) => fetch(u).then((r) => r.text()), src!);
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("require-trusted-types-for 'script'");
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i); // no inline script
    expect(html).not.toMatch(/<style[\s>]/i);                  // no inline style
    expect(html).toMatch(/<script type="module"[^>]*src="\/orrery\/assets\//);
  });
});
