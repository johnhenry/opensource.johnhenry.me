import { test } from 'node:test';
import assert from 'node:assert/strict';
import { npmRegistryEquivalent } from './check-external-links.mjs';

test('npmRegistryEquivalent: scoped package URL maps to registry API', () => {
  assert.equal(
    npmRegistryEquivalent('https://www.npmjs.com/package/@johnhenry/aimatey-cli'),
    'https://registry.npmjs.org/@johnhenry/aimatey-cli'
  );
});

test('npmRegistryEquivalent: unscoped package URL maps to registry API', () => {
  assert.equal(
    npmRegistryEquivalent('https://www.npmjs.com/package/dotenv'),
    'https://registry.npmjs.org/dotenv'
  );
});

test('npmRegistryEquivalent: works without the www subdomain', () => {
  assert.equal(
    npmRegistryEquivalent('https://npmjs.com/package/dotenv'),
    'https://registry.npmjs.org/dotenv'
  );
});

test('npmRegistryEquivalent: tolerates a trailing slash', () => {
  assert.equal(
    npmRegistryEquivalent('https://www.npmjs.com/package/@johnhenry/aimatey-cli/'),
    'https://registry.npmjs.org/@johnhenry/aimatey-cli'
  );
});

test('npmRegistryEquivalent: non-npmjs.com URLs are left alone (returns null)', () => {
  assert.equal(npmRegistryEquivalent('https://openai.com/index/gpt-4/'), null);
  assert.equal(npmRegistryEquivalent('https://x.com/johnhenry'), null);
});

test('npmRegistryEquivalent: non-package npmjs.com URLs are left alone (returns null)', () => {
  assert.equal(npmRegistryEquivalent('https://www.npmjs.com/~johnhenry'), null);
});

// Live network checks: confirm the actual bug the audit found is fixed —
// npmjs.com bot-blocks its website indiscriminately (a broken package page
// 403s exactly like a real one), so the fix must resolve through the
// registry API to get real signal. Skipped automatically if offline.
test('live: a real npmjs.com package now resolves as fine (200 via registry API)', async (t) => {
  const target = npmRegistryEquivalent('https://www.npmjs.com/package/dotenv');
  let res;
  try {
    res = await fetch(target, { signal: AbortSignal.timeout(10000) });
  } catch {
    t.skip('offline — cannot reach registry.npmjs.org');
    return;
  }
  assert.equal(res.status, 200);
});

test('live: a deliberately-broken npmjs.com package URL is now caught as a failure (404 via registry API, not masked by the website 403)', async (t) => {
  const websiteUrl =
    'https://www.npmjs.com/package/@johnhenry/this-package-definitely-does-not-exist-xyz-123';
  const target = npmRegistryEquivalent(websiteUrl);
  assert.ok(target, 'expected the broken package URL to still map to the registry API');

  let websiteRes;
  let registryRes;
  try {
    websiteRes = await fetch(websiteUrl, { signal: AbortSignal.timeout(10000) });
    registryRes = await fetch(target, { signal: AbortSignal.timeout(10000) });
  } catch {
    t.skip('offline — cannot reach npmjs.com/registry.npmjs.org');
    return;
  }

  // The bug: the website 403s a broken package link exactly like a valid
  // one, which is why a bare "403 on npmjs.com = assume fine" rule can't
  // work. Documented here so a regression (npm changing this behavior)
  // shows up as a test failure rather than silently reintroducing the gap.
  assert.equal(websiteRes.status, 403, 'expected npmjs.com to bot-block this request with 403');
  // The registry API is the one that actually distinguishes real from broken.
  assert.equal(registryRes.status, 404);
});
