import type { Playground } from '../registry';
import { readState, writeState, copyLink } from '../state';
import './workbench.css';
import { FILES, XSS_PAYLOAD, XSS_TITLE } from './workbench-modules';

// window-algebra: the shell (state, layouts, <wa-stage>, window chrome, palette, keyboard input).
import { createState, createWindowManager, THEME_CSS, RULES_CSS, type WindowManager } from '@johnhenry/window-algebra';
import { lazySurface, PALETTE_CSS } from '@johnhenry/window-algebra/browser';
import { defineWindowAlgebraElement, type WindowAlgebraElement } from '@johnhenry/window-algebra/element';
// html-modules: the components inside the windows, defined in-page from source strings via the loader + a fetch stub.
import { createHTMLModules } from '@johnhenry/html-modules';
// ... and its adapter for safe-fragment: the `sanitize` hook for the less-trusted module.
import { safeFragmentSanitizer } from '@johnhenry/html-modules/safe-fragment';
// safe-fragment: untrusted note bodies through <safe-fragment profile="article-v1">.
import * as safeFragment from '@johnhenry/safe-fragment';
import type { SanitizationReport } from '@johnhenry/safe-fragment';
// mport: the import map for this exact composition, built offline.
import { createRouter, esmSh, local, custom, entryInfo, renderImportMapCsp, renderModulePreload } from '@johnhenry/mport/core';
import waPkg from '@johnhenry/window-algebra/package.json';
import hmPkg from '@johnhenry/html-modules/package.json';
import sfPkg from '@johnhenry/safe-fragment/package.json';
// Recorded esm.sh bytes for dayjs (the standalone's one real third-party dependency), so build({ graph: true }) can hash them offline.
import dayjsEntry from './workbench-cdn/dayjs-entry.mjs?raw';
import dayjsCore from './workbench-cdn/dayjs-core.mjs?raw';
import relEntry from './workbench-cdn/relativeTime-entry.mjs?raw';
import relCore from './workbench-cdn/relativeTime-core.mjs?raw';

/* ────────────────────────────────────────────────────────────────────────────
 * Workbench Desk. The four libraries of johnhenry/workbench, in one planet:
 *   window-algebra  the shell: <wa-stage>, chrome, palette, layouts
 *   html-modules    every component in every window, from .html source
 *   safe-fragment   untrusted note bodies + the sanitize hook for a less-trusted module
 *   mport           the import map that ties them together (built live, offline)
 * The standalone app is the no-bundler, strict-CSP proof; this room is the same
 * composition under Vite. The "What's happening" text says exactly where they differ.
 * ──────────────────────────────────────────────────────────────────────────── */

const STANDALONE = 'https://johnhenry.github.io/workbench/';
const NS = '__orreryWorkbenchPwned';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
type Attrs = Record<string, string | boolean | undefined>;
function h(tag: string, attrs: Attrs = {}, ...kids: (Node | string | undefined)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : String(v));
  for (const kid of kids) if (kid !== undefined) el.append(kid);
  return el;
}
const setAttr = (el: Element, name: string, value: unknown) => {
  if (value === false || value === null || value === undefined) el.removeAttribute(name);
  else if (el.getAttribute(name) !== String(value === true ? '' : value)) el.setAttribute(name, value === true ? '' : String(value));
};

/** The shadow root of an html-modules component, once its module has registered the tag. */
async function shadowOf(host: HTMLElement): Promise<ShadowRoot> {
  await customElements.whenDefined(host.localName);
  for (let i = 0; !host.shadowRoot && i < 120; i++) await new Promise((r) => requestAnimationFrame(r));
  if (!host.shadowRoot) throw new Error(`<${host.localName}> never got a shadow root`);
  return host.shadowRoot;
}
const actionOf = (e: Event) => e.composedPath().find((n): n is HTMLElement => n instanceof HTMLElement && !!n.dataset?.action);
const idOf = (e: Event) => e.composedPath().find((n): n is HTMLElement => n instanceof HTMLElement && !!n.dataset?.id)?.dataset.id;

/** Keep `host`'s `<tag slot=...>` children in step with `items` (keyed by item.id), reusing elements. Only the order among same-slot siblings is enforced. */
function reconcile<T extends { id: string }>(host: HTMLElement, { items, tag, slot, apply }: { items: T[]; tag: string; slot: string; apply: (el: HTMLElement, item: T) => void }) {
  const same = () => [...host.children].filter((c) => c.localName === tag && c.getAttribute('slot') === slot) as HTMLElement[];
  const existing = new Map(same().map((c) => [c.dataset.id!, c]));
  const placed = items.map((item) => {
    const el = existing.get(item.id) ?? h(tag, { slot, 'data-id': item.id });
    existing.delete(item.id);
    apply(el, item);
    return el;
  });
  for (const stale of existing.values()) stale.remove();
  let cur = same();
  placed.forEach((el, i) => {
    if (cur[i] === el) return;
    host.insertBefore(el, cur[i] ?? null);
    cur = same();
  });
}

/* ───────────────────────────── 1. mport: the import map for this composition ───────────────────────────── */

// What the standalone page imports. Ranges are pinned by the lockfile; dompurify is NOT listed: dependencies:true adds it.
const SPECIFIERS = [
  '@johnhenry/window-algebra',
  '@johnhenry/window-algebra/browser',
  '@johnhenry/window-algebra/element',
  '@johnhenry/html-modules/browser',
  '@johnhenry/html-modules/runtime',
  '@johnhenry/html-modules/safe-fragment',
  '@johnhenry/safe-fragment',
  '@workbench/ui/',
  'dayjs@^1.11',
  'dayjs@^1.11/plugin/relativeTime',
];
// The standalone's deployed site serves the libraries from /workbench/vendor/ and the components from /workbench/components/.
const LIB_BASE = '/workbench/vendor/';
const UI_BASE = '/workbench/components/';

