import { test, expect, type Page } from '@playwright/test';

/**
 * Import Router planet (#/mport), end to end, on a production build.
 * Every test here runs with the network simulated (the planet's default): the registries are answered in the page and the
 * frame's two "CDNs" are same-origin mirrors under /orrery/mport/cdn/. Any request that leaves the preview server is aborted
 * and recorded, and the tests assert there were none, so nothing here depends on the internet.
 */

const PLANET = '#/mport';

/** Abort and record every request that leaves the local preview server (Google Fonts included). */
async function offline(page: Page) {
  const external: string[] = [];
  await page.route((url) => /^https?:$/.test(url.protocol) && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1', (route) => {
    external.push(route.request().url());
    return route.abort();
  });
  return external;
}
/** External requests that would mean the planet itself went online (the page's web fonts are not the planet's). */
const planetTraffic = (external: string[]) => external.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u));

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
/** Not counted: the favicon, aborted font requests, and the home page's probe for the optional Node companion
 *  (localhost:7777/orrery.json, which Firefox reports as a CORS error when nothing listens there). */
const mine = (errors: string[]) => errors.filter((e) => !/favicon|fonts\.g|ERR_FAILED|net::|Failed to load resource|orrery\.json/i.test(e));

async function open(page: Page, hash = PLANET) {
  await page.goto('about:blank');
  await page.goto(`./${hash}`);
  await expect(page.locator('.pg-mport')).toBeVisible();
}
const frameStatus = (page: Page) => page.locator('.mp-frame-status');
const frameApp = (page: Page) => page.frameLocator('.mp-iframe').locator('[data-app-status]');

test.describe('routing', () => {
  test('the default scenario runs and its checks pass, offline', async ({ page }) => {
    const external = await offline(page);
    const errors = watch(page);
    await open(page);
    await expect(page.locator('.mp-tab[data-tab="routing"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-net="sim"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mp-checks')).toHaveAttribute('data-state', 'pass');
    await expect(page.locator('.mp-card[data-spec="react@^19"]')).toHaveAttribute('data-provider', 'esm.sh');
    await expect(page.locator('.mp-health tr[data-provider="esm.sh"]')).toBeVisible();
    await expect(page.locator('.mp-out')).toContainText('"react": "https://esm.sh/react@19.2.0?target=es2022"');
    await page.locator('.mp-outtabs [data-out="lock"]').click();
    await expect(page.locator('.mp-out')).toContainText('"lockfileVersion": 1');
    expect(planetTraffic(external)).toEqual([]);
    expect(mine(errors)).toEqual([]);
  });

  test('every scenario passes its own checks', async ({ page }) => {
    test.setTimeout(120_000);
    const external = await offline(page);
    await open(page);
    for (const id of ['normal', 'namespace', 'outage', 'runtime', 'race', 'breaker', 'pinning', 'prefer', 'integrity']) {
      await page.locator(`.mp-scenarios [data-scenario="${id}"]`).click();
      await expect(page.locator(`.mp-scenario[data-scenario="${id}"] .mp-checks`), id).toHaveAttribute('data-state', 'pass', { timeout: 20_000 });
      await expect(page).toHaveURL(new RegExp(id === 'normal' ? '#/mport$' : `s=${id}`));
    }
    expect(planetTraffic(external)).toEqual([]);
  });

  test('a deep link reloads into the same scenario and network', async ({ page }) => {
    await offline(page);
    await open(page, `${PLANET}?tab=routing&s=outage&net=sim`);
    await expect(page.locator('.mp-scenarios [data-scenario="outage"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mp-checks')).toHaveAttribute('data-state', 'pass');
    await expect(page.locator('.mp-card[data-spec="preact@^10/hooks"]')).toHaveAttribute('data-provider', 'jsdelivr');
    await expect(page.locator('.mp-card[data-spec="react@^19"]')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('.prov[data-prov="esmSh"]')).toContainText('outage');
  });
});

