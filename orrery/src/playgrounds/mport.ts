import type { Playground } from '../registry';
import { readState, writeState, copyLink } from '../state';
import './mport.css';
import * as core from '@johnhenry/mport/core';
import { simFetch, simRespond, sleep, type TraceLike } from './mport-net';
import { PROOFS, exampleUrl } from './mport-proofs';

/* ============================================================================
 * Import Router: @johnhenry/mport, live.
 *
 * Three tabs:
 *   01 Routing           mport's examples/playground.html scenarios (outage, race, circuit breaker, lockfile pinning, prefer,
 *                        a tampered mirror, routing by name, failover at import time) with the timeline, health table and the
 *                        compiled importmap.json / mport.lock.json. Network: simulated (the default: registries and CDNs
 *                        answered in the page, see mport-net.ts) or live (the real CDNs and registries).
 *   02 No-bundler frame  the story mport tells best: build an import map with whole-graph integrity, hash it for a strict CSP,
 *                        and run a Preact + htm app with NO bundler in a srcdoc iframe whose <meta> policy allows the inline
 *                        map only by its hash. Tamper with the map or its hash and the browser refuses it, visibly. Take a CDN
 *                        down or break it and see why an import map can't fall back while router.import() can. The simulated
 *                        CDNs are two same-origin mirrors of Preact and htm under public/mport/cdn/ (real files, real HTTP).
 *   03 Proofs            mport's runnable examples, ported to the page against the fake network, as a pass/fail list.
 *
 * The mport API used is the package's browser entry `@johnhenry/mport/core` (everything but the 1.x default importer).
 * ========================================================================== */

const M = core as any;
const BASE = import.meta.env.BASE_URL;
/** Where the frame's files and the simulated CDN mirrors live (public/mport/), as an absolute URL. */
const fixUrl = () => new URL(`${BASE}mport/`, location.href).href;

type TabId = 'routing' | 'frame' | 'proofs';
const TABS: { id: TabId; num: string; title: string; sub: string }[] = [
  { id: 'routing', num: '01', title: 'Routing', sub: 'scenarios · timeline' },
  { id: 'frame', num: '02', title: 'No-bundler frame', sub: 'import map + strict CSP' },
  { id: 'proofs', num: '03', title: 'Proofs', sub: 'the examples, in-page' },
];
const DEFAULTS = { tab: 'routing', s: 'normal', net: 'sim', cdn: 'up', tamper: 'none' };
type State = typeof DEFAULTS;

const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A tiny DOM builder (the same shape as mport's examples/ui.mjs `h`). */
type Kid = Node | string | number | null | undefined | false | Kid[];
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'className') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const flat = (xs: Kid[]): (Node | string)[] => xs.flatMap((x) => (Array.isArray(x) ? flat(x) : x === null || x === undefined || x === false ? [] : [typeof x === 'number' ? String(x) : x]));
  el.append(...flat(kids));
  return el;
}

/* ============================================================================
 * Timeline, verdicts, cards and the health table: a port of examples/ui.mjs.
 * ========================================================================== */

const legend = () => h('div', { className: 'mp-legend' },
  h('span', {}, h('i', { className: 'k lookup' }), 'registry lookup (range → exact version)'),
  h('span', {}, h('i', { className: 'k ok' }), 'CDN answered'),
  h('span', {}, h('i', { className: 'k fail' }), 'CDN failed'),
  h('span', {}, h('i', { className: 'k aborted' }), 'cancelled / lost the race'),
  h('span', {}, h('i', { className: 'k skip' }), 'skipped without asking (reason shown)'));

function healthRows(snapshot: Record<string, any>): HTMLTableRowElement[] {
  const rows = Object.entries(snapshot);
  const now = performance.now();
  return rows.length ? rows.map(([name, s]) => h('tr', { 'data-provider': name },
    h('td', {}, name), h('td', {}, s.ok), h('td', {}, s.fail),
    h('td', {}, s.latency != null ? `${Math.round(s.latency)} ms` : '—'),
    h('td', { className: s.healthy ? 'closed' : 'open' }, s.healthy ? 'closed' : `open · ${Math.max(0, Math.ceil((s.openUntil - now) / 1000))}s`)))
    : [h('tr', {}, h('td', { colspan: 5, className: 'hint' }, 'No requests yet.'))];
}

function timeline(trace: TraceLike[], t0: number) {
  interface Bar { type: string; start: number; end: number; label: string }
  const lanes = new Map<string, { bars: Bar[]; skips: string[] }>();
  const lane = (p: string) => lanes.get(p) ?? lanes.set(p, { bars: [], skips: [] }).get(p)!;
  const open = new Map<string, TraceLike>();
  for (const e of trace) {
    if (e.type === 'probe' || e.type === 'lookup') open.set(`${e.provider} ${e.url}`, e);
    else if (e.type === 'skip') lane(e.provider).skips.push(e.reason ?? '');
    else if (e.cached) lane(e.provider).bars.push({ type: 'ok', start: (e.at ?? t0) - t0, end: (e.at ?? t0) - t0, label: 'cache hit' });
    else {
      const start = open.get(`${e.provider} ${e.url}`);
      open.delete(`${e.provider} ${e.url}`);
      const label = e.type === 'resolved' ? `→ ${e.version} ${Math.round(e.ms ?? 0)}ms`
        : e.type === 'selected' ? 'selected (probe: none)'
        : e.reason ? `${e.type}: ${e.reason}` : `${e.type}${e.phase ? `/${e.phase}` : ''} ${Math.round(e.ms ?? 0)}ms`;
      lane(e.provider).bars.push({ type: e.phase === 'integrity' || e.phase === 'import' ? 'fail' : e.type, start: (start?.at ?? e.at ?? t0) - t0, end: (e.at ?? t0) - t0, label });
    }
  }
  for (const [, e] of open) lane(e.provider).bars.push({ type: 'pending', start: (e.at ?? t0) - t0, end: performance.now() - t0, label: '…' });
  const max = Math.max(50, ...[...lanes.values()].flatMap((l) => l.bars.map((b) => b.end)));
  return h('div', { className: 'mp-tl' },
    h('div', { className: 'mp-timeline' }, [...lanes].map(([who, l]) => h('div', { className: 'lane', 'data-lane': who },
      h('div', { className: 'who', title: who }, who),
      h('div', { className: 'track' },
        l.bars.length === 0 && l.skips.length ? h('div', { className: 'bar skip', title: l.skips.join('; ') }) : null,
        l.bars.map((b, i) => h('div', {
          className: `bar ${b.type}`, title: l.bars.map((x) => x.label).join(' → '),
          style: { left: `${(Math.max(0, b.start) / max) * 80}%`, width: `${Math.max(0.6, ((b.end - b.start) / max) * 80)}%` },
        }, i === l.bars.length - 1 ? h('span', {}, l.bars.length > 1 ? l.bars.map((x) => x.label.split(' ')[0]).join(' → ') : b.label) : null)),
        l.skips.length && l.bars.length === 0 ? h('span', { className: 'skipreason', title: l.skips.join('\n') }, `skipped: ${l.skips[0]}`) : null)))),
    h('div', { className: 'axis' }, h('span', {}, '0 ms'), h('span', {}, `${Math.round(max)} ms`)));
}