/** The registry stand-in: answers version/entry questions from the three installed manifests (as installedRegistry() does from disk). */
const MANIFESTS: Record<string, any> = {
  '@johnhenry/window-algebra': waPkg,
  '@johnhenry/html-modules': hmPkg,
  '@johnhenry/safe-fragment': sfPkg,
  dompurify: { name: 'dompurify', version: (sfPkg as any).dependencies?.dompurify ?? '3.4.16', main: 'dist/purify.cjs.js', module: 'dist/purify.es.mjs' },
  dayjs: { name: 'dayjs', version: '1.11.23', main: 'dayjs.min.js' },
};
const registry: any = {
  async version(p: { name: string }) { const m = MANIFESTS[p.name]; if (!m) throw new Error(`workbench stub registry: ${p.name} is not in the table`); return m.version; },
  async info(_r: string, name: string) { const m = MANIFESTS[name]; return { versions: [m.version], tags: { latest: m.version }, deprecated: new Set() }; },
  async manifest(name: string) { return MANIFESTS[name]; },
  async entryInfo(name: string, _v: string, sub = '') { return (entryInfo as any)(MANIFESTS[name], sub); },
  async entry(name: string, _v: string, sub = '') { return (entryInfo as any)(MANIFESTS[name], sub).file; },
};

/** An offline CDN: answers esm.sh requests from recorded bytes, optionally with one file altered. */
function cdnFetch(tamper: boolean): typeof fetch {
  const bytes: Record<string, string> = {
    'https://esm.sh/dayjs@1.11.23?target=es2022': dayjsEntry,
    'https://esm.sh/dayjs@1.11.23/es2022/dayjs.mjs': tamper ? dayjsCore.replace('function', 'function /* an attacker was here */') : dayjsCore,
    'https://esm.sh/dayjs@1.11.23/plugin/relativeTime?target=es2022': relEntry,
    'https://esm.sh/dayjs@1.11.23/es2022/plugin/relativeTime.mjs': relCore,
  };
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = bytes[url];
    return body === undefined ? new Response(`offline: ${url} is not recorded`, { status: 404 }) : new Response(body, { status: 200, headers: { 'content-type': 'application/javascript; charset=utf-8' } });
  }) as typeof fetch;
}

interface MapBuild {
  importMap: { imports: Record<string, string>; integrity?: Record<string, string> };
  lock: any;
  html: string;
  hash: string;
  preload: string;
  csp: string;
  added: { specifier: string; from: string }[];
  ms: number;
}

async function buildMap(opts: { tamper?: boolean; lock?: any } = {}): Promise<MapBuild> {
  const t0 = performance.now();
  const router = createRouter(
    {
      // The libraries are served from the site itself (local()), the app's components by an app-owned prefix, the rest from esm.sh.
      '@johnhenry/*': local({ base: LIB_BASE }),
      // safe-fragment's own dependency, found by dependencies:true: without this route "*" (esm.sh) would claim it.
      dompurify: local({ base: LIB_BASE }),
      '@workbench/*': custom(`${UI_BASE}{path}`, { name: 'app', build: 'app' }),
      '*': esmSh(),
    },
    { probe: 'none', fetch: cdnFetch(!!opts.tamper), registry, ...(opts.lock ? { lock: opts.lock } : {}) },
  );
  const res: any = await router.build(SPECIFIERS, { graph: true, dependencies: true });
  const { html, hash } = await renderImportMapCsp(res.importMap);
  const origins = [...new Set(Object.values(res.importMap.imports as Record<string, string>).filter((u) => /^https?:/.test(u)).map((u) => new URL(u).origin))];
  const csp = [
    "default-src 'none'",
    `script-src 'self' ${hash} ${origins.join(' ')}`.trim(),
    "style-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
    'trusted-types html-modules dompurify',
  ].join(';\n');
  return {
    importMap: res.importMap, lock: res.lock, html, hash, preload: renderModulePreload(res.importMap), csp,
    added: (res.dependencies?.added ?? []).map((a: any) => ({ specifier: a.specifier, from: a.from })),
    ms: Math.round(performance.now() - t0),
  };
}

/* ───────────────────────────── 2. html-modules: components from source strings ───────────────────────────── */

interface SanitizeNote { what: string; tag: string; attribute?: string; reason: string; profile?: string; engine?: string }
interface Boot {
  map: MapBuild;
  hm: ReturnType<typeof createHTMLModules>;
  fetched: string[];
  components: number;
  engine: string;
  bootMs: number;
}
/** Everything the less-trusted module's sanitize hook reported. Module-level: the module is defined once per page. */
const sanitizeLog: SanitizeNote[] = [];
const sanitizeListeners = new Set<() => void>();

