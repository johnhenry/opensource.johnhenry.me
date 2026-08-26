#!/usr/bin/env node
// Crawls dist/ and reports internal links that resolve to no built page.
//
// The docs import rewrites every internal link to add a section prefix, so a
// silent miss there would strand pages that looked fine in isolation. Run
// after `npm run build`.

import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '../dist');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

const pages = walk(DIST);
const routes = new Set(
  pages.map((p) => {
    const rel = '/' + path.relative(DIST, p).replace(/index\.html$/, '').replace(/\.html$/, '');
    return rel.replace(/\/+$/, '') || '/';
  })
);
const broken = new Map();
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  const from = '/' + path.relative(DIST, page).replace(/index\.html$/, '').replace(/\/+$/, '');

  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
    // Built assets (/_astro/…, /pagefind/…, images) exist as real files.
    const asFile = path.join(DIST, href);
    if (fs.existsSync(asFile) && fs.statSync(asFile).isFile()) continue;

    const normalized = href.replace(/\/+$/, '') || '/';
    if (routes.has(normalized)) continue;

    if (!broken.has(normalized)) broken.set(normalized, new Set());
    broken.get(normalized).add(from || '/');
  }
}

// The six per-tool docs subdomains were retired when this site replaced them.
// A reference to one can survive as plain display text — in a code sample, a
// screenshot mockup — where no link checker would look, because it isn't a
// link. One did exactly that. Only the two still-served hosts are allowed.
const LIVE_ERISERA_HOSTS = new Set(['erisera.com', 'www.erisera.com', 'clawser.erisera.com']);
const retired = new Map();
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  const from = '/' + path.relative(DIST, page).replace(/index\.html$/, '').replace(/\/+$/, '');
  for (const [, host] of html.matchAll(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.erisera\.com)\b/gi)) {
    if (LIVE_ERISERA_HOSTS.has(host.toLowerCase())) continue;
    if (!retired.has(host)) retired.set(host, new Set());
    retired.get(host).add(from || '/');
  }
}

if (retired.size > 0) {
  console.log(`${retired.size} reference(s) to retired erisera.com hosts:\n`);
  for (const [host, sources] of [...retired].sort()) {
    console.log(`  ${host}`);
    for (const src of [...sources].sort().slice(0, 4)) console.log(`      on ${src}`);
  }
  console.log('');
}

if (broken.size === 0 && retired.size === 0) {
  console.log(`No broken internal links. ${routes.size} routes checked.`);
  process.exit(0);
}
if (broken.size === 0) process.exit(1);

console.log(`${broken.size} broken link target(s):\n`);
for (const [target, sources] of [...broken].sort()) {
  console.log(`  ${target}`);
  for (const src of [...sources].sort().slice(0, 4)) console.log(`      from ${src}`);
  if (sources.size > 4) console.log(`      …and ${sources.size - 4} more`);
}
process.exit(1);
