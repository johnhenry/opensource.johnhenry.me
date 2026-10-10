import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Patchbay Notebook planet (#/notebook), end to end, on a production build. Five libraries together: cells are window-algebra
 * floating windows on a patchbay canvas, wires are dataflow dependencies, code runs in one andbox Worker, and only inspectable
 * previews come back to the page. Nothing here leaves the preview server.
 */

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
const mine = (errors: string[]) => errors.filter((e) => !/favicon|manifest|apple-touch|downloadable font/i.test(e));

const cell = (page: Page, id: string) => page.locator(`.nb-cell[data-cell="${id}"]`);
const view = (page: Page, id: string) => page.locator(`wm-view[data-view="${id}"]`);
const titleBar = (page: Page, id: string) => view(page, id).locator('[data-wm-handle="move"]').first();
const steps = (page: Page) => page.locator('[data-el="history"]');

/** Open the notebook (slow motion off, unless asked) and wait until the first full run has settled. */
async function open(page: Page, hash = '#/notebook?slow=false') {
  await page.goto(`./${hash}`);
  await expect(page.locator('.nb-cell')).toHaveCount(6);
  await expect(cell(page, 'message')).toHaveAttribute('data-status', 'done', { timeout: 20_000 });
  await expect(cell(page, 'report')).toHaveAttribute('data-status', 'done');
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no bounding box');
  return b;
}

test.describe('Patchbay Notebook', () => {
  test('the first run: every cell settles, one branch skips, the coalesce runs anyway, values stay in the Worker', async ({ page }) => {
    const errors = watch(page);
    await open(page);
    await expect(cell(page, 'n')).toHaveAttribute('data-status', 'done');
    await expect(cell(page, 'squares')).toHaveAttribute('data-status', 'done');
    // n = 30: big skips (skip(reason)), small runs, message consumes the skip
    await expect(cell(page, 'big')).toHaveAttribute('data-status', 'skipped');
    await expect(cell(page, 'big')).toContainText('n is under 50');
    await expect(cell(page, 'small')).toHaveAttribute('data-status', 'done');
    await expect(cell(page, 'message')).toContainText('consumesSkip');
    // one wire per dependency (patchbay createWires), coloured by the source's status
    await expect(page.locator('.nb-wires path.patchbay-wire.nb-wire')).toHaveCount(7);
    await expect(page.locator('.nb-wires path[data-wire="big->message"]')).toHaveClass(/is-skipped/);
    // the values live in the Worker; only previews crossed
    await expect(page.locator('[data-el="worker"]')).toContainText('Worker holds 5 values');
    await expect(cell(page, 'small').locator('value-inspector')).toContainText('small: 30');
    expect(mine(errors), mine(errors).join('\n')).toEqual([]);
  });

  test('what reruns: the slider flips the branches, the manual cell turns stale until run, an error makes dependents wait', async ({ page }) => {
    const errors = watch(page);
    await open(page);
    await page.locator('[data-act="n80"]').click();
    await expect(cell(page, 'big')).toHaveAttribute('data-status', 'done');
    await expect(cell(page, 'small')).toHaveAttribute('data-status', 'skipped');
    await expect(cell(page, 'message').locator('value-inspector')).toContainText('big: 80');
    // report is manual (autorun: false): it keeps its value and is flagged stale
    await expect(cell(page, 'report')).toHaveAttribute('data-stale', 'true');
    await expect(cell(page, 'report').locator('[data-el="status"]')).toContainText('stale');
    await page.locator('[data-act="run-report"]').click();
    await expect(cell(page, 'report')).toHaveAttribute('data-stale', 'false');
    await expect(cell(page, 'report')).toHaveAttribute('data-version', '2');

    // break squares: it errors, report waits (no cascade of errors), and fixing it recovers
    await page.locator('[data-act="break"]').click();
    await expect(cell(page, 'squares')).toHaveAttribute('data-status', 'error');
    await expect(cell(page, 'squares')).toContainText('squares broke');
    await expect(cell(page, 'report')).toHaveAttribute('data-status', 'waiting');
    await page.locator('[data-act="break"]').click();
    await expect(cell(page, 'squares')).toHaveAttribute('data-status', 'done');
    expect(mine(errors), mine(errors).join('\n')).toEqual([]);
  });

  test('slow motion shows each cell running in the Worker, in dependency order', async ({ page }) => {
    await open(page, '#/notebook');
    // record every status each cell passes through (a poll could miss a 350 ms window)
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as any).__nbSeen = seen;
      new MutationObserver((records) => {
        for (const r of records) { const el = r.target as HTMLElement; seen.push(`${el.dataset.cell}:${el.dataset.status}`); }
      }).observe(document.querySelector('.pg-notebook')!, { subtree: true, attributes: true, attributeFilter: ['data-status'] });
    });
    await page.locator('[data-act="n80"]').click();
    await expect(cell(page, 'message')).toHaveAttribute('data-status', 'done');
    await expect(cell(page, 'message').locator('value-inspector')).toContainText('big: 80');
    const seen: string[] = await page.evaluate(() => (window as any).__nbSeen);
    for (const id of ['n', 'squares', 'big', 'small', 'message']) expect(seen).toContain(`${id}:running`);
    // glitch-free: squares starts only after n settled, message only after both branches settled
    expect(seen.indexOf('squares:running')).toBeGreaterThan(seen.indexOf('n:done'));
    expect(seen.indexOf('message:running')).toBeGreaterThan(Math.max(seen.lastIndexOf('big:done'), seen.lastIndexOf('small:skipped')));
  });

  test('editing a cell reruns it and what depends on it', async ({ page }) => {
    await open(page);
    const code = cell(page, 'small').locator('textarea');
    await code.fill('if (n >= 50) return SKIP;\nreturn `tiny ${n}`;');
    await code.press('ControlOrMeta+Enter');
    await expect(cell(page, 'small').locator('value-inspector')).toContainText('tiny 30');
    await expect(cell(page, 'message').locator('value-inspector')).toContainText('tiny 30');
  });

  test('inspectable: a nested value expands lazily, by handle, from the Worker', async ({ page }) => {
    await open(page);
    const inspector = cell(page, 'report').locator('value-inspector');
    await expect(inspector).toContainText('nested');
    await expect(inspector).not.toContainText('deepest');
    const before = Number(await page.locator('[data-el="worker"]').getAttribute('data-handles'));
    expect(before).toBeGreaterThan(0);
    await inspector.locator('summary', { hasText: 'nested' }).first().click();
    await expect(inspector).toContainText('deeper');
    await inspector.locator('summary', { hasText: 'deeper' }).first().click();
    await expect(inspector).toContainText('deepest');
  });

  test('patchbay wires: drag from an output port onto a cell adds a dependency; the chip removes it', async ({ page }) => {
    const errors = watch(page);
    await open(page);
    await expect(cell(page, 'message').locator('.nb-chip')).toHaveCount(2);
    await page.locator('.nb-stage').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const port = await box(cell(page, 'n').locator('.nb-port.out'));
    const target = await box(cell(page, 'message').locator('.nb-cell-head'));
    await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(cell(page, 'message').locator('.nb-chip')).toHaveCount(3);
    await expect(page.locator('.nb-wires path[data-wire="n->message"]')).toHaveCount(1);
    await cell(page, 'message').locator('[data-cut="n->message"]').click();
    await expect(cell(page, 'message').locator('.nb-chip')).toHaveCount(2);
    await expect(page.locator('.nb-wires path[data-wire="n->message"]')).toHaveCount(0);
    expect(mine(errors), mine(errors).join('\n')).toEqual([]);
  });

  test('window-algebra on a zoomed canvas: a drag tracks the cursor 1:1, it is one undo step, focus is not', async ({ page }) => {
    const errors = watch(page);
    await open(page);
    await page.locator('[data-act="zoom-out"]').click();
    await page.locator('.nb-stage').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const zoom = Number(await page.locator('[data-el="zoom"]').getAttribute('data-zoom'));
    expect(zoom).toBeLessThan(0.95);
    await expect(steps(page)).toHaveAttribute('data-steps', '0');

    // clicking a cell's title bar focuses and raises it: history.ignore keeps that out of undo
    await titleBar(page, 'small').click();
    await titleBar(page, 'big').click();
    await expect(steps(page)).toHaveAttribute('data-steps', '0');

    // a drag of 120 screen pixels moves the window 120 screen pixels, at any zoom (patchbay's coordinates hook)
    const before = await box(view(page, 'squares'));
    const bar = await box(titleBar(page, 'squares'));
    await page.mouse.move(bar.x + 60, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + 120, bar.y + bar.height / 2 + 20, { steps: 6 });
    await page.mouse.move(bar.x + 180, bar.y + bar.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await box(view(page, 'squares'))).x - before.x)).toBeGreaterThan(115);
    const after = await box(view(page, 'squares'));
    expect(Math.abs(after.x - before.x - 120)).toBeLessThan(4);
    expect(Math.abs(after.y - before.y - 40)).toBeLessThan(4);
    await expect(steps(page)).toHaveAttribute('data-steps', '1'); // the whole drag is one step

    // the wire followed the window
    await expect(page.locator('.nb-wires path[data-wire="n->squares"]')).toHaveAttribute('d', /C/);

    // undo puts it back; redo moves it again
    await page.locator('[data-act="undo"]').click();
    await expect.poll(async () => Math.round((await box(view(page, 'squares'))).x - before.x)).toBeLessThan(3);
    await expect(steps(page)).toHaveAttribute('data-steps', '0');
    await page.locator('[data-act="redo"]').click();
    await expect.poll(async () => Math.round((await box(view(page, 'squares'))).x - before.x)).toBeGreaterThan(115);
    expect(mine(errors), mine(errors).join('\n')).toEqual([]);
  });
});