let bootP: Promise<Boot> | undefined;
/** Boot once per page: custom elements are global and permanent, so the modules are defined once and reused by every visit. */
function boot(): Promise<Boot> {
  return (bootP ??= (async () => {
    const t0 = performance.now();
    safeFragment.registerSafeFragment();
    const enginePromise = safeFragment.preloadSanitizer().catch(() => 'unavailable' as const);
    const map = await buildMap();

    // html-modules resolves a bare specifier like "@workbench/ui/kit.html" through the page's import map, with
    // import.meta.resolve. This page has no import map (Vite bundled everything), so the loader is handed the map mport just built.
    const hostResolve = (spec: string) => {
      const imports = map.importMap.imports;
      if (imports[spec]) return new URL(imports[spec], location.origin).href;
      for (const [key, value] of Object.entries(imports)) if (key.endsWith('/') && spec.startsWith(key)) return new URL(value + spec.slice(key.length), location.origin).href;
      return undefined;
    };
    const fetched: string[] = [];
    const stubFetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const rel = new URL(url, location.href).pathname.replace(/^.*\/workbench\/components\//, '');
      const src = FILES[rel];
      fetched.push(rel);
      return src === undefined ? new Response('not found', { status: 404 }) : new Response(src, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;

    const hm = createHTMLModules({
      hostResolve,
      fetch: stubFetch,
      onEvent(event: any) {
        if (event.type === 'error') console.warn('[workbench] html-modules', event);
        if (event.type !== 'sanitize') return;
        const d = event.details ?? {};
        for (const note of d.removed ?? []) sanitizeLog.push({ ...note, profile: d.profile, engine: d.engine });
        sanitizeListeners.forEach((fn) => fn());
      },
    });

    let components = 0;
    const count = (r: any) => { components += Object.keys(r?.tags ?? r?.elements ?? {}).length; };
    count(await hm.import('@workbench/ui/kit.html', { as: 'kit' }));
    count(await hm.import('@workbench/ui/notes.html', { as: 'wb' }));
    count(await hm.import('@workbench/ui/report.html', { as: 'wb' }));
    count(await hm.import('@workbench/ui/clips.html', { as: 'wb' }));
    // The less-trusted module: every component template is sanitized (article-v1 + the clip-- namespace) before it is defined.
    const sanitize = safeFragmentSanitizer({ safeFragment, profile: { base: 'article-v1', namespaces: ['clip'] } });
    count(await hm.import('@workbench/ui/untrusted/clip.html', { as: 'clip', sanitize }));
    return { map, hm, fetched, components, engine: await enginePromise, bootMs: Math.round(performance.now() - t0) };
  })());
}

/* ───────────────────────────── the desk's data ───────────────────────────── */

interface Note { id: string; title: string; body: string; at: number }
interface Rendered { report: SanitizationReport; html: string; el: Element | null; raw: string; profile: string; at: number }

const SEED_NOTES = (): Note[] => [
  { id: 'n1', title: 'Welcome to the desk', at: Date.now() - 3 * 60_000, body: '<p>Every window here is a <strong>window-algebra</strong> surface. Everything <em>inside</em> a window is an <strong>html-modules</strong> component, and this note body is rendered by <strong>safe-fragment</strong>.</p><ul><li>drag a title bar</li><li>press <code>Ctrl/Cmd+Shift+P</code></li><li>try a preset above</li></ul>' },
  { id: 'n2', title: 'Plain text stays plain', at: Date.now() - 2 * 60_000, body: 'No markup in this one, so it goes through the plain-text-v1 profile:\nline breaks survive,\nand <b>this is not bold</b>.' },
  { id: 'n3', title: 'Pasted from a newsletter', at: Date.now() - 40_000, body: '<p>Big <strong>news</strong> this week. <a href="https://example.com/news">Read more</a> or <a href="javascript:window.__orreryWorkbenchPwned=(window.__orreryWorkbenchPwned||[]).concat(\'javascript: href\')">click here</a>.</p><img src="x" alt="tracking pixel" onerror="window.__orreryWorkbenchPwned=(window.__orreryWorkbenchPwned||[]).concat(\'img onerror\')">' },
];

const looksLikeMarkup = (text: string) => /<[a-z!/]/i.test(text);
const REL = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const ago = (t: number) => { const s = Math.round((t - Date.now()) / 1000); return Math.abs(s) < 45 ? 'just now' : Math.abs(s) < 3600 ? REL.format(Math.round(s / 60), 'minute') : REL.format(Math.round(s / 3600), 'hour'); };

const label = (n: { tag: string; attribute?: string }) => (n.attribute ? `${n.tag}[${n.attribute}]` : `<${n.tag}>`);
/** DOMPurify's log lists the wrappers it parses into (body, remove) as removals of every input: they are never in the input. */
const ARTEFACTS = new Set(['body', 'head', 'html', 'remove']);
const real = (n: any) => !(ARTEFACTS.has(n.tag) && String(n.reason).startsWith('removed-by-engine:dompurify'));
function removalsOf(r: SanitizationReport) {
  return [
    ...r.removedElements.filter(real).map((n) => ({ ...n, what: 'element' })),
    ...r.removedAttributes.filter(real).map((n) => ({ ...n, what: 'attribute' })),
    ...r.rewrittenUrls.filter(real).map((n) => ({ ...n, what: 'url' })),
  ];
}
function summarize(r: SanitizationReport): string {
  const removed = removalsOf(r);
  const head = `Sanitized (${r.profile}, ${r.engine})`;
  const caveat = r.engine === 'native' ? " (the native engine's own removals are not listed)" : '';
  if (!removed.length) return `${head}: nothing listed${caveat}`;
  const labels = [...new Set(removed.map(label))];
  return `${head}: removed ${removed.length}: ${labels.slice(0, 6).join(', ')}${labels.length > 6 ? `, +${labels.length - 6} more` : ''}${caveat}`;
}

/** An independent check, not the library's report: count hazards in the raw input (parsed inertly with DOMParser: no script runs, no image loads) and in the live rendered DOM. */
const HAZARDS: [string, (root: ParentNode) => number][] = [
  ['<script>', (r) => r.querySelectorAll('script').length],
  ['<iframe>/<object>/<embed>', (r) => r.querySelectorAll('iframe,object,embed,frame').length],
  ['<svg> / <math>', (r) => r.querySelectorAll('svg,math').length],
  ['<form> / form controls', (r) => r.querySelectorAll('form,input,button,select,textarea').length],
  ['on* handler attributes', (r) => [...r.querySelectorAll('*')].reduce((n, el) => n + [...el.attributes].filter((a) => /^on/i.test(a.name)).length, 0)],
  ['javascript: URLs', (r) => [...r.querySelectorAll('*')].reduce((n, el) => n + [...el.attributes].filter((a) => /^(href|src|action|formaction|xlink:href|srcdoc)$/i.test(a.name) && /^javascript:/i.test(a.value.replace(/[\u0000-\u0020]/g, ''))).length, 0)],
  ['style / srcdoc / formaction', (r) => [...r.querySelectorAll('*')].reduce((n, el) => n + [...el.attributes].filter((a) => /^(style|srcdoc|formaction)$/i.test(a.name)).length, 0)],
];
function audit(rawHtml: string, rendered: Element | null): { name: string; before: number; after: number }[] {
  const raw = new DOMParser().parseFromString(rawHtml, 'text/html');
  return HAZARDS.map(([name, count]) => ({ name, before: count(raw), after: rendered ? count(rendered) : 0 })).filter((r) => r.before || r.after);
}

const executed = () => ((window as any)[NS] as unknown[] | undefined)?.length ?? 0;

/* ───────────────────────────── 3. window-algebra: layouts and the room ───────────────────────────── */

const LAYOUTS = [
  { id: 'master-stack', label: 'Master', spec: { type: 'master-stack', ratio: 0.52 } },
  { id: 'grid', label: 'Grid', spec: { type: 'grid', min: 260 } },
  { id: 'columns', label: 'Columns', spec: { type: 'columns' } },
  { id: 'rows', label: 'Rows', spec: { type: 'rows' } },
  { id: 'spiral', label: 'Spiral', spec: { type: 'spiral' } },
  { id: 'monocle', label: 'Monocle', spec: { type: 'monocle' } },
] as const;
type LayoutId = (typeof LAYOUTS)[number]['id'];

type ToolId = 'notes' | 'clips' | 'report' | 'map' | 'source';
const TOOL_IDS: ToolId[] = ['notes', 'clips', 'report', 'map', 'source'];
const TITLES: Record<ToolId, string> = { notes: 'Notes', clips: 'Clips (less trusted)', report: 'Sanitizer report', map: 'Import map (mport)', source: 'Module source' };

const DEFAULTS = { l: 'master-stack', w: 'notes,clips,map', p: '' };

interface Ctx {
  notes: Note[];
  selected: string | null;
  rendered: Map<string, Rendered>;
  seq: number;
  onChange: Set<() => void>;
  emit(): void;
  addNote(title: string, body: string): Note;
  removeNote(id: string): void;
  boot: Boot;
  /** Set by the notes tool while it is mounted: fills the real form and presses the real submit button. */
  paste?: (title: string, body: string) => Promise<void>;
}

/* ───────────────────────────── tools ───────────────────────────── */

type Mount = (body: Element, ctx: Ctx) => () => void;

/** Mount an html-modules component into a window body and run async glue against it; returns a cleanup. */
function componentTool(tag: string, glue: (el: HTMLElement, ctx: Ctx) => Promise<(() => void) | void>): Mount {
  return (body, ctx) => {
    const el = h(tag);
    body.append(el);
    let off: (() => void) | void;
    let disposed = false;
    glue(el, ctx).then(
      (fn) => { if (disposed) fn?.(); else off = fn; },
      (error) => { body.append(errBox(`${tag} failed: ${String((error as Error)?.stack ?? error)}`)); },
    );
    return () => { disposed = true; off?.(); el.remove(); };
  };
}
function errBox(text: string): HTMLElement { const pre = h('pre', { class: 'code wb-err' }); pre.textContent = text; return pre; }

/* ---- Notes ---- */
async function renderBody(card: HTMLElement, note: Note, ctx: Ctx) {
  const root = await shadowOf(card);
  const fragment = root.querySelector('safe-fragment') as any;
  const profile = looksLikeMarkup(note.body) ? 'article-v1' : 'plain-text-v1';
  if (!(card as any).__wb) {
    (card as any).__wb = true;
    fragment.addEventListener('safe-fragment:render', (event: CustomEvent) => {
      const report = event.detail.report as SanitizationReport;
      const prev = ctx.rendered.get(card.dataset.id!);
      ctx.rendered.set(card.dataset.id!, { report, html: fragment.getRenderedRoot()?.innerHTML ?? '', el: fragment.getRenderedRoot() ?? null, raw: prev?.raw ?? '', profile: report.profile, at: Date.now() });
      setAttr(card, 'report', summarize(report));
      ctx.emit();
      setTimeout(ctx.emit, 450); // an onerror that would have fired has fired by now: refresh the "handlers that ran" count
    });
    fragment.addEventListener('safe-fragment:reject', (event: CustomEvent) => setAttr(card, 'report', `Not rendered: ${event.detail.code}`));
  }
  if ((card as any).__body === note.body) return;
  (card as any).__body = note.body;
  const prev = ctx.rendered.get(card.dataset.id!);
  if (prev) prev.raw = note.body; else ctx.rendered.set(card.dataset.id!, { report: undefined as any, html: '', el: null, raw: note.body, profile, at: 0 });
  if (fragment.profile !== profile) fragment.profile = profile;
  fragment.html = note.body; // a property: the string never passes through an attribute or an HTML sink of ours
}

const notesTool: Mount = componentTool('wb--notes-tool', async (host, ctx) => {
  const root = await shadowOf(host);
  const form = root.querySelector('form')!;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form); // the form-associated <kit--field>/<kit--area> are in here
    const title = String(data.get('title') ?? '').trim();
    if (!title) return;
    ctx.addNote(title, String(data.get('body') ?? '').trim());
    (form as HTMLFormElement).reset();
  });
  host.addEventListener('click', (event) => {
    const action = actionOf(event)?.dataset.action;
    const id = idOf(event);
    if (action === 'delete' && id) ctx.removeNote(id);
    if (action === 'inspect' && id) { ctx.selected = id; ctx.emit(); }
  });

  ctx.paste = async (title, body) => {
    const field = form.querySelector('kit--field') as any;
    const area = form.querySelector('kit--area') as any;
    const before = ctx.notes.length;
    // The fields are form-associated custom elements: set their value, then press the real submit-button component.
    field.value = title; area.value = body;
    (form.querySelector('kit--submit-button') as HTMLElement).click();
    await sleep(250);
    if (ctx.notes.length === before) { ctx.addNote(title, body); (form as HTMLFormElement).reset(); } // fall back to the data path
  };

  const render = () => {
    setAttr(host, 'count', ctx.notes.length);
    reconcile(host, {
      items: ctx.notes, tag: 'wb--note-card', slot: 'items',
      apply(el, note) {
        setAttr(el, 'heading', note.title);
        setAttr(el, 'profile', looksLikeMarkup(note.body) ? 'article-v1' : 'plain-text-v1');
        setAttr(el, 'updated', `Added ${ago(note.at)}`);
        setAttr(el, 'selected', ctx.selected === note.id);
        renderBody(el, note, ctx).catch((e) => console.warn('[workbench] note body', e));
      },
    });
  };
  render();
  ctx.onChange.add(render);
  return () => { ctx.onChange.delete(render); if (ctx.paste) ctx.paste = undefined; };
});