const short = (text = '') => text.replace(/^[^:]+: /, '').replace(/ \(use an ESM.*$/, '').replace(/^mport: /, '');
function verdict(spec: string, r: any, err: any): { good: boolean; text: string } {
  const trace: TraceLike[] = r?.trace ?? err?.trace ?? [];
  const by = (type: string) => [...new Set(trace.filter((e) => e.type === type).map((e) => e.provider))].filter((p) => !/registry$/.test(p));
  const skipped = trace.filter((e) => e.type === 'skip');
  const phased = (phase: string) => [...new Set(trace.filter((e) => e.type === 'fail' && e.phase === phase).map((e) => e.provider))];
  const tampered = phased('integrity');
  const importFailed = phased('import');
  const failed = by('fail').filter((p) => trace.some((e) => e.type === 'fail' && e.provider === p && !e.phase));
  const lost = trace.filter((e) => e.type === 'aborted').map((e) => e.provider);
  const why = (p: string) => short(skipped.find((e) => e.provider === p)?.reason);
  if (err) {
    if (err.name === 'ResolutionError') {
      const cause = /may not exist|not found/.test(err.message) ? 'the package may not exist, or the registry is unreachable' : /satisfies/.test(err.message) ? 'no published version matches that range' : 'the registry lookup failed';
      return { good: false, text: `✗ Couldn't turn "${spec}" into an exact version: ${cause}. No CDN was asked.` };
    }
    const cjs = skipped.filter((e) => /CommonJS/.test(e.reason ?? ''));
    if (cjs.length && cjs.length + failed.length >= (err.errors?.length ?? 0)) {
      return { good: false, text: `✗ No CDN left can serve it. ${failed.length ? `${failed.join(', ')} failed; ` : ''}${cjs.map((e) => e.provider).join(' and ')} only serve raw files, and this package ships CommonJS, which browsers can't import.` };
    }
    return { good: false, text: `✗ Every CDN was ruled out: ${[...failed.map((p) => `${p} failed`), ...skipped.map((e) => `${e.provider} skipped (${short(e.reason)})`)].join('; ')}.` };
  }
  if (!r) return { good: false, text: 'No route matched, so mport leaves this specifier to the browser.' };
  const parts: string[] = [];
  const pinned = !trace.some((e) => e.type === 'lookup') && r.range && !/^\d+\.\d+\.\d+/.test(r.range);
  if (pinned) parts.push(`version ${r.version} came from the lockfile, with no registry lookup`);
  for (const e of skipped) if (!(e.reason === 'excluded' && importFailed.includes(e.provider))) parts.push(`${e.provider} skipped (${why(e.provider)})`);
  if (failed.length) parts.push(`${failed.join(', ')} failed`);
  if (tampered.length) parts.push(`${tampered.join(', ')} rejected: its bytes didn't match the lockfile's hash`);
  if (importFailed.length) parts.push(`${importFailed.join(', ')} passed the check but its import failed, so it was excluded and the next CDN used`);
  if (lost.length) parts.push(`beat ${[...new Set(lost)].join(', ')} in a race`);
  if (r.integrity) parts.push(`bytes verified (${String(r.integrity).slice(0, 14)}…)`);
  const how = trace.some((e) => e.type === 'selected') ? 'picked (not checked, probe: none)' : 'served';
  return { good: true, text: `✓ ${how} by ${r.provider}${parts.length ? ': ' + parts.join('; ') : ''}.` };
}

function card(spec: string, r: any, err: any, t0: number) {
  const trace: TraceLike[] = r?.trace ?? err?.trace ?? [];
  const v = verdict(spec, r, err);
  const meta = r ? `${r.version ? `v${r.version} · ` : ''}${r.provider}${r.build ? ` (${r.build})` : ''}${r.cached ? ' · cached' : ''}${r.integrity ? ` · ${String(r.integrity).slice(0, 22)}…` : ''}` : null;
  return h('div', { className: 'mp-card', 'data-spec': spec, 'data-provider': r?.provider ?? '', 'data-ok': String(!!r && !err) },
    h('h4', {}, spec),
    h('div', { className: `verdict ${v.good ? 'good' : 'bad'}` }, v.text),
    r ? h('div', { className: 'meta' }, meta, h('br'), h('code', {}, r.base ?? r.url ?? '')) : null,
    err ? h('pre', { className: 'mp-err' }, `${err.name}: ${err.message}${err.errors ? '\n' + err.errors.map((e: Error) => `  · ${e.message}`).join('\n') : ''}`) : null,
    trace.length ? timeline(trace, t0) : null);
}

/* ============================================================================
 * 01 Routing: the playground's scenarios.
 * ========================================================================== */

interface Prov { id: 'esmSh' | 'jsDelivr' | 'unpkg' | 'jspm'; label: string; make: () => any; host: string; build: string; weight: number }
const PROVIDERS: Prov[] = [
  { id: 'esmSh', label: 'esm.sh', make: () => M.esmSh(), host: 'esm.sh', build: 'esm.sh', weight: 3 },
  { id: 'jsDelivr', label: 'jsDelivr', make: () => M.jsDelivr(), host: 'cdn.jsdelivr.net', build: 'npm', weight: 5 },
  { id: 'unpkg', label: 'unpkg', make: () => M.unpkg(), host: 'unpkg.com', build: 'npm', weight: 1 },
  { id: 'jspm', label: 'jspm', make: () => M.jspm(), host: 'ga.jspm.io', build: 'jspm', weight: 1 },
];
interface PState { on: boolean; down: boolean; latency: number; tamper: boolean; breakImports: boolean }
interface Settings { specs: string[]; strategy: 'fallback' | 'race' | 'adaptive' | 'prefer' | 'verified'; target: string; probe: string; jsrRoute: boolean; litRoute: boolean; cb: [number, number]; pin: boolean; providers: Partial<Record<Prov['id'], Partial<PState>>> }
type Results = Map<string, { r?: any; err?: any }>;
interface Ctx {
  runs: any[];
  run(label: string, o?: { fresh?: boolean }): Promise<Results>;
  importRun(spec: string, describe: (mod: any) => string): Promise<{ events: TraceLike[]; module?: any; provider?: string; error?: any }>;
  settings: Settings;
  pstate: Record<Prov['id'], PState>;
  setTarget(t: string): void;
  showTab(t: 'map' | 'lock'): void;
}
interface Scenario { id: string; title: string; blurb: string; what: string; notice: string[]; code: string; steps(ctx: Ctx): Promise<void>; checks(ctx: Ctx): [string, boolean][] }

const ALL_UP: Settings['providers'] = { esmSh: {}, jsDelivr: {}, unpkg: {}, jspm: { on: false } };
const served = (res: Results | undefined, spec: string) => res?.get(spec)?.r?.provider;
const traceOf = (res: Results | undefined, spec: string): TraceLike[] => res?.get(spec)?.r?.trace ?? res?.get(spec)?.err?.trace ?? [];
const has = (res: Results | undefined, spec: string, pred: (e: TraceLike) => boolean) => traceOf(res, spec).some(pred);

const SCENARIOS: Scenario[] = [
  {
    id: 'normal', title: "Everything's up", blurb: 'The baseline: what a normal resolution looks like.',
    code: 'const router = createRouter({ "*": [esmSh(), jsDelivr(), unpkg()] }); // array = fallback: try in order\nconst { importMap, lock } = await router.build(["react@^19", "preact@^10/hooks", "lit@^3"]);',
    what: 'All CDNs are healthy. The router tries them in order (<code>fallback</code>): esm.sh, then jsDelivr, then unpkg.',
    notice: [
      'Each package starts with a registry lookup (blue): the range, e.g. <code>^19</code>, becomes an exact version.',
      'Then the first CDN in order is asked (green) and answers, so nothing else is tried.',
      'The import map below maps each bare name to the chosen URL. That is all the browser needs.',
    ],
    async steps(ctx) { ctx.runs.push(await ctx.run('Resolve with every CDN up')); },
    checks: ({ runs: [a] }) => [
      ['Every package was served by esm.sh, the first CDN in the list', ['react@^19', 'preact@^10/hooks', 'lit@^3'].every((s) => served(a, s) === 'esm.sh')],
      ["Each package's version came from a registry lookup", ['react@^19', 'lit@^3'].every((s) => has(a, s, (e) => e.type === 'resolved'))],
    ],
  },
  {
    id: 'namespace', title: 'Route by package name', blurb: 'Different packages from different places, compiled to an import map.',
    code: 'const router = createRouter({\n  "*": esmSh(),                   // everything else\n  "@std/*": jsr(),                // the Deno standard library comes from JSR\n  "lit*": [jsDelivr(), esmSh()],  // Lit: raw files if possible\n});\nconst { importMap, lock } = await router.build(["preact@^10", "@std/path@^1", "lit@^3/"]);',
    what: 'Routes are matched by package name, most specific first: <code>@std/*</code> goes to JSR, <code>lit*</code> to jsDelivr (then esm.sh), and everything else to esm.sh. The result compiles to a standard import map and a lockfile (see the output tabs).',
    notice: [
      '<b>@std/path</b> is a JSR package: the lookup goes to the JSR registry, and the lockfile entry says <code>"registry": "jsr"</code>.',
      '<b>lit/</b> ends in <code>/</code>, so the import map gets a <em>prefix</em> mapping: <code>import "lit/decorators.js"</code> works too.',
      "The import map is all a browser needs; mport isn't involved when the page imports.",
    ],
    async steps(ctx) {
      ctx.settings.specs = ['preact@^10', '@std/path@^1', 'lit@^3/'];
      ctx.settings.litRoute = true;
      ctx.runs.push(await ctx.run('Resolve three packages from three places'));
      ctx.showTab('map');
    },
    checks: ({ runs: [a] }) => [
      ['preact → esm.sh (the catch-all route)', served(a, 'preact@^10') === 'esm.sh'],
      ['@std/path → JSR, recorded with registry "jsr"', served(a, '@std/path@^1') === 'jsr' && a.get('@std/path@^1').r.registry === 'jsr'],
      ['lit/ → esm.sh, as a prefix mapping (jsDelivr skipped: Lit has an exports map)', served(a, 'lit@^3/') === 'esm.sh' && a.get('lit@^3/').r.key === 'lit/'],
    ],
  },
  {
    id: 'outage', title: 'A CDN goes down', blurb: 'esm.sh is unreachable. Who takes over?',
    code: '// same router; esm.sh is unreachable\nconst router = createRouter({ "*": [esmSh(), jsDelivr(), unpkg()] });\nawait router.resolve("preact@^10/hooks"); // → jsDelivr (Preact ships ES modules)\nawait router.resolve("react@^19");        // ✗ RoutingError: React ships only CommonJS\n// opt out of the CommonJS check: createRouter(routes, { allowCommonJS: true })',
    what: 'esm.sh is down, so the router falls through to the next CDN. But jsDelivr and unpkg serve package files exactly as published, while esm.sh converts them to browser-ready ES modules.',
    notice: [
      '<b>preact/hooks</b> and <b>lit</b> are fine: they publish ES modules, so jsDelivr can serve them as they are.',
      "<b>react</b> fails: it publishes only CommonJS, which browsers can't import. jsDelivr and unpkg are skipped (hatched) instead of returning a URL that would break at import time.",
      "The health table counts esm.sh's failures; keep resolving and its circuit opens (see the circuit breaker scenario).",
    ],
    async steps(ctx) { ctx.pstate.esmSh.down = true; ctx.runs.push(await ctx.run('Resolve with esm.sh down')); },
    checks: ({ runs: [a] }) => [
      ['preact/hooks was served by jsDelivr after esm.sh failed', served(a, 'preact@^10/hooks') === 'jsdelivr' && has(a, 'preact@^10/hooks', (e) => e.type === 'fail' && e.provider === 'esm.sh')],
      ["react failed, and the raw-file CDNs were skipped because it's CommonJS", !served(a, 'react@^19') && has(a, 'react@^19', (e) => e.type === 'skip' && /CommonJS/.test(e.reason ?? ''))],
    ],
  },
  {
    id: 'runtime', title: 'Retry at import time', blurb: 'A CDN answers the check, then the import fails.',
    code: 'const router = createRouter({ "*": [esmSh(), jsDelivr(), unpkg()] });\nconst { nanoid } = await router.import("nanoid@^5", { onEvent: console.log });\n// If the chosen URL fails to import, that CDN is excluded and the next one is used.\nnanoid();',
    what: '<code>router.import()</code> resolves <em>and</em> imports. Here esm.sh answers mport\'s availability check but the import itself fails ("break imports"), which an import map can\'t recover from: the browser has no fallback hook. <code>router.import()</code> can.',
    notice: [
      'esm.sh is chosen first (its probe succeeds), then the import fails (red, "import").',
      'esm.sh is excluded for this import and the next CDN, jsDelivr, is used.',
      'The module really runs: the step shows an id generated by the imported <code>nanoid()</code>.',
    ],
    async steps(ctx) {
      ctx.settings.specs = ['nanoid@^5'];
      ctx.pstate.esmSh.breakImports = true;
      ctx.runs.push(await ctx.importRun('nanoid@^5', (mod) => `nanoid() → ${mod.nanoid()}`));
    },
    checks: ({ runs: [a] }) => [
      ["esm.sh's import failed at runtime", a.events.some((e: TraceLike) => e.type === 'fail' && e.phase === 'import' && e.provider === 'esm.sh')],
      ['jsDelivr served it and the module ran', a.provider === 'jsdelivr' && typeof a.module?.nanoid === 'function'],
    ],
  },
  {
    id: 'race', title: 'Race: fastest wins', blurb: 'Ask every CDN at once; use whichever answers first.',
    code: 'const router = createRouter({ "*": race(esmSh(), jsDelivr(), unpkg()) });\nconst r = await router.resolve("lit@^3");\nr.provider; // the first CDN to answer; the others are cancelled (r.trace shows it)',
    what: 'The strategy is <code>race()</code>: all CDNs are asked at the same time. jsDelivr gets +900 ms of simulated latency and unpkg +500 ms, so esm.sh should win.',
    notice: [
      'All three CDN bars start at the same moment.',
      'The first to answer wins; the others are cancelled (faded), so a slow CDN costs nothing.',
      "A single CDN failing fast doesn't lose the race: the first <em>success</em> wins.",
    ],
    async steps(ctx) {
      Object.assign(ctx.settings, { strategy: 'race', specs: ['preact@^10/hooks', 'lit@^3'] });
      ctx.pstate.jsDelivr.latency = 900;
      ctx.pstate.unpkg.latency = 500;
      ctx.runs.push(await ctx.run('Race with jsDelivr and unpkg slowed down'));
    },
    checks: ({ runs: [a] }) => [
      ['esm.sh won both races', served(a, 'preact@^10/hooks') === 'esm.sh' && served(a, 'lit@^3') === 'esm.sh'],
      ['The slower CDNs were cancelled', has(a, 'lit@^3', (e) => e.type === 'aborted')],
    ],
  },
  {
    id: 'breaker', title: 'Circuit breaker', blurb: 'Stop asking a CDN that keeps failing.',
    code: 'const router = createRouter({ "*": [esmSh(), jsDelivr(), unpkg()] }, {\n  circuitBreaker: { failures: 2, reset: "10s" }, // skip a CDN after 2 failures in a row, for 10 s\n});\nrouter.health.snapshot(); // per-CDN ok / fail / latency / circuit state',
    what: 'esm.sh is down. The circuit breaker opens after 2 failures in a row and stays open for 10 seconds. The scenario resolves three times with the same router health.',
    notice: [
      'Runs 1 and 2: esm.sh is asked, fails, and the router moves on to jsDelivr.',
      'Run 3: esm.sh is skipped with "circuit open": no request is sent, so users don\'t wait for a timeout.',
      'Watch the health table: the circuit shows open with a countdown. After it expires, esm.sh gets one more chance.',
    ],
    async steps(ctx) {
      Object.assign(ctx.settings, { specs: ['lit@^3'], cb: [2, 10], pin: false });
      ctx.pstate.esmSh.down = true;
      for (let i = 1; i <= 3; i++) ctx.runs.push(await ctx.run(`Run ${i}`, { fresh: i === 1 }));
    },
    checks: ({ runs }) => [
      ['Runs 1 and 2 asked esm.sh and it failed', runs.slice(0, 2).every((r) => has(r, 'lit@^3', (e) => e.type === 'fail' && e.provider === 'esm.sh'))],
      ['Run 3 skipped esm.sh without asking (circuit open)', has(runs[2], 'lit@^3', (e) => e.type === 'skip' && e.provider === 'esm.sh' && /circuit open/.test(e.reason ?? ''))],
      ['lit was still served every time (by jsDelivr)', runs.every((r) => served(r, 'lit@^3') === 'jsdelivr')],
    ],
  },
  {
    id: 'pinning', title: 'Same version, different mirror', blurb: 'A lockfile keeps the exact version and build.',
    code: 'const first = createRouter({ "*": [jsDelivr(), unpkg()] });\nconst { lock } = await first.build(["preact@^10/hooks", "lit@^3"]); // save as mport.lock.json\n\nconst next = createRouter({ "*": [esmSh(), jsDelivr(), unpkg()] }, { lock });\nawait next.resolve("lit@^3"); // same version, no registry lookup; only same-build mirrors may serve it',
    what: 'Run 1 resolves with esm.sh switched off, so jsDelivr serves the raw npm files and the lockfile records version + build. Then jsDelivr goes down, esm.sh comes back, and run 2 reuses that lockfile.',
    notice: [
      'Run 2 does no registry lookup: the version comes from the lockfile.',
      'esm.sh is skipped even though it\'s up: it serves a <em>different build</em> (converted code), and the lock says "npm" (raw files).',
      'jsDelivr fails, so unpkg, which serves the same raw files, takes over. Same version, same bytes, different mirror.',
    ],
    async steps(ctx) {
      ctx.settings.specs = ['preact@^10/hooks', 'lit@^3'];
      ctx.pstate.esmSh.on = false;
      ctx.runs.push(await ctx.run('Run 1: jsDelivr serves, lockfile recorded'));
      ctx.pstate.esmSh.on = true;
      ctx.pstate.jsDelivr.down = true;
      ctx.runs.push(await ctx.run('Run 2: jsDelivr down, esm.sh back, same lockfile', { fresh: false }));
    },
    checks: ({ runs: [a, b] }) => [
      ['Run 2 skipped the registry lookup (version from the lockfile)', !has(b, 'lit@^3', (e) => e.type === 'lookup')],
      ['esm.sh was skipped as a different build', has(b, 'lit@^3', (e) => e.type === 'skip' && e.provider === 'esm.sh' && /locked to "npm"/.test(e.reason ?? ''))],
      ['unpkg served the same version jsDelivr served in run 1', served(b, 'lit@^3') === 'unpkg' && b.get('lit@^3').r.version === a.get('lit@^3').r.version],
    ],
  },
  {
    id: 'prefer', title: 'Pick by capability', blurb: 'Browser-ready code or raw files, per request.',
    code: 'const router = createRouter({ "*": prefer({ browser: esmSh(), raw: fallback(jsDelivr(), unpkg()) }) });\nawait router.resolve("lit@^3", { target: "browser" }); // → esm.sh\nawait router.resolve("lit@^3", { target: "raw" });     // → jsDelivr',
    what: '<code>prefer({ browser: esmSh(), raw: fallback(jsDelivr(), unpkg()) })</code> chooses a CDN by what the caller needs. The scenario resolves once with target "browser" and once with target "raw".',
    notice: [
      'Target "browser" goes to esm.sh (converted, ready to import).',
      'Target "raw" goes to jsDelivr (the files exactly as published, e.g. for a bundler or a lockfile audit).',
      'Same package, same version, different artifact. The steps list shows both results; the cards show the last run.',
    ],
    async steps(ctx) {
      Object.assign(ctx.settings, { strategy: 'prefer', specs: ['preact@^10/hooks', 'lit@^3'] });
      ctx.runs.push(await ctx.run('target: browser'));
      ctx.setTarget('raw');
      ctx.runs.push(await ctx.run('target: raw'));
    },
    checks: ({ runs: [a, b] }) => [
      ['target "browser" → esm.sh', served(a, 'lit@^3') === 'esm.sh'],
      ['target "raw" → jsDelivr, same version', served(b, 'lit@^3') === 'jsdelivr' && a.get('lit@^3').r.version === b.get('lit@^3').r.version],
    ],
  },
  {
    id: 'integrity', title: 'Tampered mirror', blurb: 'Reject a CDN that serves different bytes.',
    code: 'const router = createRouter({ "*": race(verified(jsDelivr()), verified(unpkg())) }, { lock });\nconst r = await router.resolve("lit@^3"); // a mirror whose bytes don\'t match lock\'s hash is rejected\nr.integrity;                              // "sha384-…", also emitted in the import map\'s "integrity"',
    what: "Run 1 records each file's SRI hash in the lockfile (esm.sh off; jsDelivr and unpkg race, each wrapped in <code>verified()</code>). Then jsDelivr starts serving tampered bytes, and is made the fastest.",
    notice: [
      'Run 2: jsDelivr answers first, but its bytes don\'t match the hash in the lockfile, so it\'s rejected (red, "integrity").',
      "unpkg serves the genuine file, which matches, so it's used.",
      'The import map carries the hashes too (<code>integrity</code>), so browsers enforce them on their own.',
    ],
    async steps(ctx) {
      Object.assign(ctx.settings, { strategy: 'verified', specs: ['lit@^3'] });
      ctx.pstate.esmSh.on = false;
      ctx.runs.push(await ctx.run('Run 1: record hashes'));
      Object.assign(ctx.pstate.jsDelivr, { tamper: true, latency: 0 });
      ctx.pstate.unpkg.latency = 400;
      ctx.runs.push(await ctx.run('Run 2: jsDelivr tampered (and fastest)', { fresh: false }));
    },
    checks: ({ runs: [a, b] }) => [
      ['Run 1 recorded an SRI hash', Boolean(a.get('lit@^3').r?.integrity)],
      ["Run 2 rejected jsDelivr's tampered bytes", has(b, 'lit@^3', (e) => e.type === 'fail' && e.provider === 'jsdelivr' && e.phase === 'integrity')],
      ["unpkg's genuine file was used, with the recorded hash", served(b, 'lit@^3') === 'unpkg' && b.get('lit@^3').r.integrity === a.get('lit@^3').r.integrity],
    ],
  },
];

const ROUTING_EXPLAIN = `Each scenario is a real <code>createRouter()</code> with real strategies (<code>fallback</code>, <code>race</code>, <code>prefer</code>, <code>verified</code>, the circuit breaker, a lockfile); only the network is staged. Outages, latency, tampered bytes and broken imports are a <code>fetch</code> and an <code>importer</code> wrapper passed to <code>createRouter({ fetch, importer })</code>, exactly as mport's own playground does. With <b>Network: simulated</b> (the default) the npm and JSR registries and the four CDNs are answered in the page from fixtures shaped like the real endpoints, so every run is the same and nothing leaves the browser; with <b>live</b> the registry lookups and CDN requests are real. The timeline is the resolution's <code>trace</code>; the health table is <code>router.health.snapshot()</code>; the output is <code>compileImportMap()</code> and <code>router.lock.toJSON()</code>.`;

/* ============================================================================
 * The planet
 * ========================================================================== */

async function mountMport(host: HTMLElement): Promise<() => void> {
  const disposers: (() => void)[] = [];
  let disposed = false;
  const on = (el: EventTarget, ev: string, fn: (e: any) => void) => { el.addEventListener(ev, fn); disposers.push(() => el.removeEventListener(ev, fn)); };
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

  const state = readState(DEFAULTS) as State;
  if (!TABS.some((t) => t.id === state.tab)) state.tab = DEFAULTS.tab;
  if (!SCENARIOS.some((s) => s.id === state.s)) state.s = DEFAULTS.s;
  if (!['sim', 'live'].includes(state.net)) state.net = DEFAULTS.net;
  if (!['up', 'down', 'broken'].includes(state.cdn)) state.cdn = DEFAULTS.cdn;
  if (!['none', 'hash', 'map', 'file'].includes(state.tamper)) state.tamper = DEFAULTS.tamper;
  const persist = () => writeState({ ...state }, DEFAULTS);

  const root = h('div', { className: 'pg-mport', 'data-tab': state.tab });
  host.append(root);
  root.innerHTML = `
    <div class="mp-top">
      <div class="mp-tabs" role="tablist">
        ${TABS.map((t) => `<button class="mp-tab" role="tab" type="button" data-tab="${t.id}" aria-selected="false"><span class="num">${t.num}</span><span class="tt">${t.title}</span><span class="sub">${t.sub}</span></button>`).join('')}
      </div>
      <div class="mp-tools">
        <div class="mp-net" role="group" aria-label="Network">
          <span class="lbl">network</span>
          <button type="button" data-net="sim" title="Registries and CDNs answered in the page from fixtures: deterministic, offline">simulated</button>
          <button type="button" data-net="live" title="The real npm/JSR registries and CDNs">live</button>
        </div>
        <button class="btn mp-copy" type="button">copy link</button>
      </div>
    </div>
    <section class="mp-body"></section>
    <details class="panel mp-explain" open><summary>What's happening</summary><div class="mp-explain-body"></div></details>`;
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const body = $('.mp-body');
  const explain = $('.mp-explain-body');
  const tabBtns = [...root.querySelectorAll<HTMLButtonElement>('.mp-tab')];
  const netBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-net]')];

  let tabCleanup: (() => void) | null = null;
  let tabToken = 0;

  function paintChrome() {
    root.dataset.tab = state.tab;
    root.dataset.network = state.net;
    tabBtns.forEach((b) => { const sel = b.dataset.tab === state.tab; b.classList.toggle('on', sel); b.setAttribute('aria-selected', String(sel)); });
    netBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.net === state.net)));
    $<HTMLElement>('.mp-net').hidden = state.tab === 'proofs';
  }

  function switchTab(tab: TabId) {
    state.tab = tab;
    tabToken++;
    if (tabCleanup) { try { tabCleanup(); } catch {} tabCleanup = null; }
    body.replaceChildren();
    paintChrome();
    persist();
    const token = tabToken;
    const alive = () => !disposed && token === tabToken;
    if (tab === 'routing') tabCleanup = mountRouting(body, alive);
    else if (tab === 'frame') tabCleanup = mountFrame(body, alive);
    else tabCleanup = mountProofs(body, alive);
  }

  tabBtns.forEach((b) => on(b, 'click', () => switchTab(b.dataset.tab as TabId)));
  netBtns.forEach((b) => on(b, 'click', () => {
    if (state.net === b.dataset.net) return;
    state.net = b.dataset.net as 'sim' | 'live';
    switchTab(state.tab as TabId);
  }));
  const copyBtn = $('.mp-copy');
  on(copyBtn, 'click', async () => {
    persist();
    await sleep(180);
    await copyLink();
    copyBtn.textContent = 'copied ✓';
    later(() => { copyBtn.textContent = 'copy link'; }, 1400);
  });

  /* ------------------------------------------------------------------ 01 Routing */

  function mountRouting(el: HTMLElement, alive: () => boolean): () => void {
    const local: (() => void)[] = [];
    const lon = (t: EventTarget, ev: string, fn: (e: any) => void) => { t.addEventListener(ev, fn); local.push(() => t.removeEventListener(ev, fn)); };
    const live = state.net === 'live';
    explain.innerHTML = ROUTING_EXPLAIN;

    const scenBox = h('div', { className: 'mp-scenarios', role: 'group', 'aria-label': 'scenarios' });
    const scenPanel = h('section', { className: 'panel mp-scenario' });
    const provBox = h('div', { className: 'mp-provs' });
    const healthBody = h('tbody', {}, healthRows({}));
    const cards = h('div', { className: 'mp-cards' });
    const outTabs = h('div', { className: 'mp-outtabs', role: 'tablist' },
      h('button', { type: 'button', role: 'tab', 'data-out': 'map', 'aria-selected': 'true' }, 'importmap.json'),
      h('button', { type: 'button', role: 'tab', 'data-out': 'lock', 'aria-selected': 'false' }, 'mport.lock.json'));
    const outPre = h('pre', { className: 'code mp-out', 'data-out-view': 'map' }, 'Run a scenario to see the output.');
    el.append(
      live ? h('p', { className: 'mp-banner live' }, h('b', {}, 'Live network. '), 'Registry lookups and CDN requests are real; only the outages, latency, tampering and broken imports are staged. Results depend on the real CDNs right now.')
        : h('p', { className: 'mp-banner' }, h('b', {}, 'Simulated network. '), 'The npm and JSR registries and esm.sh, jsDelivr, unpkg and jspm are answered in the page from fixtures. Deterministic and offline; switch to live for the real CDNs.'),
      scenBox, scenPanel,
      h('div', { className: 'mp-results' },
        h('div', { className: 'mp-col' },
          h('section', { className: 'panel' }, h('h3', {}, 'Providers ', h('span', { className: 'stat' }, 'as the scenario set them')), provBox),
          h('section', { className: 'panel' }, h('h3', {}, 'Health ', h('span', { className: 'stat' }, h('code', {}, 'router.health.snapshot()'))),
            h('table', { className: 'mp-health' }, h('thead', {}, h('tr', {}, ['provider', 'ok', 'fail', 'latency', 'circuit'].map((c) => h('th', {}, c)))), healthBody)),
          h('section', { className: 'panel' }, outTabs, outPre)),
        h('div', { className: 'mp-col' }, legend(), cards)));

    let settings!: Settings;
    const pstate = Object.fromEntries(PROVIDERS.map((p) => [p.id, { on: true, down: false, latency: 0, tamper: false, breakImports: false }])) as Record<Prov['id'], PState>;
    function apply(s: Partial<Settings> = {}) {
      settings = { specs: ['react@^19', 'preact@^10/hooks', 'lit@^3'], strategy: 'fallback', target: 'browser', probe: 'head', jsrRoute: true, litRoute: false, cb: [2, 15], pin: true, providers: ALL_UP, ...s };
      for (const p of PROVIDERS) Object.assign(pstate[p.id], { on: true, down: false, latency: 0, tamper: false, breakImports: false }, settings.providers[p.id] ?? { on: false });
    }
    const paintProviders = () => provBox.replaceChildren(...PROVIDERS.map((p) => {
      const s = pstate[p.id];
      const tags = [!s.on && 'off', s.down && 'outage', s.latency && `+${s.latency} ms`, s.tamper && 'tampered bytes', s.breakImports && 'imports break'].filter(Boolean) as string[];
      return h('div', { className: `prov${s.on ? '' : ' off'}${s.down || s.tamper || s.breakImports ? ' bad' : ''}`, 'data-prov': p.id },
        h('b', {}, p.label), h('span', { className: 'build' }, `build ${p.build}`), h('span', { className: 'tags' }, tags.length ? tags.join(' · ') : 'healthy'));
    }));

    // The network every router in this tab talks to: the simulated internet or the real one, then the scenario's staging on top.
    const baseFetch = (url: string, init?: RequestInit) => (live ? fetch(url, init) : simFetch(url, init));
    const provOf = (url: string) => { try { const host = new URL(url).host; return PROVIDERS.find((p) => p.host === host); } catch { return undefined; } };
    const stagedFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input instanceof Request ? input.url : input);
      const p = provOf(url);
      if (p) {
        const s = pstate[p.id];
        if (s.latency) await sleep(s.latency, init.signal);
        if (s.down) throw new TypeError(`simulated outage: ${p.host}`);
        if (s.tamper && (init.method ?? 'GET') === 'GET') {
          const res = await baseFetch(url, init);
          return new Response(`${await res.text()}\n/* tampered by a simulated compromised mirror */`, { status: res.status, headers: res.headers });
        }
      }
      return baseFetch(url, init);
    };
    // import() through the same staging: an outage or "break imports" makes the import itself fail.
    const stagedImport = async (url: string) => {
      const p = provOf(url);
      if (p && (pstate[p.id].down || pstate[p.id].breakImports)) throw new TypeError(`Failed to fetch dynamically imported module: ${url} (simulated)`);
      if (live) return import(/* @vite-ignore */ url);
      const hit = simRespond(url);
      if (!hit || hit.status !== 200) throw new TypeError(`Failed to fetch dynamically imported module: ${url}`);
      const blob = URL.createObjectURL(new Blob([hit.body], { type: 'text/javascript' }));
      try { return await import(/* @vite-ignore */ blob); } finally { URL.revokeObjectURL(blob); }
    };

    const enabled = () => PROVIDERS.filter((p) => pstate[p.id].on);
    function makeRouter(previous?: any) {
      const nodes = enabled().map((p) => p.make());
      if (!nodes.length && settings.strategy !== 'prefer') throw new Error('Enable at least one provider.');
      const star = ({
        fallback: () => M.fallback(...nodes),
        race: () => M.race(...nodes),
        adaptive: () => M.adaptive(...enabled().map((p) => M.weighted(p.make(), p.weight))),
        prefer: () => M.prefer({ browser: M.esmSh(), raw: M.fallback(M.jsDelivr(), M.unpkg()) }),
        verified: () => M.race(...nodes.map((n) => M.verified(n))),
      } as Record<string, () => any>)[settings.strategy]();
      const routes: Record<string, any> = { '*': star };
      if (settings.jsrRoute) routes['@std/*'] = M.jsr();
      if (settings.litRoute) routes['lit*'] = [M.jsDelivr(), M.esmSh()];
      return M.createRouter(routes, {
        fetch: stagedFetch, importer: stagedImport, probe: settings.probe, target: settings.target, now: () => performance.now(),
        circuitBreaker: { failures: settings.cb[0], reset: `${settings.cb[1]}s` },
        health: previous?.health,
        lock: previous && settings.pin ? previous.lock.toJSON() : undefined,
      });
    }

    let router: any = null;
    const outputs = { map: '', lock: '' };
    let outView: 'map' | 'lock' = 'map';
    const showOut = (v: 'map' | 'lock') => {
      outView = v;
      outTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.out === v)));
      outPre.dataset.outView = v;
      outPre.textContent = outputs[v] || 'Run a scenario to see the output.';
    };
    outTabs.querySelectorAll<HTMLButtonElement>('button').forEach((b) => lon(b, 'click', () => showOut(b.dataset.out as 'map' | 'lock')));
    const paintHealth = () => { if (router) healthBody.replaceChildren(...healthRows(router.health.snapshot())); };
    const healthTimer = window.setInterval(() => { if (alive()) paintHealth(); }, 1000);
    local.push(() => clearInterval(healthTimer));

    const settle = live ? 1600 : 250;
    async function run({ fresh }: { fresh: boolean }): Promise<Results> {
      router = makeRouter(fresh ? undefined : router);
      paintProviders();
      const list = settings.specs;
      const t0 = performance.now();
      const results: Results = new Map(list.map((s) => [s, {}]));
      const paint = () => {
        if (!alive()) return;
        cards.replaceChildren(...list.map((s) => {
          const { r, err } = results.get(s)!;
          return r === undefined && !err ? h('div', { className: 'mp-card' }, h('h4', {}, s), h('div', { className: 'meta' }, 'resolving…')) : card(s, r, err, t0);
        }));
        paintHealth();
      };
      paint();
      await Promise.all(list.map((s) => router.resolve(s, { target: settings.target }).then((r: any) => { results.get(s)!.r = r; }, (err: any) => { results.get(s)!.err = err; }).finally(paint)));
      await sleep(settle); // cancelled race losers settle into the trace
      paint();
      const ok = [...results.values()].map((x) => x.r).filter(Boolean);
      outputs.map = JSON.stringify(M.compileImportMap(ok), null, 2);
      outputs.lock = JSON.stringify(router.lock.toJSON(), null, 2);
      if (alive()) showOut(outView);
      return results;
    }

    const paintScenarioButtons = () => scenBox.replaceChildren(...SCENARIOS.map((sc) =>
      h('button', { type: 'button', 'data-scenario': sc.id, 'aria-pressed': String(state.s === sc.id), onclick: () => { void play(sc); } }, h('b', {}, sc.title), h('span', {}, sc.blurb))));

    let playToken = 0;
    async function play(sc: Scenario) {
      const my = ++playToken;
      const current = () => alive() && my === playToken;
      state.s = sc.id;
      persist();
      paintScenarioButtons();
      apply();
      paintProviders();
      router = null;
      healthBody.replaceChildren(...healthRows({}));
      cards.replaceChildren();
      outputs.map = outputs.lock = '';
      showOut('map');
      const steps = h('ol', { className: 'mp-steps' });
      const checks = h('ul', { className: 'mp-checks', 'data-state': 'running' }, h('li', {}, h('span', { className: 'mark wait' }, '…'), 'running'));
      scenPanel.replaceChildren(
        h('h3', {}, sc.title),
        h('p', { html: sc.what }),
        h('details', { className: 'mp-code' }, h('summary', {}, 'Show code'), h('pre', { className: 'code' }, sc.code)),
        h('div', { className: 'mp-cols' },
          h('div', {}, h('h4', {}, 'What to notice'), h('ul', {}, sc.notice.map((n) => h('li', { html: n })))),
          h('div', {}, h('h4', {}, 'Steps'), steps, h('h4', {}, 'Did it happen?'), checks)));
      scenPanel.dataset.scenario = sc.id;
      const ctx: Ctx = {
        runs: [],
        get settings() { return settings; },
        pstate,
        setTarget(t) { settings.target = t; },
        showTab(t) { showOut(t); },
        async run(label, { fresh = true } = {}) {
          const li = h('li', {}, `${label} …`);
          steps.append(li);
          const res = await run({ fresh });
          li.textContent = `${label}: ${[...res].map(([spec, { r }]) => `${spec} → ${r?.provider ?? '✗'}`).join(', ')}`;
          return res;
        },
        async importRun(spec, describe) {
          const li = h('li', {}, `router.import("${spec}") …`);
          steps.append(li);
          router = makeRouter();
          paintProviders();
          const events: TraceLike[] = [];
          const t0 = performance.now();
          let module: any; let error: any;
          try { module = await router.import(spec, { onEvent: (e: TraceLike) => events.push(e) }); } catch (e) { error = e; }
          const last = [...events].reverse().find((e) => e.type === 'ok' || e.type === 'selected');
          const r = error ? null : { provider: last?.provider, url: last?.url, version: events.find((e) => e.type === 'resolved')?.version, build: '', trace: events };
          if (current()) { cards.replaceChildren(card(`${spec}  (router.import)`, r, error && Object.assign(error, { trace: events }), t0)); paintHealth(); }
          li.textContent = error ? `router.import("${spec}") failed: ${error.message}` : `router.import("${spec}") → ${r!.provider}; ${describe(module)}`;
          outputs.map = '(none: router.import() resolves and imports at runtime, with no import map)';
          outputs.lock = JSON.stringify(router.lock.toJSON(), null, 2);
          if (current()) showOut(outView);
          return { events, module, provider: r?.provider, error };
        },
      };
      try {
        await sc.steps(ctx);
        if (!current()) return;
        const rows = sc.checks(ctx);
        checks.replaceChildren(...rows.map(([label, ok]) => h('li', { 'data-pass': String(ok) }, h('span', { className: `mark ${ok ? 'pass' : 'fail'}` }, ok ? 'yes' : 'no'), label)));
        checks.dataset.state = rows.every(([, ok]) => ok) ? 'pass' : 'fail';
      } catch (e) {
        if (!current()) return;
        checks.replaceChildren(h('li', {}, h('span', { className: 'mark fail' }, 'error'), `${(e as Error).name}: ${(e as Error).message}`));
        checks.dataset.state = 'error';
      }
    }

    paintScenarioButtons();
    void play(SCENARIOS.find((s) => s.id === state.s) ?? SCENARIOS[0]);
    return () => { playToken++; local.forEach((f) => f()); };
  }

  /* ------------------------------------------------------------------ 02 No-bundler frame */

  function mountFrame(el: HTMLElement, alive: () => boolean): () => void {
    const local: (() => void)[] = [];
    const lon = (t: EventTarget, ev: string, fn: (e: any) => void) => { t.addEventListener(ev, fn); local.push(() => t.removeEventListener(ev, fn)); };
    const live = state.net === 'live';
    const FIX = fixUrl();
    const SPECS = ['preact@^10', 'preact@^10/hooks', 'htm@^3'];
    // The two "CDNs". Simulated: same-origin mirrors of Preact and htm (public/mport/cdn/), shaped like esm.sh's stub-plus-build
    // layout and jsDelivr's +esm bundles (each rewrites its own imports to relative URLs, as those CDNs do). Live: the real ones.
    const A_BASE = live ? 'https://esm.sh/' : `${FIX}cdn/esm.sh/`;
    const B_BASE = live ? 'https://cdn.jsdelivr.net/npm/' : `${FIX}cdn/jsdelivr/npm/`;
    const DEAD = live ? 'https://esm.sh.invalid/' : `${FIX}cdn/esm.sh.invalid/`;
    const providers = live ? [M.esmSh(), M.jsDelivr({ esm: true })] : [
      M.provider({ name: 'esm.sh', build: 'esm.sh', capabilities: ['browser', 'esm-transform'], url: (a: any) => `${A_BASE}${a.name}@${a.version}/${a.path ? `${a.path}/` : ''}index.mjs` }),
      M.provider({ name: 'jsdelivr-esm', build: 'jsdelivr-esm', capabilities: ['browser', 'esm-transform'], prefix: false, url: (a: any) => `${B_BASE}${a.name}@${a.version}/${a.path ? `${a.path}/` : ''}esm.mjs` }),
    ];
    const isA = (url: string) => url.startsWith(A_BASE);
    const isRegistry = (url: string) => /^https:\/\/(registry\.npmjs\.org|jsr\.io)\//.test(url);
    const frameFetch = async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input instanceof Request ? input.url : input);
      if (state.cdn === 'down' && isA(url)) throw new TypeError('simulated outage: esm.sh');
      if (!live && isRegistry(url)) return simFetch(url, init);
      return fetch(url, init);
    };
    const toDead = (url: string) => (isA(url) ? DEAD + url.slice(A_BASE.length) : url);

    explain.innerHTML = `The standalone workbench app used to tell this story; this tab carries it now. <b>Build</b>: <code>router.build(${esc(JSON.stringify(SPECS))}, { graph: true })</code> resolves the three packages, walks every module's static imports and records a <code>sha384</code> for each file in the import map's <code>integrity</code> and the lockfile's <code>files</code>. <b>Hash</b>: <code>renderImportMapCsp(importMap)</code> returns the <code>&lt;script type="importmap"&gt;</code> and the <code>'sha256-…'</code> of its exact text. <b>Run</b>: the frame is a <code>srcdoc</code> document whose <code>&lt;meta&gt;</code> policy is <code>default-src 'none'</code>, no <code>'unsafe-inline'</code>, <code>require-trusted-types-for 'script'</code>, and a <code>script-src</code> that allows this site's <code>/mport/</code> path${live ? ', the two CDNs' : ''} and that one hash. Its only inline script is the import map (after a classic probe script that reports violations to this page); then a plain <code>&lt;script type="module"&gt;</code> app imports <code>preact</code>, <code>preact/hooks</code> and <code>htm</code> by bare name. No bundler. <b>Tamper</b> with the hash or the map and the browser blocks the map, so the bare imports can't resolve. <b>CDN</b>: "down" is handled at build time (esm.sh fails mport's probe and the map points at jsDelivr); "broken" means esm.sh passed the probe but its files then fail to load (the map is pointed at a dead mirror to reproduce that, as mport's examples/app.html does), and an import map has no fallback. Beside it, <code>router.import()</code> in this page meets the same broken CDN, excludes it and loads from the next one. This is a port of mport's <code>test/browser/csp.spec.mjs</code> and <code>examples/app.html</code>.`;

    const ctl = h('div', { className: 'mp-frame-ctl' },
      h('div', { className: 'mp-seg', role: 'group', 'aria-label': 'esm.sh' }, h('span', { className: 'lbl' }, 'esm.sh is'),
        [['up', 'up'], ['down', 'down'], ['broken', 'up, but its files fail']].map(([k, label]) => h('button', { type: 'button', 'data-cdn': k, 'aria-pressed': String(state.cdn === k) }, label))),
      h('label', { className: 'field mp-tamper' }, h('span', {}, 'tamper'),
        h('select', { 'data-tamper': '' },
          [['none', 'nothing (the good path)'], ['hash', 'a wrong CSP hash'], ['map', 'the map, after hashing'], ['file', "one file's integrity hash"]].map(([k, label]) => h('option', { value: k, selected: state.tamper === k }, label)))),
      h('button', { type: 'button', className: 'btn mp-reload' }, 'reload the frame'));
    const status = h('div', { className: 'mp-frame-status', 'data-state': 'building' }, 'building the import map…');
    const iframe = h('iframe', { className: 'mp-iframe', title: 'No-bundler frame: a Preact + htm app under a strict CSP' });
    const vlog = h('pre', { className: 'code mp-vlog' }, '(none yet)');
    const cspPre = h('pre', { className: 'code mp-csp' }, '…');
    const mapPre = h('pre', { className: 'code mp-map' }, '…');
    const lockPre = h('pre', { className: 'code mp-lock' }, '…');
    const docPre = h('pre', { className: 'code mp-doc' }, '…');
    const buildLog = h('div', { className: 'mp-buildlog stat' });
    const rtOut = h('div', { className: 'mp-rt-app' });
    const rtStatus = h('div', { className: 'mp-rt-status', 'data-state': 'idle' }, '…');
    const rtCards = h('div', { className: 'mp-cards' });
    el.append(
      live ? h('p', { className: 'mp-banner live' }, h('b', {}, 'Live network. '), 'The map points at the real esm.sh and jsDelivr, the registry lookups are real, and the frame\'s policy allows those two origins.')
        : h('p', { className: 'mp-banner' }, h('b', {}, 'Simulated network. '), 'The registry is answered in the page; the two CDNs are same-origin mirrors of the real Preact 10.29.8 and htm 3.1.1 files under ', h('code', {}, `${BASE}mport/cdn/`), ', fetched over real HTTP and hashed by mport.'),
      ctl,
      h('div', { className: 'mp-frame-grid' },
        h('section', { className: 'panel mp-frame-panel' },
          h('h3', {}, 'The frame ', h('span', { className: 'stat' }, 'srcdoc · its own <meta> CSP · no bundler')),
          status, iframe, buildLog,
          h('h4', {}, 'Violations and load errors reported by the frame'), vlog),
        h('section', { className: 'panel mp-frame-side' },
          h('h4', {}, 'The policy ', h('span', { className: 'stat' }, '<meta http-equiv="Content-Security-Policy">')), cspPre,
          h('h4', {}, 'The import map ', h('span', { className: 'stat' }, 'the exact text the hash covers')), mapPre,
          h('details', {}, h('summary', {}, 'mport.lock.json (versions, builds, and every file\'s integrity)'), lockPre),
          h('details', {}, h('summary', {}, 'the whole frame document (srcdoc)'), docPre))),
      h('section', { className: 'panel mp-rt' },
        h('h3', {}, 'The same app through ', h('code', {}, 'router.import()'), ' in this page'),
        h('p', { className: 'stat' }, 'No import map: each dependency is resolved and imported through the router. When an import fails, that CDN is excluded and the next one is tried, which a native import map cannot do.'),
        rtStatus, h('div', { className: 'mp-rt-grid' }, rtOut, rtCards)));

    let seq = 0;
    let frameReport = { violations: [] as any[], loadErrors: [] as any[], errors: [] as any[], rendered: null as any, loaded: false };
    let verdictTimer = 0;
    const paintReport = () => {
      const lines = [
        ...frameReport.violations.map((v) => `violation  ${v.directive}  ${v.blocked || ''} ${v.sample ? `"${v.sample}"` : ''}`.trim()),
        ...frameReport.loadErrors.map((v) => `load error <${v.tag}> ${v.src}`),
        ...frameReport.errors.map((v) => `error      ${v.message}`),
      ];
      vlog.textContent = lines.length ? lines.join('\n') : '(none)';
      status.dataset.violations = String(frameReport.violations.length);
    };
    function decide() {
      if (!alive()) return;
      const r = frameReport;
      if (r.rendered) {
        status.dataset.state = 'rendered';
        status.innerHTML = `<b>✓ The app ran.</b> The map was allowed by its hash, the bare imports resolved through it (<code>preact</code> → <code>${esc(r.rendered.resolved?.preact ?? '?')}</code>)${r.violations.length ? `, but there were ${r.violations.length} policy violation(s)` : ', with zero policy violations'}.`;
        return;
      }
      const mapBlocked = r.violations.some((v) => /^script-src/.test(v.directive) && !v.blocked?.startsWith('http'));
      status.dataset.state = mapBlocked ? 'blocked' : 'failed';
      status.innerHTML = mapBlocked
        ? `<b>✗ Blocked.</b> The browser refused the inline import map: its text doesn't match the hash in the policy (${state.tamper === 'hash' ? 'the policy carries a wrong hash' : 'the map was changed after it was hashed'}). With no map, <code>import "preact"</code> can't resolve, so the app never starts.`
        : state.tamper === 'file'
          ? `<b>✗ Refused.</b> The map was allowed, but one module's bytes don't match the <code>integrity</code> the map pins for it, so the browser refused to run it and the app never started. (Enforced where import-map integrity is supported.)`
          : state.cdn === 'broken'
            ? `<b>✗ The app didn't load.</b> mport's check passed (esm.sh answered), but the files then fail to load, and <b>an import map has no fallback</b>: the browser will not try another URL. Compare <code>router.import()</code> below.`
            : `<b>✗ The app didn't start.</b> See the frame's report below.`;
    }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      const d = e.data?.mportFrame;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'violation') frameReport.violations.push(d);
      else if (d.type === 'load-error') frameReport.loadErrors.push(d);
      else if (d.type === 'error') frameReport.errors.push(d);
      else if (d.type === 'rendered') { frameReport.rendered = d; clearTimeout(verdictTimer); }
      else if (d.type === 'load') { frameReport.loaded = true; clearTimeout(verdictTimer); verdictTimer = later(decide, frameReport.rendered ? 0 : 1200); }
      paintReport();
      if (d.type === 'rendered') { clearTimeout(verdictTimer); verdictTimer = later(decide, 250); }
    };
    lon(window, 'message', onMessage);

    const WRONG = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='";
    let rtUnmount: (() => void) | null = null;

    async function build() {
      const my = ++seq;
      const current = () => alive() && my === seq;
      clearTimeout(verdictTimer);
      frameReport = { violations: [], loadErrors: [], errors: [], rendered: null, loaded: false };
      paintReport();
      status.dataset.state = 'building';
      status.textContent = `building the import map (router.build(…, { graph: true }))${live ? ' against the real CDNs' : ''}…`;
      root.querySelectorAll<HTMLButtonElement>('[data-cdn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cdn === state.cdn)));
      const events: TraceLike[] = [];
      try {
        const router = M.createRouter({ '*': providers }, { fetch: frameFetch, now: () => performance.now(), onEvent: (e: TraceLike) => events.push(e) });
        const t0 = performance.now();
        const { importMap, lock, graph } = await router.build(SPECS, { graph: true });
        const ms = performance.now() - t0;
        if (!current()) return;
        // what goes into the frame
        let map = structuredClone(importMap) as { imports: Record<string, string>; integrity?: Record<string, string> };
        if (state.cdn === 'broken') {
          map = { imports: Object.fromEntries(Object.entries(map.imports).map(([k, v]) => [k, toDead(v)])), integrity: map.integrity && Object.fromEntries(Object.entries(map.integrity).map(([k, v]) => [toDead(k), v])) };
        }
        if (state.tamper === 'file' && map.integrity) {
          const key = Object.keys(map.integrity).find((k) => /hooks/.test(k) && !/index\.mjs$|\?/.test(k)) ?? Object.keys(map.integrity).find((k) => /hooks/.test(k)) ?? Object.keys(map.integrity)[0];
          map.integrity[key] = await M.sri(new TextEncoder().encode('/* not the bytes the CDN serves */'));
        }
        const { html, hash, text } = await M.renderImportMapCsp(map);
        if (!current()) return;
        let mapHtml: string = html;
        let cspHash: string = hash;
        if (state.tamper === 'hash') cspHash = WRONG;
        if (state.tamper === 'map') {
          // an attacker (or a careless edit) points preact somewhere else AFTER the policy's hash was computed
          const evil = live ? 'https://evil.example/preact.mjs' : `${FIX}cdn/evil/preact.mjs`;
          mapHtml = html.replace(JSON.stringify(map.imports.preact).slice(1, -1), evil);
        }
        const origins = live ? ['https://esm.sh', 'https://cdn.jsdelivr.net', ...(state.cdn === 'broken' ? ['https://esm.sh.invalid'] : [])] : [];
        const csp = [
          "default-src 'none'",
          `script-src ${FIX} ${cspHash}${origins.length ? ' ' + origins.join(' ') : ''}`,
          `style-src ${FIX}frame/`,
          "img-src data:",
          "base-uri 'none'",
          "form-action 'none'",
          "object-src 'none'",
          "require-trusted-types-for 'script'",
          "trusted-types 'none'",
        ].join('; ');
        const sources = SPECS.map((s) => { const p = lock.packages[s] ?? {}; return { label: s.replace(/@[^/@]+(?=\/|$)/, ''), version: p.version, provider: p.provider }; });
        const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
<title>No-bundler frame</title>
<script src="${FIX}frame/probe.js"></script>
${mapHtml}
<link rel="stylesheet" href="${FIX}frame/app.css">
</head>
<body data-sources="${esc(JSON.stringify(sources))}">
<main id="app"><p class="boot">loading the app through the import map…</p></main>
<script type="module" src="${FIX}frame/app-main.mjs"></script>
</body>
</html>`;
        cspPre.textContent = csp.split('; ').join(';\n');
        mapPre.textContent = state.tamper === 'map' ? mapHtml.replace(/^<script type="importmap">|<\/script>$/g, '') : text;
        mapPre.dataset.hash = hash;
        lockPre.textContent = JSON.stringify(lock, null, 2);
        docPre.textContent = doc;
        const failed = [...new Set(events.filter((e) => e.type === 'fail').map((e) => e.provider))];
        buildLog.innerHTML = `built in ${ms.toFixed(0)} ms · ${graph?.files ?? 0} files hashed · served by ${[...new Set(Object.values(lock.packages).map((p: any) => p.provider))].join(', ')}${failed.length ? ` · <span class="bad">${failed.join(', ')} failed mport's probe</span>` : ''} · CSP hash <code>${esc(hash)}</code>${state.tamper === 'hash' ? ' (the policy carries a wrong one)' : ''}`;
        status.textContent = 'loading the frame…';
        iframe.srcdoc = doc;
        verdictTimer = later(decide, 6000); // a frame that never reports
      } catch (e) {
        if (!current()) return;
        status.dataset.state = 'error';
        status.innerHTML = `<b>✗ mport could not build the map:</b> ${esc((e as Error).message)}`;
        buildLog.textContent = events.map((x) => `${x.type}${x.phase ? '/' + x.phase : ''}:${x.provider}${x.reason ? ` (${x.reason})` : ''}`).join(' → ');
      }
      void runtimeLane(my);
    }

    async function runtimeLane(my: number) {
      const current = () => alive() && my === seq;
      rtStatus.dataset.state = 'loading';
      rtStatus.textContent = 'router.import() of each dependency…';
      rtCards.replaceChildren();
      if (rtUnmount) { rtUnmount(); rtUnmount = null; }
      rtOut.replaceChildren();
      const importer = (url: string) => import(/* @vite-ignore */ state.cdn === 'broken' ? toDead(url) : url);
      const router = M.createRouter({ '*': providers }, { fetch: frameFetch, importer, now: () => performance.now() });
      const t0 = performance.now();
      const loads = await Promise.all(SPECS.map(async (s) => {
        const events: TraceLike[] = [];
        try {
          const module = await router.import(s, { onEvent: (e: TraceLike) => events.push(e) });
          const last = [...events].reverse().find((e) => e.type === 'ok' || e.type === 'selected');
          return { s, module, r: { provider: last?.provider, url: last?.url, version: events.find((e) => e.type === 'resolved')?.version, build: '', trace: events } as any };
        } catch (err) {
          return { s, err: Object.assign(err as Error, { trace: events }) } as any;
        }
      }));
      if (!current()) return;
      rtCards.replaceChildren(...loads.map(({ s, r, err }) => card(`${s}  (router.import)`, r, err, t0)));
      if (loads.some((x) => x.err)) {
        rtStatus.dataset.state = 'failed';
        rtStatus.textContent = '✗ Some dependencies could not be loaded from any CDN.';
        return;
      }
      try {
        const [{ h: ph, render }, { useState }, { default: htm }] = loads.map((x) => x.module);
        const { App } = await import(/* @vite-ignore */ `${FIX}frame/app-view.mjs`);
        if (!current()) return;
        const mountEl = h('div', { className: 'mp-rt-mount' });
        rtOut.replaceChildren(mountEl);
        render(ph(App({ h: ph, useState, htm }), { sources: loads.map((x) => ({ label: x.s.replace(/@[^/@]+(?=\/|$)/, ''), version: x.r.version, provider: x.r.provider })) }), mountEl);
        rtUnmount = () => { try { render(null, mountEl); } catch {} };
        const retried = loads.some((x) => x.r.trace.some((e: TraceLike) => e.phase === 'import'));
        rtStatus.dataset.state = 'rendered';
        rtStatus.textContent = retried
          ? '✓ esm.sh passed the check but its modules failed to import, so router.import() excluded it and loaded each dependency from jsDelivr. The app runs.'
          : state.cdn === 'down' ? '✓ esm.sh was unreachable, so each dependency came from jsDelivr.' : '✓ Each dependency was resolved and imported through the router.';
      } catch (e) {
        if (!current()) return;
        rtStatus.dataset.state = 'failed';
        rtStatus.textContent = `✗ ${(e as Error).message}`;
      }
    }

    root.querySelectorAll<HTMLButtonElement>('[data-cdn]').forEach((b) => lon(b, 'click', () => { state.cdn = b.dataset.cdn as State['cdn']; persist(); void build(); }));
    lon(el.querySelector('[data-tamper]')!, 'change', (e) => { state.tamper = (e.target as HTMLSelectElement).value; persist(); void build(); });
    lon(el.querySelector('.mp-reload')!, 'click', () => { void build(); });
    void build();
    return () => {
      seq++;
      clearTimeout(verdictTimer);
      local.forEach((f) => f());
      if (rtUnmount) rtUnmount();
      iframe.srcdoc = '';
      iframe.remove();
    };
  }

  /* ------------------------------------------------------------------ 03 Proofs */

  function mountProofs(el: HTMLElement, alive: () => boolean): () => void {
    const local: (() => void)[] = [];
    explain.innerHTML = `mport's numbered examples are self-verifying: each asserts the behaviour it demonstrates and exits 0 when it holds (the mport repository runs them in CI). These are those examples, ported to this page: the same calls and the same assertions, through a small <code>assert</code> shim shaped like <code>node:assert/strict</code>, against the same fake network (<code>examples/_offline.mjs</code>'s registry fixtures and injectable <code>fetch</code>). The last row is not an example: it is example 21's <code>htmlGraph()</code> over the real html-modules components the <a href="#/workbench">Untrusted Desk</a> planet loads, served by this site. Not here, because they need Node: 10 (the CLI), 11 (an internal factory), 15 (<code>mport outdated</code>/<code>update</code>), 16 (a Rollup build), 17 (<code>installedRegistry()</code> reads <code>node_modules</code> from disk); and 18's <code>node:crypto</code> cross-check, whose browser counterpart is the No-bundler frame tab.`;
    const summary = h('div', { className: 'mp-proof-summary', 'data-state': 'running' }, 'running…');
    const list = h('ol', { className: 'mp-proofs' });
    const again = h('button', { type: 'button', className: 'btn' }, 'run again');
    el.append(h('section', { className: 'panel' }, h('div', { className: 'mp-proof-head' }, summary, again), list));
    let runToken = 0;
    async function runAll() {
      const my = ++runToken;
      const current = () => alive() && my === runToken;
      const rows = PROOFS.map((p) => {
        const li = h('li', { 'data-proof': p.id, 'data-status': 'pending' },
          h('span', { className: 'mark wait' }, '…'),
          h('span', { className: 'pid' }, p.id),
          h('a', { href: exampleUrl(p.file), target: '_blank', rel: 'noopener', className: 'ptitle' }, p.title),
          h('span', { className: 'ms stat' }, ''),
          h('code', { className: 'pout' }, ''));
        return { p, li };
      });
      list.replaceChildren(...rows.map((r) => r.li));
      summary.dataset.state = 'running';
      summary.textContent = `running ${rows.length} proofs…`;
      let pass = 0; let fail = 0;
      for (const { p, li } of rows) {
        const t0 = performance.now();
        let out: string; let ok: boolean;
        try { out = await p.run(); ok = true; } catch (e) { out = `${(e as Error).name}: ${(e as Error).message}`; ok = false; }
        if (!current()) return;
        ok ? pass++ : fail++;
        li.dataset.status = ok ? 'pass' : 'fail';
        li.querySelector('.mark')!.className = `mark ${ok ? 'pass' : 'fail'}`;
        li.querySelector('.mark')!.textContent = ok ? 'pass' : 'fail';
        li.querySelector('.ms')!.textContent = `${(performance.now() - t0).toFixed(0)} ms`;
        li.querySelector('.pout')!.textContent = out.length > 260 ? out.slice(0, 260) + '…' : out;
      }
      summary.dataset.state = fail ? 'fail' : 'pass';
      summary.dataset.pass = String(pass);
      summary.dataset.fail = String(fail);
      summary.innerHTML = fail ? `<b class="bad">${fail} failed</b>, ${pass} passed` : `<b>${pass}/${rows.length} passed</b> against the fake network`;
    }
    const onAgain = () => { void runAll(); };
    again.addEventListener('click', onAgain);
    local.push(() => again.removeEventListener('click', onAgain));
    void runAll();
    return () => { runToken++; local.forEach((f) => f()); };
  }

  switchTab(state.tab as TabId);

  return () => {
    disposed = true;
    tabToken++;
    if (tabCleanup) { try { tabCleanup(); } catch {} }
    disposers.forEach((f) => f());
    timers.forEach((t) => clearTimeout(t));
    root.remove();
  };
}

const playground: Playground = {
  id: 'mport',
  title: 'Import Router',
  pkg: '@johnhenry/mport',
  hue: 230,
  blurb: 'Route imports across CDNs, compile an import map, hash it for a strict CSP, and run an app with no bundler.',
  docs: 'https://opensource.johnhenry.me/mport/',
  async mount(host) {
    try {
      return await mountMport(host);
    } catch (e) {
      const pre = document.createElement('pre');
      pre.className = 'code';
      pre.textContent = `Import Router failed to start:\n${String((e as Error)?.stack ?? e)}`;
      host.append(pre);
      return () => pre.remove();
    }
  },
};
export default playground;
