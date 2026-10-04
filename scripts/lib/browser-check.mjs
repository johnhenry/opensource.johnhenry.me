// Loads module specifiers in a real browser page and reports whether each
// import resolved and evaluated. Used by scripts/verify-cdn-snippets.mjs.
//
// The page is served from a throwaway http://cdn-check.localhost origin (via
// Playwright request interception) so it behaves like an ordinary site: the
// import map is the first thing in <head>, before any module script.

import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * Playwright is not a dependency of the docs site. Use an installed copy if
 * there is one, otherwise the Orrery's (it already depends on Playwright for
 * its e2e suite). Nothing in orrery/ is modified.
 */
export async function loadPlaywright(root) {
  try {
    return await import('playwright');
  } catch {
    for (const from of [path.join(root, 'orrery/package.json'), path.join(root, 'package.json')]) {
      try {
        const require = createRequire(from);
        return await import(require.resolve('playwright'));
      } catch {}
    }
  }
  throw new Error('Playwright not found. Run `npx playwright install chromium` with playwright installed, or `npm --prefix orrery ci`.');
}

const ORIGIN = 'http://cdn-check.localhost';

/**
 * Imports each specifier in turn (with `importMap` installed, if given) and
 * stops at the first failure.
 *
 * @param {import('playwright').Browser} browser
 * @param {{ importMap?: object, specifier?: string, specifiers?: string[], timeout?: number }} opts
 * @returns {Promise<{ ok: boolean, exports?: Record<string, string[]>, failed?: string, error?: string }>}
 */
export async function checkImport(browser, { importMap, specifier, specifiers = [specifier], timeout = 60000 }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const map = importMap ? `<script type="importmap">${JSON.stringify(importMap)}</script>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8">${map}
<script type="module">
  const exports = {};
  let current;
  try {
    for (current of ${JSON.stringify(specifiers)}) exports[current] = Object.keys(await import(current));
    window.__result = { ok: true, exports };
  } catch (e) {
    window.__result = { ok: false, failed: current, error: String(e && (e.stack || e.message) || e) };
  }
</script></head><body></body></html>`;
  await page.route(`${ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  try {
    await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__result, null, { timeout });
    const result = await page.evaluate(() => window.__result);
    if (!result.ok && errors.length) result.error += ` | console: ${errors.slice(0, 3).join(' | ')}`;
    return result;
  } catch (e) {
    return { ok: false, error: `timeout/no result: ${String(e.message).split('\n')[0]} ${errors.slice(0, 3).join(' | ')}` };
  } finally {
    await context.close();
  }
}