/* ---- Clips (the less-trusted module) ---- */
const clipsTool: Mount = componentTool('wb--clips-tool', async (host) => {
  await shadowOf(host);
  host.append(h('clip--card', { slot: 'card', heading: 'A clip from elsewhere' }));
  const render = () => {
    setAttr(host, 'removed', sanitizeLog.length);
    reconcile(host, {
      items: sanitizeLog.map((note, i) => ({ id: String(i), note })),
      tag: 'kit--removal', slot: 'removed',
      apply(el, { note }) {
        setAttr(el, 'name', label(note));
        setAttr(el, 'detail', `${note.what}: ${note.reason}`);
      },
    });
  };
  render();
  sanitizeListeners.add(render);
  return () => sanitizeListeners.delete(render);
});

/* ---- Sanitizer report ---- */
/** The control: the raw note rendered with NO sanitizer, in a sandboxed (opaque-origin) iframe, so you can see what it would have done. */
function runControl(raw: string): Promise<string[]> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:0';
    let done = false;
    const finish = (fired: string[]) => { if (done) return; done = true; removeEventListener('message', onMsg); frame.remove(); resolve(fired); };
    const onMsg = (e: MessageEvent) => { if (e.source === frame.contentWindow && e.data && Array.isArray(e.data.wbControl)) finish(e.data.wbControl as string[]); };
    addEventListener('message', onMsg);
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><body>${raw}<script>addEventListener('load',function(){setTimeout(function(){var v=window.${NS}||[];parent.postMessage({wbControl:Array.isArray(v)?v:[String(v)]},'*')},350)})<\/script>`;
    document.body.append(frame);
    setTimeout(() => finish([]), 2500);
  });
}

const reportTool: Mount = componentTool('wb--report-tool', async (host, ctx) => {
  await shadowOf(host);
  let controlResult: { id: string; fired: string[] } | undefined;
  /** The inspected note: the one picked with a card's Report button, else the first note with a hazard in its input. */
  const pick = () => {
    if (ctx.selected && ctx.notes.some((n) => n.id === ctx.selected)) return ctx.selected;
    return (ctx.notes.find((n) => audit(n.body, null).some((f) => f.before)) ?? ctx.notes[0])?.id;
  };
  host.addEventListener('click', async (event) => {
    if (actionOf(event)?.dataset.action !== 'control') return;
    const id = pick();
    const note = ctx.notes.find((n) => n.id === id);
    if (!note) return;
    controlResult = undefined;
    render('running the raw note in a sandboxed iframe…');
    const fired = await runControl(note.body);
    controlResult = { id: note.id, fired };
    render();
  });

  function render(status?: string) {
    const id = pick();
    const note = ctx.notes.find((n) => n.id === id);
    const r = id ? ctx.rendered.get(id) : undefined;
    if (!note || !r?.report) { setAttr(host, 'heading', note ? `${note.title} (rendering…)` : 'No notes'); return; }
    const removed = removalsOf(r.report);
    setAttr(host, 'heading', note.title);
    setAttr(host, 'profile', r.report.profile);
    setAttr(host, 'engine', r.report.engine);
    setAttr(host, 'ms', r.report.durationMs.toFixed(1));
    setAttr(host, 'els', r.report.removedElements.filter(real).length);
    setAttr(host, 'attrs', r.report.removedAttributes.filter(real).length);
    setAttr(host, 'urls', r.report.rewrittenUrls.filter(real).length);
    setAttr(host, 'executed', executed());
    reconcile(host, {
      items: removed.map((n, i) => ({ id: String(i), n })), tag: 'kit--removal', slot: 'removed',
      apply(el, { n }) { setAttr(el, 'name', label(n)); setAttr(el, 'detail', `${n.what}: ${n.reason}`); },
    });
    const found = audit(note.body, r.el);
    reconcile(host, {
      items: found.map((f, i) => ({ id: String(i), f })), tag: 'kit--removal', slot: 'audit',
      apply(el, { f }) { setAttr(el, 'name', f.name); setAttr(el, 'detail', `${f.before} in input → ${f.after} in DOM`); },
    });
    const pre = (slot: string, text: string) => {
      let el = host.querySelector(`:scope > pre[slot="${slot}"]`) as HTMLElement | null;
      if (!el) { el = h('pre', { slot }); host.append(el); }
      if (el.textContent !== text) el.textContent = text;
    };
    pre('raw', note.body || '(empty)');
    pre('rendered', r.html || '(nothing rendered)');
    let ctl = host.querySelector(':scope > div[slot="control"]') as HTMLElement | null;
    if (!ctl) { ctl = h('div', { slot: 'control' }); host.append(ctl); }
    ctl.textContent = status ?? (controlResult && controlResult.id === id
      ? (controlResult.fired.length ? `Unsanitized, ${controlResult.fired.length} handler${controlResult.fired.length === 1 ? '' : 's'} ran: ${controlResult.fired.join(', ')}` : 'Nothing ran in the control (this note has no live payload).')
      : 'The control runs in a sandboxed iframe with an opaque origin.');
  }
  const again = () => render();
  render();
  ctx.onChange.add(again);
  return () => ctx.onChange.delete(again);
});

/* ---- Import map (mport) ---- */
function highlightJson(json: string): string {
  return esc(json)
    .replace(/(&quot;(?:sha\d+-[^&]*)&quot;)/g, '<span class="wb-hash">$1</span>')
    .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="wb-key">$1</span>$2');
}

const mapTool: Mount = (body, ctx) => {
  const box = h('div', { class: 'wb-map' });
  const tabs: [string, string][] = [['map', 'import map'], ['csp', 'CSP + hash'], ['html', 'index.html'], ['lock', 'lockfile']];
  let tab = 'map';
  let tamperMsg: { ok: boolean; text: string } | undefined;
  box.innerHTML = `
    <div class="wb-map-bar" role="group" aria-label="mport output">${tabs.map(([id, t]) => `<button class="wb-chip" data-tab="${id}" aria-pressed="false">${t}</button>`).join('')}
      <span class="wb-spacer"></span><button class="wb-chip wb-warn" data-tamper title="Rebuild with one recorded CDN file altered, against the lockfile">Tamper with a CDN file</button></div>
    <div class="wb-map-meta"></div>
    <pre class="code wb-map-pre"></pre>
    <div class="wb-map-tamper" hidden></div>`;
  body.append(box);
  const meta = box.querySelector('.wb-map-meta') as HTMLElement;
  const pre = box.querySelector('.wb-map-pre') as HTMLElement;
  const tamperBox = box.querySelector('.wb-map-tamper') as HTMLElement;
  const m = ctx.boot.map;

  const show = () => {
    for (const b of box.querySelectorAll<HTMLElement>('[data-tab]')) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
    const nInt = Object.keys(m.importMap.integrity ?? {}).length;
    const nImp = Object.keys(m.importMap.imports).length;
    if (tab === 'map') {
      meta.innerHTML = `<b>${nImp}</b> imports · <b>${nInt}</b> <code>integrity</code> entries · built in <b>${m.ms} ms</b> by <code>router.build(specs, { graph: true, dependencies: true })</code>` +
        (m.added.length ? ` · <code>dependencies: true</code> added <b>${esc(m.added.map((a) => a.specifier).join(', '))}</b> (from ${esc(m.added[0].from)})` : '');
      pre.innerHTML = highlightJson(JSON.stringify(m.importMap, null, 2));
    } else if (tab === 'csp') {
      meta.innerHTML = `<code>renderImportMapCsp()</code> hashes exactly the text inside the inline map tag: <b class="wb-hash">${esc(m.hash)}</b>`;
      pre.textContent = m.csp;
    } else if (tab === 'html') {
      meta.innerHTML = `Map first, <em>then</em> <code>renderModulePreload()</code>: an engine that has started a preload refuses a later map.`;
      pre.textContent = `${m.html}\n${m.preload}`;
    } else {
      meta.innerHTML = `<code>mport.lock.json</code>: exact versions, builds, and the SHA-384 of every CDN file in the graph (<code>files</code>).`;
      pre.textContent = JSON.stringify(m.lock, null, 2);
    }
    tamperBox.hidden = !tamperMsg;
    if (tamperMsg) { tamperBox.className = `wb-map-tamper ${tamperMsg.ok ? 'ok' : 'bad'}`; tamperBox.textContent = tamperMsg.text; }
  };
  const onClick = async (e: Event) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-tamper]');
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; show(); return; }
    t.setAttribute('disabled', '');
    tamperMsg = { ok: true, text: 'rebuilding against the lockfile with one altered CDN file…' }; show();
    try {
      await buildMap({ tamper: true, lock: m.lock });
      tamperMsg = { ok: false, text: 'Unexpected: the altered file was accepted.' };
    } catch (err) {
      tamperMsg = { ok: true, text: `Refused at build time. ${(err as Error).name}: ${(err as Error).message}\n\nIn the browser, the same mismatch against the map's "integrity" entries makes the engine refuse the file at load time (the standalone's tests check this on three engines).` };
    }
    t.removeAttribute('disabled'); show();
  };
  box.addEventListener('click', onClick);
  show();
  return () => { box.removeEventListener('click', onClick); box.remove(); };
};

/* ---- Module source ---- */
const sourceTool: Mount = (body) => {
  const box = h('div', { class: 'wb-src' });
  const names = Object.keys(FILES);
  let cur = names[1];
  box.innerHTML = `<div class="wb-map-bar" role="group" aria-label="Module sources">${names.map((n) => `<button class="wb-chip" data-src="${esc(n)}" aria-pressed="false">${esc(n)}</button>`).join('')}</div>
    <div class="wb-map-meta"></div><pre class="code wb-map-pre"></pre>`;
  body.append(box);
  const pre = box.querySelector('pre') as HTMLElement;
  const meta = box.querySelector('.wb-map-meta') as HTMLElement;
  const show = () => {
    for (const b of box.querySelectorAll<HTMLElement>('[data-src]')) b.setAttribute('aria-pressed', String(b.dataset.src === cur));
    const src = FILES[cur];
    meta.innerHTML = `<code>/workbench/components/${esc(cur)}</code>: ${src.split('\n').length} lines, served by a stub <code>fetch</code>, defined by html-modules' loader.`;
    pre.textContent = src;
  };
  const onClick = (e: Event) => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-src]'); if (t) { cur = t.dataset.src!; show(); } };
  box.addEventListener('click', onClick);
  show();
  return () => { box.removeEventListener('click', onClick); box.remove(); };
};

