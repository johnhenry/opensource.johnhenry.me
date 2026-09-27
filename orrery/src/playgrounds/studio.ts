import type { Playground } from '../registry';
import { receive, handoffBanner, handoffButton } from '../bus';
import { readState, writeState, copyLink } from '../state';

/* ============================================================================
 * Tab 04 (Deploy)'s Service Worker demo, in the same file: a SW script's
 * scriptURL must have an "http"/"https" scheme (Service Worker spec, §
 * Start Register Job -- confirmed empirically too: both `blob:` and `data:`
 * URLs are rejected outright by `register()` in every engine, not a Chrome
 * quirk). This room owns no static file to register from disk (file
 * ownership is studio.ts/css only), but Vite's dev/build pipeline already
 * serves THIS module at a real, same-origin URL (`import.meta.url`) -- so
 * this file is dual-mode: loaded normally by the page, it's the room; loaded
 * by the browser as a Service Worker (registered against its own
 * `import.meta.url`, see `ensureServiceWorker()` below), this top-level
 * block runs instead. Nothing below this block executes automatically in
 * that mode (mountStudio/loadLibs/etc. only ever run inside `mount()`,
 * never called from a Service Worker), so evaluating the rest of the module
 * graph is harmless there -- except the CSS import, which touches `document`
 * and must stay page-only.
 *
 * Scope, and why there's a hidden iframe: a script's max allowed SW scope is
 * its own directory (`/src/playgrounds/` in dev, a hashed `/assets/` chunk
 * in a production build) unless the server sends a `Service-Worker-Allowed`
 * header widening it -- not available without owning server/vite config.
 * ORRERY's own page lives at the site root, outside that scope, so the room
 * itself can never become a *controlled* client (confirmed empirically: a
 * `fetch()` from the room's own page to a URL "in scope" still bypasses the
 * worker entirely, falling through to Vite's SPA-fallback network response,
 * because scope-membership of the REQUEST doesn't matter -- only whether the
 * requesting CLIENT is controlled). A hidden same-origin iframe navigated to
 * a URL that IS inside the worker's scope becomes a real controlled client
 * once that navigation itself is answered by the worker, so the demo's
 * actual `fetch()` runs from inside that iframe's document, not the page.
 *
 * And why the relay itself is a `BroadcastChannel`, not `clients.postMessage`:
 * the *page* is never a controlled client either (same reason, see above), so
 * the SW's `clients` list only ever contains the hidden iframe -- there is no
 * controlled client to `postMessage` the relay TO that's actually the page
 * with the compiled app (confirmed empirically: relaying via the iframe's own
 * `Client` just hangs -- nothing is listening there). `BroadcastChannel` has
 * no such restriction; any same-origin context can join one regardless of SW
 * control, which is exactly what's needed to get a message from the worker
 * back to the top-level page.
 * ========================================================================== */
// Captured into a plain variable before any `new URL(..., THIS_URL)` call:
// Vite statically recognizes the literal pattern `new URL('./x', import.meta.url)`
// as an asset reference and rewrites it (for bundling purposes) -- fine for a
// real relative asset path, but it mis-resolves a bare `new URL('.', import.meta.url)`
// used purely for runtime scope math (confirmed empirically: the literal form
// silently dropped a path segment here). Going through a variable first keeps
// this plain runtime `URL` arithmetic instead of static asset analysis.
const THIS_MODULE_URL = import.meta.url;
const SW_SCOPE = new URL('.', THIS_MODULE_URL);
const SW_MARKER = 'studio-deploy-preview';
const SW_FRAME_URL = new URL(`${SW_MARKER}/frame`, SW_SCOPE).toString();
const SW_RUN_BASE = new URL(`${SW_MARKER}/run`, SW_SCOPE).toString();
const SW_CHANNEL = 'orrery:studio:deploy-sw-relay';
const IS_SW_SCOPE = typeof window === 'undefined' && typeof self !== 'undefined' && 'clients' in (self as any) && 'registration' in (self as any);

if (IS_SW_SCOPE) {
  const sw = self as any;
  sw.addEventListener('install', () => { sw.skipWaiting(); });
  sw.addEventListener('activate', (event: any) => { event.waitUntil(sw.clients.claim()); });
  sw.addEventListener('fetch', (event: any) => {
    const href: string = event.request.url;
    if (href === SW_FRAME_URL) {
      event.respondWith(new Response('<!doctype html><title>studio deploy frame</title>', { headers: { 'content-type': 'text/html' } }));
      return;
    }
    if (!href.startsWith(SW_RUN_BASE)) return; // not ours: let the network/browser handle it
    event.respondWith(relaySwFetch(event));
  });
} else {
  void import('./studio.css');
}

/** SW-side half of the relay: broadcasts the request to the page over a BroadcastChannel and answers with what comes back. */
async function relaySwFetch(event: any): Promise<Response> {
  const req: Request = event.request;
  const reqUrl = new URL(req.url);
  const appPath = reqUrl.searchParams.get('path') || '/';
  const targetUrl = new URL(appPath, reqUrl.origin).toString();
  let body: ArrayBuffer | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') body = await req.clone().arrayBuffer();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const bc = new BroadcastChannel(SW_CHANNEL);
  try {
    const data: any = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no page answered within 5s -- open the Deploy tab (04) first')), 5000);
      bc.onmessage = (ev: MessageEvent) => {
        if (!ev.data || ev.data.id !== id || ev.data.type !== 'studio-deploy:response') return;
        clearTimeout(timer);
        resolve(ev.data);
      };
      bc.postMessage({ type: 'studio-deploy:fetch', id, url: targetUrl, method: req.method, headers: [...req.headers], body });
    });
    return new Response(data.body, { status: data.status, statusText: data.statusText, headers: data.headers });
  } catch (e) {
    return new Response(String((e as Error)?.message ?? e), { status: 504 });
  } finally {
    bc.close();
  }
}

/* ============================================================================
 * Libraries: plain imports, loaded lazily so the planet can show a loading state
 * and report a failure instead of throwing out of mount().
 *
 *  - fileable 0.0.4: `@johnhenry/fileable/browser` (Build -> Resolve -> Layout ->
 *    Hash, File/Dir/Rm, linkTo/warn, markdownToHtml, drainBuildContext) +
 *    `@johnhenry/fileable/jsx-runtime`.
 *  - servable 0.0.3: the package entry (browser condition; its `#resolve`/
 *    `#serve-file`/`#fileable` self-imports resolve to browser variants).
 *  - hostable 0.0.1: the package entry, as published (no node: imports left).
 * No Vite shims or dedupe: every line of library logic that runs below is the
 * published package code. hostable exports only compile() (Gateway -> servable
 * tree -> dispatcher, with the middle step internal), so the hostable lanes view
 * is derived from hostable's own descriptor tree by lowerGatewayForTable().
 * ========================================================================== */

interface Libs {
  F: Record<string, any>; // fileable: components + pipeline stages + jsx runtime
  S: Record<string, any>; // servable index
  SJ: Record<string, any>; // servable jsx-runtime
  H: Record<string, any>; // hostable index
  HJ: Record<string, any>; // hostable jsx-runtime
}

let libsPromise: Promise<Libs> | null = null;

function loadLibs(): Promise<Libs> {
  if (libsPromise) return libsPromise;
  libsPromise = (async () => {
    const [fBrowser, fJsx, S, SJ, H, HJ] = await Promise.all([
      import('@johnhenry/fileable/browser'),
      import('@johnhenry/fileable/jsx-runtime'),
      import('@johnhenry/servable'),
      import('@johnhenry/servable/jsx-runtime'),
      import('@johnhenry/hostable'),
      import('@johnhenry/hostable/jsx-runtime'),
    ]);
    const F = { ...fBrowser, ...fJsx };
    return { F, S, SJ, H, HJ } as Libs;
  })();
  libsPromise.catch(() => { libsPromise = null; });
  return libsPromise;
}

/* Deploy tab (04) only: packfile + dialback, loaded lazily so tabs 1–3 never pay for them. */
let packfilePromise: Promise<Record<string, any>> | null = null;
function loadPackfile(): Promise<Record<string, any>> {
  if (!packfilePromise) packfilePromise = import('@johnhenry/packfile/browser');
  packfilePromise.catch(() => { packfilePromise = null; });
  return packfilePromise;
}
let dialbackPromise: Promise<Record<string, any>> | null = null;
function loadDialback(): Promise<Record<string, any>> {
  if (!dialbackPromise) dialbackPromise = import('@johnhenry/dialback');
  dialbackPromise.catch(() => { dialbackPromise = null; });
  return dialbackPromise;
}
let cfAdapterPromise: Promise<Record<string, any>> | null = null;
function loadCloudflareAdapter(): Promise<Record<string, any>> {
  if (!cfAdapterPromise) cfAdapterPromise = import('@johnhenry/servable/adapters/cloudflare');
  cfAdapterPromise.catch(() => { cfAdapterPromise = null; });
  return cfAdapterPromise;
}


/* ============================================================================
 * A tiny JSX -> h() transpiler.
 *
 * Handles elements, member tags (a.b), fragments, string / {expression} /
 * boolean / spread attributes, text with JSX whitespace rules, {expression}
 * children, nested JSX inside expressions and template literals. Every element
 * becomes h(tag, props, locIndex, ...children); locIndex points at the source
 * range so the planet can highlight exactly which <Route> answered a request.
 * ========================================================================== */

interface Loc { start: number; end: number; openEnd: number; tag: string }

class JsxError extends Error {
  constructor(message: string, public pos: number) { super(message); }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e] ?? m);

function jsxText(raw: string): string {
  const lines = raw.split(/\r?\n/);
  if (lines.length === 1) return raw;
  let out = '';
  lines.forEach((line, idx) => {
    let l = line.replace(/\t/g, ' ');
    if (idx !== 0) l = l.replace(/^\s+/, '');
    if (idx !== lines.length - 1) l = l.replace(/\s+$/, '');
    if (l) out += (out ? ' ' : '') + l;
  });
  return out;
}

