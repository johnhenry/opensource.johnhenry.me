import { test, expect, type Page } from '@playwright/test';

/**
 * Domable Prism planet (#/domable): domable 0.0.2's createElement props. A function on* prop is a listener (never an inline
 * handler attribute), a ".name" key is a DOM property, style takes an object, null/false are skipped, nested arrays flatten.
 */

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
const mine = (errors: string[]) => errors.filter((e) => !/favicon|manifest|apple-touch|downloadable font/i.test(e));

test('createElement props: listeners, properties, style objects, skipped values and flattened arrays', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/domable');
  const table = page.locator('[data-el="props-table"]');
  await expect(table.locator('tbody tr')).not.toHaveCount(0);
  await expect(table.locator('td.bad')).toHaveCount(0);
  await expect(table.locator('tr[data-kind="listener"]')).toHaveCount(3);
  await expect(table.locator('tr[data-kind="property"]')).toContainText('el.value = "7"');
  await expect(table.locator('tr[data-kind="style object"]')).toContainText('--tint: tomato');
  await expect(table).toHaveAttribute('data-skipped', '4');
  const preview = page.locator('[data-el="props-preview"]');
  // the real node: its listener works and its property was set
  await preview.locator('button').click();
  await preview.locator('button').click();
  await expect(preview.locator('button output')).toHaveText('2');
  await expect(page.locator('[data-el="props-events"]')).toContainText('click 2');
  await expect(preview.locator('input[type="range"]')).toHaveValue('7');
  await expect(preview.locator('li')).toHaveCount(5);
  // serialized: no inline handler, no value attribute
  const text = page.locator('[data-el="props-text"]');
  await expect(text).not.toContainText('onclick');
  await expect(text).not.toContainText('value=');
  expect(mine(errors), mine(errors).join('\n')).toEqual([]);
});