type Placement = { x: number; y: number; width: number; height: number };
const TOOLS: Record<ToolId, { mount: Mount; floating?: (stage: HTMLElement) => Placement }> = {
  notes: { mount: notesTool },
  clips: { mount: clipsTool },
  // The report opens as a floating window over the right side: drag it, or press its float/dock button to tile it.
  report: { mount: reportTool, floating: (st) => { const w = st.clientWidth || 900; const hgt = st.clientHeight || 600; const width = Math.min(500, w - 24); return { x: Math.max(12, w - width - 16), y: 16, width, height: Math.min(hgt - 32, 580) }; } },
  map: { mount: mapTool },
  source: { mount: sourceTool },
};

/* ───────────────────────────── the room ───────────────────────────── */

const EXPLAIN = `
<p><b>Four libraries, one desk.</b> Each box below is a different library doing one job; none of them imports another.</p>
<ul>
  <li><b>window-algebra</b> is the shell. <code>&lt;wa-stage&gt;</code> draws the windows from an immutable state: <code>wm.setLayout()</code> swaps the whole arrangement without remounting a window, the chrome (title bar, buttons, eight resize grips) is its built-in <code>chrome: true</code>, and the palette (<kbd>Ctrl/Cmd+Shift+P</kbd>) lists whichever commands make sense right now. Drag a title bar, dock it, press <kbd>Alt+Shift+Arrows</kbd> on a floating one.</li>
  <li><b>html-modules</b> defines every component inside a window from <code>.html</code> source: <code>{{heading}}</code> and <code>props="value:number"</code> data binding, a form-associated <code>&lt;kit--field&gt;</code> and a real <code>form-role="submit"</code> button (Enter submits; the preset presses it), and <code>notes.html</code> importing <code>kit.html</code> (modules importing modules). Open the <em>Module source</em> window to read them.</li>
  <li><b>safe-fragment</b> renders each note body, which is untrusted, through <code>&lt;safe-fragment profile="article-v1"&gt;</code>; text with no markup goes through <code>plain-text-v1</code>. The <em>Clips</em> window is a module "from somewhere else": html-modules' <code>sanitize</code> hook, wired to safe-fragment through <code>@johnhenry/html-modules/safe-fragment</code>, cleaned its template before the component existed. The report is on every card, in the <em>Sanitizer report</em> window and in the removed list under the clip. The "handlers that ran" counter watches a canary the payloads try to set; the control button renders the same note with <em>no</em> sanitizer in a sandboxed iframe so you can see it fire.</li>
  <li><b>mport</b> built the import map in the <em>Import map</em> window, live, for exactly this composition: <code>router.build()</code> with a stand-in registry and recorded esm.sh bytes, so no network. Note the <code>integrity</code> entries (a SHA-384 for every file of dayjs's graph), <code>dompurify</code> added by <code>dependencies: true</code>, and the CSP hash from <code>renderImportMapCsp()</code>.</li>
</ul>
<p><b>What is different from the standalone, honestly.</b> In the orrery, <b>Vite bundles all four libraries</b> into this page, so the browser is not using that import map to load them; and this site has no strict CSP or Trusted Types. What is real here: mport really produces the map (the CSP hash above is the one the standalone's live page carries), html-modules really resolves <code>@workbench/ui/kit.html</code> <em>through that map</em> (the loader is handed it as <code>hostResolve</code>, because this page has no <code>&lt;script type="importmap"&gt;</code>), and the components, windows and sanitizer are the real packages. The standalone loads that exact map with <b>no bundler</b>, copies the libraries into <code>vendor/</code>, runs under <code>require-trusted-types-for 'script'</code> with <code>style-src 'self'</code>, enforces the integrity entries in the engine, and is tested on Chromium, Firefox and WebKit. That is the proof the planet cannot be: <a href="${STANDALONE}" target="_blank" rel="noopener">open the standalone workbench</a>.</p>`;

