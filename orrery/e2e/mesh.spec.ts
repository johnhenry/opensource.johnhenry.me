import { test, expect, type Page } from '@playwright/test';

/**
 * Browsermesh Swarm planet (#/mesh): two tabs of one browser context find each other (BroadcastChannel), and a signed chat message
 * crosses between them. Receivers verify it with PodIdentity.verify(publicKey, signature, data) -- the WebCrypto argument order
 * browsermesh-primitives 0.2.0 made mandatory (the old order throws) -- so a message tampered with after signing is rejected.
 */

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
const mine = (errors: string[]) => errors.filter((e) => !/favicon|manifest|apple-touch|downloadable font/i.test(e));

test('two tabs: signed chat verifies across tabs, a tampered message is rejected', async ({ context }) => {
  const a = await context.newPage();
  const errsA = watch(a);
  await a.goto('./#/mesh');
  await expect(a.locator('[data-r=pcount]')).toContainText('peer', { timeout: 20_000 });

  const b = await context.newPage();
  const errsB = watch(b);
  await b.goto('./#/mesh');
  await expect(b.locator('[data-r=pcount]')).toContainText('peer', { timeout: 20_000 });

  const text = `hello-${Date.now() % 100000}`;
  await a.fill('[data-r=chatin]', text);
  await a.click('form[data-r=chatform] button[type=submit]');
  // B shows A's message with a verified signature.
  await expect(b.locator('[data-r=chat]')).toContainText(text, { timeout: 20_000 });
  await expect(b.locator('[data-r=chat]')).toContainText('Ed25519 verified');

  // A signs a message, alters its text after signing, sends it: B rejects the signature.
  await a.click('[data-r=tamper]');
  await expect(b.locator('[data-r=chat]')).toContainText('Ed25519 signature invalid', { timeout: 20_000 });
  await expect(b.locator('[data-r=chatstat]')).toContainText('1 rejected');

  expect(mine(errsA), mine(errsA).join('\n')).toEqual([]);
  expect(mine(errsB), mine(errsB).join('\n')).toEqual([]);
});
