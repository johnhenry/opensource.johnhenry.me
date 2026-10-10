import { test, expect, type Page } from '@playwright/test';

/**
 * Data Plot Studio planet (#/data-plot): a real <data-plot> reading the editable <table id="dp-data"> beside it. Editing a cell
 * redraws through the package's own MutationObserver; layers and channels are the package's elements and attributes; the
 * width slider reflows the plot with CSS alone (no render event).
 */

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
const mine = (errors: string[]) => errors.filter((e) => !/favicon|fonts\.g|ERR_FAILED|net::|Failed to load resource|orrery\.json|Not allowed to request resource|downloadable font/i.test(e));

async function open(page: Page, hash = '#/data-plot') {
  await page.goto('about:blank');
  await page.goto(`./${hash}`);
  await expect(page.locator('.pg-data-plot')).toBeVisible();
}
const renders = async (page: Page) => Number(await page.locator('[data-renders]').textContent());

test('the default scatter plots every table row on linear scales, with a legend', async ({ page }) => {
  const errors = watch(page);
  await open(page);
  await expect(page.locator('[data-preset="cities"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#dp-data tbody tr')).toHaveCount(11);
  await expect(page.locator('data-plot plot-marks > .plot-dot')).toHaveCount(11);
  await expect(page.locator('data-plot plot-legend .plot-legend-item')).toHaveCount(4);
  await expect(page.locator('[data-scales]')).toContainText('x linear');
  await expect(page.locator('[data-scales]')).toContainText('color categorical');
  await expect(page.locator('data-plot plot-axis[scale="x"] .plot-tick').first()).toBeVisible();
  expect(mine(errors), mine(errors).join('\n')).toEqual([]);
});

test('editing a table cell redraws the plot', async ({ page }) => {
  await open(page);
  const firstDot = page.locator('data-plot plot-marks > .plot-dot').first();
  await expect(firstDot).toBeVisible();
  const before = await firstDot.evaluate((el) => getComputedStyle(el).getPropertyValue('--x').trim() || (el as HTMLElement).style.getPropertyValue('--x'));
  const count = await renders(page);
  const cell = page.locator('#dp-data tbody tr').first().locator('td').nth(2); // Lisbon's rain
  await cell.fill('2400');
  await expect.poll(() => renders(page)).toBeGreaterThan(count);
  await expect.poll(() => firstDot.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--x'))).not.toBe(before);
});

test('presets switch the chart elements: bars, lines, faces', async ({ page }) => {
  await open(page);
  await page.locator('[data-preset="commits"]').click();
  await expect(page).toHaveURL(/p=commits/);
  await expect(page.locator('data-plot plot-marks.dp-bars > .dp-bar')).toHaveCount(7);
  await expect(page.locator('[data-scales]')).toContainText('x band');

  await page.locator('[data-preset="temps"]').click();
  await expect(page.locator('data-plot plot-line path')).toHaveCount(3);

  await page.locator('[data-preset="teams"]').click();
  await expect(page.locator('data-plot plot-marks.dp-faces > chernoff-face')).toHaveCount(6);
  await expect(page.locator('data-plot plot-marks.dp-faces > chernoff-face').first()).toHaveAttribute('aria-label', 'Atlas');

  await page.reload();
  await expect(page.locator('[data-preset="teams"]')).toHaveAttribute('aria-pressed', 'true');
});

test('layers and channels are attributes on the real elements', async ({ page }) => {
  await open(page);
  await page.locator('[data-layer="line"]').check();
  await expect(page.locator('data-plot > plot-line')).toHaveCount(1);
  await expect(page.locator('[data-markup]')).toContainText('<plot-line x="rain" y="sun" color="continent">');
  await page.locator('[data-layer="dots"]').uncheck();
  await expect(page.locator('data-plot plot-marks > .plot-dot')).toHaveCount(0);
  await page.locator('[data-layer="dots"]').check();
  await page.locator('[data-ch="color"]').selectOption('');
  await expect(page.locator('data-plot > plot-marks').first()).not.toHaveAttribute('color', /./);
  await page.locator('[data-ch="x"]').selectOption('people');
  await expect(page.locator('data-plot > plot-marks').first()).toHaveAttribute('x', 'people');
});

test('resizing the container reflows with no redraw', async ({ page }) => {
  await open(page);
  await expect(page.locator('data-plot plot-marks > .plot-dot')).toHaveCount(11);
  await expect.poll(() => renders(page)).toBeGreaterThan(0);
  const count = await renders(page);
  const plot = page.locator('data-plot');
  const wide = (await plot.boundingBox())!.width;
  await page.locator('[data-w]').fill('50');
  await expect.poll(async () => (await plot.boundingBox())!.width).toBeLessThan(wide * 0.7);
  expect(await renders(page)).toBe(count);
  await expect(page).toHaveURL(/w=50/);
});
