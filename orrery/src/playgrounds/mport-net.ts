/**
 * The Import Router planet's fake network: registry metadata and CDN bodies answered in the page, so the default state and
 * every gating test are deterministic and never touch the internet.
 *
 * Two pieces, both ported from the mport repository (neither ships in the npm package):
 *   - `offlineFetch`, `registry`, `allUp`, `show`, `NPM`: examples/_offline.mjs, which the numbered examples (the Proofs tab) use.
 *   - `simRespond`: test/browser/stubs.mjs's `respond()`, the hermetic CDN + registry the browser tests use, here answering the
 *     Routing tab's scenarios. Package bodies are tiny modules, byte-identical across hosts for one package, so a hash
 *     recorded from one mirror matches another's (which is what makes the "tampered mirror" scenario meaningful).
 */

/* ------------------------------------------------------------------ examples/_offline.mjs */

export const NPM = 'https://registry.npmjs.org';

type Table = Record<string, unknown>;

export const registry: Table = {
  [`${NPM}/react`]: { 'dist-tags': { latest: '19.2.0', next: '20.0.0-rc.1' }, versions: { '18.3.1': {}, '19.0.0': {}, '19.2.0': {}, '20.0.0-rc.1': {} } },
  // Real React ships CommonJS: main is index.js and there is no "type": "module".
  [`${NPM}/react/19.2.0`]: { name: 'react', version: '19.2.0', main: 'index.js' },
  [`${NPM}/react/18.3.1`]: { name: 'react', version: '18.3.1', main: 'index.js' },
  [`${NPM}/preact`]: { 'dist-tags': { latest: '10.29.8' }, versions: { '10.28.0': {}, '10.29.8': {} } },
  [`${NPM}/preact/10.29.8`]: {
    name: 'preact', version: '10.29.8', module: 'dist/preact.module.js', main: 'dist/preact.js',
    exports: {
      '.': { browser: './dist/preact.module.js', import: './dist/preact.mjs', require: './dist/preact.js' },
      './hooks': { import: './hooks/dist/hooks.mjs', require: './hooks/dist/hooks.js' },
    },
  },
  [`${NPM}/lit`]: { 'dist-tags': { latest: '3.3.1' }, versions: { '3.3.1': {} } },
  [`${NPM}/lit/3.3.1`]: { name: 'lit', version: '3.3.1', type: 'module', exports: { '.': { default: './index.js' } } },
  'https://jsr.io/@std/path/meta.json': { latest: '1.1.0', versions: { '1.0.0': {}, '1.1.0': {}, '1.2.0': { yanked: true } } },
};

export type FakeFetch = ((url: string | URL | Request, init?: RequestInit) => Promise<Response>) & { log: { url: string; method: string }[] };

/** A fake network: URL (or "prefix*") → status code, body string, JSON object or (url, init) => Response; anything else is a 404. */
export function offlineFetch(table: Table = {}, { delays = {} as Record<string, number>, log = [] as { url: string; method: string }[] } = {}): FakeFetch {
  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    log.push({ url, method: init.method ?? 'GET' });
    const wait = Object.entries(delays).find(([k]) => url.startsWith(k))?.[1] ?? 0;
    if (wait) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, wait);
        init.signal?.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
      });
    }
    const hit = table[url] ?? Object.entries(table).find(([k]) => k.endsWith('*') && url.startsWith(k.slice(0, -1)))?.[1];
    if (hit === undefined) return new Response('not found', { status: 404 });
    if (typeof hit === 'function') return (hit as (u: string, i: RequestInit) => Response)(url, init);
    if (typeof hit === 'number') return new Response(hit < 400 ? 'ok' : 'error', { status: hit });
    return new Response(typeof hit === 'string' ? hit : JSON.stringify(hit), { status: 200 });
  }) as FakeFetch;
  fetch.log = log;
  return fetch;
}

/** Every CDN answers with a small module body. */
export const allUp: Table = {
  'https://esm.sh/*': "export default 'esm.sh'",
  'https://cdn.jsdelivr.net/*': "export default 'jsdelivr'",
  'https://unpkg.com/*': "export default 'unpkg'",
  'https://ga.jspm.io/*': "export default 'jspm'",
};

export interface TraceLike { type: string; phase?: string; provider: string; reason?: string; url?: string; ms?: number; at?: number; version?: string; cached?: boolean }
/** One line per trace event: "type:provider (reason)". */
export const show = (trace: TraceLike[]) => trace.map((e) => `${e.type}${e.phase ? `/${e.phase}` : ''}:${e.provider}${e.reason ? ` (${e.reason})` : ''}`);