function transpile(src: string): { code: string; locs: Loc[] } {
  const n = src.length;
  const locs: Loc[] = [];
  let i = 0;
  const isIdStart = (c: string | undefined) => !!c && /[A-Za-z_$]/.test(c);
  const isId = (c: string | undefined) => !!c && /[\w$]/.test(c);
  const err = (m: string, at = i): never => { throw new JsxError(m, Math.min(at, n)); };

  function prevWordOrChar(): string {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (j < 0) return '';
    if (!isId(src[j])) return src[j];
    let k = j;
    while (k >= 0 && isId(src[k])) k--;
    return src.slice(k + 1, j + 1);
  }
  function jsxAllowed(): boolean {
    const nx = src[i + 1];
    if (!(nx === '>' || isIdStart(nx))) return false;
    const p = prevWordOrChar();
    if (p === '') return true;
    if (p.length === 1 && '([{,;=:?!&|>}+-*%~^'.includes(p)) return true;
    return ['return', 'default', 'yield', 'await', 'case', 'else', 'do'].includes(p);
  }
  function regexAllowed(): boolean {
    const p = prevWordOrChar();
    return p === '' || (p.length === 1 && '(,=:[!&|?{};'.includes(p)) || p === 'return';
  }
  function skipWs() {
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++;
      if (src.startsWith('{/*', i)) { const e = src.indexOf('*/}', i); if (e < 0) err('Unclosed comment'); i = e + 3; continue; }
      if (src.startsWith('//', i)) { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
      if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i); if (e < 0) err('Unclosed comment'); i = e + 2; continue; }
      break;
    }
  }
  function readName(re: RegExp): string {
    const s = i;
    while (i < n && re.test(src[i])) i++;
    return src.slice(s, i);
  }
  function readString(q: string): string {
    const s = i;
    i++;
    while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    if (i >= n) err('Unterminated string', s);
    i++;
    return src.slice(s, i);
  }
  function readTemplate(): string {
    let out = '`';
    const s = i;
    i++;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { out += '`'; i++; return out; }
      if (c === '$' && src[i + 1] === '{') { i += 2; out += '${' + jsCode(true) + '}'; i++; continue; }
      out += c; i++;
    }
    return err('Unterminated template literal', s);
  }
  function readRegex(): string {
    const s = i;
    i++;
    let cls = false;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') err('Unterminated regex', s);
      if (c === '[') cls = true;
      else if (c === ']') cls = false;
      else if (c === '/' && !cls) { i++; break; }
      i++;
    }
    while (isId(src[i])) i++;
    return src.slice(s, i);
  }
  function jsCode(untilBrace: boolean): string {
    let out = '';
    let depth = 0;
    const s = i;
    while (i < n) {
      const c = src[i];
      if (c === '}' && depth === 0 && untilBrace) return out;
      if (c === '{') { depth++; out += c; i++; continue; }
      if (c === '}') { depth--; out += c; i++; continue; }
      if (c === '"' || c === "'") { out += readString(c); continue; }
      if (c === '`') { out += readTemplate(); continue; }
      if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? n : e; out += src.slice(i, end); i = end; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; out += src.slice(i, end); i = end; continue; }
      if (c === '/' && regexAllowed()) { out += readRegex(); continue; }
      if (c === '<' && jsxAllowed()) { out += element(); continue; }
      out += c; i++;
    }
    if (untilBrace) err('Unclosed { expression', s - 1);
    return out;
  }
  function expr(): string {
    // at '{' of an attribute value / child expression
    i++;
    const e = jsCode(true);
    i++;
    return e;
  }
  function element(): string {
    const start = i;
    i++;
    let tagName = '';
    let tagExpr = 'Fragment';
    const props: string[] = [];
    let selfClose = false;
    if (src[i] === '>') {
      i++;
    } else {
      tagName = readName(/[\w$.:-]/);
      if (!tagName) err('Expected a tag name');
      tagExpr = /^[a-z]/.test(tagName) && !tagName.includes('.') ? JSON.stringify(tagName) : tagName;
      for (;;) {
        skipWs();
        if (i >= n) err(`Unclosed <${tagName}> tag`, start);
        if (src.startsWith('/>', i)) { i += 2; selfClose = true; break; }
        if (src[i] === '>') { i++; break; }
        if (src[i] === '{') {
          i++;
          skipWs();
          if (!src.startsWith('...', i)) err('Expected {...spread} in attributes');
          i += 3;
          const e = jsCode(true);
          i++;
          props.push(`...(${e})`);
          continue;
        }
        if (!/[A-Za-z_$]/.test(src[i])) err(`Unexpected "${src[i]}" inside <${tagName}>`);
        const name = readName(/[\w$:-]/);
        skipWs();
        if (src[i] !== '=') { props.push(`${JSON.stringify(name)}: true`); continue; }
        i++;
        skipWs();
        const c = src[i];
        if (c === '"' || c === "'") {
          const e = src.indexOf(c, i + 1);
          if (e < 0) err('Unterminated attribute string');
          props.push(`${JSON.stringify(name)}: ${JSON.stringify(decodeEntities(src.slice(i + 1, e)))}`);
          i = e + 1;
        } else if (c === '{') {
          const e = expr();
          if (!e.trim()) err(`Empty {} for attribute ${name}`);
          props.push(`${JSON.stringify(name)}: (${e})`);
        } else if (c === '<') {
          props.push(`${JSON.stringify(name)}: ${element()}`);
        } else err(`Expected a value for attribute ${name}`);
      }
    }
    const openEnd = i;
    const children: string[] = [];
    if (!selfClose) {
      for (;;) {
        if (i >= n) err(`Unclosed <${tagName || ''}> — expected </${tagName}>`, start);
        if (src.startsWith('</', i)) {
          const cs = i;
          i += 2;
          skipWs();
          const close = readName(/[\w$.:-]/);
          skipWs();
          if (src[i] !== '>') err('Expected ">" to end the closing tag');
          i++;
          if (close !== tagName) err(`Expected </${tagName}> but found </${close}>`, cs);
          break;
        }
        const c = src[i];
        if (c === '{') {
          const e = expr();
          if (e.replace(/\/\*[\s\S]*?\*\//g, '').trim()) children.push(`(${e})`);
          continue;
        }
        if (c === '<') { children.push(element()); continue; }
        let j = i;
        while (j < n && src[j] !== '{' && src[j] !== '<') j++;
        const text = jsxText(src.slice(i, j));
        i = j;
        if (text) children.push(JSON.stringify(decodeEntities(text)));
      }
    }
    const idx = locs.push({ start, end: i, openEnd, tag: tagName || 'Fragment' }) - 1;
    return `h(${tagExpr}, {${props.join(', ')}}, ${idx}${children.map((c) => ', ' + c).join('')})`;
  }
  const code = jsCode(false);
  return { code, locs };
}

/** Blank out imports and turn `export default` into `return`, keeping every offset intact. */
function prepareModule(src: string): string {
  return src
    .replace(/^[ \t]*import\b[^\n]*$/gm, (m) => ' '.repeat(m.length))
    .replace(/^([ \t]*)export default\b/m, (m, ws: string) => ws + 'return'.padEnd(m.length - ws.length))
    .replace(/^([ \t]*)export(?=\s+(?:const|let|function|async|class)\b)/gm, (m, ws: string) => ws + ' '.repeat(m.length - ws.length));
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;
const LOC = '__studioLoc';

function lineCol(src: string, pos: number): string {
  const before = src.slice(0, pos);
  const line = before.split('\n').length;
  return `${line}:${pos - before.lastIndexOf('\n')}`;
}

type HFn = (tag: unknown, props: Record<string, unknown> | null, loc: number, ...children: unknown[]) => unknown;

function makeH(jsx: (t: unknown, p: unknown) => unknown, wrap?: (tag: unknown, node: unknown, loc: number) => unknown): HFn {
  return (tag, props, loc, ...children) => {
    const p: Record<string, unknown> = props ? { ...props } : {};
    if (children.length === 1) p.children = children[0];
    else if (children.length > 1) p.children = children;
    if (typeof tag === 'function' && loc >= 0) p[LOC] = loc;
    const node = jsx(tag, p);
    return wrap ? wrap(tag, node, loc) : node;
  };
}

async function runModule(src: string, scope: Record<string, unknown>, h: HFn): Promise<{ value: unknown; locs: Loc[] }> {
  const prepared = prepareModule(src);
  const { code, locs } = transpile(prepared);
  const names = Object.keys(scope);
  let fn: (...a: unknown[]) => Promise<unknown>;
  try {
    fn = new AsyncFunction(...names, 'h', `"use strict";\n${code}`);
  } catch (e) {
    throw new Error(`Syntax error: ${(e as Error).message}`);
  }
  let value = await fn(...names.map((k) => scope[k]), h);
  if (value === undefined) throw new Error('Nothing exported: end the module with `export default <tree>`.');
  return { value, locs };
}

/* ============================================================================
 * Presets
 * ========================================================================== */

type TabId = 'fileable' | 'servable' | 'hostable' | 'deploy';
interface Req { label?: string; method: string; path: string; host?: string; headers?: string; body?: string }
interface Preset { label: string; src: string; requests?: Req[] }

const F_PRESETS: Record<string, Preset> = {
  site: {
    label: 'static site',
    src: `/** @jsxImportSource @johnhenry/fileable */
import { Dir, File, Rm, linkTo, markdownToHtml } from "@johnhenry/fileable";

const pages = [
  { slug: "orbits", title: "Orbits", body: "Every file here is **JSX**. Edit me and watch the hashes." },
  { slug: "epicycles", title: "Epicycles", body: "Wheels on wheels: \`Dir\` inside \`Dir\`." },
  { slug: "transits", title: "Transits", body: "- change one page\\n- only its hash moves" },
];

const Page = ({ title, children }) => (
  <html>
    <head><title>{title}</title><link rel="stylesheet" href="/static/site/css/site.css" /></head>
    <body><main>{children}</main></body>
  </html>
);

const pageFiles = pages.map((p) => (
  <File name={\`\${p.slug}.html\`}>
    {"<!doctype html>"}
    <Page title={p.title}><h1>{p.title}</h1>{markdownToHtml(p.body)}</Page>
  </File>
));

export default (
  <Dir name="site">
    <File name="index.html">
      {"<!doctype html>"}
      <Page title="Orrery">
        <h1>The Orrery</h1>
        <ul>{pages.map((p, i) => <li><a href={linkTo(pageFiles[i])}>{p.title}</a></li>)}</ul>
      </Page>
    </File>
    <Dir name="pages">{pageFiles}</Dir>
    <Dir name="css">
      <File name="site.css">{"body { font: 16px/1.5 system-ui; background: #0b1120; color: #e2e8f0; padding: 2rem }\\na { color: #2dd4bf }"}</File>
    </Dir>
    <File name="pages.json">{JSON.stringify(pages.map((p) => p.slug), null, 2)}</File>
    <File name="latest.html" symlink={pageFiles[pageFiles.length - 1]} />
    <Rm target="*.draft.html" />
  </Dir>
);
`,
  },
  scaffold: {
    label: 'project scaffold',
    src: `/** @jsxImportSource @johnhenry/fileable */
import { Dir, File } from "@johnhenry/fileable";

// A template can be a function of --var values. Change them and re-run.
export default function template(vars = { name: "orbit-app", license: "MIT", tests: true }) {
  const pkg = {
    name: vars.name,
    version: "0.1.0",
    type: "module",
    scripts: { test: "node --test" },
  };
  return (
    <Dir name={vars.name}>
      <File name="package.json">{JSON.stringify(pkg, null, 2)}</File>
      <File name="README.md">{\`# \${vars.name}\\n\\nScaffolded by fileable.\\n\`}</File>
      <File name=".gitignore">{["node_modules", "dist", ".env"].join("\\n")}</File>
      <Dir name="src">
        <File name="index.js">{"export const hello = (who) => \`hello, \${who}\`;\\n"}</File>
      </Dir>
      {vars.tests && (
        <Dir name="test">
          <File name="index.test.js">{[
            'import { test } from "node:test";',
            'import { hello } from "../src/index.js";',
            'test("hello", () => hello("ada"));',
          ].join("\\n")}</File>
        </Dir>
      )}
      <File name="LICENSE">{\`\${vars.license} License\\n\\nCopyright (c) \${new Date().getFullYear()}\`}</File>
    </Dir>
  );
}
`,
  },
  inline: {
    label: 'inlining + archive',
    src: `/** @jsxImportSource @johnhenry/fileable */
import { Dir, File } from "@johnhenry/fileable";

const chapters = ["Orbits", "Epicycles", "Transits"];

// A nameless <File> nested inside another <File> is inlined into it.
const Chapter = ({ n, title }) => (
  <File>
    <section><h2>{n}. {title}</h2><p>Chapter {n} of {chapters.length}.</p></section>
  </File>
);

export default (
  <Dir name="book">
    <File name="book.html">
      <h1>The Orrery Book</h1>
      {chapters.map((t, i) => <Chapter n={i + 1} title={t} />)}
    </File>
    {/* the same chapters, as standalone pages inside one .zip */}
    <Dir name="chapters" encode="zip">
      {chapters.map((t, i) => (
        <File name={\`\${i + 1}-\${t.toLowerCase()}.html\`}><h2>{t}</h2></File>
      ))}
    </Dir>
  </Dir>
);
`,
  },
};

const S_PRESETS: Record<string, Preset> = {
  api: {
    label: 'API + static mount',
    src: `/** @jsxImportSource @johnhenry/servable */
import { Router, Group, Route, Use, NotFound, Redirect, Response as ResponseTag } from "@johnhenry/servable";
// \`files\` is the fileable tree from tab 01, mounted below as static routes.

const users = { 1: "Ada", 2: "Grace", 42: "Hopper" };

const timing = async (req, ctx, next) => {
  const t = performance.now();
  const res = await next();
  res.headers.set("server-timing", \`app;dur=\${(performance.now() - t).toFixed(2)}\`);
  return res;
};

export default (
  <Router>
    <Use middleware={timing}>
      <Group prefix="/api" headers={{ "x-api-version": "2" }}>
        <Route path="/hello">Hello from servable!</Route>
        <Route path="/users/:id" handler={(req, { params }) =>
          users[params.id]
            ? Response.json({ id: +params.id, name: users[params.id] })
            : Response.json({ error: "no such user" }, { status: 404 })} />
        <Route path="/echo" method="POST" handler={async (req) =>
          Response.json({ got: await req.text(), type: req.headers.get("content-type") })} />
        <Route path="/users" method="POST">
          <ResponseTag status={201} headers={{ location: "/api/users/43" }}>{{ created: true }}</ResponseTag>
        </Route>
        <NotFound>{{ error: "unknown API route" }}</NotFound>
      </Group>
      <Group prefix="/static" from={files} />
      <Route path="/page"><main><h1>Markup is a response too</h1><p>JSX children become text/html.</p></main></Route>
      <Redirect from="/" to="/static/site/index.html" status={302} />
    </Use>
    <NotFound handler={(req) => new Response(\`nothing at \${new URL(req.url).pathname}\`, { status: 404 })} />
  </Router>
);
`,
    requests: [
      { method: 'GET', path: '/api/users/42' },
      { method: 'GET', path: '/api/users/7' },
      { method: 'POST', path: '/api/echo', headers: 'content-type: application/json', body: '{"hello":"orrery"}' },
      { method: 'POST', path: '/api/users' },
      { method: 'GET', path: '/api/nope' },
      { method: 'GET', path: '/static/site/index.html' },
      { method: 'GET', path: '/static/site/latest.html' },
      { method: 'GET', path: '/page' },
      { method: 'GET', path: '/' },
      { method: 'GET', path: '/elsewhere' },
    ],
  },
  guarded: {
    label: 'auth, errors, streams',
    src: `/** @jsxImportSource @johnhenry/servable */
import { Router, Group, Route, Use, ErrorBoundary, sse } from "@johnhenry/servable";

const requireToken = (req, ctx, next) =>
  req.headers.get("authorization") === "Bearer orrery"
    ? next()
    : Response.json({ error: "missing or bad token" }, { status: 401, headers: { "www-authenticate": "Bearer" } });

const onError = (err, req) =>
  Response.json({ caught: String(err?.message ?? err), path: new URL(req.url).pathname }, { status: 500 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default (
  <Router>
    <Route path="/health">{{ status: "ok" }}</Route>
    <ErrorBoundary handler={onError}>
      <Group prefix="/admin">
        <Use middleware={requireToken}>
          <Route path="/stats" handler={() => Response.json({ rooms: 25, uptimeMs: Math.round(performance.now()) })} />
          <Route path="/explode" handler={() => { throw new Error("reactor breach"); }} />
        </Use>
      </Group>
    </ErrorBoundary>
    <Route path="/ticks" handler={() => sse((async function* () {
      for (let n = 1; n <= 5; n++) { await sleep(350); yield { event: "tick", id: String(n), data: \`orbit \${n}\` }; }
    })())} />
  </Router>
);
`,
    requests: [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/admin/stats' },
      { method: 'GET', path: '/admin/stats', headers: 'authorization: Bearer orrery' },
      { method: 'GET', path: '/admin/explode', headers: 'authorization: Bearer orrery' },
      { method: 'GET', path: '/ticks' },
    ],
  },
};

const H_PRESETS: Record<string, Preset> = {
  gateway: {
    label: 'multi-domain gateway',
    src: `/** @jsxImportSource @johnhenry/hostable */
import { Gateway, Host, Group, Route, Upstream, Redirect } from "@johnhenry/hostable";
import { Router, compile as compileServable } from "@johnhenry/servable";

// A separately compiled servable app, forwarded to in-process (zero network hop).
const billing = await compileServable(
  <Router>
    <Route path="/invoices/:id" handler={(req, { params }) => Response.json({ invoice: params.id, total: 42 })} />
  </Router>
);

export default (
  <Gateway>
    <Host name="api.example.com">
      <Group prefix="/v1">
        <Route path="/users/:id" handler={(req, { params }) => Response.json({ user: params.id, via: "api.example.com" })} />
      </Group>
      <Group prefix="/billing">
        <Upstream app={billing} />
      </Group>
    </Host>
    <Host name="www.example.com">
      {/* prefix="/" on purpose: a prefix-less Group joins to "." and its routes never match */}
      <Group prefix="/" from={files} />
      <Redirect from="/" to="/site/index.html" status={302} />
    </Host>
    <Host pattern="*.preview.example.com">
      <Upstream handler={(req) => new Response(\`preview build for "\${new URL(req.url).hostname.split(".")[0]}"\`)} />
    </Host>
    <Route path="/health">{{ gateway: "ok" }}</Route>
  </Gateway>
);
`,
    requests: [
      { method: 'GET', host: 'api.example.com', path: '/v1/users/7' },
      { method: 'GET', host: 'api.example.com', path: '/billing/invoices/2026-09' },
      { method: 'GET', host: 'www.example.com', path: '/site/index.html' },
      { method: 'GET', host: 'www.example.com', path: '/' },
      { method: 'GET', host: 'pr-128.preview.example.com', path: '/' },
      { method: 'GET', host: 'anything.dev', path: '/health' },
      { method: 'GET', host: 'anything.dev', path: '/v1/users/7' },
    ],
  },
  canary: {
    label: 'blue / green canary',
    src: `/** @jsxImportSource @johnhenry/hostable */
import { Gateway, Host, Route, Upstream } from "@johnhenry/hostable";
import { Router, compile as compileServable } from "@johnhenry/servable";

const version = (color, n) => compileServable(
  <Router>
    <Route path="/*" handler={(req) => Response.json({ color, version: n, path: new URL(req.url).pathname })} />
  </Router>
);
const blue = await version("blue", "1.4.0");
const green = await version("green", "1.5.0-rc");

export default (
  <Gateway>
    {/* any Fetch-shaped object can sit directly inside a Host */}
    <Host name="blue.example.com">{blue}</Host>
    <Host name="green.example.com">{green}</Host>
    <Host name="app.example.com">
      <Upstream handler={(req) => (req.headers.get("x-canary") === "1" ? green : blue).fetch(req)} />
    </Host>
  </Gateway>
);
`,
    requests: [
      { method: 'GET', host: 'app.example.com', path: '/checkout' },
      { method: 'GET', host: 'app.example.com', path: '/checkout', headers: 'x-canary: 1' },
      { method: 'GET', host: 'blue.example.com', path: '/cart' },
      { method: 'GET', host: 'green.example.com', path: '/' },
      { method: 'GET', host: 'red.example.com', path: '/' },
    ],
  },
};

const PRESETS: Record<TabId, Record<string, Preset>> = { fileable: F_PRESETS, servable: S_PRESETS, hostable: H_PRESETS, deploy: {} };

/* ============================================================================
 * Domable handoff: a React-element-shaped tree -> a fileable preset
 * ========================================================================== */

interface ReactLike { type?: unknown; props?: Record<string, unknown> & { children?: unknown } }
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isEl = (n: unknown): n is ReactLike => !!n && typeof n === 'object' && !Array.isArray(n) && 'props' in (n as object);
/** domable's reactToJSON() stringifies React.Fragment as "Symbol(react.fragment)"; treat that (and non-string types) as a fragment. */
const isFragmentType = (t: unknown): boolean => typeof t !== 'string' || t === 'Fragment' || /^Symbol\((react\.)?fragment\)$/i.test(t);

const kids = (n: ReactLike): unknown[] => ([] as unknown[]).concat(n.props?.children ?? []).flat(Infinity);

function attrPairs(props: Record<string, unknown>): [string, string | true][] {
  const out: [string, string | true][] = [];
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'key' || k === 'ref' || k === 'dangerouslySetInnerHTML' || v == null || v === false || typeof v === 'function') continue;
    const name = k === 'className' ? 'class' : k === 'htmlFor' ? 'for' : k;
    if (v === true) { out.push([name, true]); continue; }
    if (name === 'style' && typeof v === 'object') {
      out.push([name, Object.entries(v as Record<string, unknown>).map(([p, x]) => `${p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${x}`).join('; ')]);
      continue;
    }
    out.push([name, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
  }
  return out;
}

function reactToHtml(n: unknown): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return escHtml(String(n));
  if (Array.isArray(n)) return n.map(reactToHtml).join('');
  if (!isEl(n)) return '';
  const inner = (n.props?.dangerouslySetInnerHTML as { __html?: string } | undefined)?.__html ?? kids(n).map(reactToHtml).join('');
  if (isFragmentType(n.type)) return inner;
  const tag = String(n.type);
  const attrs = attrPairs(n.props ?? {}).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)).join('');
  return VOID.has(tag) ? `<${tag}${attrs}>` : `<${tag}${attrs}>${inner}</${tag}>`;
}

