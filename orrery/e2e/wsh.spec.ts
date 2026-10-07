import { test, expect, type Page } from '@playwright/test';

/**
 * Web Shell planet (#/wsh), end to end, on a production build.
 *
 *  - "in-page host": no companion needed. The planet connects over a MessageChannel to its hand-built wsh host.
 *  - "companion": the REAL `@johnhenry/wsh/server` host the Node companion mounts on :7780 (playwright.config starts the
 *    companion). Skipped when no companion answers (a run against ORRERY_URL, or a port clash).
 * Both exercise the same planet code: Ed25519 auth, the restricted shell over a PTY, exec on its own QMux stream, the sandbox files,
 * and MCP discover/call.
 */

const PLANET = '#/wsh';
const COMPANION = process.env.ORRERY_COMPANION ?? 'http://localhost:7777';

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
/** Errors that are about this planet (not the favicon, nor a companion probe that finds nothing). */
const mine = (errors: string[]) => errors.filter((e) => !/favicon|manifest|apple-touch|ERR_CONNECTION_REFUSED|orrery\.json|downloadable font/i.test(e));

const status = (page: Page) => page.locator('.status').first();
const termText = (page: Page) => page.locator('.xterm-rows').first().innerText();

async function connect(page: Page, mode: 'page' | 'live') {
  await page.goto(`./${PLANET}`);
  await page.reload();
  await page.click(`[data-m=${mode}]`);
  await page.click('[data-a=connect]');
  await expect(status(page)).toContainText(mode === 'live' ? 'authenticated · companion' : 'authenticated · in-page', { timeout: 20_000 });
}

async function exercise(page: Page, where: string) {
  // PTY: the restricted line shell answers typed commands.
  await expect.poll(() => termText(page), { timeout: 15_000 }).toContain(`@${where}:~/sandbox$`);
  await page.keyboard.type('whoami\r');
  await expect.poll(() => termText(page)).toMatch(/guest\s+\(key [0-9a-f]{16}/);
  await page.keyboard.type('ls\r');
  await expect.poll(() => termText(page)).toContain('notes.md');

  // exec: its own QMux stream (announced by the transport, or primed), exit code 0.
  await page.fill('[data-r=exec]', 'echo exec-works');
  await page.click('[data-a=exec]');
  await expect(page.locator('[data-r=eout]')).toContainText('exec-works');
  await expect(page.locator('[data-r=emeta]')).toContainText('exit 0');

  // files: the sandbox listing arrives as FileResult entries.
  await page.click('[data-a=refresh]');
  await expect(page.locator('[data-r=files]')).toContainText('README.txt');
  await expect(page.locator('[data-r=files]')).toContainText('orbits.csv');

  // MCP: three tools discovered, one called with JSON arguments.
  await page.click('[data-a=discover]');
  await expect(page.locator('[data-r=mcpstat]')).toContainText('3 tools discovered');
  await expect(page.locator('[data-r=mcptools]')).toContainText('kepler');
  await page.fill('[data-r=mcpargs]', 'kepler {"au": 5.2}');
  await page.click('[data-a=call]');
  await expect(page.locator('[data-r=mcpstat]')).toContainText('call(kepler) -> success=true');
}

test('in-page host: connect, shell, exec, files and MCP tools', async ({ page }) => {
  const errors = watch(page);
  await connect(page, 'page');
  await exercise(page, 'in-page');
  expect(mine(errors), mine(errors).join('\n')).toEqual([]);
});

test.describe('companion (real @johnhenry/wsh/server)', () => {
  test.beforeEach(async ({ request }) => {
    const up = await request.get(`${COMPANION}/orrery.json`).then((r) => r.ok(), () => false);
    test.skip(!up, 'no Node companion is answering');
    const j = await request.get(`${COMPANION}/orrery.json`).then((r) => r.json());
    test.skip(!(j.demos as { id: string; ok: boolean }[]).some((d) => d.id === 'wsh' && d.ok), 'the wsh demo did not mount');
  });

  test('connect, shell, exec, files, MCP; real host-key TOFU pins, then refuses a rotated key', async ({ page }) => {
    const errors = watch(page);
    await connect(page, 'live');
    await exercise(page, 'companion');

    // fileWrite is a real server feature (the in-page host has none): write a note, see it listed.
    await expect(page.locator('[data-r=noterow]')).toBeVisible();
    await page.fill('[data-r=notename]', `e2e-${Date.now() % 100000}.txt`);
    await page.click('[data-a=note]');
    await expect(page.locator('[data-r=fmsg]')).toContainText('wrote');

    // Trust-on-first-use is the client's own: pinned on first sight, matched on the second connect.
    await expect(page.locator('[data-r=trustverdict]')).toContainText('known host');

    // Rotate the host key on the companion, reconnect: WshClient refuses before sending a signature.
    await page.click('[data-a=rotate]');
    await expect.poll(() => page.locator('[data-r=hostlog]').innerText(), { timeout: 15_000 }).toContain('rotated its host key');
    await page.click('[data-a=connect]');
    await expect(status(page)).toContainText('host key refused', { timeout: 20_000 });
    await expect(page.locator('[data-r=err]')).toContainText('HOST KEY CHANGED');
    await expect(page.locator('[data-r=trustverdict]')).toContainText('fingerprint changed');

    // Forget the host and the new key is trusted on first use again.
    await page.click('[data-a=forget]');
    await page.click('[data-a=connect]');
    await expect(status(page)).toContainText('authenticated · companion', { timeout: 20_000 });
    expect(mine(errors), mine(errors).join('\n')).toEqual([]);
  });
});