/* ------------------------------------------------------------------ test/browser/stubs.mjs */

export const CDN_HOSTS = ['esm.sh', 'cdn.jsdelivr.net', 'unpkg.com', 'ga.jspm.io'];

const packument = (latest: string, versions: string[], tags: Record<string, string> = {}) => ({ 'dist-tags': { latest, ...tags }, versions: Object.fromEntries(versions.map((v) => [v, {}])) });

const REGISTRY: Record<string, unknown> = {
  'react': packument('19.2.0', ['18.3.1', '19.0.0', '19.2.0']),
  'react/19.2.0': { name: 'react', version: '19.2.0', main: 'index.js' },
  'react/18.3.1': { name: 'react', version: '18.3.1', main: 'index.js' },
  'preact': packument('10.29.8', ['10.28.0', '10.29.8']),
  'preact/10.29.8': registry[`${NPM}/preact/10.29.8`],
  'htm': packument('3.1.1', ['3.1.1']),
  'htm/3.1.1': { name: 'htm', version: '3.1.1', module: 'dist/htm.module.js', main: 'dist/htm.js' },
  'lit': packument('3.3.1', ['3.3.1']),
  'lit/3.3.1': { name: 'lit', version: '3.3.1', type: 'module', exports: { '.': { default: './index.js' }, './decorators.js': { default: './decorators.js' } } },
  'nanoid': packument('5.1.5', ['5.1.4', '5.1.5']),
  'nanoid/5.1.5': { name: 'nanoid', version: '5.1.5', type: 'module', exports: { '.': { default: './index.js' } } },
};
const JSR: Record<string, unknown> = { '/@std/path/meta.json': { latest: '1.1.0', versions: { '1.0.0': {}, '1.1.0': {} } } };

// small modules, one per package, identical whichever CDN serves them
const BODIES: Record<string, string> = {
  'nanoid': `export const nanoid = (n = 21) => "stubbed-nanoid-id".padEnd(n, "x").slice(0, n);\nexport default nanoid;`,
  'lit': `export const html = (s, ...v) => ({ s, v });\nexport default "stub:lit";`,
  'react': `export const createElement = (type, props) => ({ type, props });\nexport default { createElement };`,
  'preact': `export const h = (type, props) => ({ type, props });\nexport const options = {};\nexport default "stub:preact";`,
  '@std/path': `export const join = (...p) => p.join("/");\nexport default "stub:@std/path";`,
};
const generic = (name: string) => `export default ${JSON.stringify(`stub:${name}`)};`;

// "name" and "version" out of a CDN path: /npm/react@19.2.0/…, /npm:react@19/…, /@scope/pkg@1/…, /react@19/…, /jsr/@std/path@1.1.0
const PKG = /(?:\/npm\/|\/npm:|\/(?:jsr\/)?)(@[^/@]+\/[^/@?]+|[^/@?+]+)@([^/?]+)/;

export interface SimResponse { status: number; type: string; body: string }

/** What the simulated internet answers for a URL (registries and the four CDNs). `undefined`: not a host it simulates. */
export function simRespond(urlString: string): SimResponse | undefined {
  const url = new URL(urlString);
  const json = (value: unknown, status = 200): SimResponse => ({ status, type: 'application/json', body: JSON.stringify(value) });
  const text = (status: number, body: string): SimResponse => ({ status, type: 'text/plain', body });
  if (url.hostname === 'registry.npmjs.org') {
    const hit = REGISTRY[decodeURIComponent(url.pathname.slice(1)).replace(/^(@[^/]+)\//, '$1%2F')];
    return hit ? json(hit) : text(404, 'not found');
  }
  if (url.hostname === 'jsr.io') return JSR[url.pathname] ? json(JSR[url.pathname]) : text(404, 'not found');
  if (!CDN_HOSTS.includes(url.hostname)) return undefined;
  const m = PKG.exec(url.pathname);
  if (!m) return text(404, 'not found');
  const name = m[1];
  return { status: 200, type: 'text/javascript', body: BODIES[name] ?? generic(name) };
}

/** The simulated internet as a fetch. Anything it does not simulate is refused: the simulated mode never reaches the network. */
export const simFetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
  const url = String(input instanceof Request ? input.url : input);
  const hit = simRespond(url);
  if (!hit) throw new TypeError(`simulated network: no route to ${url}`);
  return new Response(init.method === 'HEAD' ? null : hit.body, { status: hit.status, headers: { 'content-type': hit.type } });
};

/** A cancellable wait (rejects with an AbortError, as a real request would). */
export const sleep = (ms: number, signal?: AbortSignal | null) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
});