function mount(host: HTMLElement, boot: Boot): () => void {
  const defaults = DEFAULTS;
  const init = readState(defaults);
  const narrow = matchMedia('(max-width: 720px)').matches;
  const wanted = String(init.w).split(',').filter((id): id is ToolId => (TOOL_IDS as string[]).includes(id));
  // A phone gets rows (windows stacked) unless the link names a layout.
  const named = /[?&]l=/.test(location.hash);
  const startLayout = (LAYOUTS.find((l) => l.id === (named ? init.l : narrow ? 'rows' : defaults.l)) ?? LAYOUTS[0]) as (typeof LAYOUTS)[number];

  const ctx: Ctx = {
    notes: SEED_NOTES(), selected: null, rendered: new Map(), seq: 3, onChange: new Set(), boot,
    emit() { ctx.onChange.forEach((fn) => fn()); refresh(); },
    addNote(title, body) { const n: Note = { id: `n${++ctx.seq}`, title, body, at: Date.now() }; ctx.notes = [n, ...ctx.notes]; ctx.emit(); return n; },
    removeNote(id) { ctx.notes = ctx.notes.filter((n) => n.id !== id); ctx.rendered.delete(id); if (ctx.selected === id) ctx.selected = null; ctx.emit(); },
  };
  (window as any)[NS] = [];

  // window-algebra's CSS: injected here (and removed on leave) because it is not part of the page's stylesheet.
  const style = document.createElement('style');
  style.setAttribute('data-pg-workbench', '');
  style.textContent = `${THEME_CSS}\n${RULES_CSS}\n${PALETTE_CSS}`;
  document.head.append(style);

  const root = h('div', { class: 'pg-workbench' });
  root.innerHTML = `
    <section class="panel wb-callout">
      <a class="btn primary" href="${STANDALONE}" target="_blank" rel="noopener">Open the standalone johnhenry/workbench ↗</a>
      <p><b>The standalone app stays.</b> It is the proof: these four libraries meet at <em>one import map</em> with no bundler, a strict CSP and Trusted Types, tested on three engines. This planet is the same desk under Vite: see "What's happening" for exactly what differs.</p>
    </section>
    <div class="wb-pipeline" aria-label="How the four libraries line up"></div>
    <div class="wb-controls">
      <div class="wb-row" role="group" aria-label="Presets">
        <span class="wb-label">Presets</span>
        <button class="btn" data-preset="desk">Default desk</button>
        <button class="btn primary" data-preset="xss">Paste an XSS payload</button>
        <button class="btn" data-preset="layout">Switch layout</button>
        <button class="btn" data-act="palette" title="Ctrl/Cmd+Shift+P">Command palette</button>
        <button class="btn" data-act="copy">Copy link</button>
        <span class="stat wb-status" role="status"></span>
      </div>
      <div class="wb-row" role="group" aria-label="Layout">
        <span class="wb-label">Layout</span>${LAYOUTS.map((l) => `<button class="wb-chip" data-layout="${l.id}" aria-pressed="false">${l.label}</button>`).join('')}
        <span class="wb-sep"></span><span class="wb-label">Windows</span>${TOOL_IDS.map((id) => `<button class="wb-chip" data-open="${id}" aria-pressed="false">${TITLES[id].split(' (')[0]}</button>`).join('')}
      </div>
    </div>
    <wa-stage class="wb-stage" aria-label="Workbench windows"></wa-stage>
    <details class="panel wb-explain" open><summary>What's happening</summary><div class="wb-explain-body">${EXPLAIN}</div></details>`;
  host.append(root);

  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const stage = $<WindowAlgebraElement>('wa-stage');
  const pipeline = $('.wb-pipeline');
  const statusEl = $('.wb-status');

  // --- the window manager: state is data; the stage renders it ---
  const wm: WindowManager = createWindowManager({
    state: createState({ layout: startLayout.spec as any, config: { gap: 8, inset: 8 } }),
    history: 100,
  });
  const openTool = (id: ToolId) => {
    const state = wm.getState();
    const win = (state.windows as Record<string, any>)[id];
    if (win) { if (win.status === 'minimized') wm.restore(id); wm.focus(id); return; }
    const t = TOOLS[id];
    wm.create({ id, title: TITLES[id], ...(t.floating ? { mode: 'floating', placement: t.floating(stage) } : {}) } as any);
  };
  const closeTool = (id: ToolId) => { if ((wm.getState().windows as Record<string, any>)[id]) wm.close(id); };
  for (const id of wanted) openTool(id);
  wm.focus(wanted[0] ?? 'notes');

  const surfaces = new Map<string, ReturnType<typeof lazySurface>>();
  const surfaceFor = (id: string) => {
    const tool = TOOLS[id as ToolId];
    if (!tool || !(wm.getState().windows as Record<string, any>)[id]) return undefined;
    if (!surfaces.has(id)) surfaces.set(id, lazySurface((body) => tool.mount(body, ctx)));
    return surfaces.get(id);
  };

  defineWindowAlgebraElement(); // <wa-stage>
  stage.configure({
    wm,
    surfaceFor,
    chrome: true, // title bar, buttons and resize grips: window-algebra's, themed by --wa-* tokens
    palette: { host: root, injectStyles: false }, // Ctrl/Cmd+Shift+P; mounted inside the room so it inherits the tokens
    input: { keyboard: true, announce: true, touch: { pinch: true, swipe: { tabs: true } } },
  } as any);

  // --- UI state ---
  const layoutNow = (): LayoutId => {
    const s = wm.getState() as any;
    return (s.workspaces[s.activeWorkspace]?.layout?.type ?? 'master-stack') as LayoutId;
  };
  const openNow = () => TOOL_IDS.filter((id) => (wm.getState().windows as Record<string, any>)[id]);
  let preset = String(init.p ?? '');
  const syncUrl = () => writeState({ l: layoutNow(), w: openNow().join(','), p: preset }, defaults);

  function refresh() {
    const layout = layoutNow();
    const open = openNow();
    for (const b of root.querySelectorAll<HTMLElement>('[data-layout]')) b.setAttribute('aria-pressed', String(b.dataset.layout === layout));
    for (const b of root.querySelectorAll<HTMLElement>('[data-open]')) b.setAttribute('aria-pressed', String(open.includes(b.dataset.open as ToolId)));
    const nInt = Object.keys(boot.map.importMap.integrity ?? {}).length;
    const nImp = Object.keys(boot.map.importMap.imports).length;
    const removed = sanitizeLog.length + [...ctx.rendered.values()].reduce((n, r) => n + (r.report ? removalsOf(r.report).length : 0), 0);
    pipeline.innerHTML = `
      <span class="wb-stage-chip"><b>mport</b> ${nImp} imports · ${nInt} integrity · ${boot.map.ms} ms <i>${esc(boot.map.hash.slice(0, 15))}…</i></span><span class="wb-arrow">→</span>
      <span class="wb-stage-chip"><b>html-modules</b> ${boot.fetched.length} modules · ${boot.components} components</span><span class="wb-arrow">→</span>
      <span class="wb-stage-chip"><b>safe-fragment</b> ${esc(boot.engine)} engine · ${removed} removed · <span class="${executed() ? 'bad' : 'ok'}">${executed()} ran</span></span><span class="wb-arrow">→</span>
      <span class="wb-stage-chip"><b>window-algebra</b> ${open.length} windows · ${esc(layout)}</span>`;
  }
  const unsubscribe = wm.subscribe(() => { refresh(); syncUrl(); });
  sanitizeListeners.add(refresh);
  refresh();
  syncUrl();

  // --- presets ---
  const say = (t: string) => { statusEl.textContent = t; };
  async function applyPreset(name: string) {
    if (name === 'desk') {
      preset = '';
      for (const id of TOOL_IDS) closeTool(id);
      ctx.notes = SEED_NOTES(); ctx.selected = null; ctx.rendered.clear(); ctx.seq = 3; (window as any)[NS] = [];
      wm.setLayout(LAYOUTS[0].spec as any);
      for (const id of ['notes', 'clips', 'map'] as ToolId[]) openTool(id);
      wm.focus('notes');
      ctx.emit();
      say('default desk');
    } else if (name === 'layout') {
      const i = LAYOUTS.findIndex((l) => l.id === layoutNow());
      const next = LAYOUTS[(i + 1) % LAYOUTS.length];
      wm.setLayout(next.spec as any);
      say(`layout → ${next.id} (the windows kept their state)`);
    } else if (name === 'xss') {
      preset = 'xss';
      openTool('report'); openTool('notes');
      stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      await sleep(60);
      for (let i = 0; !ctx.paste && i < 40; i++) await sleep(50); // wait for the notes window to mount
      say('pasting the payload and pressing the real submit button…');
      if (!ctx.notes.some((n) => n.title === XSS_TITLE)) {
        if (ctx.paste) await ctx.paste(XSS_TITLE, XSS_PAYLOAD); else ctx.addNote(XSS_TITLE, XSS_PAYLOAD);
      }
      const note = ctx.notes.find((n) => n.title === XSS_TITLE);
      if (note) ctx.selected = note.id;
      ctx.emit();
      wm.focus('report');
      await sleep(600);
      say(executed() === 0 ? 'payload neutralised: 0 handlers ran. Open the report for what was removed.' : `WARNING: ${executed()} handler(s) ran`);
      ctx.emit();
      syncUrl();
    }
  }

  const onClick = async (e: Event) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-preset],[data-act],[data-layout],[data-open]');
    if (!t) return;
    try {
      if (t.dataset.preset) await applyPreset(t.dataset.preset);
      else if (t.dataset.layout) { const l = LAYOUTS.find((x) => x.id === t.dataset.layout)!; wm.setLayout(l.spec as any); }
      else if (t.dataset.open) {
        const id = t.dataset.open as ToolId;
        if (openNow().includes(id)) closeTool(id); else openTool(id);
      } else if (t.dataset.act === 'palette') stage.palette?.open();
      else if (t.dataset.act === 'copy') { syncUrl(); await sleep(200); await copyLink(); say('link copied'); }
    } catch (err) { say(`error: ${(err as Error).message}`); console.error(err); }
  };
  // Only the room's own controls: window-algebra's views carry data-* attributes of their own (data-layout, ...).
  const controls = $('.wb-controls');
  controls.addEventListener('click', onClick);
  if (preset === 'xss') setTimeout(() => void applyPreset('xss'), 0);

  return () => {
    controls.removeEventListener('click', onClick);
    unsubscribe();
    sanitizeListeners.delete(refresh);
    ctx.onChange.clear();
    root.remove(); // disconnects <wa-stage>: its manager, renderer, input, palette and sync detach; the surfaces' cleanups run
    style.remove();
    delete (window as any)[NS];
  };
}

const playground: Playground = {
  id: 'workbench',
  title: 'Workbench Desk',
  pkg: '@johnhenry/window-algebra',
  hue: 165,
  blurb: 'A tiling desk built from four libraries: window-algebra windows, html-modules components, safe-fragment notes, and the mport import map that joins them.',
  docs: 'https://opensource.johnhenry.me/workbench/',
  async mount(host) {
    const loading = h('div', { class: 'loading' }, 'building the import map, defining the modules…');
    host.append(loading);
    try {
      const b = await boot();
      loading.remove();
      return mount(host, b);
    } catch (e) {
      loading.remove();
      const pre = errBox(`Workbench Desk failed to start:\n${String((e as Error)?.stack ?? e)}`);
      host.append(pre);
      return () => pre.remove();
    }
  },
};
export default playground;