test.describe('no-bundler frame', () => {
  test('the good path: the map is allowed by its hash, the app runs with zero CSP violations', async ({ page }) => {
    const external = await offline(page);
    const errors = watch(page);
    await open(page, `${PLANET}?tab=frame`);
    await expect(frameStatus(page)).toHaveAttribute('data-state', 'rendered');
    await expect(frameApp(page)).toContainText('preact 10.29.8 from esm.sh');
    // the app really is interactive inside the strict frame
    const frame = page.frameLocator('.mp-iframe');
    await frame.locator('input[type="text"]').fill('no bundler');
    await frame.locator('form.add button').click();
    await expect(frame.locator('.todo', { hasText: 'no bundler' })).toBeVisible();
    // let any late violation arrive, then: none
    await page.waitForTimeout(500);
    await expect(frameStatus(page)).toHaveAttribute('data-violations', '0');
    await expect(page.locator('.mp-vlog')).toHaveText('(none)');
    // the policy carries the map's own hash, and what the frame shows is that policy
    const hash = await page.locator('.mp-map').getAttribute('data-hash');
    expect(hash).toMatch(/^'sha256-/);
    await expect(page.locator('.mp-csp')).toContainText(hash!);
    await expect(page.locator('.mp-csp')).toContainText("require-trusted-types-for 'script'");
    await expect(page.locator('.mp-csp')).toContainText("default-src 'none'");
    const doc = await page.locator('.mp-iframe').evaluate((f: HTMLIFrameElement) => f.srcdoc);
    expect(doc.indexOf('<script type="importmap">')).toBeGreaterThan(0);
    expect(doc.indexOf('<script type="importmap">')).toBeLessThan(doc.indexOf('<script type="module"'));
    expect(doc).not.toContain('unsafe-inline');
    // whole-graph integrity in the map and the lockfile
    await expect(page.locator('.mp-map')).toContainText('"integrity"');
    await expect(page.locator('.mp-lock')).toContainText('"files"', { useInnerText: false });
    // and router.import() in the page agrees
    await expect(page.locator('.mp-rt-status')).toHaveAttribute('data-state', 'rendered');
    expect(planetTraffic(external)).toEqual([]);
    expect(mine(errors)).toEqual([]);
  });

  for (const [tamper, why] of [['hash', 'a wrong hash in the policy'], ['map', 'the map changed after hashing']] as const) {
    test(`tamper: ${why} is blocked by the browser`, async ({ page }) => {
      await offline(page);
      await open(page, `${PLANET}?tab=frame&tamper=${tamper}`);
      await expect(page.locator('[data-tamper]')).toHaveValue(tamper);
      await expect(frameStatus(page)).toHaveAttribute('data-state', 'blocked');
      await expect(page.locator('.mp-vlog')).toContainText(/violation\s+script-src/);
      expect(Number(await frameStatus(page).getAttribute('data-violations'))).toBeGreaterThan(0);
      await expect(frameApp(page)).toHaveCount(0);
    });
  }

  test("tamper: a file whose bytes don't match the map's integrity is refused", async ({ page }) => {
    await offline(page);
    await open(page, `${PLANET}?tab=frame&tamper=file`);
    await expect(frameStatus(page)).toHaveAttribute('data-state', 'failed');
    await expect(frameStatus(page)).toHaveAttribute('data-violations', '0');
    await expect(frameApp(page)).toHaveCount(0);
  });

  test('CDN switch: down falls back at build time; broken breaks the map but not router.import(); only the iframe reloads', async ({ page }) => {
    await offline(page);
    await open(page, `${PLANET}?tab=frame`);
    await expect(frameStatus(page)).toHaveAttribute('data-state', 'rendered');
    await page.locator('.pg-mport').evaluate((el) => { (el as any).__marker = 'same planet'; });

    await page.locator('[data-cdn="down"]').click();
    await expect(page).toHaveURL(/cdn=down/);
    await expect(frameApp(page)).toContainText('preact 10.29.8 from jsdelivr-esm');
    await expect(frameStatus(page)).toHaveAttribute('data-state', 'rendered');
    await expect(page.locator('.mp-buildlog')).toContainText("esm.sh failed mport's probe");

    await page.locator('[data-cdn="broken"]').click();
    await expect(frameStatus(page)).toHaveAttribute('data-state', 'failed');
    await expect(frameStatus(page)).toContainText('an import map has no fallback');
    await expect(page.locator('.mp-rt-status')).toHaveAttribute('data-state', 'rendered');
    await expect(page.locator('.mp-rt-status')).toContainText('excluded it');
    await expect(page.locator('.mp-rt-app [data-app-status]')).toContainText('from jsdelivr-esm');

    await page.locator('[data-cdn="up"]').click();
    await expect(frameStatus(page)).toHaveAttribute('data-state', 'rendered');
    expect(await page.locator('.pg-mport').evaluate((el) => (el as any).__marker)).toBe('same planet');
  });
});

test.describe('proofs', () => {
  test("mport's examples pass in the page, against the fake network", async ({ page }) => {
    const external = await offline(page);
    await open(page, `${PLANET}?tab=proofs`);
    await expect(page.locator('.mp-proof-summary')).toHaveAttribute('data-state', 'pass', { timeout: 30_000 });
    const n = await page.locator('.mp-proofs li').count();
    expect(n).toBeGreaterThanOrEqual(16);
    await expect(page.locator('.mp-proofs li[data-status="pass"]')).toHaveCount(n);
    await expect(page.locator('.mp-proofs li[data-proof="desk"] .pout')).toContainText('@workbench/ui/kit.html');
    expect(planetTraffic(external)).toEqual([]);
  });
});

test('tabs deep-link, and leaving the planet cleans up', async ({ page }) => {
  await offline(page);
  const errors = watch(page);
  await open(page, `${PLANET}?tab=frame&cdn=down`);
  await expect(page.locator('[data-cdn="down"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(frameStatus(page)).toHaveAttribute('data-state', 'rendered');
  await page.locator('.mp-tab[data-tab="proofs"]').click();
  await expect(page).toHaveURL(/tab=proofs/);
  await expect(page.locator('.mp-iframe')).toHaveCount(0);
  await page.locator('.mp-tab[data-tab="frame"]').click();
  await expect(frameStatus(page)).toHaveAttribute('data-state', 'rendered');

  await page.evaluate(() => { location.hash = '#/'; });
  await expect(page.locator('.pg-mport')).toHaveCount(0);
  await expect(page.locator('iframe.mp-iframe')).toHaveCount(0);
  expect(page.frames().filter((f) => f.url() === 'about:srcdoc')).toHaveLength(0);
  await page.waitForTimeout(1500);
  expect(mine(errors)).toEqual([]);
});
