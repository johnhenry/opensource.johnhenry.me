#!/usr/bin/env node
// Refreshes src/data/package-versions.json from the registries, so install
// snippets never carry a hand-typed version.
//
//   npm run sync:versions              all packages
//   npm run sync:versions -- @johnhenry/mport @johnhenry/safe-fragment
//
// For each package it records the npm `latest` version, the JSR version (or
// null when the package is not on JSR), and, for packages that run in a
// browser, a raw-CDN import map pinned to that exact version plus the esm.sh
// URLs (plus, where curated `sri: true`, an SRI hash of every raw file the map
// loads). The curated fields (section, status, summary, entries, nodeEntries,
// cdn, mapLazyDeps, sri) are left alone. Lazily imported hard dependencies are
// mapped too unless `mapLazyDeps: false` (ecmanim's renderers: mathjax-full
// does not load raw from a CDN).
//
// A version bump changes the key that `verified` is looked up by, so the CDN
// tab of a bumped package disappears until `npm run verify:cdn` has loaded the
// new snippet in a browser.

import fs from 'node:fs';
import path from 'node:path';
import { buildImportMap, fetchJson, isBuiltin, sriHash } from './lib/cdn-map.mjs';
import { entrySpecifiers, esmShUrl } from '../src/lib/install-snippets.mjs';

const FILE = path.resolve(import.meta.dirname, '../src/data/package-versions.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const names = only.length ? only : Object.keys(data.packages);

for (const n of only) if (!data.packages[n]) {
  console.error(`sync: ${n} is not in ${path.relative(process.cwd(), FILE)}; add it with section/status/summary first`);
  process.exit(1);
}

async function npmLatest(name) {
  const res = await fetch(`https://registry.npmjs.org/${name}/latest`, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  return (await res.json()).version ?? null;
}

async function jsrLatest(name) {
  const meta = await fetchJson(`https://jsr.io/${name}/meta.json`).catch(() => null);
  return meta?.latest ?? null;
}

let failures = 0;
async function syncOne(name) {
  const pkg = data.packages[name];
  const [npm, jsr] = await Promise.all([npmLatest(name), jsrLatest(name)]);
  if (!npm) {
    console.error(`sync: ${name} has no npm "latest"`);
    failures++;
    return;
  }
  const before = pkg.npm;
  pkg.npm = npm;
  pkg.jsr = jsr;
  delete pkg.importMap;
  delete pkg.esmSh;
  delete pkg.lazyOptional;
  delete pkg.integrity;
  if (pkg.status !== 'node' && pkg.cdn !== false) {
    const specifiers = entrySpecifiers(name, pkg);
    const r = await buildImportMap({ name, version: npm, specifiers, mapLazyDeps: pkg.mapLazyDeps !== false });
    if (r.nodeImports.length || r.problems.length) {
      console.error(`sync: ${name}@${npm} entries ${specifiers.join(', ')} do not map cleanly:`);
      for (const x of [...r.nodeImports.map((s) => `Node built-in ${s}`), ...r.problems]) console.error(`  - ${x}`);
      failures++;
    }
    pkg.importMap = Object.keys(r.scopes).length ? { imports: r.imports, scopes: r.scopes } : { imports: r.imports };
    pkg.esmSh = Object.fromEntries((pkg.entries ?? ['.']).map((sub) => [sub, esmShUrl(name, npm, sub)]));
    // SRI for every raw file the graph loads, for an import map's `integrity`.
    // Only where curated `sri: true` (the family page's worked example): for a
    // large package it is hundreds of hashes that churn on every release.
    if (pkg.sri) pkg.integrity = Object.fromEntries(await Promise.all(r.rawFiles.map(async (u) => [u, await sriHash(u)])));
    const lazy = r.dynamic.filter((d) => !isBuiltin(d));
    if (lazy.length) pkg.lazyOptional = lazy;
  }
  const change = before && before !== npm ? ` (was ${before})` : '';
  console.log(`${name.padEnd(42)} npm ${npm}${change}  jsr ${jsr ?? '-'}  ${pkg.status}`);
}

// A few at a time: jsDelivr and the registries rate-limit bursts.
const queue = [...names];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) await syncOne(queue.shift());
  })
);

data.syncedAt = new Date().toISOString().slice(0, 10);
const sorted = Object.fromEntries(Object.entries(data.packages).sort(([a], [b]) => a.localeCompare(b)));
data.packages = sorted;
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`\nwrote ${path.relative(process.cwd(), FILE)}; now run \`npm run verify:cdn\` so changed snippets are re-tested`);
if (failures) process.exit(1);
