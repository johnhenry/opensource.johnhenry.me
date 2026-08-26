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
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(import.meta.dirname, '../dist');
const CONCURRENCY = 8;

// Hosts that block automated requests. They answer 403 to a HEAD/GET from a
// script while being perfectly reachable in a browser, so treating a bare 403
// as broken would train everyone to ignore this report. Any OTHER failure
// (404, timeout, connection refused) on these hosts is still reported —
// only a 403 is assumed to be the bot wall rather than a real problem.
const BOT_BLOCKED = [/(^|\.)npmjs\.com$/, /(^|\.)openai\.com$/, /(^|\.)x\.com$/, /(^|\.)twitter\.com$/];

// npmjs.com's website sits behind a bot challenge that 403s *every* request
// from a script, valid package or not — so a bare "403 on a bot-blocked host
// = assume fine" rule would give zero signal for exactly the links this
// checker most needs to cover (see header comment). The registry API behind
// it doesn't challenge scripts and answers plain 200/404, so package links
// are redirected there for the real check; the original URL is still what
// gets reported.
export function npmRegistryEquivalent(url) {
  const match = url.match(/^https?:\/\/(?:www\.)?npmjs\.com\/package\/([^/?#]+(?:\/[^/?#]+)?)\/?$/);
  if (!match) return null;
  return `https://registry.npmjs.org/${match[1]}`;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

// Guarded so the pure helpers above can be imported by tests without also
// running the network scan (which needs a built dist/ and live internet).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
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

  const targets = [...links.keys()];

  const skipped = [];
  const broken = [];
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const url = targets[cursor++];
      const host = new URL(url).hostname;
      const botBlocked = BOT_BLOCKED.some((re) => re.test(host));
      const checkUrl = npmRegistryEquivalent(url) ?? url;
      try {
        const res = await fetch(checkUrl, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
        if (!res.ok) {
          // A bot-blocked host answering 403 is the known "reachable in a
          // browser, refuses scripts" case — assume fine. Any other failure
          // status (404, etc.) is still a real broken link, even on these hosts.
          if (botBlocked && res.status === 403) {
            skipped.push(url);
          } else {
            broken.push({ url, status: res.status });
          }
        }
      } catch (err) {
        broken.push({ url, status: err.name === 'TimeoutError' ? 'timeout' : 'unreachable' });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`Checked ${targets.length} external links (${skipped.length} skipped as bot-blocked 403s).`);

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
}
