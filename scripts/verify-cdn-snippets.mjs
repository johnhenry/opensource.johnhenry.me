#!/usr/bin/env node
// Loads every CDN snippet the docs publish in a real browser and records which
// ones import, in src/data/package-versions.json under `verified`.
//
//   npm run verify:cdn                          Chromium
//   npm run verify:cdn -- --browsers=chromium,firefox,webkit
//
// What is tested is exactly what src/components/Install.astro renders (both
// use src/lib/install-snippets.mjs): for every <Install pkg="…"> on a docs
// page, and for every browser-capable package on its own,
//   - the raw-CDN import map, importing every specifier it maps, and
//   - each esm.sh URL, with no import map, and
//   - for a single package, the import map again with `integrity` for every raw file.
// The key is the package list at its current versions, so a version bump
// hides that CDN tab again until this script has passed for the new version.
// A failing snippet is recorded as failed and the component leaves it out.

import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, checkImport } from './lib/browser-check.mjs';
import { browserPackages, comboKey, esmShImports, mergedImportMap } from '../src/lib/install-snippets.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'src/data/package-versions.json');
const DOCS = path.join(ROOT, 'src/content/docs');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const browsers = (process.argv.find((a) => a.startsWith('--browsers='))?.split('=')[1] ?? 'chromium').split(',');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : /\.mdx?$/.test(e.name) ? [full] : [];
  });
}

// Every package set a page renders, plus every package alone.
const combos = new Map();
for (const file of walk(DOCS)) {
  for (const [, attrs] of fs.readFileSync(file, 'utf8').matchAll(/<Install\b([^>]*)\/?>/g)) {
    const pkg = attrs.match(/\bpkg="([^"]+)"/)?.[1];
    if (!pkg) continue;
    const names = pkg.trim().split(/\s+/);
    const missing = names.filter((n) => !data.packages[n]);
    if (missing.length) {
      console.error(`${path.relative(ROOT, file)}: ${missing.join(', ')} not in package-versions.json`);
      process.exitCode = 1;
      continue;
    }
    const pkgs = browserPackages(names, data);
    if (pkgs.length === names.length) combos.set(comboKey(pkgs, data), pkgs);
  }
}
for (const n of browserPackages(Object.keys(data.packages), data)) combos.set(comboKey([n], data), [n]);

const pw = await loadPlaywright(ROOT);
const launched = await Promise.all(browsers.map(async (b) => [b, await pw[b].launch()]));
const verified = {};
const date = new Date().toISOString().slice(0, 10);
const jobs = [...combos.entries()];
let failed = 0;

async function verifyCombo([key, pkgs]) {
  const importMap = mergedImportMap(pkgs, data);
  const mapped = Object.keys(importMap.imports);
  const esm = esmShImports(pkgs, data).map((x) => x.url);
  const record = { date, browsers, jsdelivr: true, esmsh: true };
  for (const [name, browser] of launched) {
    const jd = await checkImport(browser, { importMap, specifiers: mapped });
    const es = await checkImport(browser, { specifiers: esm });
    if (!jd.ok) {
      record.jsdelivr = false;
      (record.errors ??= []).push(`${name} import map: ${jd.failed}: ${jd.error.split('\n')[0]}`);
    }
    if (pkgs.length === 1 && data.packages[pkgs[0]].integrity) {
      // The same map with every raw file pinned by SRI (the family page's example).
      const pinned = mergedImportMap(pkgs, data, { integrity: true });
      const integ = await checkImport(browser, { importMap: pinned, specifiers: mapped });
      record.integrity = record.integrity !== false && integ.ok;
      if (!integ.ok) (record.errors ??= []).push(`${name} integrity: ${integ.failed}: ${integ.error.split('\n')[0]}`);
    }
    if (!es.ok) {
      record.esmsh = false;
      (record.errors ??= []).push(`${name} esm.sh: ${es.failed}: ${es.error.split('\n')[0]}`);
    }
  }
  verified[key] = record;
  const mark = (ok) => (ok ? 'ok  ' : 'FAIL');
  console.log(`import-map ${mark(record.jsdelivr)} esm.sh ${mark(record.esmsh)}  ${key}`);
  for (const e of record.errors ?? []) console.log(`    ${e}`);
  if (!record.jsdelivr || !record.esmsh) failed++;
}

const queue = [...jobs];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) await verifyCombo(queue.shift());
  })
);
for (const [, b] of launched) await b.close();

data.verified = Object.fromEntries(Object.entries(verified).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`\n${jobs.length - failed}/${jobs.length} snippet sets passed in ${browsers.join(', ')}; recorded in ${path.relative(ROOT, FILE)}`);
if (failed) process.exitCode = 1;
