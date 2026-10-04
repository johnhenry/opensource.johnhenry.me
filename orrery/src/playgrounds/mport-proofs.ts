/**
 * The Proofs tab: mport's own runnable examples (examples/01–09, 12–14, 19–21 in the mport repository), ported to run in this
 * page against the fake network (mport-net.ts) instead of Node. Each proof keeps the example's assertions, through a small
 * `assert` shim shaped like node:assert/strict, and returns the line the example prints when it passes.
 *
 * Left out, because they need Node: 10 (the CLI), 11 (the internal createV1 factory), 15 (the CLI's outdated/update),
 * 16 (a real Rollup build), 17 (installedRegistry reads node_modules from disk), 18's node:crypto cross-check (the browser
 * version of that proof is the No-bundler frame tab, where a real engine enforces the hash).
 */
import * as M from '@johnhenry/mport/core';
import { scanHTMLModule } from '@johnhenry/html-modules';
import { offlineFetch, registry, allUp, show, NPM } from './mport-net';

/* ------------------------------------------------------------------ assert, the node:assert/strict subset the examples use */

export class AssertionError extends Error { name = 'AssertionError'; }
const fmt = (v: unknown) => { try { return JSON.stringify(v, (_k, x) => (x instanceof Set ? [...x] : x)); } catch { return String(v); } };

function deepEq(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Set) return a.size === b.size && [...a].every((x) => b.has(x));
  if (a instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && deepEq(v, b.get(k)));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEq(a[k], b[k]));
}

