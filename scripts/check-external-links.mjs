#!/usr/bin/env node
// Checks every external link in dist/ and reports ones that don't resolve.
//
// Separate from check-links.mjs (which only covers internal routes) because a
// consolidated docs site inherits other repos' links, and those rot without
// anything here changing — the ai.matey examples were renamed upstream and
// 26 links went dead with no signal on this side.
//
// Not wired into the build: it's network-dependent and slow, so it would make
// builds flaky. Run it periodically instead: `npm run check:external`.

import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '../dist');
const CONCURRENCY = 8;

// Hosts that block automated requests. They answer 403 to a HEAD/GET from a
// script while being perfectly reachable in a browser, so treating them as
// broken would train everyone to ignore this report.
const BOT_BLOCKED = [/(^|\.)npmjs\.com$/, /(^|\.)openai\.com$/, /(^|\.)x\.com$/, /(^|\.)twitter\.com$/];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

const links = new Map();
for (const page of walk(DIST)) {
  const html = fs.readFileSync(page, 'utf8');
  const from = '/' + path.relative(DIST, page).replace(/index\.html$/, '');
  for (const [, href] of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const url = href.split('#')[0];
    if (url.includes('opensource.johnhenry.me')) continue;
    if (!links.has(url)) links.set(url, new Set());
    links.get(url).add(from);
  }
}

const skipped = [];
const targets = [...links.keys()].filter((u) => {
  const host = new URL(u).hostname;
  if (BOT_BLOCKED.some((re) => re.test(host))) {
    skipped.push(u);
    return false;
  }
  return true;
});

const broken = [];
let cursor = 0;
async function worker() {
  while (cursor < targets.length) {
    const url = targets[cursor++];
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (!res.ok) broken.push({ url, status: res.status });
    } catch (err) {
      broken.push({ url, status: err.name === 'TimeoutError' ? 'timeout' : 'unreachable' });
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`Checked ${targets.length} external links (${skipped.length} skipped as bot-blocked).`);

if (broken.length === 0) {
  console.log('All resolved.');
  process.exit(0);
}

console.log(`\n${broken.length} did not resolve:\n`);
for (const { url, status } of broken.sort((a, b) => a.url.localeCompare(b.url))) {
  console.log(`  [${status}] ${url}`);
  for (const src of [...links.get(url)].sort().slice(0, 3)) console.log(`         on ${src}`);
}
process.exit(1);