const pascal = (s: string) => s.replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toUpperCase()).replace(/^(\d)/, 'C$1') || 'Part';

/** Render React-shaped nodes as JSX source text (class= attributes: fileable serializes props verbatim). */
function reactToJsx(n: unknown, ind: string, refs: Map<unknown, string>): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') {
    const t = String(n);
    if (!t.trim()) return t.includes('\n') ? '' : `${ind}{" "}`;
    return /^[^{}<>\n]*$/.test(t) && t === t.trim() ? ind + t : `${ind}{${JSON.stringify(t)}}`;
  }
  if (Array.isArray(n)) return n.map((c) => reactToJsx(c, ind, refs)).filter(Boolean).join('\n');
  if (!isEl(n)) return '';
  const ref = refs.get(n);
  if (ref) return `${ind}<${ref} />`;
  const tag = isFragmentType(n.type) ? '' : String(n.type);
  // A fragment has no attributes and renders as the <>…</> shorthand.
  const attrs = tag ? attrPairs(n.props ?? {}).map(([k, v]) => (v === true ? ` ${k}` : / "|"|\{|\}/.test(v) || v.includes('"') ? ` ${k}={${JSON.stringify(v)}}` : ` ${k}="${v}"`)).join('') : '';
  const ch = kids(n);
  if (!ch.length) return tag ? `${ind}<${tag}${attrs} />` : '';
  if (tag && VOID.has(tag)) return `${ind}<${tag}${attrs} />`;
  if (ch.length === 1 && (typeof ch[0] === 'string' || typeof ch[0] === 'number') && String(ch[0]).length < 60) {
    return `${ind}<${tag}${attrs}>${reactToJsx(ch[0], '', refs)}</${tag}>`;
  }
  const inner = ch.map((c) => reactToJsx(c, ind + '  ', refs)).filter(Boolean).join('\n');
  return `${ind}<${tag}${attrs}>\n${inner}\n${ind}</${tag}>`;
}

function domablePreset(tree: unknown, rawName?: string): Preset {
  const roots = ([] as unknown[]).concat(tree).flat(Infinity).filter(isEl);
  const flatRoots = roots.flatMap((r) => (!isFragmentType(r.type) ? [r] : kids(r).filter(isEl)));
  const first = flatRoots[0];
  const cls = first && typeof first.props?.className === 'string' ? String(first.props.className).split(/\s+/)[0] : '';
  const name = (rawName || cls || (first && !isFragmentType(first.type) ? String(first.type) : '') || 'domable').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'domable';
  const Root = pascal(name);
  // Extract each element child of the root(s) that has element children of its own into a component.
  const parts: { name: string; node: ReactLike }[] = [];
  const used = new Set<string>([Root]);
  for (const r of flatRoots) {
    for (const c of kids(r).filter(isEl)) {
      if (isFragmentType(c.type) || !kids(c).some(isEl) || parts.length >= 6) continue;
      const hint = typeof c.props?.className === 'string' ? String(c.props.className).split(/\s+/)[0] : String(c.type);
      let nm = Root + pascal(hint);
      for (let k = 2; used.has(nm); k++) nm = Root + pascal(hint) + k;
      used.add(nm);
      parts.push({ name: nm, node: c });
    }
  }
  const noRefs = new Map<unknown, string>();
  const refs = new Map<unknown, string>(parts.map((p) => [p.node, p.name]));
  const compDecl = (nm: string, body: string) => `const ${nm} = () => (\n${body}\n);`;
  const partDecls = parts.map((p) => compDecl(p.name, reactToJsx(p.node, '  ', noRefs)));
  const rootBody = flatRoots.length === 1 ? reactToJsx(flatRoots[0], '  ', refs) : `  <>\n${flatRoots.map((r) => reactToJsx(r, '    ', refs)).join('\n')}\n  </>`;
  const html = reactToHtml(flatRoots);
  const tl = (s: string) => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
  const compFile = (nm: string, node: ReactLike) => tl(`export const ${nm} = () => (\n${reactToJsx(node, '  ', noRefs)}\n);\n`);
  const src = `/** @jsxImportSource @johnhenry/fileable */
import { Dir, File } from "@johnhenry/fileable";

// Handed off from the Domable room: a React-element-shaped tree (${html.length} bytes of HTML),
// scaffolded into files. Components render straight into index.html; their JSX
// source is written to components/ as well.

${[...partDecls, compDecl(Root, rootBody)].join('\n\n')}

export default (
  <Dir name="${name}">
    <File name="index.html">
      {"<!doctype html>\\n"}
      <html>
        <head><meta charset="utf-8" /><title>${name}</title></head>
        <body><${Root} /></body>
      </html>
    </File>
    <Dir name="components">
${[{ name: Root, node: null as ReactLike | null }, ...parts].map((p) =>
    p.node
      ? `      <File name="${p.name}.jsx">{${compFile(p.name, p.node)}}</File>`
      : `      <File name="${p.name}.jsx">{${tl(`${parts.map((q) => `import { ${q.name} } from "./${q.name}.jsx";\n`).join('')}${parts.length ? '\n' : ''}export const ${Root} = () => (\n${rootBody}\n);\n`)}}</File>`,
  ).join('\n')}
    </Dir>
    <File name="snapshot.html">{${JSON.stringify(html)}}</File>
  </Dir>
);
`;
  return { label: `from Domable: ${name}`, src };
}

/* ============================================================================
 * Source highlighting (overlay under a transparent textarea)
 * ========================================================================== */

const TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(<\/?[A-Za-z][\w.:-]*|(?<!=)\/?>|<>|<\/>)|([A-Za-z_][\w-]*(?==[{"']))|\b(const|let|var|return|export|default|import|from|async|await|function|new|if|else|true|false|null|undefined|of|in|typeof|for|throw)\b|\b(\d+(?:\.\d+)?)\b/g;
const TOKEN_CLS = ['', 'cm', 'str', 'tag', 'attr', 'kw', 'num'];
interface Mark { start: number; end: number; cls: string }

function highlightHtml(src: string, marks: Mark[]): string {
  const n = src.length;
  const tok: string[] = new Array(n).fill('');
  const mk: string[] = new Array(n).fill('');
  for (const m of src.matchAll(TOKEN_RE)) {
    const g = m.findIndex((x, k) => k > 0 && x !== undefined);
    for (let k = m.index!; k < m.index! + m[0].length; k++) tok[k] = TOKEN_CLS[g];
  }
  for (const m of marks) for (let k = Math.max(0, m.start); k < Math.min(n, m.end); k++) mk[k] = mk[k] ? mk[k] + ' ' + m.cls : m.cls;
  let out = '';
  let k = 0;
  while (k < n) {
    let j = k + 1;
    while (j < n && tok[j] === tok[k] && mk[j] === mk[k]) j++;
    const text = escHtml(src.slice(k, j));
    const cls = [tok[k] && 'sx-' + tok[k], mk[k]].filter(Boolean).join(' ');
    out += cls ? `<span class="${cls}">${text}</span>` : text;
    k = j;
  }
  return out + '\n\n';
}

/* ============================================================================
 * The planet
 * ========================================================================== */

const TABS: { id: TabId; num: string; title: string; pkg: string; sub: string }[] = [
  { id: 'fileable', num: '01', title: 'Fileable', pkg: '@johnhenry/fileable', sub: 'JSX → files' },
  { id: 'servable', num: '02', title: 'Servable', pkg: '@johnhenry/servable', sub: 'JSX → dispatcher' },
  { id: 'hostable', num: '03', title: 'Hostable', pkg: '@johnhenry/hostable', sub: 'JSX → gateway' },
  { id: 'deploy', num: '04', title: 'Deploy', pkg: '@johnhenry/servable', sub: 'targets + pipeline' },
];

const EXPLAIN: Record<TabId, string> = {
  fileable: `Your JSX runs through <b>fileable's own runtime</b> (<code>Dir</code>/<code>File</code>/<code>Rm</code> are its real exports), then its real pipeline stages: <b>build</b> normalizes the tree, <b>resolve</b> settles props, <b>layout</b> assigns output paths, inlines nameless files and resolves <code>linkTo()</code> and symlinks, and <b>hash</b> computes the same SHA-256 content hashes its <code>.fileable-lock.json</code> stores. The final <b>write</b> stage needs a disk, so this planet stops there: it's a dry run. Edit a page and only that file's hash changes, so only that file would be rewritten.`,
  servable: `The same JSX-to-descriptor trick, aimed at HTTP. <code>compile()</code> turns the tree into one Fetch-style <code>(Request) =&gt; Response</code> function, and the composer calls it directly: no server, no network. <code>&lt;Group from={files}&gt;</code> mounts <b>tab 01's fileable tree</b> as static routes (servable runs fileable's build/resolve/layout itself). The planet wraps each <code>Route</code>/<code>Group</code> in an invisible tracing <code>&lt;Use&gt;</code>, which is how it knows which element answered and can highlight it in the source.`,
  hostable: `A gateway: <code>&lt;Host&gt;</code> scopes match on the request's hostname before any path matching happens, and <code>&lt;Upstream&gt;</code> forwards to a URL, an in-process app, or a handler. hostable lowers the Gateway into one servable tree (the lanes below are that tree's compiled route table, grouped by hostname). Fetch won't let a page set a <code>Host</code> header, so the composer puts your Host into the request URL, which is exactly what servable's <code>URLPattern</code> matching reads.`,
  deploy: `Two real deploys of <b>tab 02's compiled app</b>, not a mockup. <b>Targets</b>: <code>servable/adapters/cloudflare</code>'s <code>toWorker(compiled)</code> hands back the exact <code>{fetch}</code> shape a Cloudflare Worker exports by default; the Deno/Bun/Node panels are the same compiled app through those adapters' own <code>serve()</code> — genuinely runnable source, not prose. <b>Live preview</b> registers a real <code>ServiceWorker</code> from a blob script at a scoped path: its <code>fetch</code> handler relays each request to this page over a <code>MessageChannel</code>, which answers with the SAME <code>toWorker()</code> handler, so what comes back travelled through an actual installed worker and a real network-shaped request, not an in-page call. <b>The pipeline</b> chains five more real library calls end to end: fileable's <code>plan()</code> hashes a tree with a <code>&lt;Dir encode="wbn"&gt;</code>; since fileable's own <code>.wbn</code> writer is Node-only, packfile's <code>toArchive()</code> builds the identical gzip(Web Bundle) bytes as a bridge, which packfile's <code>fromArchive()</code> reads back and <code>createRouter()</code> serves; servable's <code>&lt;Group from&gt;</code> mounts the same tree's loose files as routes; hostable's <code>&lt;Gateway&gt;&lt;Host&gt;&lt;Upstream app={dialbackServer}&gt;</code> forwards to it through a real <code>@johnhenry/dialback</code> <code>Server</code> — its <code>fetch</code> is a real getter, and with no agent connected its constructor-supplied default handler answers instead.`,
};

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const DEFAULTS = { tab: 'fileable', f: 'site', s: 'api', h: 'gateway', m: '', p: '', host: '', dt: 'cloudflare' };
const DOMABLE_KEY = 'orrery:studio:domable';

const esc = escHtml;
const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`);
const byteLen = (c: unknown) => (typeof c === 'string' ? new TextEncoder().encode(c).length : (c as { length?: number })?.length ?? 0);

interface Stage { name: string; ms?: number; state: 'ok' | 'skip' | 'err' | 'idle'; note?: string }
/** Shared by the tabs 1–3 pipeline strip (`.st-pipeline`) and tab 04's own local strips. */
function stageStripHtml(stages: Stage[]): string {
  return stages
    .map((s, k) => `${k ? '<span class="arr">→</span>' : ''}<span class="stg ${s.state}" title="${esc(s.note ?? '')}"><b>${esc(s.name)}</b>${s.ms !== undefined ? `<i>${s.ms < 1 ? s.ms.toFixed(2) : s.ms.toFixed(1)} ms</i>` : s.note ? `<i>${esc(s.note)}</i>` : ''}</span>`)
    .join('');
}
async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface RouteRow { method: string; host: string; path: string; loc?: number; kind: string; redirect?: string; descriptor?: any }

/* ============================================================================
 * Tab 04 (Deploy): multi-target entry sources + a real in-page Service Worker
 * ========================================================================== */

interface EntryFile { label: string; filename: string; code: string }

/** Real, standalone entry-point sources for each runtime, built around whatever JSX is currently compiled in tab 02. */
function entrySources(appSrc: string): Record<'app' | 'cloudflare' | 'deno' | 'bun' | 'node', EntryFile> {
  const banner = `// This is exactly the JSX currently compiled in tab 02 (Servable).\n// \`files\` is tab 01's fileable tree, supplied by this room -- a standalone\n// deploy needs its own tree (or drop the <Group from={files}> line).\n\n`;
  return {
    app: { label: 'app.tsx', filename: 'app.tsx', code: banner + appSrc },
    cloudflare: {
      label: 'Cloudflare Workers',
      filename: 'worker.ts',
      code: `import { compile } from "@johnhenry/servable";
import { toWorker } from "@johnhenry/servable/adapters/cloudflare";
import app from "./app.tsx";

// toWorker() hands back a pure { fetch } -- exactly the shape a module
// Worker's default export needs. No adapter-specific glue beyond this.
const compiled = await compile(app, { cwd: "/" });
export default toWorker(compiled);
`,
    },
    deno: {
      label: 'Deno',
      filename: 'server.deno.ts',
      code: `import { compile } from "@johnhenry/servable";
import { serve } from "@johnhenry/servable/adapters/deno";
import app from "./app.tsx";

// Deno.serve() already speaks (Request) => Response natively --
// this adapter is a thin pass-through, not a bridge.
const compiled = await compile(app, { cwd: import.meta.dirname ?? "." });
serve(compiled, { port: 8787 });
console.log("listening on http://localhost:8787");
`,
    },
    bun: {
      label: 'Bun',
      filename: 'server.bun.ts',
      code: `import { compile } from "@johnhenry/servable";
import { serve } from "@johnhenry/servable/adapters/bun";
import app from "./app.tsx";

// Bun.serve() also speaks (Request) => Response natively.
const compiled = await compile(app, { cwd: import.meta.dir });
const server = serve(compiled, { port: 8787 });
console.log(\`listening on \${server.url}\`);
`,
    },
    node: {
      label: 'Node',
      filename: 'server.node.mjs',
      code: `import { compile } from "@johnhenry/servable";
import { serve } from "@johnhenry/servable/adapters/node";
import app from "./app.tsx";

// node:http speaks IncomingMessage/ServerResponse, not Request/Response --
// this adapter bridges through @johnhenry/leserve's serve() underneath.
// (app.tsx is JSX: run this through a loader that strips/transpiles it,
// e.g. \`tsx\`, or pre-bundle with esbuild/tsc first.)
const compiled = await compile(app, { cwd: process.cwd() });
serve(compiled, {
  port: 8787,
  onListen: (info) => console.log(\`listening on http://localhost:\${info.port}\`),
});
`,
    },
  };
}

/** The pipeline's demo tree: a loose index.html (servable <Group from> can mount it) beside a <Dir encode="wbn"> (fileable/packfile archive it). */
function buildDemoTree(F: Record<string, any>) {
  return F.Dir({
    name: 'deploy-demo',
    children: [
      F.File({ name: 'index.html', children: ['<!doctype html><h1>deploy pipeline</h1><p>packaged separately as a Web Bundle.</p>'] }),
      F.Dir({
        name: 'assets',
        encode: 'wbn',
        children: [
          F.File({ name: 'style.css', children: ['body{background:#0b1120;color:#e2e8f0;font:14px system-ui}'] }),
          F.File({ name: 'app.js', children: ['export const hello = () => "pipeline";\n'] }),
          F.File({ name: 'hello.txt', children: ['hello from the orrery deploy pipeline'] }),
        ],
      }),
    ],
  });
}

async function mountStudio(host: HTMLElement): Promise<() => void> {
  const disposers: (() => void)[] = [];
  let disposed = false;
  const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, ev: K | string, fn: (e: any) => void) => {
    el.addEventListener(ev, fn);
    disposers.push(() => el.removeEventListener(ev, fn));
  };

  const handoff = receive<{ tree?: unknown; name?: string }>('studio');
  const state = readState(DEFAULTS) as typeof DEFAULTS;

  // Restore / accept a Domable handoff preset
  try {
    const saved = sessionStorage.getItem(DOMABLE_KEY);
    if (saved) F_PRESETS.domable = JSON.parse(saved);
  } catch {}
  let handoffNote = '';
  if (handoff && handoff.kind === 'react-tree' && handoff.payload?.tree) {
    try {
      const pre = domablePreset(handoff.payload.tree, handoff.payload.name);
      F_PRESETS.domable = pre;
      try { sessionStorage.setItem(DOMABLE_KEY, JSON.stringify(pre)); } catch {}
      state.tab = 'fileable';
      state.f = 'domable';
      handoffNote = `Received a React-shaped tree and scaffolded it as fileable JSX: <code>index.html</code> with the rendered markup plus a <code>components/</code> dir.`;
    } catch (e) {
      handoffNote = `Received a React-shaped tree, but converting it failed: ${esc(String((e as Error).message))}`;
    }
  }
  if (!['fileable', 'servable', 'hostable', 'deploy'].includes(state.tab)) state.tab = 'fileable';
  if (!F_PRESETS[state.f]) state.f = DEFAULTS.f;
  if (!S_PRESETS[state.s]) state.s = DEFAULTS.s;
  if (!H_PRESETS[state.h]) state.h = DEFAULTS.h;

  const root = document.createElement('div');
  root.className = 'pg-studio';
  host.append(root);
  if (handoff && handoffNote) root.append(handoffBanner(handoff, handoffNote));

  const shell = document.createElement('div');
  shell.className = 'st-shell';
  shell.innerHTML = `
    <div class="st-top">
      <div class="st-tabs" role="tablist">
        ${TABS.map((t) => `<button class="st-tab" role="tab" data-tab="${t.id}"><span class="num">${t.num}</span><span class="tt">${t.title}</span><span class="sub">${t.sub}</span></button>`).join('')}
      </div>
      <div class="st-tools">
        <label class="field st-preset"><span>preset</span><select></select></label>
        <button class="btn st-copy" type="button">copy link</button>
      </div>
    </div>
    <div class="st-pipeline"></div>
    <div class="st-grid">
      <section class="panel st-editor-panel">
        <header class="st-ph"><span class="dot"></span><b class="st-file">site.jsx</b><span class="stat st-estat"></span></header>
        <div class="st-editor">
          <pre class="st-hl" aria-hidden="true"></pre>
          <textarea class="st-ta" spellcheck="false" wrap="off" autocapitalize="off" autocomplete="off"></textarea>
        </div>
        <pre class="code st-err" hidden></pre>
        <div class="st-scope stat"></div>
      </section>
      <section class="panel st-out"></section>
    </div>
    <section class="panel st-deploy" style="display:none"></section>
    <details class="panel st-explain" open><summary>What's happening</summary><p></p></details>`;
  root.append(shell);

  const $ = <T extends Element = HTMLElement>(sel: string, r: ParentNode = shell) => r.querySelector(sel) as T;
  const tabBtns = [...shell.querySelectorAll<HTMLButtonElement>('.st-tab')];
  const presetSel = $<HTMLSelectElement>('.st-preset select');
  const ta = $<HTMLTextAreaElement>('.st-ta');
  const hl = $<HTMLPreElement>('.st-hl');
  const errBox = $<HTMLPreElement>('.st-err');
  const out = $('.st-out');
  const pipe = $('.st-pipeline');
  const fileLabel = $('.st-file');
  const estat = $('.st-estat');
  const scopeBox = $('.st-scope');
  const explain = $('.st-explain p');

  const loading = document.createElement('div');
  loading.className = 'st-loading stat';
  loading.textContent = 'linking fileable + servable + hostable into the page…';
  out.append(loading);

  let L: Libs;
  try {
    L = await loadLibs();
  } catch (e) {
    out.innerHTML = `<pre class="code st-err">Could not load the libraries:\n${esc(String((e as Error)?.stack ?? e))}</pre>`;
    return () => root.remove();
  }
  if (disposed) return () => {};
  const { F, S, SJ, H, HJ } = L;

  /* ---------------- per-tab state ---------------- */
  const presetOf = (t: TabId) => (t === 'fileable' ? state.f : t === 'servable' ? state.s : state.h);
  const sources: Record<TabId, string> = {
    fileable: F_PRESETS[state.f].src,
    servable: S_PRESETS[state.s].src,
    hostable: H_PRESETS[state.h].src,
    deploy: '',
  };
  const firstReq = (t: TabId): Req => {
    const p = PRESETS[t][presetOf(t)]?.requests?.[0];
    return p ? { ...p } : { method: 'GET', path: '/', host: 'api.example.com' };
  };
  const reqs: Record<'servable' | 'hostable', Req> = { servable: firstReq('servable'), hostable: firstReq('hostable') };
  if ((state.tab === 'servable' || state.tab === 'hostable') && (state.p || state.m || state.host)) {
    const r = reqs[state.tab as 'servable' | 'hostable'];
    if (state.m && METHODS.includes(state.m)) r.method = state.m;
    if (state.p) r.path = state.p;
    if (state.host) r.host = state.host;
    r.headers = ''; r.body = '';
  }
  let marks: Mark[] = [];
  let prevHashes = new Map<string, string>();
  let compileSeq = 0;
  let compileTimer = 0;

  /* ---------------- deploy tab state (worker + service worker) ---------------- */
  let deployWorkerFetch: ((req: Request) => Promise<Response>) | null = null;
  let swReg: ServiceWorkerRegistration | null = null;
  let swFrameWindow: Window | null = null;
  let swListenerAttached = false;

  const persist = () => {
    const tab = state.tab as TabId;
    const r = tab === 'servable' || tab === 'hostable' ? reqs[tab] : null;
    writeState({ ...state, m: r?.method ?? '', p: r?.path ?? '', host: tab === 'hostable' ? r?.host ?? '' : '' }, DEFAULTS);
  };

  /* ---------------- editor ---------------- */
  const paint = () => { hl.innerHTML = highlightHtml(ta.value, marks); syncScroll(); };
  const syncScroll = () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; };
  const setMarks = (m: Mark[], scrollTo?: number) => {
    marks = m;
    paint();
    if (scrollTo !== undefined) {
      const line = ta.value.slice(0, scrollTo).split('\n').length - 1;
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
      const y = line * lh;
      if (y < ta.scrollTop + lh || y > ta.scrollTop + ta.clientHeight - lh * 3) ta.scrollTop = Math.max(0, y - ta.clientHeight / 3);
      syncScroll();
    }
  };
  on(ta, 'scroll', syncScroll);
  on(ta, 'input', () => {
    sources[state.tab as TabId] = ta.value;
    marks = [];
    paint();
    clearTimeout(compileTimer);
    compileTimer = window.setTimeout(() => void compileCurrent(), 280);
  });
  on(ta, 'keydown', (e: KeyboardEvent) => {
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.setRangeText('  ', s, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  });
  disposers.push(() => clearTimeout(compileTimer));

  const showError = (e: unknown, src?: string) => {
    let msg = String((e as Error)?.message ?? e);
    if (e instanceof JsxError && src !== undefined) {
      msg = `JSX ${lineCol(src, e.pos)}  ${msg}`;
      setMarks([{ start: e.pos, end: e.pos + 1, cls: 'mk-err' }], e.pos);
    }
    const path = (e as { path?: string })?.path;
    if (path && !msg.includes(path)) msg += `\n  at ${path}`;
    errBox.textContent = msg;
    errBox.hidden = false;
  };
  const clearError = () => { errBox.hidden = true; errBox.textContent = ''; };

  /* ---------------- pipeline strip ---------------- */
  const renderPipe = (stages: Stage[]) => { pipe.innerHTML = stageStripHtml(stages); };
  const time = async <T,>(fn: () => T | Promise<T>): Promise<[T, number]> => {
    const t = performance.now();
    const v = await fn();
    return [v, performance.now() - t];
  };

  /* ---------------- evaluate the fileable tab (also used by tabs 2/3) ---------------- */
  const fileableScope = () => ({ Dir: F.Dir, File: F.File, Rm: F.Rm, Fragment: F.Fragment, linkTo: F.linkTo, warn: F.warn, markdownToHtml: F.markdownToHtml });
  async function evalFiles(src: string) {
    const { value, locs } = await runModule(src, fileableScope(), makeH(F.jsx));
    const tree = typeof value === 'function' ? (value as (v?: unknown) => unknown)() : value;
    return { tree, locs };
  }
  async function filesForMount(): Promise<{ tree: unknown; note: string }> {
    try {
      return { tree: (await evalFiles(sources.fileable)).tree, note: '' };
    } catch (e) {
      return { tree: F.Dir({ name: 'site', children: [F.File({ name: 'index.html', children: ['tab 01 has an error'] })] }), note: `tab 01 failed (${(e as Error).message}); mounted a placeholder` };
    }
  }

  /* ======================= TAB 1: FILEABLE ======================= */
  let fSelected = '';
  async function runFileable(seq: number) {
    const src = sources.fileable;
    const stages: Parameters<typeof renderPipe>[0] = [];
    try {
      const [{ tree, locs }, tEval] = await time(() => evalFiles(src));
      stages.push({ name: 'JSX', ms: tEval, state: 'ok' });
      const [built, tB] = await time(() => F.build(tree));
      stages.push({ name: 'build', ms: tB, state: 'ok' });
      const [resolved, tR] = await time(() => F.resolve(built, { cwd: '/' }));
      stages.push({ name: 'resolve', ms: tR, state: 'ok' });
      const [laid, tL] = await time(() => F.layout(resolved, {}));
      stages.push({ name: 'layout', ms: tL, state: 'ok' });
      const ctx = F.drainBuildContext();
      const [hashed, tH] = await time(() => F.hash(laid, ctx.collectionPatterns));
      stages.push({ name: 'hash', ms: tH, state: 'ok' });
      stages.push({ name: 'write', state: 'skip', note: 'dry run, no disk' });
      if (seq !== compileSeq || disposed) return;
      renderPipe(stages);
      clearError();
      renderFileTree(hashed, locs, [...(ctx.warnings ?? []), ...(laid.warnings ?? [])]);
    } catch (e) {
      if (seq !== compileSeq || disposed) return;
      stages.push({ name: stages.length ? ['build', 'resolve', 'layout', 'hash'][stages.length - 1] ?? 'error' : 'JSX', state: 'err' });
      renderPipe(stages);
      showError(e, prepareModule(src));
    }
  }

  function renderFileTree(hashed: any, locs: Loc[], warnings: string[]) {
    const arts: any[] = hashed.artifacts;
    const byId: Map<string, any> = hashed.byId;
    const childIds = new Set(arts.flatMap((a) => a.children));
    const roots = arts.filter((a) => !childIds.has(a.id));
    const next = new Map<string, string>();
    let nNew = 0, nChanged = 0, nSame = 0, bytes = 0, nFiles = 0;
    const rows: string[] = [];
    const walk = (a: any, depth: number) => {
      const prev = prevHashes.get(a.id);
      next.set(a.id, a.hash);
      const st = prev === undefined ? 'new' : prev === a.hash ? 'same' : 'changed';
      if (st === 'new') nNew++; else if (st === 'changed') nChanged++; else nSame++;
      const isArchive = (a.target === 'zip' || a.target === 'wbn') && a.containerPath === a.outputPath;
      const kind = a.symlinkTo !== undefined ? 'link' : isArchive ? 'zip' : a.kind;
      const size = a.kind === 'file' && a.symlinkTo === undefined ? byteLen(a.content) : 0;
      if (a.kind === 'file') { nFiles++; bytes += size; }
      const name = a.outputPath.split('/').pop();
      const icon = kind === 'dir' ? '▾' : kind === 'zip' ? '▣' : kind === 'link' ? '↪' : '◆';
      rows.push(`<tr class="fr k-${kind} ${a.id === fSelected ? 'sel' : ''} st-${st}" data-id="${esc(a.id)}">
        <td class="nm" style="--d:${depth}"><span class="ic">${icon}</span>${esc(name)}${kind === 'link' ? ` <span class="lk">→ ${esc(a.symlinkTo)}</span>` : ''}${kind === 'zip' ? ' <span class="chip">archive</span>' : ''}</td>
        <td class="sz">${a.kind === 'file' && kind !== 'link' ? fmtBytes(size) : ''}</td>
        <td class="hs" title="${esc(a.hash)}">${esc(a.hash.slice(7, 19))}</td>
        <td class="stt"><span class="badge ${st}">${st === 'same' ? 'cached' : st}</span></td></tr>`);
      for (const c of a.children) { const ch = byId.get(c); if (ch) walk(ch, depth + 1); }
    };
    roots.forEach((r) => walk(r, 0));
    const gone = [...prevHashes.keys()].filter((k) => !next.has(k));
    prevHashes = next;
    if (!fSelected || !byId.has(fSelected)) fSelected = arts.find((a) => a.kind === 'file' && /\.html$/.test(a.outputPath) && a.symlinkTo === undefined)?.id ?? arts.find((a) => a.kind === 'file')?.id ?? '';
    const removals: string[] = (hashed.removals ?? []).map((r: string | { pattern: string }) => (typeof r === 'string' ? r : r.pattern));
    out.innerHTML = `
      <header class="st-ph"><span class="dot"></span><b>artifact tree</b>
        <span class="stat"><b>${nFiles}</b> files · <b>${fmtBytes(bytes)}</b> · write plan: <b>${nNew + nChanged}</b> to write, <b>${nSame}</b> cached${gone.length ? `, <b>${gone.length}</b> no longer produced` : ''}</span></header>
      <div class="st-tablewrap"><table class="st-files">
        <thead><tr><th>path</th><th>size</th><th>sha256</th><th>lock</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table></div>
      ${removals.length ? `<div class="stat st-rm">Rm: ${removals.map((r) => `<code>${esc(r)}</code>`).join(' ')} <span>(removal globs, applied by the write stage)</span></div>` : ''}
      ${warnings.length ? `<div class="st-warn">${warnings.map((w) => `⚠ ${esc(w)}`).join('<br>')}</div>` : ''}
      <div class="st-viewer"></div>
      <div class="st-actions"><button class="btn st-serve" type="button">Serve this tree in 02 <span class="arrow">→</span></button></div>`;
    const packBtn = handoffButton({
      from: 'studio',
      to: 'packfile',
      kind: 'fileable-tree',
      label: 'Pack this tree',
      getPayload: () => {
        // packfile's toArchive() input (FileEntry: { data, size, hash }) has no
        // symlink concept at all -- verified against packfile's types.ts, the
        // real source of FileEntry -- so symlinks can't be carried; be honest
        // about the drop instead of silently losing them.
        const fileArts = arts.filter((a) => a.kind === 'file');
        const symlinks = fileArts.filter((a) => a.symlinkTo !== undefined);
        const regular = fileArts.filter((a) => a.symlinkTo === undefined);
        const toBase64 = (bytes: Uint8Array): string => {
          let bin = '';
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
          return btoa(bin);
        };
        return {
          files: regular.map((a) =>
            typeof a.content === 'string'
              ? { path: a.outputPath, content: a.content, encoding: 'utf8' as const }
              : { path: a.outputPath, content: toBase64(a.content as Uint8Array), encoding: 'base64' as const },
          ),
          droppedSymlinks: symlinks.length,
        };
      },
    });
    $('.st-actions', out).append(packBtn);
    const tbody = $('tbody', out);
    tbody.addEventListener('click', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      if (!tr) return;
      fSelected = tr.dataset.id!;
      tbody.querySelectorAll('tr').forEach((r) => r.classList.toggle('sel', r === tr));
      showArtifact(byId.get(fSelected), locs, true);
    });
    $('.st-serve', out).addEventListener('click', () => {
      const a = byId.get(fSelected);
      const path = a && a.target === 'loose' && a.kind === 'file' ? a.outputPath : 'site/index.html';
      reqs.servable = { method: 'GET', path: `/static/${path}` };
      if (!/from=\{files\}/.test(sources.servable)) { state.s = 'api'; sources.servable = S_PRESETS.api.src; }
      switchTab('servable');
    });
    showArtifact(byId.get(fSelected), locs, false);
  }

  function showArtifact(a: any, locs: Loc[], scroll: boolean) {
    const viewer = $('.st-viewer', out);
    if (!a) { viewer.innerHTML = ''; return; }
    const loc = a.descriptor?.props?.[LOC];
    const l = typeof loc === 'number' ? locs[loc] : undefined;
    setMarks(l ? [{ start: l.start, end: l.end, cls: 'mk-hit' }] : [], scroll && l ? l.start : undefined);
    const content = a.kind === 'dir' ? `(${a.children.length} entr${a.children.length === 1 ? 'y' : 'ies'})` : a.symlinkTo !== undefined ? `symlink → ${a.symlinkTo}` : typeof a.content === 'string' ? a.content : `[${byteLen(a.content)} binary bytes]`;
    const isHtml = /\.html?$/.test(a.outputPath) && typeof a.content === 'string';
    viewer.innerHTML = `<div class="vh"><code>${esc((a.target === 'zip' || a.target === 'wbn') && a.containerPath !== a.outputPath ? `${a.containerPath} :: ${a.outputPath}` : a.outputPath)}</code>
      <span class="stat">${esc(a.hash)}</span>${isHtml ? '<button class="btn st-prev" type="button">preview</button>' : ''}</div>
      <pre class="code">${esc(content)}</pre>`;
    if (isHtml) {
      const btn = $('.st-prev', viewer);
      btn.addEventListener('click', () => {
        const pre = $('pre', viewer);
        const existing = viewer.querySelector('iframe');
        if (existing) { existing.remove(); pre.hidden = false; btn.textContent = 'preview'; return; }
        const f = document.createElement('iframe');
        f.setAttribute('sandbox', '');
        f.srcdoc = a.content;
        pre.hidden = true;
        viewer.append(f);
        btn.textContent = 'source';
      });
    }
  }

  /* ======================= TABS 2 + 3: SERVABLE / HOSTABLE ======================= */
  interface TraceHit { loc: number; params: Record<string, string> }
  let trace: TraceHit[] = [];
  interface Compiled { app: { fetch: (r: Request) => Promise<Response> }; locs: Loc[]; rows: RouteRow[]; redirects: RouteRow[]; routes: any[]; redirectsRaw: any[]; hostLocs: Map<string, number>; warnings: string[] }
  let compiled: Compiled | null = null;

  function servableScope(files: unknown) {
    return {
      Router: S.Router, Group: S.Group, Host: S.Host, Route: S.Route, Use: S.Use, ErrorBoundary: S.ErrorBoundary,
      NotFound: S.NotFound, Redirect: S.Redirect, ResponseTag: S.Response, Fragment: SJ.Fragment,
      linkTo: S.linkTo, markdownToHtml: S.markdownToHtml, sse: S.sse, streamBody: S.streamBody, setCookie: S.setCookie,
      files, Dir: F.Dir, File: F.File,
    };
  }

  function tracingH(jsx: (t: unknown, p: unknown) => unknown) {
    const traced = new Set<unknown>([S.Route, S.Redirect, S.Group, S.Host, S.Use, S.ErrorBoundary, H.Upstream]);
    return makeH(jsx, (tag, node, loc) =>
      traced.has(tag)
        ? S.Use({ middleware: (_req: Request, ctx: { params: Record<string, string> }, next: () => Promise<Response>) => { trace.push({ loc, params: { ...(ctx?.params ?? {}) } }); return next(); }, children: node })
        : node,
    );
  }

  function collectHosts(tree: unknown, outMap: Map<string, number>) {
    const seen = new Set<unknown>();
    const visit = (n: any) => {
      if (!n || typeof n !== 'object' || seen.has(n)) return;
      seen.add(n);
      if (Array.isArray(n)) { n.forEach(visit); return; }
      if (n.tag === 'host') outMap.set(n.props?.name ?? n.props?.pattern, n.props?.[LOC]);
      if (Array.isArray(n.children)) n.children.forEach(visit);
    };
    visit(tree);
  }

  // Runs servable's own build/resolve/layout stages to list the route table, on a
  // cloneDescriptorTree() copy (servable 0.0.3) so Build's __id stamps and Layout's
  // linkTo resolution never touch the tree the planet evaluated. Since servable
  // 0.0.3 (servable#9) a standalone resolve() keeps its warnings on its own return
  // value instead of leaking them into the next compile(), so compile()'s
  // `warnings` are exactly that call's own and the planet shows them as-is.
  async function routeTable(tree: unknown) {
    const built = S.build(S.cloneDescriptorTree(tree));
    const resolved = await S.resolve(built, { cwd: '/' });
    return S.layout(resolved);
  }

  // hostable 0.0.1 exports compile() only: its Gateway/Upstream -> servable
  // lowering (transformChild in dist/src/compile.js) is internal. For the lanes
  // view the planet derives the table from hostable's own descriptor tree with the
  // same structural rules, built from servable's real primitives: <Gateway> ->
  // <Router>, <Upstream> -> one <Route> per method (all seven when `method` is
  // unset) at `path` (default "/*"), a raw Fetch-shaped child -> the same at
  // "/*", Fragments flattened, Router/Host/Group/Use/ErrorBoundary recursed into,
  // everything else passed through. The route handlers here are inert markers
  // (never called); requests always go through the real hostable.compile() app.
  const UPSTREAM_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  function lowerGatewayForTable(tree: unknown): unknown {
    const upstreamRoutes = (path: string, method?: string) =>
      (method ? [method] : UPSTREAM_METHODS).map((m) => S.Route({ path, method: m, handler: function upstream() { return new Response(null, { status: 502 }); } }));
    const kids = (n: any) => (n.children as unknown[]).flatMap(lower);
    const lower = (n: any): unknown[] => {
      if (Array.isArray(n)) return n.flatMap(lower);
      if (H.isFetchLike(n)) return upstreamRoutes('/*');
      if (!H.isDescriptor(n)) return [n];
      switch (n.tag) {
        case 'gateway': return [S.Router({ children: kids(n) })];
        case 'router': return [S.Router({ ...n.props, children: kids(n) })];
        case 'host': return [S.Host({ ...n.props, children: kids(n) })];
        case 'group': return [S.Group({ ...n.props, children: kids(n) })];
        case 'use': return [S.Use({ ...n.props, children: kids(n) })];
        case 'errorboundary': return [S.ErrorBoundary({ ...n.props, children: kids(n) })];
        case 'upstream': return upstreamRoutes(n.props.path ?? '/*', n.props.method);
        case SJ.Fragment: return kids(n);
        default: return [n];
      }
    };
    const out = lower(tree);
    return out.length === 1 ? out[0] : out;
  }

  const rowOf = (r: any, kind: string): RouteRow => {
    const pat = r.pattern;
    const loc = r.descriptor?.props?.[LOC];
    const label = kind === 'redirect' ? 'Redirect' : typeof loc === 'number' ? 'Route' : r.descriptor?.props?.src instanceof Blob ? 'fileable' : typeof r.descriptor?.props?.handler === 'function' ? 'Upstream' : 'Route';
    return { method: kind === 'redirect' ? '*' : r.method, host: pat?.hostname ?? '*', path: pat?.pathname ?? String(r.descriptor?.props?.path ?? '?'), loc: typeof loc === 'number' ? loc : undefined, kind: label, redirect: kind === 'redirect' ? r.to : undefined };
  };

  async function runServable(tab: 'servable' | 'hostable', seq: number) {
    const src = sources[tab];
    const stages: Parameters<typeof renderPipe>[0] = [];
    const warnings: string[] = [];
    try {
      const { tree: files, note } = await filesForMount();
      if (note) warnings.push(note);
      stages.push({ name: 'files ← 01', state: note ? 'err' : 'ok', note: note || 'fileable tree from tab 01' });
      const scope: Record<string, unknown> = servableScope(files);
      if (tab === 'hostable') {
        Object.assign(scope, { Gateway: H.Gateway, Upstream: H.Upstream, Fragment: HJ.Fragment, compileServable: (t: unknown, o?: object) => S.compile(t, { cwd: '/', ...o }), compile: (t: unknown, o?: object) => S.compile(t, { cwd: '/', ...o }) });
      }
      const [{ value: tree, locs }, tEval] = await time(() => runModule(src, scope, tracingH(tab === 'hostable' ? HJ.jsx : SJ.jsx)));
      stages.push({ name: 'JSX', ms: tEval, state: 'ok' });
      let app: any;
      let tC: number;
      if (tab === 'hostable') {
        [app, tC] = await time(() => H.compile(tree, { cwd: '/' }));
        stages.push({ name: 'hostable.compile', ms: tC, state: 'ok', note: 'Gateway → servable tree' });
      } else {
        [app, tC] = await time(() => S.compile(tree, { cwd: '/' }));
        stages.push({ name: 'servable.compile', ms: tC, state: 'ok', note: 'build → resolve → layout → dispatcher' });
      }
      const hostLocs = new Map<string, number>();
      collectHosts(tree, hostLocs);
      const table = await routeTable(tab === 'hostable' ? lowerGatewayForTable(tree) : tree);
      warnings.push(...(app.warnings ?? []));
      if (seq !== compileSeq || disposed) return;
      compiled = {
        app, locs, hostLocs, warnings,
        routes: table.routes, redirectsRaw: table.redirects,
        rows: table.routes.map((r: any) => rowOf(r, 'route')),
        redirects: table.redirects.map((r: any) => rowOf(r, 'redirect')),
      };
      stages.push({ name: 'dispatch', state: 'idle', note: 'waiting for a request' });
      renderPipe(stages);
      clearError();
      renderServableOut(tab);
      await send(tab, stages);
    } catch (e) {
      if (seq !== compileSeq || disposed) return;
      stages.push({ name: stages.length < 2 ? 'JSX' : 'compile', state: 'err' });
      renderPipe(stages);
      showError(e, prepareModule(src));
      compiled = null;
      if (!out.querySelector('.st-composer')) renderServableOut(tab);
    }
  }

  function renderServableOut(tab: 'servable' | 'hostable') {
    const r = reqs[tab];
    const quick = PRESETS[tab][presetOf(tab)]?.requests ?? [];
    out.innerHTML = `
      <header class="st-ph"><span class="dot"></span><b>fake request</b><span class="stat">no network: <code>app.fetch(new Request(…))</code></span></header>
      <form class="st-composer" autocomplete="off">
        <div class="row1">
          <select name="method">${METHODS.map((m) => `<option ${m === r.method ? 'selected' : ''}>${m}</option>`).join('')}</select>
          ${tab === 'hostable' ? `<label class="hostf"><span>Host</span><input name="host" value="${esc(r.host ?? '')}" spellcheck="false"></label>` : ''}
          <input name="path" class="path" value="${esc(r.path)}" spellcheck="false">
          <button class="btn primary" type="submit">Send</button>
        </div>
        <div class="row2">
          <label><span>headers</span><textarea name="headers" rows="2" spellcheck="false" placeholder="name: value">${esc(r.headers ?? '')}</textarea></label>
          <label><span>body</span><textarea name="body" rows="2" spellcheck="false">${esc(r.body ?? '')}</textarea></label>
        </div>
        <div class="quick">${quick.map((q, k) => `<button type="button" class="chip q" data-k="${k}"><b>${q.method}</b> ${tab === 'hostable' ? esc(q.host ?? '') : ''}${esc(q.path)}${q.headers ? ' <i>+hdr</i>' : ''}${q.body ? ' <i>+body</i>' : ''}</button>`).join('')}</div>
      </form>
      <div class="st-route-vis"></div>
      <div class="st-resp"></div>`;
    const form = $<HTMLFormElement>('.st-composer', out);
    const read = () => {
      const fd = new FormData(form);
      reqs[tab] = { method: String(fd.get('method')), path: String(fd.get('path') || '/'), host: tab === 'hostable' ? String(fd.get('host') || 'localhost') : undefined, headers: String(fd.get('headers') ?? ''), body: String(fd.get('body') ?? '') };
      persist();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); read(); void send(tab); });
    form.addEventListener('change', (e) => { read(); if ((e.target as HTMLElement).tagName === 'SELECT') void send(tab); });
    $('.quick', out).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.q');
      if (!b) return;
      const q = quick[+b.dataset.k!];
      reqs[tab] = { headers: '', body: '', ...q };
      persist();
      renderServableOut(tab);
      void send(tab);
    });
    renderRouteVis(tab, null);
  }

  function matchRow(url: string, method: string): { kind: 'route' | 'redirect'; i: number } | null {
    if (!compiled) return null;
    for (let k = 0; k < compiled.routes.length; k++) {
      const r = compiled.routes[k];
      if (r.method === method && r.pattern.exec(url)) return { kind: 'route', i: k };
    }
    for (let k = 0; k < compiled.redirectsRaw.length; k++) if (compiled.redirectsRaw[k].pattern.exec(url)) return { kind: 'redirect', i: k };
    return null;
  }

  function renderRouteVis(tab: 'servable' | 'hostable', hit: { kind: 'route' | 'redirect'; i: number } | null, reqHost?: string) {
    const vis = $('.st-route-vis', out);
    if (!vis || !compiled) { if (vis) vis.innerHTML = ''; return; }
    const all = [...compiled.rows.map((r, i) => ({ r, key: `route:${i}` })), ...compiled.redirects.map((r, i) => ({ r, key: `redirect:${i}` }))];
    const hitKey = hit ? `${hit.kind}:${hit.i}` : '';
    const rowHtml = ({ r, key }: { r: RouteRow; key: string }) =>
      `<tr class="${key === hitKey ? 'hit' : ''}" data-key="${key}"><td class="m m-${r.method}">${r.method}</td><td class="p">${esc(r.path)}${r.redirect ? ` <span class="lk">→ ${esc(r.redirect)}</span>` : ''}</td><td class="k">${r.kind}</td></tr>`;
    if (tab === 'servable') {
      vis.innerHTML = `<div class="st-rt-h stat">compiled route table · first match in document order wins · <b>${all.length}</b> entries</div>
        <div class="st-tablewrap short"><table class="st-routes"><tbody>${all.map(rowHtml).join('')}</tbody></table></div>`;
    } else {
      const lanes = new Map<string, typeof all>();
      for (const x of all) { const k = x.r.host; if (!lanes.has(k)) lanes.set(k, []); lanes.get(k)!.push(x); }
      const hitHost = hit ? all.find((x) => x.key === hitKey)?.r.host : undefined;
      // Upstream expands to one route per method; collapse those rows for readability
      const collapse = (rows: typeof all) => {
        const outRows: { r: RouteRow; key: string; keys: string[] }[] = [];
        for (const x of rows) {
          const prev = outRows.find((o) => o.r.kind === 'Upstream' && x.r.kind === 'Upstream' && o.r.path === x.r.path);
          if (prev) { prev.keys.push(x.key); prev.r = { ...prev.r, method: 'ANY' }; } else outRows.push({ ...x, keys: [x.key] });
        }
        return outRows;
      };
      vis.innerHTML = `<div class="st-rt-h stat">gateway lanes · the request's hostname picks a lane, then the path picks a row</div>
        <div class="st-lanes">
          <div class="st-reqcard"><span class="stat">request</span><b>${esc(reqHost ?? '')}</b></div>
          <svg class="st-wires"></svg>
          <div class="st-lanecol">${[...lanes.entries()].map(([h, rows]) => {
            const loc = compiled!.hostLocs.get(h);
            return `<div class="lane ${h === hitHost ? 'hit' : ''}" data-host="${esc(h)}" ${loc !== undefined ? `data-loc="${loc}"` : ''}>
              <div class="lh"><b>${h === '*' ? 'any host' : esc(h)}</b><span class="chip">${h === '*' ? 'no &lt;Host&gt;' : h.includes('*') ? 'Host pattern' : 'Host name'}</span></div>
              <table class="st-routes"><tbody>${collapse(rows).map((x) => rowHtml({ r: x.r, key: x.keys.includes(hitKey) ? hitKey : x.key })).join('')}</tbody></table></div>`;
          }).join('')}</div>
        </div>`;
      requestAnimationFrame(() => drawWires(vis, hitHost));
    }
    vis.querySelectorAll<HTMLTableRowElement>('tr[data-key]').forEach((tr) =>
      tr.addEventListener('click', () => {
        const [kind, i] = tr.dataset.key!.split(':');
        const r = kind === 'route' ? compiled!.rows[+i] : compiled!.redirects[+i];
        const l = r.loc !== undefined ? compiled!.locs[r.loc] : undefined;
        if (l) setMarks([{ start: l.start, end: l.end, cls: 'mk-hit' }], l.start);
        const sample = r.path.replace(/\{\/\}\?$/, '').replace(/:(\w+)/g, (_m, p: string) => (p === 'id' ? '42' : p)).replace(/\*/g, 'anything');
        const cur = reqs[tab];
        reqs[tab] = { ...cur, method: r.method === '*' || r.method === 'ANY' ? 'GET' : r.method, path: sample || '/', host: tab === 'hostable' && r.host !== '*' && !r.host.includes('*') ? r.host : tab === 'hostable' && r.host.includes('*') ? r.host.replace('*', 'demo') : cur.host };
        persist();
        renderServableOut(tab);
        void send(tab);
      }),
    );
    vis.querySelectorAll<HTMLElement>('.lane[data-loc] .lh').forEach((lh) =>
      lh.addEventListener('click', () => {
        const l = compiled!.locs[+lh.parentElement!.dataset.loc!];
        if (l) setMarks([{ start: l.start, end: l.openEnd, cls: 'mk-path' }], l.start);
      }),
    );
  }

  function drawWires(vis: HTMLElement, hitHost?: string) {
    const svg = vis.querySelector<SVGSVGElement>('.st-wires');
    const card = vis.querySelector<HTMLElement>('.st-reqcard');
    const wrap = vis.querySelector<HTMLElement>('.st-lanes');
    if (!svg || !card || !wrap) return;
    const W = wrap.getBoundingClientRect();
    const S0 = svg.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const x0 = c.right - S0.left;
    const y0 = c.top + c.height / 2 - S0.top;
    svg.setAttribute('viewBox', `0 0 ${S0.width} ${S0.height}`);
    svg.innerHTML = [...vis.querySelectorAll<HTMLElement>('.lane')].map((lane) => {
      const r = lane.getBoundingClientRect();
      const y1 = r.top + 18 - S0.top;
      const x1 = S0.width;
      const hit = lane.dataset.host === hitHost;
      const d = `M${Math.max(0, x0 - (c.right - S0.left))} ${y0} C ${x1 * 0.5} ${y0}, ${x1 * 0.5} ${y1}, ${x1} ${y1}`;
      return `<path d="${d}" class="${hit ? 'hit' : ''}"/>${hit ? `<circle r="4" class="pkt"><animateMotion dur="0.9s" repeatCount="indefinite" path="${d}"/></circle>` : ''}`;
    }).join('');
    void W;
  }

  async function send(tab: 'servable' | 'hostable', stages?: Parameters<typeof renderPipe>[0]) {
    if (!compiled) return;
    const r = reqs[tab];
    const hostName = tab === 'hostable' ? (r.host || 'localhost').trim() : 'localhost';
    const path = r.path.startsWith('/') ? r.path : '/' + r.path;
    const headers = new Headers();
    const dropped: string[] = [];
    for (const line of (r.headers ?? '').split('\n')) {
      const m = line.match(/^\s*([^:\s]+)\s*:\s*(.*)$/);
      if (!m) continue;
      try { headers.append(m[1], m[2]); } catch { dropped.push(m[1]); }
    }
    const noBody = r.method === 'GET' || r.method === 'HEAD';
    let url: string;
    let req: Request;
    const resp = $('.st-resp', out);
    try {
      url = new URL(path, `http://${hostName}`).href;
      req = new Request(url, { method: r.method, headers, body: noBody || !r.body ? undefined : r.body });
    } catch (e) {
      if (resp) resp.innerHTML = `<pre class="code st-err">${esc(String((e as Error).message))}</pre>`;
      return;
    }
    const hit = matchRow(url, r.method);
    trace = [];
    const t0 = performance.now();
    let res: Response;
    try {
      res = await compiled.app.fetch(req);
    } catch (e) {
      if (resp) resp.innerHTML = `<div class="st-status s5"><b>threw</b></div><pre class="code st-err">${esc(String((e as Error)?.stack ?? e))}</pre>`;
      return;
    }
    const ms = performance.now() - t0;
    const hits = trace.slice();
    if (disposed || !resp) return;
    if (stages) {
      stages[stages.length - 1] = { name: 'dispatch', ms, state: 'ok' };
      renderPipe(stages);
    } else {
      const last = pipe.querySelector('.stg:last-child');
      if (last) { last.className = 'stg ok'; last.innerHTML = `<b>dispatch</b><i>${ms.toFixed(2)} ms</i>`; }
    }
    renderRouteVis(tab, hit, hostName);
    // highlight the source: ancestors lightly, the answering element strongly
    const locs = compiled.locs;
    const m: Mark[] = [];
    const leafTags = new Set(['Route', 'Redirect', 'Upstream']);
    let leaf = hits.length ? hits[hits.length - 1] : undefined;
    const answered = hit !== null;
    let focus: number | undefined;
    hits.forEach((h, k) => {
      const l = locs[h.loc];
      if (!l) return;
      const isLeaf = k === hits.length - 1 && answered;
      m.push(isLeaf && leafTags.has(l.tag) ? { start: l.start, end: l.end, cls: 'mk-hit' } : { start: l.start, end: l.openEnd, cls: isLeaf ? 'mk-hit' : 'mk-path' });
      if (isLeaf) focus = l.start;
    });
    let via = '';
    if (!answered) {
      // fell through to NotFound: pick the one inside the deepest traced scope
      const nf = locs.filter((l) => l.tag === 'NotFound');
      const scopes = hits.map((h) => locs[h.loc]).filter(Boolean);
      const within = (a: Loc, b: Loc) => a.start >= b.start && a.end <= b.end;
      let pick: Loc | undefined;
      for (let k = scopes.length - 1; k >= 0 && !pick; k--) pick = nf.find((x) => within(x, scopes[k]) && !locs.some((g) => (g.tag === 'Group' || g.tag === 'Host') && within(x, g) && g !== scopes[k] && within(g, scopes[k])));
      pick ??= nf.find((x) => !locs.some((g) => (g.tag === 'Group' || g.tag === 'Host') && within(x, g)));
      if (pick) { m.push({ start: pick.start, end: pick.end, cls: 'mk-hit' }); focus = pick.start; via = 'NotFound'; }
      else via = 'built-in 404';
      leaf = undefined;
    }
    setMarks(m, focus);
    const chain = hits.map((h) => {
      const l = locs[h.loc];
      if (!l) return '';
      const open = ta.value.slice(l.start, Math.min(l.openEnd, l.start + 60)).replace(/\s+/g, ' ');
      return `<code>${esc(open.length >= 60 ? open + '…' : open)}</code>`;
    }).filter(Boolean);
    const pe = Object.entries(leaf?.params ?? {}).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => [/^\d+$/.test(k) ? '*' : k, v] as const);
    const params = pe.length ? Object.fromEntries(pe) : null;
    const status = res.status;
    const ct = res.headers.get('content-type') ?? '';
    const hdrs = [...res.headers.entries()];
    resp.innerHTML = `
      <div class="st-status s${String(status)[0]}"><b>${status}</b> ${esc(res.statusText || statusText(status))}<span class="stat">${ms.toFixed(2)} ms · ${esc(new URL(url).host)}${esc(new URL(url).pathname)}</span></div>
      <div class="st-chain">${chain.length ? chain.join('<span class="arr">›</span>') : ''}${via ? `${chain.length ? '<span class="arr">›</span>' : ''}<code>${via}</code>` : ''}${params ? ` <span class="stat">params</span> ${Object.entries(params).map(([k, v]) => `<span class="chip">${esc(k)}=${esc(String(v))}</span>`).join(' ')}` : ''}</div>
      ${dropped.length ? `<div class="st-warn">Fetch refused to set: ${dropped.map(esc).join(', ')} (forbidden header names)${dropped.some((d) => d.toLowerCase() === 'host') ? '; the Host field sets the URL hostname instead' : ''}</div>` : ''}
      ${compiled.warnings.length ? `<div class="st-warn">${compiled.warnings.map((w) => `⚠ ${esc(w)}`).join('<br>')}</div>` : ''}
      <table class="st-hdrs">${hdrs.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') || '<tr><td colspan="2" class="stat">no headers</td></tr>'}</table>
      <div class="st-bodyh"><span class="stat">body</span>${/html/.test(ct) ? '<button class="btn st-prev" type="button">preview</button>' : ''}${res.headers.get('location') ? `<button class="btn st-follow" type="button">follow → ${esc(res.headers.get('location')!)}</button>` : ''}</div>
      <pre class="code st-body"></pre>`;
    const bodyPre = $<HTMLPreElement>('.st-body', resp);
    const follow = resp.querySelector('.st-follow');
    follow?.addEventListener('click', () => {
      const loc = new URL(res.headers.get('location')!, url);
      reqs[tab] = { ...reqs[tab], method: 'GET', path: loc.pathname + loc.search, host: tab === 'hostable' ? loc.hostname : reqs[tab].host, body: '' };
      persist();
      renderServableOut(tab);
      void send(tab);
    });
    let text = '';
    if (res.body && r.method !== 'HEAD') {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done || disposed) break;
        text += dec.decode(value, { stream: true });
        bodyPre.textContent = text;
      }
    }
    if (/json/.test(ct)) { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch {} }
    bodyPre.textContent = text || (r.method === 'HEAD' ? '(HEAD: no body)' : '(empty)');
    const prev = resp.querySelector('.st-prev');
    prev?.addEventListener('click', () => {
      const ex = resp.querySelector('iframe');
      if (ex) { ex.remove(); bodyPre.hidden = false; prev.textContent = 'preview'; return; }
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', '');
      f.srcdoc = text;
      bodyPre.hidden = true;
      bodyPre.after(f);
      prev.textContent = 'source';
    });
  }

  /* ======================= TAB 4: DEPLOY ======================= */

  /**
   * Wires the one page-side BroadcastChannel listener that answers the
   * Service Worker's relayed fetches -- attached once, reused across every
   * open of tab 04. See the module doc comment (top of file) for why this is
   * a BroadcastChannel and not `navigator.serviceWorker`'s own `message`
   * event: neither the page nor the worker's `clients` list can reach each
   * other directly here (the page is out of the worker's scope; the worker's
   * only controlled client is the hidden iframe), and BroadcastChannel is
   * the one same-origin channel that doesn't care about SW control at all.
   */
  function attachSwRelay() {
    if (swListenerAttached || typeof BroadcastChannel === 'undefined') return;
    swListenerAttached = true;
    const bc = new BroadcastChannel(SW_CHANNEL);
    bc.onmessage = async (ev: MessageEvent) => {
      const data = ev.data as { type?: string; id?: string; url?: string; method?: string; headers?: [string, string][]; body?: ArrayBuffer | null } | undefined;
      if (!data || data.type !== 'studio-deploy:fetch') return;
      try {
        if (!deployWorkerFetch) throw new Error('no compiled worker available yet -- open the Deploy tab first');
        const init: RequestInit = { method: data.method };
        if (data.headers?.length) init.headers = new Headers(data.headers);
        if (data.body) init.body = data.body;
        const req = new Request(data.url!, init);
        const res = await deployWorkerFetch(req);
        const buf = await res.arrayBuffer();
        bc.postMessage({ type: 'studio-deploy:response', id: data.id, status: res.status, statusText: res.statusText, headers: [...res.headers], body: buf });
      } catch (e) {
        const msg = new TextEncoder().encode(String((e as Error)?.message ?? e)).buffer;
        bc.postMessage({ type: 'studio-deploy:response', id: data.id, status: 500, statusText: 'Studio Deploy Error', headers: [['content-type', 'text/plain']], body: msg });
      }
    };
    disposers.push(() => bc.close());
  }

  function waitForActivation(reg: ServiceWorkerRegistration): Promise<void> {
    if (reg.active) return Promise.resolve();
    const worker = reg.installing || reg.waiting;
    if (!worker) return Promise.resolve();
    return new Promise((resolve) => {
      const onChange = () => { if (worker.state === 'activated') { worker.removeEventListener('statechange', onChange); resolve(); } };
      worker.addEventListener('statechange', onChange);
    });
  }

