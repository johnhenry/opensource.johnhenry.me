#!/usr/bin/env node
// roadmap 4.5 — "CI badge from the Tester"
//
// Build-time script: produces a fresh `vite build`, serves it locally with
// `vite preview`, drives headless Chrome (Playwright) to `#/tester?autorun=1`
// (the deep link Wave A already wired up in src/playgrounds/tester.ts), waits
// for the run to finish, and writes the results to dist/tests.json so
// src/home.ts can show test badges even for visitors who never opened the
// Tester Console themselves.
//
// Completion detection: tester.ts's runSuites() sets a small global,
// `window.__ORRERY_TESTER_DONE__`, once the (non-cancelled) run completes —
// see the "roadmap 4.5" comments there. That's the one minimal addition this
// task made to tester.ts; everything else here just drives the page and
// reads that value back.

import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, 'dist');
const AUTORUN_TIMEOUT_MS = 120_000; // the terminal has a per-character typewriter effect; ~35 suites can take a while

/** @typedef {{ id: string; roomId?: string; pass: number; fail: number }} SuiteResult */
/** @typedef {{ at: number; ms: number; tests: number; pass: number; fail: number; suites: SuiteResult[] }} TesterRunResult */

async function main() {
  const skipBuild = process.argv.includes('--skip-build');

  if (skipBuild) {
    console.log('[run-tests-headless] --skip-build: reusing existing dist/');
  } else {
    console.log('[run-tests-headless] building (vite build)...');
    await build({ root: ROOT, logLevel: 'warn' });
  }

  console.log('[run-tests-headless] starting vite preview server over dist/...');
  const previewServer = await preview({
    root: ROOT,
    logLevel: 'warn',
    preview: { port: 0, strictPort: false, open: false },
  });
  const resolvedUrl = previewServer.resolvedUrls?.local?.[0];
  if (!resolvedUrl) {
    await closePreview(previewServer);
    throw new Error('vite preview did not report a local URL');
  }
  const base = resolvedUrl.endsWith('/') ? resolvedUrl : `${resolvedUrl}/`;
  const testerUrl = `${base}#/tester?autorun=1`;
  console.log(`[run-tests-headless] preview up at ${base}`);

  let browser;
  /** @type {TesterRunResult} */
  let result;
  try {
    browser = await chromium.launch({ headless: true });
    // Deliberately the *default* headless context: no camera permission
    // grants and no WebGPU-enabling flags. Per the roadmap, suites that
    // depend on those capabilities must self-report as skipped here, not
    // fail — see the report on which suites were checked for this.
    const page = await browser.newPage();
    page.on('pageerror', (err) => console.warn('[run-tests-headless] page error:', err.message));

    console.log(`[run-tests-headless] opening ${testerUrl} ...`);
    await page.goto(testerUrl, { waitUntil: 'load' });

    await page.waitForFunction(
      () => (/** @type {any} */ (window)).__ORRERY_TESTER_DONE__ !== undefined,
      { timeout: AUTORUN_TIMEOUT_MS },
    );

    result = await page.evaluate(() => (/** @type {any} */ (window)).__ORRERY_TESTER_DONE__);
  } finally {
    if (browser) await browser.close();
    await closePreview(previewServer);
  }

  if (!result) throw new Error('autorun completed with no results marker (unexpected)');

  const rooms = {};
  for (const suite of result.suites) {
    if (!suite.roomId) continue; // meta suites (e.g. "diagnostics") have no planet badge to feed
    rooms[suite.roomId] = { pass: suite.pass, fail: suite.fail, at: result.at };
  }

  const out = {
    generatedAt: new Date(result.at).toISOString(),
    ms: Math.round(result.ms),
    totals: { tests: result.tests, pass: result.pass, fail: result.fail },
    suites: result.suites,
    rooms,
  };

  const outPath = path.join(OUT_DIR, 'tests.json');
  await writeFile(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(
    `[run-tests-headless] wrote ${path.relative(ROOT, outPath)}: ` +
      `${out.totals.pass} pass, ${out.totals.fail} fail, ${out.totals.tests} total (${out.ms}ms)`,
  );

  if (out.totals.fail > 0) {
    console.warn(`[run-tests-headless] warning: ${out.totals.fail} assertion(s) failed in the headless run`);
  }
}

async function closePreview(server) {
  await new Promise((resolve) => {
    // Vite's PreviewServer#httpServer.close() is the documented way to stop it.
    server?.httpServer?.close(() => resolve());
    if (!server?.httpServer) resolve();
  });
}

main().catch((err) => {
  console.error('[run-tests-headless] failed:', err);
  process.exitCode = 1;
});
