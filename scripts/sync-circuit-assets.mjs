#!/usr/bin/env node
// Mirrors npm-installed assets that are loaded directly by the browser rather
// than through Astro's bundler:
//
//   @erisera-code/circuit src/  → public/src/         (standalone showcase page)
//   ecmanim              dist/  → public/ecmanim-dist/ (ecmanim's live demo)
//
// Both were previously hand-copied or copied from a sibling checkout — the
// circuit mirror drifted from its source at least once, and ecmanim's copied
// from `../dist`, which only resolves inside that repo. Taking both from
// node_modules keeps this site self-contained (it builds on Dokku with no
// sibling repos present) and pinned to the versions in package.json.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SITE_ROOT = path.resolve(import.meta.dirname, '..');

function mirror({ pkg, probe, from, to }) {
  // A package's `exports` map may not expose package.json, so the root is
  // found by resolving a known export and walking up to the directory that
  // actually has a package.json.
  let dir = path.dirname(require.resolve(probe));
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not locate the root of ${pkg}`);
    dir = parent;
  }

  const src = path.join(dir, from);
  const dest = path.join(SITE_ROOT, to);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });

  const { version } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const count = fs.readdirSync(dest, { recursive: true }).length;
  console.log(`${pkg}@${version} ${from} → ${to} (${count} entries)`);
}

mirror({
  pkg: '@erisera-code/circuit',
  probe: '@erisera-code/circuit/tokens.css',
  from: 'src',
  to: 'public/src',
});

mirror({
  pkg: 'ecmanim',
  probe: 'ecmanim/browser',
  from: 'dist',
  to: 'public/ecmanim-dist',
});
