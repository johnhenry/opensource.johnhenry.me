import { test, expect, type Page } from '@playwright/test';

/**
 * Form Lab planet (#/obfo): @johnhenry/obfo reading a live form (observe + cast "auto"), fill() from JSON with a round-trip
 * check, formFromObject() generating a form, and the cast table computed by obfo itself. Everything runs in the page.
 */

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
/** Not counted: the favicon, fonts, and the probe for the optional Node companion. */
const mine = (errors: string[]) => errors.filter((e) => !/favicon|fonts\.g|ERR_FAILED|net::|Failed to load resource|orrery\.json|Not allowed to request resource|downloadable font/i.test(e));

async function open(page: Page, hash = '#/obfo') {
  await page.goto('about:blank');
  await page.goto(`./${hash}`);
  await expect(page.locator('.pg-obfo')).toBeVisible();
}
const live = async (page: Page) => JSON.parse((await page.locator('[data-live]').textContent()) ?? 'null');

test('the form reads as a typed, nested object and updates as you type', async ({ page }) => {
  const errors = watch(page);
  await open(page);
  await expect(page.locator('[data-call]')).toContainText('cast: "auto"');
  await expect.poll(async () => (await live(page))?.address?.geo?.lat).toBe(51.507);
  const v = await live(page);
  expect(v.age).toBe(36);
  expect(v.subscribe).toBe(true);
  expect(v.plan).toBe('pro');
  expect(v.languages).toEqual(['js', 'html']);
  expect(v.tags).toEqual(['mathematics', 'engines', 'poetry']);
  expect(v.projects[1]).toEqual({ title: 'Flyology', year: 1828, published: false });

  const city = page.locator('[data-form] input[name="city"]');
  await city.fill('Paris');
  await expect.poll(async () => (await live(page)).address.city).toBe('Paris');
  await expect(page.locator('[data-change]')).toContainText('address.city');

  await page.locator('[data-form] input[name="subscribe"]').uncheck();
  await expect.poll(async () => (await live(page)).subscribe).toBe(false);
  expect(mine(errors), mine(errors).join('\n')).toEqual([]);
});

test('no cast reads strings, and the mode is deep-linked', async ({ page }) => {
  await open(page);
  await page.locator('[data-cast="none"]').click();
  await expect(page.locator('[data-cast="none"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await live(page)).age).toBe('36');
  expect((await live(page)).subscribe).toBe('on');
  await expect(page).toHaveURL(/cast=none/);
  await page.reload();
  await expect(page.locator('[data-cast="none"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await live(page))?.age).toBe('36');
});

test('fill() writes JSON into the form and the round trip holds', async ({ page }) => {
  await open(page);
  await page.locator('[data-do-fill]').click();
  await expect(page.locator('[data-roundtrip]')).toHaveClass(/ok/);
  await expect.poll(async () => (await live(page)).name).toBe('Grace Hopper');
  const v = await live(page);
  expect(v.age).toBe(85);
  expect(v.languages).toEqual(['css', 'wasm']);
  expect(v.tags).toEqual(['compilers', 'COBOL', 'poetry']); // arrays never grow: the third input keeps its value
  expect(v.address.street).toBe("12 St James's Square"); // keys left out keep their fields

  await page.locator('[data-fill]').fill('{ "nickname": "Amazing Grace" }');
  await page.locator('[data-do-fill]').click();
  await expect(page.locator('[data-roundtrip]')).toHaveClass(/warn/);
  await expect(page.locator('[data-roundtrip]')).toContainText('nickname');
});

test('formFromObject() generates a form that reads back as the same JSON', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-gen-check]')).toHaveClass(/ok/);
  await page.locator('[data-preset="recipe"]').click();
  await expect(page).toHaveURL(/gen=recipe/);
  const generated = page.locator('[data-generated] form');
  await expect(generated.locator('input[type="number"]').first()).toHaveValue('4');
  await expect(page.locator('[data-gen-check]')).toHaveClass(/ok/);
  await generated.locator('input[type="number"]').first().fill('6');
  await expect(page.locator('[data-gen-check]')).toHaveClass(/warn/);
  await expect(page.locator('[data-gen-out]')).toContainText('"serves": 6');
  await page.locator('[data-gen-back]').click();
  await expect(page.locator('[data-gen]')).toHaveValue(/"serves": 6/);
  await expect(page.locator('[data-gen-check]')).toHaveClass(/ok/);
});

test('the cast table is computed by obfo itself', async ({ page }) => {
  await open(page);
  const rows = page.locator('[data-rules] tbody tr');
  await expect(rows).toHaveCount(9);
  await expect(rows.nth(0).locator('td').nth(1)).toHaveText('"42"');
  await expect(rows.nth(0).locator('td').nth(2)).toHaveText('42');
  await expect(rows.nth(4).locator('td').nth(2)).toHaveText('false');
  await expect(rows.nth(6).locator('td').nth(2)).toHaveText('["js","html"]');
});

test('an array of rows hands off to Data Plot Studio', async ({ page }) => {
  await open(page, '#/obfo?gen=points');
  const send = page.locator('[data-gen-actions] .handoff');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page).toHaveURL(/#\/data-plot/);
  await expect(page.locator('.handoff-banner')).toContainText('3 rows');
  await expect(page.locator('#dp-data tbody tr')).toHaveCount(3);
  await expect(page.locator('data-plot plot-marks > .plot-dot')).toHaveCount(3);
});