/**
   * Registers the real Service Worker (idempotent) and a hidden, controlled
   * iframe to actually call it from (see the module doc comment above for
   * why the page itself can't be the caller: its scope is capped at this
   * module's own directory, which doesn't cover the site root the page
   * lives at). `import.meta.url` -- this very module's own, real,
   * same-origin URL -- is the script: a SW's scriptURL must be http(s)
   * (both `blob:` and `data:` are rejected outright by every engine,
   * confirmed empirically against this exact build), and Vite already
   * serves this module at a real URL in both dev and a production build,
   * so no extra static file is needed. The top-level `IS_SW_SCOPE` branch
   * above is what actually runs once the browser loads it as a worker --
   * everything in `mountStudio` below is unreachable there.
   */
  async function ensureServiceWorker(): Promise<{ ok: true; frame: Window } | { ok: false; error: string }> {
    if (!('serviceWorker' in navigator)) return { ok: false, error: 'navigator.serviceWorker is unavailable (needs a secure context: https, or localhost)' };
    attachSwRelay();
    try {
      if (!swReg) {
        // No explicit `scope`: the default already IS this module's own directory
        // (SW_SCOPE), the max allowed without a Service-Worker-Allowed header --
        // passing that same value back explicitly is, empirically, rejected as
        // a trailing-slash mismatch against Chrome's own computed max scope.
        const reg = await navigator.serviceWorker.register(THIS_MODULE_URL, { type: 'module' });
        await waitForActivation(reg);
        swReg = reg;
      }
      if (!swFrameWindow) {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.setAttribute('aria-hidden', 'true');
        disposers.push(() => iframe.remove());
        const loaded = new Promise<void>((resolve, reject) => {
          iframe.addEventListener('load', () => resolve(), { once: true });
          iframe.addEventListener('error', () => reject(new Error('the hidden frame failed to load')), { once: true });
        });
        document.body.append(iframe);
        iframe.src = SW_FRAME_URL;
        await loaded;
        if (!iframe.contentWindow) throw new Error('iframe.contentWindow is unavailable');
        swFrameWindow = iframe.contentWindow;
      }
      return { ok: true, frame: swFrameWindow };
    } catch (e) {
      swReg = null;
      swFrameWindow = null;
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  }

  function toBase64Bytes(bytes: Uint8Array): string {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  }

  /** The pipeline: fileable.plan() -> packfile.toArchive() (bridge) -> packfile.fromArchive() -> packfile.createRouter() -> servable <Group from> -> hostable <Gateway><Upstream app={dialbackServer}>. */
  async function runPipeline(stripEl: HTMLElement, outEl: HTMLElement) {
    const stages: Stage[] = [];
    const rows: string[] = [];
    const paint = () => { stripEl.innerHTML = stageStripHtml(stages); outEl.innerHTML = rows.join(''); };
    outEl.innerHTML = '<div class="st-loading stat">running fileable → packfile → servable → hostable…</div>';
    const pushOk = (name: string, ms: number, note: string, hash?: string) => {
      stages.push({ name, ms, state: 'ok', note });
      rows.push(`<div class="dp-stage"><div class="dp-stage-h"><b>${esc(name)}</b><span class="stat">${ms.toFixed(2)} ms</span></div><p>${esc(note)}</p>${hash ? `<code class="dp-hash">${esc(hash)}</code>` : ''}</div>`);
      paint();
    };
    try {
      const [Pk, Dbk] = await Promise.all([loadPackfile(), loadDialback()]);

      // Stage 1: fileable.plan() over a tree with a loose index.html beside a <Dir encode="wbn">
      const demoTree = buildDemoTree(F);
      const [planResult, tPlan] = await time(() => F.plan(demoTree, { cwd: '/' }));
      const wbnRoot = planResult.artifacts.find((a: any) => a.target === 'wbn' && a.containerPath === a.outputPath);
      if (!wbnRoot) throw new Error('plan() did not produce a <Dir encode="wbn"> container root -- unexpected fileable output shape');
      const members = planResult.artifacts.filter((a: any) => a.target === 'wbn' && a.containerPath === wbnRoot.containerPath && a !== wbnRoot && a.kind === 'file');
      pushOk('fileable.plan()', tPlan, `${members.length} files hashed under <Dir encode="wbn"> (plus a loose index.html mounted separately below)`, wbnRoot.hash);

      // Stage 2: packfile.toArchive() -- fileable's own write/wbn.ts is Node-only (node:zlib), so this
      // is the honest bridge: it builds the identical gzip(Web Bundle) bytes from plan()'s own artifacts.
      const enc = new TextEncoder();
      const fileMap = new Map<string, { data: Uint8Array; size: number; hash: string }>();
      for (const m of members) {
        const data = typeof m.content === 'string' ? enc.encode(m.content) : new Uint8Array(m.content ?? []);
        fileMap.set(m.outputPath, { data, size: data.length, hash: m.hash });
      }
      const [archiveBuf, tArchive] = await time(() => Pk.toArchive(fileMap));
      const archiveHash = await sha256Hex(archiveBuf as ArrayBuffer);
      pushOk('packfile.toArchive()', tArchive, `${fmtBytes((archiveBuf as ArrayBuffer).byteLength)} gzip(Web Bundle) -- same wire format fileable's own (Node-only) write step would produce`, `sha256:${archiveHash}`);

      // Stage 3: packfile.fromArchive()
      const [decoded, tFrom] = await time(() => Pk.fromArchive(archiveBuf));
      pushOk('packfile.fromArchive()', tFrom, `${decoded.size} files decoded back out of the archive`);

      // Stage 4: packfile.createRouter()
      const router = Pk.createRouter(decoded);
      const helloMember = members.find((m: any) => m.outputPath.endsWith('hello.txt')) ?? members[0];
      const t4 = performance.now();
      const routerRes = await router(new Request(new URL('/' + helloMember.outputPath, location.origin)));
      const tRouter = performance.now() - t4;
      const routerBody = await routerRes.clone().arrayBuffer();
      pushOk('packfile.createRouter()', tRouter, `GET /${helloMember.outputPath} → ${routerRes.status} ${routerRes.statusText}`, `sha256:${await sha256Hex(routerBody)}`);

      // Stage 5: servable <Group from> -- mounts the SAME demo tree's loose index.html (the wbn
      // subtree is skipped with a real warning: mount-fileable.ts doesn't mount archive roots yet).
      // A named mount root keeps its own name as part of the URL (servable's own documented rule --
      // see mount-fileable.ts's "NAMING" doc comment), so the root Dir's name is part of the path.
      const sitePath = '/pack/deploy-demo/index.html';
      const siteTree = S.Router({ children: [S.Group({ prefix: '/pack', from: demoTree })] });
      const [siteCompiled, tSiteCompile] = await time(() => S.compile(siteTree, { cwd: '/' }));
      const t5 = performance.now();
      const siteRes = await siteCompiled.fetch(new Request(new URL(sitePath, location.origin)));
      const tSiteReq = performance.now() - t5;
      const siteBody = await siteRes.clone().arrayBuffer();
      const siteWarnN = (siteCompiled.warnings ?? []).length;
      pushOk(
        'servable <Group from>',
        tSiteCompile + tSiteReq,
        `compile ${tSiteCompile.toFixed(2)} ms + GET ${sitePath} → ${siteRes.status}${siteWarnN ? ` (${siteWarnN} warning${siteWarnN === 1 ? '' : 's'}: the wbn subtree isn't mountable yet, only the loose index.html is)` : ''}`,
        `sha256:${await sha256Hex(siteBody)}`,
      );

      // Stage 6: hostable <Gateway><Host><Upstream app={dialbackServer}> -- a real dialback Server,
      // its own `fetch` getter (not a plain method); no agent connected, so its constructor-supplied
      // default handler answers, forwarding straight to stage 5's compiled app.
      const dialbackServer = new Dbk.Server((req: Request) => siteCompiled.fetch(req), { allowUnauthenticatedAgents: true });
      const gatewayTree = H.Gateway({ children: [H.Host({ name: 'pipeline.demo', children: [H.Upstream({ app: dialbackServer })] })] });
      const [gatewayCompiled, tGwCompile] = await time(() => H.compile(gatewayTree, { cwd: '/' }));
      const t6 = performance.now();
      const gwRes = await gatewayCompiled.fetch(new Request(`http://pipeline.demo${sitePath}`));
      const tGwReq = performance.now() - t6;
      const gwBody = await gwRes.clone().arrayBuffer();
      const same = (await sha256Hex(gwBody)) === (await sha256Hex(siteBody));
      pushOk(
        'hostable <Gateway><Upstream>',
        tGwCompile + tGwReq,
        `compile ${tGwCompile.toFixed(2)} ms + GET pipeline.demo${sitePath} via dialback.Server#fetch (no agent → default handler) → ${gwRes.status}${same ? ', byte-identical to stage 5 ✓' : ', ⚠ differs from stage 5'}`,
        `sha256:${await sha256Hex(gwBody)}`,
      );

      const totalMs = stages.reduce((n, s) => n + (s.ms ?? 0), 0);
      rows.push(`<div class="dp-pipe-links">
        <span class="stat">${stages.length} stages · ${totalMs.toFixed(2)} ms total</span>
        <button class="btn dp-goto" data-tab="fileable">01 fileable →</button>
        <button class="btn dp-goto" data-tab="servable">02 servable →</button>
        <button class="btn dp-goto" data-tab="hostable">03 hostable →</button>
      </div>`);
      paint();
      const linksRow = $<HTMLElement>('.dp-pipe-links', outEl);
      linksRow.append(
        handoffButton({
          from: 'studio',
          to: 'packfile',
          kind: 'fileable-tree',
          label: 'open the archived files in Packfile Vault',
          getPayload: () => ({
            files: [
              { path: 'index.html', content: '<!doctype html><h1>deploy pipeline</h1><p>packaged separately as a Web Bundle.</p>', encoding: 'utf8' as const },
              ...members.map((m: any) => ({
                path: String(m.outputPath).split('/').pop(),
                content: typeof m.content === 'string' ? m.content : toBase64Bytes(new Uint8Array(m.content ?? [])),
                encoding: (typeof m.content === 'string' ? 'utf8' : 'base64') as 'utf8' | 'base64',
              })),
            ],
            droppedSymlinks: 0,
          }),
        }),
      );
      linksRow.append(
        handoffButton({ from: 'studio', to: 'dialback', kind: 'note', label: 'open the tunnel in Dialback Tunnel', getPayload: () => ({ note: 'sent from the Deploy pipeline (studio, tab 04)' }) }),
      );
      outEl.querySelectorAll<HTMLButtonElement>('.dp-goto').forEach((b) => on(b, 'click', () => switchTab(b.dataset.tab as TabId)));
    } catch (e) {
      stages.push({ name: 'pipeline', state: 'err' });
      rows.push(`<pre class="code st-err">${esc(String((e as Error)?.stack ?? e))}</pre>`);
      paint();
    }
  }

  async function renderDeployTab(panel: HTMLElement) {
    panel.innerHTML = `<div class="st-loading stat">compiling tab 02's servable app for deployment…</div>`;
    let deployCompiled: any;
    const tStart = performance.now();
    try {
      const { tree: filesTree } = await filesForMount();
      const scope = servableScope(filesTree);
      const { value: tree } = await runModule(sources.servable, scope, makeH(SJ.jsx));
      deployCompiled = await S.compile(tree, { cwd: '/' });
    } catch (e) {
      panel.innerHTML = `<pre class="code st-err">Could not compile tab 02's servable app for deployment:\n${esc(String((e as Error)?.stack ?? e))}</pre>`;
      return;
    }
    if (disposed) return;
    const tCompile = performance.now() - tStart;
    const { toWorker } = await loadCloudflareAdapter();
    const worker = toWorker(deployCompiled);
    deployWorkerFetch = worker.fetch;

    const targets = entrySources(sources.servable);
    const warnings: string[] = deployCompiled.warnings ?? [];
    const defaultSwPath = (S_PRESETS[state.s]?.requests?.[0]?.path as string | undefined) || '/api/hello';

    panel.innerHTML = `
      <section class="dp-section">
        <header class="st-ph"><span class="dot"></span><b>deploy targets</b><span class="stat">tab 02 compiled in ${tCompile.toFixed(2)} ms · <code>toWorker(compiled)</code> from <code>servable/adapters/cloudflare</code></span></header>
        ${warnings.length ? `<div class="st-warn">${warnings.map((w) => `⚠ ${esc(w)}`).join('<br>')}</div>` : ''}
        <div class="dp-tabs" role="tablist"></div>
        <div class="dp-srcwrap"><pre class="code dp-src"></pre><button class="btn dp-copy" type="button">copy</button></div>
      </section>
      <section class="dp-section">
        <header class="st-ph"><span class="dot"></span><b>live preview via a real Service Worker</b><span class="stat dp-sw-stat">not registered</span></header>
        <p class="dp-note">Registers this very module as a real, installed <code>ServiceWorker</code> (its scriptURL is <code>import.meta.url</code> -- a real same-origin URL Vite already serves; <code>blob:</code>/<code>data:</code> URLs are rejected by every engine's <code>register()</code>, so there's no way around a real URL without a static file this room doesn't own). Its scope is capped at this module's own directory, which doesn't cover the page itself, so the actual request below runs from a hidden, SW-controlled iframe rather than the page -- the worker's <code>fetch</code> handler relays it to this page over a <code>MessageChannel</code>, which answers with the exact <code>toWorker(compiled).fetch</code> shown above.</p>
        <div class="dp-swrow">
          <button class="btn primary dp-register" type="button">register &amp; send a request</button>
          <input class="dp-swpath" spellcheck="false" autocomplete="off" value="${esc(defaultSwPath)}">
        </div>
        <div class="dp-swresult"></div>
      </section>
      <section class="dp-section">
        <header class="st-ph"><span class="dot"></span><b>the pipeline</b><span class="stat">fileable → packfile → servable → hostable, five real library calls</span></header>
        <div class="dp-pipe-strip"></div>
        <div class="dp-pipe-out"></div>
        <div class="dp-pipe-actions"><button class="btn dp-rerun" type="button">run again</button></div>
      </section>`;

    /* ---- targets sub-tabs ---- */
    const tabsWrap = $<HTMLElement>('.dp-tabs', panel);
    const srcPre = $<HTMLPreElement>('.dp-src', panel);
    const copyBtn2 = $<HTMLButtonElement>('.dp-copy', panel);
    const keys = Object.keys(targets) as (keyof typeof targets)[];
    let activeKey: keyof typeof targets = (keys as string[]).includes(state.dt) ? (state.dt as keyof typeof targets) : 'cloudflare';
    const paintTargets = () => {
      tabsWrap.innerHTML = keys.map((k) => `<button class="chip dp-tchip ${k === activeKey ? 'on' : ''}" data-k="${k}" type="button">${esc(targets[k].label)}</button>`).join('');
      srcPre.textContent = targets[activeKey].code;
    };
    paintTargets();
    on(tabsWrap, 'click', (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.dp-tchip');
      if (!b) return;
      activeKey = b.dataset.k as keyof typeof targets;
      state.dt = activeKey;
      persist();
      paintTargets();
    });
    on(copyBtn2, 'click', async () => {
      try { await navigator.clipboard.writeText(targets[activeKey].code); copyBtn2.textContent = 'copied ✓'; }
      catch { copyBtn2.textContent = 'copy failed'; }
      setTimeout(() => { copyBtn2.textContent = 'copy'; }, 1400);
    });

    /* ---- service worker demo ---- */
    const swStat = $<HTMLElement>('.dp-sw-stat', panel);
    const swResult = $<HTMLElement>('.dp-swresult', panel);
    const swPathInput = $<HTMLInputElement>('.dp-swpath', panel);
    const registerBtn = $<HTMLButtonElement>('.dp-register', panel);
    async function runSwDemo() {
      registerBtn.disabled = true;
      swStat.textContent = swReg ? 'registered · sending…' : 'registering…';
      const result = await ensureServiceWorker();
      if (disposed) return;
      if (!result.ok) {
        swStat.textContent = 'registration failed';
        swResult.innerHTML = `<pre class="code st-err">${esc(result.error)}</pre>`;
        registerBtn.disabled = false;
        return;
      }
      swStat.textContent = `registered · scope ${swReg?.scope ?? ''} · calling from a controlled hidden frame`;
      const rawPath = swPathInput.value.trim() || '/';
      const path = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
      const runUrl = `${SW_RUN_BASE}?path=${encodeURIComponent(path)}`;
      const directUrl = new URL(path, location.origin);
      try {
        const t0 = performance.now();
        // The very first fetch through a just-activated worker/just-loaded
        // controlled frame occasionally throws "Failed to fetch" once before
        // settling (confirmed empirically: an identical call moments later
        // always succeeds) -- a real startup race in the platform's own
        // controller hand-off, not a bug in the relay above; retried rather
        // than surfaced as a false failure.
        let swRes: Response | undefined;
        let lastErr: unknown;
        for (let attempt = 0; attempt < 4 && !swRes; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 300));
          try { swRes = await (result.frame as any).fetch(runUrl); } catch (e) { lastErr = e; }
        }
        if (!swRes) throw lastErr;
        const tSw = performance.now() - t0;
        const swBody = await swRes.clone().text();
        const t1 = performance.now();
        const directRes = await deployWorkerFetch!(new Request(directUrl.toString()));
        const tDirect = performance.now() - t1;
        const directBody = await directRes.clone().text();
        const match = swBody === directBody && swRes.status === directRes.status;
        swResult.innerHTML = `
          <div class="st-status s${String(swRes.status)[0]}"><b>${swRes.status}</b> ${esc(swRes.statusText || statusText(swRes.status))}<span class="stat">via the Service Worker (called from a hidden, SW-controlled iframe) · ${tSw.toFixed(2)} ms · real fetch() over the network stack</span></div>
          <pre class="code">${esc(swBody.slice(0, 2000))}</pre>
          <div class="stat">direct <code>toWorker(compiled).fetch()</code> call (no worker): ${directRes.status} in ${tDirect.toFixed(2)} ms — ${match ? '<b class="dp-ok">byte-identical ✓</b>' : '<b class="dp-bad">differs ⚠</b>'}</div>`;
      } catch (e) {
        swResult.innerHTML = `<pre class="code st-err">${esc(String((e as Error)?.stack ?? e))}</pre>`;
      }
      registerBtn.disabled = false;
    }
    on(registerBtn, 'click', () => void runSwDemo());
    void runSwDemo(); // ship a working default state with zero clicks, per this room's own convention

    /* ---- the pipeline ---- */
    const pipeStrip = $<HTMLElement>('.dp-pipe-strip', panel);
    const pipeOut = $<HTMLElement>('.dp-pipe-out', panel);
    on($<HTMLButtonElement>('.dp-rerun', panel), 'click', () => void runPipeline(pipeStrip, pipeOut));
    void runPipeline(pipeStrip, pipeOut);
  }

  /* ---------------- tab + preset plumbing ---------------- */
  async function compileCurrent() {
    const seq = ++compileSeq;
    const tab = state.tab as TabId;
    if (tab === 'fileable') await runFileable(seq);
    else if (tab === 'servable' || tab === 'hostable') await runServable(tab, seq);
  }

  function fillPresets() {
    const tab = state.tab as TabId;
    const cur = presetOf(tab);
    presetSel.innerHTML = Object.entries(PRESETS[tab]).map(([k, p]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
  }

  const deployPanel = $<HTMLElement>('.st-deploy');
  const presetField = $<HTMLElement>('.st-preset');

  function switchTab(tab: TabId) {
    state.tab = tab;
    tabBtns.forEach((b) => { const onb = b.dataset.tab === tab; b.classList.toggle('on', onb); b.setAttribute('aria-selected', String(onb)); });
    root.dataset.tab = tab;
    explain.innerHTML = EXPLAIN[tab];
    if (tab === 'deploy') {
      $<HTMLElement>('.st-grid').style.display = 'none';
      deployPanel.style.display = '';
      presetField.style.display = 'none';
      pipe.innerHTML = '';
      persist();
      void renderDeployTab(deployPanel);
      return;
    }
    $<HTMLElement>('.st-grid').style.display = '';
    deployPanel.style.display = 'none';
    presetField.style.display = '';
    fillPresets();
    ta.value = sources[tab];
    marks = [];
    ta.scrollTop = 0;
    paint();
    clearError();
    fileLabel.textContent = `${presetOf(tab)}.jsx`;
    estat.innerHTML = `<code>@jsxImportSource ${TABS.find((t) => t.id === tab)!.pkg}</code>`;
    scopeBox.innerHTML = tab === 'fileable'
      ? 'in scope: <code>Dir File Rm linkTo warn markdownToHtml</code> (imports are shown for realism; the planet provides them)'
      : `in scope: <code>${tab === 'hostable' ? 'Gateway Upstream compileServable ' : ''}Router Group Host Route Use ErrorBoundary NotFound Redirect ResponseTag sse</code> · <code>files</code> = tab 01's tree · top-level <code>await</code> works`;
    out.innerHTML = '';
    pipe.innerHTML = '';
    if (tab === 'fileable') prevHashes = new Map();
    persist();
    void compileCurrent();
  }

  tabBtns.forEach((b) => on(b, 'click', () => switchTab(b.dataset.tab as TabId)));
  on(presetSel, 'change', () => {
    const tab = state.tab as TabId;
    if (tab === 'deploy') return;
    const k = presetSel.value;
    if (tab === 'fileable') { state.f = k; prevHashes = new Map(); fSelected = ''; }
    else if (tab === 'servable') { state.s = k; reqs.servable = firstReq('servable'); }
    else { state.h = k; reqs.hostable = firstReq('hostable'); }
    sources[tab] = PRESETS[tab][k].src;
    switchTab(tab);
  });
  const copyBtn = $('.st-copy');
  on(copyBtn, 'click', async () => {
    persist();
    await new Promise((r) => setTimeout(r, 180));
    await copyLink();
    copyBtn.textContent = 'copied ✓';
    setTimeout(() => { copyBtn.textContent = 'copy link'; }, 1400);
  });
  const ro = new ResizeObserver(() => {
    const vis = out.querySelector<HTMLElement>('.st-route-vis');
    if (vis && state.tab === 'hostable') drawWires(vis, vis.querySelector<HTMLElement>('.lane.hit')?.dataset.host);
  });
  ro.observe(out);
  disposers.push(() => ro.disconnect());

  loading.remove();
  switchTab(state.tab as TabId);

  return () => {
    disposed = true;
    compileSeq++;
    disposers.forEach((f) => f());
    if (swReg) void swReg.unregister();
    root.remove();
  };
}

function statusText(s: number): string {
  return ({ 200: 'OK', 201: 'Created', 204: 'No Content', 206: 'Partial Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 500: 'Internal Server Error', 502: 'Bad Gateway' } as Record<number, string>)[s] ?? '';
}

const playground: Playground = {
  id: 'studio',
  title: 'JSX Studio',
  pkg: '@johnhenry/servable',
  hue: 165,
  blurb: 'Fileable, servable and hostable: JSX that compiles to files, to a dispatcher, and to a gateway. Run it here.',
  docs: 'https://opensource.johnhenry.me/servable/',
  async mount(host) {
    try {
      return await mountStudio(host);
    } catch (e) {
      const pre = document.createElement('pre');
      pre.className = 'code';
      pre.textContent = `JSX Studio failed to start:\n${String((e as Error)?.stack ?? e)}`;
      host.append(pre);
      return () => pre.remove();
    }
  },
};
export default playground;