type ErrorCheck = RegExp | ((e: any) => boolean) | Record<string, unknown>;
export const assert = {
  ok(v: unknown, msg?: string) { if (!v) throw new AssertionError(msg ?? `expected a truthy value, got ${fmt(v)}`); },
  equal(a: unknown, b: unknown, msg?: string) { if (!Object.is(a, b)) throw new AssertionError(`${msg ? msg + ': ' : ''}${fmt(a)} !== ${fmt(b)}`); },
  notEqual(a: unknown, b: unknown, msg?: string) { if (Object.is(a, b)) throw new AssertionError(`${msg ? msg + ': ' : ''}both are ${fmt(a)}`); },
  deepEqual(a: unknown, b: unknown, msg?: string) { if (!deepEq(a, b)) throw new AssertionError(`${msg ? msg + ': ' : ''}${fmt(a)} is not deep-equal to ${fmt(b)}`); },
  match(s: string, re: RegExp, msg?: string) { if (!re.test(s)) throw new AssertionError(`${msg ? msg + ': ' : ''}${fmt(s)} does not match ${re}`); },
  async rejects(p: Promise<unknown>, check?: ErrorCheck, msg?: string) {
    let error: any;
    try { await p; } catch (e) { error = e; }
    if (error === undefined) throw new AssertionError(msg ?? 'expected a rejection, but it resolved');
    if (!check) return;
    const ok = check instanceof RegExp ? check.test(String(error)) || check.test(error?.message ?? '')
      : typeof check === 'function' ? check(error) === true
      : Object.entries(check).every(([k, v]) => (v instanceof RegExp ? v.test(error?.[k]) : deepEq(error?.[k], v)));
    if (!ok) throw new AssertionError(`${msg ? msg + ': ' : ''}rejected with ${error?.name}: ${error?.message}, which fails the check`);
  },
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const anyM = M as any;

export interface Proof { id: string; title: string; file: string; run: () => Promise<string> }
const R = 'https://github.com/johnhenry/mport/blob/main/examples/';

export const PROOFS: Proof[] = [
  {
    id: '01', title: 'Ranges resolve once to exact versions', file: '01-ranges-resolve-once-to-exact-versions.mjs',
    async run() {
      const { createRouter, esmSh, jsr } = anyM;
      const fetch = offlineFetch(registry);
      const router = createRouter({ '*': esmSh(), '@std/*': jsr() }, { fetch, probe: 'none' });
      const react = await router.resolve('react@^19');
      assert.equal(react.version, '19.2.0');
      assert.equal(react.url, 'https://esm.sh/react@19.2.0?target=es2022');
      assert.deepEqual(show(react.trace), ['lookup:npm registry', 'resolved:npm registry', 'selected:esm.sh']);
      const exact = await router.resolve('react@18.3.1');
      assert.deepEqual(show(exact.trace), ['selected:esm.sh'], 'an exact version needs no lookup');
      assert.equal((await router.resolve('react@next')).version, '20.0.0-rc.1', 'dist-tags resolve too');
      await assert.rejects(router.resolve('react@^20'), { name: 'ResolutionError' });
      assert.deepEqual(router.health.snapshot(), {});
      const path = await router.resolve('@std/path@^1');
      assert.equal(path.registry, 'jsr');
      assert.equal(path.version, '1.1.0', 'yanked 1.2.0 is ignored');
      assert.equal(path.url, 'https://esm.sh/jsr/@std/path@1.1.0?target=es2022');
      return `01 ok: ${react.url} | ${path.url}`;
    },
  },
  {
    id: '02', title: 'Fallback skips a CDN that is down', file: '02-fallback-skips-a-cdn-that-is-down.mjs',
    async run() {
      const { createRouter, esmSh, jsr, jsDelivr, unpkg } = anyM;
      const fetch = offlineFetch({ ...registry, ...allUp, 'https://esm.sh/*': 503 });
      const router = createRouter({ '*': [esmSh(), jsr(), jsDelivr(), unpkg()] }, { fetch });
      const lit = await router.resolve('lit@^3');
      assert.equal(lit.provider, 'jsdelivr');
      assert.equal(lit.url, 'https://cdn.jsdelivr.net/npm/lit@3.3.1/index.js', 'raw CDNs get the entry file from exports');
      assert.deepEqual(show(lit.trace), ['lookup:npm registry', 'resolved:npm registry', 'probe:esm.sh', 'fail:esm.sh', 'skip:jsr (no npm support)', 'probe:jsdelivr', 'ok:jsdelivr']);
      assert.equal(router.health.snapshot()['esm.sh'].fail, 1, 'the failure is recorded against esm.sh');
      const down = createRouter({ '*': [esmSh(), unpkg()] }, { fetch: offlineFetch({ ...registry, 'https://esm.sh/*': 503, 'https://unpkg.com/*': 500 }) });
      await assert.rejects(down.resolve('lit@3.3.1'), (e) => e.name === 'RoutingError' && e.errors.length === 2 && e.trace.length === 4);
      return `02 ok: ${show(lit.trace).join(' → ')}`;
    },
  },
  {
    id: '03', title: 'Race: the first success wins, losers are not blamed', file: '03-race-first-success-wins-losers-are-not-blamed.mjs',
    async run() {
      const { createRouter, race, esmSh, jsDelivr, unpkg } = anyM;
      const fetch = offlineFetch({ ...registry, ...allUp, 'https://esm.sh/*': 500 }, { delays: { 'https://cdn.jsdelivr.net/': 5, 'https://unpkg.com/': 60 } });
      const router = createRouter({ '*': race(esmSh(), jsDelivr(), unpkg()) }, { fetch });
      const r = await router.resolve('lit@3.3.1');
      assert.equal(r.provider, 'jsdelivr', 'esm.sh failed first, jsDelivr answered next');
      await wait(20);
      assert.ok(show(r.trace).includes('aborted:unpkg'));
      const health = router.health.snapshot();
      assert.equal(health['esm.sh'].fail, 1);
      assert.equal(health.unpkg, undefined, 'an aborted loser has no health entry at all');
      const importer = (url: string) => new Promise((res) => setTimeout(() => res({ url }), url.includes('unpkg') ? 5 : 30));
      const imports = createRouter({ '*': race(jsDelivr(), unpkg()) }, { probe: 'import', importer, fetch: offlineFetch(registry) });
      const won = await imports.resolve('lit@3.3.1');
      await wait(50);
      assert.equal(won.provider, 'unpkg');
      assert.deepEqual(won.module, { url: won.url }, 'probe: "import" returns the module it imported');
      assert.ok(show(won.trace).includes('aborted:jsdelivr (lost the race)'));
      return `03 ok: ${show(r.trace).join(' → ')}`;
    },
  },
  {
    id: '04', title: 'CommonJS is skipped on raw CDNs', file: '04-commonjs-is-skipped-on-raw-cdns.mjs',
    async run() {
      const { createRouter, jsDelivr, unpkg, esmSh, entryInfo } = anyM;
      const fetch = offlineFetch(registry);
      const router = createRouter({ '*': [jsDelivr(), unpkg(), esmSh()] }, { fetch, probe: 'none' });
      const react = await router.resolve('react@^19');
      assert.equal(react.provider, 'esm.sh');
      assert.deepEqual(react.trace.filter((e: any) => e.type === 'skip').map((e: any) => e.provider), ['jsdelivr', 'unpkg']);
      assert.match(react.trace.find((e: any) => e.type === 'skip').reason, /index\.js is CommonJS/);
      const preact = await router.resolve('preact@^10/hooks');
      assert.equal(preact.url, 'https://cdn.jsdelivr.net/npm/preact@10.29.8/hooks/dist/hooks.mjs', 'sub-path mapped through exports');
      const lenient = createRouter({ '*': jsDelivr() }, { fetch, probe: 'none', allowCommonJS: true });
      assert.equal((await lenient.resolve('react@^19')).url, 'https://cdn.jsdelivr.net/npm/react@19.2.0/index.js');
      assert.deepEqual(entryInfo({ main: 'index.js' }), { file: 'index.js', esm: false, hasExports: false });
      assert.deepEqual(entryInfo({ type: 'module', main: 'index.js' }), { file: 'index.js', esm: true, hasExports: false });
      assert.deepEqual(entryInfo({ main: 'index.js', module: 'dist/x.js' }), { file: 'dist/x.js', esm: true, hasExports: false });
      assert.deepEqual(entryInfo({ exports: { '.': { require: './a.cjs', import: './a.js' } } }), { file: 'a.js', esm: true, hasExports: true });
      assert.deepEqual(entryInfo({ main: 'dist/lib.esm.js' }), { file: 'dist/lib.esm.js', esm: true, hasExports: false }, 'ESM by naming convention');
      return `04 ok: ${show(react.trace).join(' → ')}`;
    },
  },
  {
    id: '05', title: 'A lockfile pins version and build', file: '05-lockfile-pins-version-and-build.mjs',
    async run() {
      const { createRouter, esmSh, jspm, jsDelivr, unpkg } = anyM;
      const day1 = createRouter({ '*': [jsDelivr(), unpkg()] }, { fetch: offlineFetch({ ...registry, ...allUp, 'https://cdn.jsdelivr.net/*': 503 }) });
      const { lock } = await day1.build(['lit@^3']);
      assert.deepEqual(lock.packages['lit@^3'], {
        specifier: 'lit@^3', registry: 'npm', name: 'lit', range: '^3', version: '3.3.1',
        entry: 'index.js', build: 'npm', provider: 'unpkg', url: 'https://unpkg.com/lit@3.3.1/index.js',
      });
      const log: { url: string; method: string }[] = [];
      const fetch = offlineFetch({ ...registry, ...allUp }, { log });
      const day2 = createRouter({ '*': [esmSh(), jspm(), jsDelivr(), unpkg()] }, { fetch, lock });
      const r = await day2.resolve('lit@^3');
      assert.equal(r.version, '3.3.1');
      assert.equal(r.provider, 'jsdelivr', 'a mirror of the locked build, not the provider that served it last time');
      assert.deepEqual(show(r.trace).slice(0, 2), ['skip:esm.sh (serves build "esm.sh", locked to "npm")', 'skip:jspm (serves build "jspm", locked to "npm")']);
      assert.ok(!log.some((l) => l.url.startsWith('https://registry.npmjs.org')), 'version and entry came from the lock');
      const fresh = await day2.resolve('lit@^3', { relock: true });
      assert.equal(fresh.provider, 'esm.sh');
      return `05 ok: ${show(r.trace).join(' → ')}`;
    },
  },
  {
    id: '06', title: 'The circuit breaker opens and resets', file: '06-circuit-breaker-opens-and-resets.mjs',
    async run() {
      const { createRouter, esmSh, unpkg, HealthRegistry } = anyM;
      let t = 0;
      const now = () => t;
      const log: { url: string; method: string }[] = [];
      const fetch = offlineFetch({ ...registry, ...allUp, 'https://esm.sh/*': 500 }, { log });
      const router = createRouter({ '*': [esmSh(), unpkg()] }, { fetch, now, circuitBreaker: { failures: 2, reset: '30s' } });
      await router.resolve('lit@3.3.1');
      await router.resolve('preact@10.29.8');
      assert.equal(router.health.isOpen('esm.sh'), true);
      const before = log.filter((l) => l.url.startsWith('https://esm.sh')).length;
      const r = await router.resolve('lit@3.3.1');
      assert.equal(r.trace[0].reason, 'circuit open');
      assert.equal(log.filter((l) => l.url.startsWith('https://esm.sh')).length, before, 'no request while open');
      t += 30_001;
      assert.equal(router.health.isOpen('esm.sh'), false, 'closed again after reset');
      assert.equal(router.health.snapshot()['esm.sh'].streak, 2, 'the streak survives the reset, so the next failure reopens it immediately');
      const other = createRouter({ '*': [esmSh(), unpkg()] }, { fetch, health: router.health });
      assert.equal(other.health, router.health);
      const h = new HealthRegistry({ failures: 1, reset: 1000, now });
      h.failure('x');
      assert.equal(h.isOpen('x'), true);
      h.success('x', 40);
      assert.deepEqual(h.snapshot().x, { ok: 1, fail: 1, streak: 0, latency: 40, openUntil: 0, healthy: true });
      return '06 ok: esm.sh circuit opened after 2 failures and closed after 30s';
    },
  },
  {
    id: '07', title: 'verified() rejects a tampered mirror', file: '07-verified-rejects-a-tampered-mirror.mjs',
    async run() {
      const { createRouter, verified, jsDelivr, unpkg, sri } = anyM;
      const good = 'export const html = String.raw;';
      const fetch = offlineFetch({ ...registry, 'https://unpkg.com/*': 'export const html = () => stealCookies();', 'https://cdn.jsdelivr.net/*': good });
      const expected = await sri(new TextEncoder().encode(good));
      const router = createRouter({ '*': [verified(unpkg()), verified(jsDelivr())] }, { fetch });
      const r = await router.resolve('lit@3.3.1', { integrity: expected });
      assert.equal(r.provider, 'jsdelivr');
      assert.equal(r.integrity, expected);
      assert.deepEqual(show(r.trace), ['probe:unpkg', 'ok:unpkg', 'fail/integrity:unpkg', 'probe:jsdelivr', 'ok:jsdelivr']);
      const tofu = createRouter({ '*': verified(unpkg()) }, { fetch });
      const { importMap, lock } = await tofu.build(['lit@3.3.1']);
      assert.match(importMap.integrity['https://unpkg.com/lit@3.3.1/index.js'], /^sha384-/);
      assert.equal(lock.packages['lit@3.3.1'].integrity, importMap.integrity['https://unpkg.com/lit@3.3.1/index.js']);
      return `07 ok: ${show(r.trace).join(' → ')}`;
    },
  },
  {
    id: '08', title: 'router.import() fails over at runtime', file: '08-router-import-fails-over-at-runtime.mjs',
    async run() {
      const { createRouter, createImporter, esmSh, jsDelivr } = anyM;
      const importer = async (url: string) => {
        if (url.startsWith('https://esm.sh/')) throw new TypeError(`Failed to fetch dynamically imported module: ${url}`);
        return { default: `module from ${url}` };
      };
      const routes = { '*': [esmSh(), jsDelivr({ esm: true })] };
      const events: string[] = [];
      const router = createRouter(routes, { fetch: offlineFetch(registry), probe: 'none', importer, onEvent: (e: any) => events.push(`${e.type}${e.phase ? `/${e.phase}` : ''}:${e.provider}`) });
      const load = createImporter(router);
      const react = await load('react@^19');
      assert.equal(react.default, 'module from https://cdn.jsdelivr.net/npm/react@19.2.0/+esm');
      assert.deepEqual(events.filter((e) => !e.includes('registry')), ['selected:esm.sh', 'fail/import:esm.sh', 'skip:esm.sh', 'selected:jsdelivr-esm']);
      assert.equal(router.health.snapshot()['esm.sh'].fail, 1, 'an import failure counts against the provider');
      await assert.rejects(router.import('react@^19', { build: 'esm.sh' }), (e) => e.name === 'RoutingError');
      const locked = createRouter(routes, { fetch: offlineFetch(registry), probe: 'none', importer, lock: { lockfileVersion: 1, packages: { 'react@^19': { version: '19.2.0', build: 'esm.sh' } } } });
      await assert.rejects(locked.import('react@^19'), (e) => e.name === 'RoutingError' && e.errors.length === 2);
      assert.deepEqual(await createRouter(routes, { importer: async (u: string) => ({ u }) }).import('./local.js'), { u: './local.js' });
      return `08 ok: ${events.join(' → ')}`;
    },
  },
  {
    id: '09', title: 'build() compiles an import map and a lockfile', file: '09-build-compiles-an-import-map-and-lockfile.mjs',
    async run() {
      const { createRouter, esmSh, jsDelivr, jsr, mergeImportMaps } = anyM;
      const router = createRouter({ '*': esmSh(), 'lit*': [jsDelivr(), esmSh()], '@std/*': jsr() }, { fetch: offlineFetch(registry), probe: 'none' });
      const { importMap, lock } = await router.build(
        ['react@^19', 'react@^19/jsx-runtime', 'lit/', 'npm:preact@10', '@std/path@^1'],
        { scopes: { 'https://legacy.example.com/': { react: 'react@18.3.1' } } },
      );
      assert.deepEqual(importMap, {
        imports: {
          'react': 'https://esm.sh/react@19.2.0?target=es2022',
          'react/jsx-runtime': 'https://esm.sh/react@19.2.0/jsx-runtime?target=es2022',
          'lit/': 'https://esm.sh/lit@3.3.1/',
          'npm:preact': 'https://esm.sh/preact@10.29.8?target=es2022',
          '@std/path': 'https://esm.sh/jsr/@std/path@1.1.0?target=es2022',
        },
        scopes: { 'https://legacy.example.com/': { react: 'https://esm.sh/react@18.3.1?target=es2022' } },
      });
      assert.deepEqual(Object.keys(lock.packages), ['@std/path@^1', 'lit', 'npm:preact@10', 'react@18.3.1', 'react@^19', 'react@^19/jsx-runtime']);
      assert.equal(lock.packages['@std/path@^1'].registry, 'jsr');
      await assert.rejects(router.build(['./app.js']), (e) => e.name === 'ResolutionError' && /no route/.test(e.message));
      assert.deepEqual(mergeImportMaps(importMap, { imports: { react: '/vendor/react.js' } }).imports.react, '/vendor/react.js');
      return `09 ok: ${JSON.stringify(importMap.imports)}`;
    },
  },
  {
    id: '12', title: 'A server renders the import map with preloads', file: '12-server-renders-an-import-map-with-preloads.mjs',
    async run() {
      const { createRouter, esmSh, verified, renderImportMap, renderModulePreload } = anyM;
      const router = createRouter({ '*': verified(esmSh()) }, { fetch: offlineFetch({ ...registry, ...allUp }) });
      const { importMap } = await router.build(['react@^19', 'lit/']);
      const head = `${renderImportMap(importMap)}\n${renderModulePreload(importMap)}`;
      assert.match(head, /^<script type="importmap">.*<\/script>\n<link rel="modulepreload" href="https:\/\/esm\.sh\/react@19\.2\.0\?target=es2022" integrity="sha384-[^"]+" crossorigin="anonymous">/s);
      assert.ok(!head.includes('href="https://esm.sh/lit@3.3.1/"'), 'a prefix mapping is a directory, not a module to preload');
      await assert.rejects(router.build(['react@18.3.1', 'react@^19']), /conflicting resolutions for "react".*scope/);
      const ok = await router.build(['react@^19'], { scopes: { 'https://legacy.example.com/': { react: 'react@18.3.1' } } });
      assert.equal(ok.importMap.scopes['https://legacy.example.com/'].react, 'https://esm.sh/react@18.3.1?target=es2022');
      return `12 ok: ${head.split('\n').length} head lines`;
    },
  },
  {
    id: '13', title: 'Conflicting versions get scopes', file: '13-conflicting-versions-get-scopes.mjs',
    async run() {
      const { createRouter, jsDelivr } = anyM;
      const table = {
        ...registry,
        [`${NPM}/react/18.3.1`]: { name: 'react', version: '18.3.1', type: 'module', main: 'index.js' },
        [`${NPM}/react/19.2.0`]: { name: 'react', version: '19.2.0', type: 'module', main: 'index.js' },
        [`${NPM}/lib-a`]: { 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} } },
        [`${NPM}/lib-a/1.0.0`]: { name: 'lib-a', version: '1.0.0', type: 'module', main: 'index.js', dependencies: { react: '^18.2.0' } },
      };
      const make = () => createRouter({ '*': jsDelivr() }, { fetch: offlineFetch(table), probe: 'none' });
      const specifiers = ['react@19.2.0', 'react@18.3.1', 'lib-a@1.0.0'];
      await assert.rejects(make().build(specifiers), (e) => e.name === 'ResolutionError' && /conflicting resolutions for "react"/.test(e.message));
      const { importMap, conflicts } = await make().build(specifiers, { conflicts: 'scope' });
      assert.equal(importMap.imports.react, 'https://cdn.jsdelivr.net/npm/react@19.2.0/index.js');
      assert.deepEqual(importMap.scopes, { 'https://cdn.jsdelivr.net/npm/lib-a@1.0.0/': { react: 'https://cdn.jsdelivr.net/npm/react@18.3.1/index.js' } });
      assert.equal(conflicts[0].scoped[0].dependent, 'lib-a@1.0.0');
      assert.deepEqual(conflicts[0].unscoped, [], 'every version is reachable from somewhere');
      const orphan = await make().build(['react@19.2.0', 'react@18.3.1'], { conflicts: 'scope' });
      assert.equal(orphan.importMap.scopes, undefined);
      assert.deepEqual(orphan.conflicts[0].unscoped.map((u: any) => u.specifier), ['react@18.3.1']);
      return `13 ok: ${JSON.stringify(importMap.scopes)}`;
    },
  },
  {
    id: '14', title: 'Whole-graph integrity in the lockfile', file: '14-whole-graph-integrity-in-the-lockfile.mjs',
    async run() {
      const { createRouter, esmSh } = anyM;
      const files = {
        'https://esm.sh/react@19.2.0?target=es2022': 'export * from "/react@19.2.0/es2022/react.mjs";',
        'https://esm.sh/react@19.2.0/es2022/react.mjs': 'import "/scheduler@0.27.0/es2022/scheduler.mjs";export default 1;',
        'https://esm.sh/scheduler@0.27.0/es2022/scheduler.mjs': 'export const tick = () => {};',
      };
      const make = (table: Record<string, unknown>, o: Record<string, unknown> = {}) => createRouter({ '*': esmSh() }, { fetch: offlineFetch({ ...registry, ...table }), probe: 'none', ...o });
      const { importMap, lock, graph } = await make(files).build(['react@^19'], { graph: true });
      assert.deepEqual(Object.keys(importMap.integrity).sort(), Object.keys(files).sort(), 'every file of the graph, not just the stub');
      assert.deepEqual(lock.files, importMap.integrity);
      assert.equal(graph.files, 3);
      const tampered = { ...files, 'https://esm.sh/scheduler@0.27.0/es2022/scheduler.mjs': 'export const tick = () => steal();' };
      await assert.rejects(make(tampered, { lock }).build(['react@^19'], { graph: true }), (e) => e.name === 'IntegrityError' && /scheduler\.mjs/.test(e.message));
      const events: any[] = [];
      const cut = await make(files, { onEvent: (e: any) => events.push(e) }).build(['react@^19'], { graph: { maxFiles: 2 } });
      assert.equal(cut.graph.truncated[0].reason, 'maxFiles');
      assert.equal(events.find((e) => e.type === 'truncated').skipped, 1);
      return `14 ok: ${Object.keys(importMap.integrity).length} files hashed`;
    },
  },
  {
    id: '19', title: 'Dependencies of a raw-CDN package join the map', file: '19-dependencies-of-a-raw-cdn-package-join-the-map.mjs',
    async run() {
      const { createRouter, jsDelivr, esmSh } = anyM;
      const pkg = (name: string, version: string, dependencies: Record<string, string> = {}) => ({
        [`${NPM}/${name}`]: { 'dist-tags': { latest: version }, versions: { [version]: {} } },
        [`${NPM}/${name}/${version}`]: { name, version, type: 'module', main: 'index.js', dependencies },
      });
      const table = {
        ...pkg('safe-fragment', '1.0.0', { dompurify: '^3.0.0', 'node-only': 'file:../node-only' }),
        ...pkg('dompurify', '3.2.0', { 'trusted-types': '^2' }),
        ...pkg('trusted-types', '2.0.0'),
      };
      const make = (provider: unknown) => createRouter({ '*': provider }, { fetch: offlineFetch(table), probe: 'none' });
      const bare = await make(jsDelivr()).build(['safe-fragment@1.0.0']);
      assert.deepEqual(Object.keys(bare.importMap.imports), ['safe-fragment']);
      const { importMap, dependencies, lock } = await make(jsDelivr()).build(['safe-fragment@1.0.0'], { dependencies: true });
      assert.deepEqual(importMap.imports, {
        'safe-fragment': 'https://cdn.jsdelivr.net/npm/safe-fragment@1.0.0/index.js',
        'dompurify': 'https://cdn.jsdelivr.net/npm/dompurify@3.2.0/index.js',
        'trusted-types': 'https://cdn.jsdelivr.net/npm/trusted-types@2.0.0/index.js',
      });
      assert.deepEqual(dependencies.added.map((d: any) => `${d.specifier} <- ${d.from} (depth ${d.depth})`), ['dompurify@^3.0.0 <- safe-fragment@1.0.0 (depth 1)', 'trusted-types@^2 <- dompurify@3.2.0 (depth 2)']);
      assert.equal(dependencies.skipped[0].name, 'node-only', 'a file: range is reported, not guessed at');
      assert.ok(lock.packages['dompurify@^3.0.0'], 'added entries are locked, so a lockfile reproduces the build');
      const shallow = await make(jsDelivr()).build(['safe-fragment@1.0.0'], { dependencies: true, dependencyDepth: 1 });
      assert.deepEqual(shallow.dependencies.truncated.map((t: any) => t.name), ['trusted-types'], 'what the depth bound cut off is reported');
      const esm = await make(esmSh()).build(['safe-fragment@1.0.0'], { dependencies: true });
      assert.deepEqual(Object.keys(esm.importMap.imports), ['safe-fragment']);
      assert.equal(esm.dependencies.skipped[0].reason, 'rewrites its own imports');
      return `19 ok: ${Object.keys(importMap.imports).join(', ')}`;
    },
  },
  {
    id: '20', title: 'An app-owned prefix needs no registry', file: '20-app-owned-prefix-needs-no-registry.mjs',
    async run() {
      const { createRouter, custom, esmSh } = anyM;
      const fetch = offlineFetch(registry);
      const router = createRouter({ 'components/*': custom('/components/{path}', { name: 'app', build: 'app' }), '*': esmSh() }, { fetch, probe: 'none' });
      const { importMap, lock } = await router.build(['components/button.js', 'components/', 'react@^19']);
      assert.deepEqual(importMap.imports, { 'components/button.js': '/components/button.js', 'components/': '/components/', 'react': 'https://esm.sh/react@19.2.0?target=es2022' });
      assert.deepEqual(fetch.log.map((l) => l.url), ['https://registry.npmjs.org/react']);
      assert.equal(lock.packages['components/button.js'].build, 'app');
      return `20 ok: ${JSON.stringify(importMap.imports)}`;
    },
  },
  {
    id: '21', title: 'An integrity manifest for an html-modules graph', file: '21-integrity-manifest-for-an-html-modules-graph.mjs',
    async run() {
      const { createRouter, esmSh, htmlGraph, integrityManifest } = anyM;
      const files = {
        'https://ui.example/app.html': '<html-import src="./card.html" as="card"></html-import><html-import src="./logic.js" as="logic"></html-import>',
        'https://ui.example/card.html': '<html-export name="ui-card"><template>card</template></html-export><html-export src="./icon.html"></html-export>',
        'https://ui.example/icon.html': '<html-export name="ui-icon"><template>icon</template></html-export>',
        'https://ui.example/logic.js': 'import "./util.js"; export const ready = true;',
        'https://ui.example/util.js': 'export const util = 1;',
      };
      // In a bundled page the optional peer can't be imported by name at runtime, so its scanner is passed in (the documented `scan` option).
      const scan = scanHTMLModule;
      const { integrity, files: count } = await htmlGraph('https://ui.example/app.html', { fetch: offlineFetch(files), scan });
      assert.equal(count, 5, 'HTML modules, their re-exports, and the JavaScript they import');
      assert.deepEqual(Object.keys(integrity), Object.keys(files).sort());
      assert.ok(Object.values(integrity).every((h: any) => h.startsWith('sha384-')));
      const make = (table: Record<string, unknown>, o: Record<string, unknown> = {}) => createRouter({ '*': esmSh() }, { fetch: offlineFetch({ ...registry, ...table }), probe: 'none', ...o });
      const { importMap, lock } = await make(files).build([], { html: { roots: ['https://ui.example/app.html'], scan } });
      assert.deepEqual(importMap.integrity, integrity);
      assert.deepEqual(lock.files, integrity);
      assert.deepEqual(integrityManifest({ importMap }), integrity);
      const tampered = { ...files, 'https://ui.example/icon.html': '<html-export name="ui-icon"><template><img src=x onerror=steal()></template></html-export>' };
      await assert.rejects(make(tampered, { lock }).build([], { html: { roots: ['https://ui.example/app.html'], scan } }), (e) => e.name === 'IntegrityError' && /icon\.html/.test(e.message));
      return `21 ok: ${count} files in the manifest`;
    },
  },
  {
    id: 'desk', title: "The Untrusted Desk's own components, hashed", file: '21-integrity-manifest-for-an-html-modules-graph.mjs',
    async run() {
      // Not a ported example: example 21's htmlGraph() over the REAL html-modules files the Untrusted Desk planet loads
      // (served by this site, so the walk is deterministic). Their <html-import src="@workbench/ui/kit.html"> imports are bare
      // specifiers that resolve through the page's import map, so the walk reports them instead of following them.
      const { htmlGraph } = anyM;
      const base = new URL(`${import.meta.env.BASE_URL}workbench/components/`, location.href).href;
      const roots = ['kit.html', 'notes.html', 'clips.html', 'report.html', 'untrusted/clip.html'].map((f) => base + f);
      const g = await htmlGraph(roots, { scan: scanHTMLModule });
      assert.equal(g.files, 5, 'five component files');
      assert.ok(Object.values(g.integrity).every((h: any) => /^sha384-/.test(h)), 'every file has a sha384 hash');
      assert.ok(g.bare.includes('@workbench/ui/kit.html'), 'the bare @workbench/ui/ imports are reported, not followed');
      return `desk ok: ${g.files} files, bare imports: ${g.bare.join(', ')}`;
    },
  },
];

export const exampleUrl = (file: string) => R + file;
