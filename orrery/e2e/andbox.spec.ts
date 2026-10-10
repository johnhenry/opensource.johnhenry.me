import { test, expect, type Page } from '@playwright/test';

/**
 * Andbox Cell planet (#/andbox): andbox's mode: 'iframe' (code renders a real DOM in an opaque-origin frame) and the network option
 * (0.2.0: network.allowedHosts is required; here the function form over a visitor-editable list, with a request log). The network test
 * allows only this site's own host, so the requests to other hosts are refused on the host before anything leaves the page.
 */

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
const mine = (errors: string[]) => errors.filter((e) => !/favicon|manifest|apple-touch|downloadable font|esm\.sh|Failed to load resource/i.test(e));

test("mode: 'iframe' renders real DOM in a sandboxed frame that cannot reach the page", async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/andbox');
  const result = page.locator('[data-el="iframeResult"]');
  await expect(result).toContainText('"origin": "null"', { timeout: 20_000 });
  await expect(result).toContainText('"parentDocument": "SecurityError"');
  const frame = page.locator('[data-el="iframeHost"] iframe');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  const inside = page.frameLocator('[data-el="iframeHost"] iframe');
  await expect(inside.locator('svg rect')).toHaveCount(8);
  await inside.locator('button').click();
  await expect(inside.locator('button')).toHaveText('clicked 1×');
  expect(mine(errors), mine(errors).join('\n')).toEqual([]);
});

test('network: the host function allows the listed host and refuses the rest, visibly', async ({ page }) => {
  await page.goto('./#/andbox');
  const host = new URL(page.url()).hostname;
  await page.locator('[data-el="netHosts"]').fill(host);
  await page.locator('[data-a="netRun"]').click();
  const log = page.locator('[data-el="netLog"]');
  await expect(log.locator('.ab-net-row')).toHaveCount(4, { timeout: 20_000 });
  await expect(log.locator('.ab-net-row[data-verdict="allowed"]')).toHaveCount(1);
  await expect(log.locator('.ab-net-row[data-verdict="allowed"]')).toContainText('favicon.svg');
  await expect(log.locator('.ab-net-row[data-verdict="allowed"] .s')).toHaveText('200');
  await expect(log.locator('.ab-net-row[data-verdict="refused"]')).toHaveCount(3);
  await expect(log).toContainText('httpbin.org is not in the list');
  await expect(page.locator('[data-el="netResult"]')).toContainText('example.com is not allowed by network.allowedHosts');
});
