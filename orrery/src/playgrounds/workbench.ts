import type { Playground } from '../registry';
import { readState, writeState, copyLink } from '../state';
import './workbench.css';
import { XSS_PAYLOAD, XSS_TITLE } from './workbench-modules';

// window-algebra: the shell (state, layouts, <wa-stage>, window chrome, palette, keyboard input).
import { createState, createWindowManager, THEME_CSS, RULES_CSS, type WindowManager } from '@johnhenry/window-algebra';
import { lazySurface, PALETTE_CSS } from '@johnhenry/window-algebra/browser';
import { defineWindowAlgebraElement, type WindowAlgebraElement } from '@johnhenry/window-algebra/element';
// html-modules: how the components inside the windows are written: real .html files, defined by the loader.
import { createHTMLModules } from '@johnhenry/html-modules';
// ... and its adapter for safe-fragment: the `sanitize` hook for the less-trusted module.
import { safeFragmentSanitizer } from '@johnhenry/html-modules/safe-fragment';
// safe-fragment: untrusted note bodies through <safe-fragment profile="article-v1">.
import * as safeFragment from '@johnhenry/safe-fragment';
import type { SanitizationReport } from '@johnhenry/safe-fragment';
/* ────────────────────────────────────────────────────────────────────────────
 * Untrusted Desk (id: workbench). The planet leads with two libraries and uses a third as the way the components are written:
 *   window-algebra  the desk: <wa-stage>, chrome, palette, layouts, undo/redo, floating windows (keyboard move/resize), pop-out, sync
 *   safe-fragment   the untrusted notes: a switchable profile, the report, the Clips module (html-modules' sanitize hook), and a
 *                   strict-CSP + Trusted Types frame (workbench/tt.html) that proves it in a separate document
 *   html-modules    every component in every window is a .html module
 * The standalone johnhenry/workbench (all four libraries via an mport import map, no bundler) is linked, not reimplemented.
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

/* ───────────────────────────── 1. html-modules: the components, from .html files ───────────────────────────── */

// The components are real static files (Vite public dir: public/workbench/components/), so the prefix carries the site's base
// ("/" in dev, "/orrery/" in the docs build). html-modules fetches them over HTTP; notes.html imports kit.html by the bare
// specifier "@workbench/ui/kit.html", which this page has no import map for, so the loader is handed a resolver.
const UI_BASE = `${import.meta.env.BASE_URL}workbench/components/`;
const UI_PREFIX = '@workbench/ui/';

interface SanitizeNote { what: string; tag: string; attribute?: string; reason: string; profile?: string; engine?: string }
interface Boot {
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

    const hostResolve = (spec: string) => (spec.startsWith(UI_PREFIX) ? new URL(UI_BASE + spec.slice(UI_PREFIX.length), location.origin).href : undefined);
    const fetched: string[] = [];
    // The platform's own fetch, only logged.
    const loggedFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      fetched.push(new URL(url, location.href).pathname.replace(/^.*\/workbench\/components\//, ''));
      return fetch(input, init);
    }) as typeof fetch;

    const hm = createHTMLModules({
      hostResolve,
      fetch: loggedFetch,
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
    count(await hm.import(`${UI_PREFIX}kit.html`, { as: 'kit' }));
    count(await hm.import(`${UI_PREFIX}notes.html`, { as: 'wb' }));
    count(await hm.import(`${UI_PREFIX}report.html`, { as: 'wb' }));
    count(await hm.import(`${UI_PREFIX}clips.html`, { as: 'wb' }));
    // safe-fragment's feature "sanitize an untrusted component template", through html-modules' `sanitize` hook: every template of the
    // less-trusted module is cleaned (article-v1 + the clip-- namespace) BEFORE its component is defined.
    const sanitize = safeFragmentSanitizer({ safeFragment, profile: { base: 'article-v1', namespaces: ['clip'] } });
    count(await hm.import(`${UI_PREFIX}untrusted/clip.html`, { as: 'clip', sanitize }));
    return { hm, fetched, components, engine: await enginePromise, bootMs: Math.round(performance.now() - t0) };
  })());
}

/* ───────────────────────────── the desk's data ───────────────────────────── */

interface Note { id: string; title: string; body: string; at: number }
interface Rendered { report: SanitizationReport; html: string; el: Element | null; raw: string; profile: string; at: number }

const SEED_NOTES = (): Note[] => [
  { id: 'n1', title: 'Welcome to the desk', at: Date.now() - 3 * 60_000, body: '<p>Every window here is a <strong>window-algebra</strong> surface. Everything <em>inside</em> a window is an <strong>html-modules</strong> component, and this note body is rendered by <strong>safe-fragment</strong>.</p><ul><li>drag a title bar</li><li>press <code>Ctrl/Cmd+Shift+P</code></li><li>try a preset above</li></ul>' },
  { id: 'n2', title: 'Plain text stays plain', at: Date.now() - 2 * 60_000, body: 'Nothing here looks like markup, so this goes through the plain-text-v1 profile:\nline breaks survive,\nand so does a < sign when a space follows it (1 < 2).' },
  { id: 'n3', title: 'Pasted from a newsletter', at: Date.now() - 40_000, body: '<p>Big <strong>news</strong> this week. <a href="https://example.com/news">Read more</a> or <a href="javascript:window.__orreryWorkbenchPwned=(window.__orreryWorkbenchPwned||[]).concat(\'javascript: href\')">click here</a>.</p><img src="x" alt="tracking pixel" onerror="window.__orreryWorkbenchPwned=(window.__orreryWorkbenchPwned||[]).concat(\'img onerror\')">' },
];

const looksLikeMarkup = (text: string) => /<[a-z!/]/i.test(text);
/** The profile a note renders under: the switcher's choice, or in "auto" the one that suits the note. */
const profileFor = (note: { body: string }, choice: ProfileChoice): string => (choice !== 'auto' ? choice : looksLikeMarkup(note.body) ? 'article-v1' : 'plain-text-v1');
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

type ToolId = 'notes' | 'clips' | 'report';
const TOOL_IDS: ToolId[] = ['notes', 'clips', 'report'];
const TITLES: Record<ToolId, string> = { notes: 'Notes', clips: 'Clips (untrusted template)', report: 'Sanitizer report' };

/** The profile switcher: "auto" is the per-note choice (markup -> article-v1, none -> plain-text-v1); the rest force one profile on every note. */
const PROFILES = ['article-v1', 'ui-v1', 'email-v1', 'plain-text-v1'] as const;
type ProfileChoice = 'auto' | (typeof PROFILES)[number];
const DEFAULTS = { l: 'master-stack', w: 'notes,clips', p: '', pf: 'auto' };

/* ---- persistence: window-algebra's own serialize()/load() for the layout, localStorage for the notes, a BroadcastChannel for tabs ----
 * Planet-specific names, so no other planet's storage or channel is touched. Window state crosses tabs through the stage's `sync`
 * option (attachSync); notes are app data, which attachSync does not carry, so they cross through the `storage` event, as in the standalone. */
const WM_KEY = 'orrery:workbench:wm';
const DATA_KEY = 'orrery:workbench:data';
const CHANNEL = 'orrery-workbench';
const store = {
  read: (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } },
  write: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private mode or quota: the desk still works for this session */ } },
  remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};
const readNotes = (raw: string | null): Note[] | null => {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (!data || !Array.isArray(data.notes)) return null;
    return data.notes.filter((n: any) => n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.body === 'string').map((n: any) => ({ id: n.id, title: n.title, body: n.body, at: Number(n.at) || Date.now() }));
  } catch { return null; }
};
const newId = () => `n${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, '').slice(0, 10)}`;

interface Ctx {
  notes: Note[];
  selected: string | null;
  /** The safe-fragment profile every note is rendered under ('auto': each note picks its own). */
  profile: ProfileChoice;
  rendered: Map<string, Rendered>;
  onChange: Set<() => void>;
  emit(): void;
  /** A timer that is dropped when the planet unmounts. */
  later(fn: () => void, ms: number): void;
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
  const profile = profileFor(note, ctx.profile);
  if (!(card as any).__wb) {
    (card as any).__wb = true;
    fragment.addEventListener('safe-fragment:render', (event: CustomEvent) => {
      const report = event.detail.report as SanitizationReport;
      const prev = ctx.rendered.get(card.dataset.id!);
      ctx.rendered.set(card.dataset.id!, { report, html: fragment.getRenderedRoot()?.innerHTML ?? '', el: fragment.getRenderedRoot() ?? null, raw: prev?.raw ?? '', profile: report.profile, at: Date.now() });
      setAttr(card, 'report', summarize(report));
      ctx.emit();
      ctx.later(ctx.emit, 450); // an onerror that would have fired has fired by now: refresh the "handlers that ran" count
    });
    fragment.addEventListener('safe-fragment:reject', (event: CustomEvent) => setAttr(card, 'report', `Not rendered: ${event.detail.code}`));
  }
  const key = `${profile}\u0000${note.body}`;
  if ((card as any).__key === key) return; // same profile, same body: nothing to render again
  (card as any).__key = key;
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
        setAttr(el, 'profile', profileFor(note, ctx.profile));
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

type Placement = { x: number; y: number; width: number; height: number };
const TOOLS: Record<ToolId, { mount: Mount; floating?: (stage: HTMLElement) => Placement }> = {
  notes: { mount: notesTool },
  clips: { mount: clipsTool },
  // The report opens as a floating window over the right side: drag it, or press its float/dock button to tile it.
  report: { mount: reportTool, floating: (st) => { const w = st.clientWidth || 900; const hgt = st.clientHeight || 600; const width = Math.min(500, w - 24); return { x: Math.max(12, w - width - 16), y: 16, width, height: Math.min(hgt - 32, 580) }; } },
};

/* ───────────────────────────── the room ───────────────────────────── */

/** The strict-CSP frame: a separate page (built as its own Vite entry, workbench/tt.html) with its own <meta> policy. */
const FRAME_URL = `${import.meta.env.BASE_URL}workbench/tt.html`;

const EXPLAIN = `
<p><b>Two libraries lead.</b> <b>window-algebra</b> is the desk and <b>safe-fragment</b> is why its notes can be hostile; the components inside the windows are written as <b>html-modules</b>.</p>
<h4>window-algebra</h4>
<ul>
  <li><b>State is data, so history is free.</b> <code>&lt;wa-stage&gt;</code> draws the windows from an immutable state, and the manager records every command: <b>Undo</b> / <b>Redo</b> call <code>wm.undo()</code> / <code>wm.redo()</code>, and the whole of a drag is one step (commands that share a <code>gesture</code> token). Try it: swap a layout, close a window, undo. History covers the windows, not the notes' text. <code>wm.setLayout()</code> changes the whole arrangement without remounting a window.</li>
  <li><b>Floating windows are keyboard-reachable.</b> <b>Float focused</b> is <code>wm.toggleFloating()</code>. With input <code>keyboard: true</code>, <kbd>Alt+Shift+Arrows</kbd> move the focused floating window by <code>floatStep</code> (10 px) and <kbd>Ctrl+Alt+Shift+Arrows</kbd> resize it; the readout shows the placement. The Sanitizer report opens floating.</li>
  <li><b>Pop-out.</b> <b>Pop out</b> (or the chrome's own button) uses <code>attachPopouts</code>: the window's live DOM, shadow roots and all, moves into a real browser window and back. It needs a user gesture and a browser that allows pop-ups; a blocked one is reported, not thrown.</li>
  <li><b>The rest of the shell:</b> built-in chrome (<code>chrome: true</code>), the command palette (<kbd>Ctrl/Cmd+Shift+P</kbd>), and persistence plus two-tab sync, below.</li>
</ul>
<h4>safe-fragment</h4>
<ul>
  <li><b>Every note body is untrusted.</b> It is handed to <code>&lt;safe-fragment&gt;</code> as a property and rendered under a versioned <b>profile</b>. The switcher re-renders all notes under <code>article-v1</code>, <code>ui-v1</code>, <code>email-v1</code> or <code>plain-text-v1</code>, so you can see what each one keeps; <em>auto</em> picks <code>plain-text-v1</code> for notes with no markup. The report is on every card, in the <em>Sanitizer report</em> window (with an independent hazard count over the raw input and the live DOM), and the "handlers that ran" counter watches a canary the payloads try to set. The control button renders the raw note with <em>no</em> sanitizer in a sandboxed iframe so you can see it fire.</li>
  <li><b>Sanitize an untrusted component template.</b> <em>Clips</em> is a module "from somewhere else". html-modules' <code>sanitize</code> hook, wired to safe-fragment by <code>@johnhenry/html-modules/safe-fragment</code>, cleaned its template under <code>article-v1</code> before the component was defined; what it removed is listed under the clip.</li>
  <li><b>Strict CSP, Trusted Types.</b> The frame below is a separate page with <code>require-trusted-types-for 'script'</code> and <code>trusted-types dompurify</code>, no inline script or style. safe-fragment renders hostile notes in it with <b>zero</b> <code>securitypolicyviolation</code> events (counted on the page and on safe-fragment's parse realm); a raw <code>innerHTML</code> of the same string throws and <em>does</em> raise one, shown as the control. Chromium and Firefox use the native Sanitizer API; WebKit uses the DOMPurify engine, the one policy name the page allows. One honest limit: on Chromium a note containing an inline <code>style=</code> attribute makes the parse realm report <code>style-src-attr</code> even though the output is clean, so the frame's demo notes carry none.</li>
</ul>
<h4>html-modules</h4>
<ul>
  <li>Every component is a <code>.html</code> module: a data-bound template (<code>{{heading}}</code>, <code>props="value:number"</code>), a form-associated <code>&lt;kit--field&gt;</code> and a real <code>form-role="submit"</code> button (Enter submits; the preset presses it), and <code>notes.html</code> importing <code>kit.html</code>. They are plain static files under <code>public/workbench/components/</code>, defined by the loader.</li>
</ul>
<p><b>Persistence and tabs.</b> The windows (<code>wm.serialize()</code> / <code>wm.load()</code>) and the notes survive a reload, under this planet's own keys (<code>orrery:workbench:*</code>). Open the planet in a second tab: the layout follows through <code>&lt;wa-stage&gt;</code>'s <code>sync</code> option (<code>attachSync</code> on a <code>BroadcastChannel</code> named <code>orrery-workbench</code>; undo and redo sync too), and notes follow through the <code>storage</code> event, because <code>attachSync</code> carries window state only. <em>Reset desk</em> clears both.</p>
<p><b>What this page is not.</b> Vite bundles the libraries into the orrery, and the orrery itself has no strict CSP; the frame is the proof that safe-fragment holds under one.</p>`;

function mountDesk(host: HTMLElement, boot: Boot): () => void {
  const defaults = DEFAULTS;
  const init = readState(defaults);
  const narrow = matchMedia('(max-width: 720px)').matches;
  const wanted = String(init.w).split(',').filter((id): id is ToolId => (TOOL_IDS as string[]).includes(id));
  // A phone gets rows (windows stacked) unless the link names a layout.
  const named = /[?&]l=/.test(location.hash);
  const namedWindows = /[?&]w=/.test(location.hash);
  const startLayout = (LAYOUTS.find((l) => l.id === (named ? init.l : narrow ? 'rows' : defaults.l)) ?? LAYOUTS[0]) as (typeof LAYOUTS)[number];
  const startProfile: ProfileChoice = (['auto', ...PROFILES] as string[]).includes(String(init.pf)) ? (init.pf as ProfileChoice) : 'auto';
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); return t; };

  // The notes: the saved set if there is one (another visit, another tab), else the seed, which is saved at once so a second tab agrees on it.
  const savedNotes = readNotes(store.read(DATA_KEY));
  const saveNotes = () => store.write(DATA_KEY, JSON.stringify({ v: 1, notes: ctx.notes }));
  const ctx: Ctx = {
    notes: savedNotes ?? SEED_NOTES(), selected: null, profile: startProfile, rendered: new Map(), onChange: new Set(), boot,
    emit() { if (disposed) return; ctx.onChange.forEach((fn) => fn()); refresh(); },
    later: (fn, ms) => void later(fn, ms),
    addNote(title, body) { const n: Note = { id: newId(), title, body, at: Date.now() }; ctx.notes = [n, ...ctx.notes]; saveNotes(); ctx.emit(); return n; },
    removeNote(id) { ctx.notes = ctx.notes.filter((n) => n.id !== id); ctx.rendered.delete(id); if (ctx.selected === id) ctx.selected = null; saveNotes(); ctx.emit(); return; },
  };
  if (!savedNotes) saveNotes();
  (window as any)[NS] = [];

  // window-algebra's CSS: injected here (and removed on leave) because it is not part of the page's stylesheet.
  const style = document.createElement('style');
  style.setAttribute('data-pg-workbench', '');
  style.textContent = `${THEME_CSS}\n${RULES_CSS}\n${PALETTE_CSS}`;
  document.head.append(style);

  const root = h('div', { class: 'wb-inpage' });
  root.innerHTML = `
    <section class="panel wb-callout">
      <a class="btn primary" href="${STANDALONE}" target="_blank" rel="noopener" data-standalone>Open the standalone johnhenry/workbench ↗</a>
      <p>The standalone shows all four libraries loading through an <b>mport</b>-generated import map with no bundler, under strict CSP. This planet is the part you can poke at: the desk and the untrusted notes.</p>
    </section>
    <div class="wb-pipeline" aria-label="How the libraries line up"></div>
    <div class="wb-controls">
      <div class="wb-row" role="group" aria-label="Presets">
        <span class="wb-label">Presets</span>
        <button class="btn primary" data-preset="xss">Paste an XSS payload</button>
        <button class="btn" data-preset="layout">Switch layout</button>
        <button class="btn" data-act="palette" title="Ctrl/Cmd+Shift+P (some browsers reserve Ctrl+Shift+P for a private window: this button always works)">Command palette</button>
        <button class="btn" data-act="reset" title="Back to the default desk and the three seed notes; clears what this planet saved">Reset desk</button>
        <button class="btn" data-act="copy">Copy link</button>
        <span class="stat wb-tabs" data-tabs title="Tabs of this planet on this browser, counted by window-algebra's attachSync">1 tab</span>
        <span class="stat wb-status" role="status"></span>
      </div>
      <div class="wb-row" role="group" aria-label="Layout">
        <span class="wb-label">Layout</span>${LAYOUTS.map((l) => `<button class="wb-chip" data-layout="${l.id}" aria-pressed="false">${l.label}</button>`).join('')}
        <span class="wb-sep"></span><span class="wb-label">Windows</span>${TOOL_IDS.map((id) => `<button class="wb-chip" data-open="${id}" aria-pressed="false">${TITLES[id].split(' (')[0]}</button>`).join('')}
      </div>
      <div class="wb-row wb-feature" role="group" aria-label="History">
        <span class="wb-label">History</span>
        <button class="btn" data-act="undo" disabled>Undo</button>
        <button class="btn" data-act="redo" disabled>Redo</button>
        <span class="stat" data-history>0 steps</span>
        <span class="wb-why">window-algebra logs every command, so undo and redo walk the desk's history; a whole drag is one step. Windows only, not note text.</span>
      </div>
      <div class="wb-row wb-feature" role="group" aria-label="Floating windows">
        <span class="wb-label">Floating</span>
        <button class="btn" data-act="float" title="wm.toggleFloating() on the focused window">Float focused</button>
        <button class="btn" data-act="popout" title="attachPopouts: the focused window's live DOM moves into a real browser window">Pop out</button>
        <span class="stat" data-floatbox aria-live="polite">no window focused</span>
        <span class="wb-why">Focus a floating window, then <kbd>Alt+Shift+Arrows</kbd> move it 10px and <kbd>Ctrl+Alt+Shift+Arrows</kbd> resize it. Pop out moves it into its own browser window.</span>
      </div>
      <div class="wb-row wb-feature" role="group" aria-label="safe-fragment profile">
        <span class="wb-label">Profile</span>${(['auto', ...PROFILES] as const).map((p) => `<button class="wb-chip" data-profile="${p}" aria-pressed="false">${p}</button>`).join('')}
        <span class="wb-why">safe-fragment renders every note under the profile you pick: the badge, the removed list and the rendered HTML change. Auto keeps notes with no markup as plain text.</span>
      </div>
    </div>
    <wa-stage class="wb-stage" aria-label="Workbench windows"></wa-stage>
    <section class="panel wb-tt" aria-label="Strict CSP and Trusted Types proof">
      <h3>Strict CSP and Trusted Types, with safe-fragment inside</h3>
      <p class="wb-why">A separate page (<code>workbench/tt.html</code>) with <code>require-trusted-types-for 'script'</code>, <code>trusted-types dompurify</code> and no inline script or style. safe-fragment renders hostile notes in it with zero violations; a raw <code>innerHTML</code> of the same string is refused, and that refusal is the one violation.</p>
      <div class="wb-tt-status" data-tt-status role="status">waiting for the frame…</div>
      <iframe class="wb-tt-frame" data-tt-frame title="Strict CSP frame: safe-fragment rendering untrusted notes under Trusted Types" src="${FRAME_URL}"></iframe>
    </section>
    <details class="panel wb-explain" open><summary>What's happening</summary><div class="wb-explain-body">${EXPLAIN}</div></details>`;
  host.append(root);

  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const stage = $<WindowAlgebraElement>('wa-stage');
  const pipeline = $('.wb-pipeline');
  const statusEl = $('.wb-status');
  const tabsEl = $('[data-tabs]');
  const historyEl = $('[data-history]');
  const floatEl = $('[data-floatbox]');
  const undoBtn = $<HTMLButtonElement>('[data-act="undo"]');
  const redoBtn = $<HTMLButtonElement>('[data-act="redo"]');
  const popBtn = $<HTMLButtonElement>('[data-act="popout"]');
  const frameEl = $<HTMLIFrameElement>('[data-tt-frame]');
  const ttEl = $('[data-tt-status]');

  type Wins = Record<string, any>;
  // --- the desk's initial state: restored or seeded on a throwaway manager, so the real manager's history starts clean at this state
  // (a load() or the first create()s would otherwise be steps that Undo could walk back through to an empty desk) ---
  const seed = createWindowManager({ state: createState({ layout: startLayout.spec as any, config: { gap: 8, inset: 8 } }) });
  const openOn = (m: WindowManager, id: ToolId) => {
    const win = (m.getState().windows as Wins)[id];
    if (win) { if (win.status === 'minimized') m.restore(id); m.focus(id); return; }
    const t = TOOLS[id];
    m.create({ id, title: TITLES[id], ...(t.floating ? { mode: 'floating', placement: t.floating(stage) } : {}) } as any);
  };
  const openIdsOn = (m: WindowManager) => TOOL_IDS.filter((id) => (m.getState().windows as Wins)[id]);
  const layoutOn = (m: WindowManager): LayoutId => {
    const s = m.getState() as any;
    return (s.workspaces[s.activeWorkspace]?.layout?.type ?? 'master-stack') as LayoutId;
  };
  // Restore the saved desk (load validates and migrates it; null means it was unusable), else open what the link asks for.
  const savedWm = store.read(WM_KEY);
  const restored = !!savedWm && !!seed.load(savedWm);
  for (const id of Object.keys(seed.getState().windows)) if (!(TOOL_IDS as string[]).includes(id)) seed.close(id); // windows an older version of this planet saved
  if (!restored) {
    for (const id of wanted) openOn(seed, id);
    seed.focus(wanted[0] ?? 'notes');
  } else {
    // A link that names a layout or windows wins over the saved desk (the saved one is otherwise what the URL already says).
    if (named && layoutOn(seed) !== startLayout.id) seed.setLayout(startLayout.spec as any);
    if (namedWindows) {
      for (const id of openIdsOn(seed)) if (!wanted.includes(id)) seed.close(id);
      for (const id of wanted) if (!openIdsOn(seed).includes(id)) openOn(seed, id);
    }
  }
  // --- the window manager: state is data; the stage renders it ---
  const wm: WindowManager = createWindowManager({ state: seed.getState(), history: 100 });
  const layoutNow = () => layoutOn(wm);
  const openTool = (id: ToolId) => openOn(wm, id);
  const closeTool = (id: ToolId) => { if ((wm.getState().windows as Wins)[id]) wm.close(id); };
  const openNow = () => openIdsOn(wm);
  store.write(WM_KEY, wm.serialize());
  const saveWm = () => store.write(WM_KEY, wm.serialize());

  const surfaces = new Map<string, ReturnType<typeof lazySurface>>();
  const surfaceFor = (id: string) => {
    const tool = TOOLS[id as ToolId];
    if (!tool || !(wm.getState().windows as Wins)[id]) return undefined;
    if (!surfaces.has(id)) surfaces.set(id, lazySurface((body) => tool.mount(body, ctx)));
    return surfaces.get(id);
  };

  defineWindowAlgebraElement(); // <wa-stage>
  stage.configure({
    wm,
    surfaceFor,
    // Title bar, buttons and resize grips: window-algebra's, themed by --wa-* tokens. "popout" adds the pop-out button (and attachPopouts).
    chrome: { buttons: ['minimize', 'maximize', 'float', 'popout', 'close'] },
    popouts: true,
    palette: { host: root, injectStyles: false }, // Ctrl/Cmd+Shift+P; mounted inside the room so it inherits the tokens
    // attachSync on a BroadcastChannel of this planet's own: the layout follows across tabs. onSync repaints the tab counter.
    sync: { channel: CHANNEL, onSync: () => showTabs(), onError: (e: Error) => console.warn('[workbench] sync', e) },
    // keyboard: Alt+Shift+Arrows move and Ctrl+Alt+Shift+Arrows resize the focused floating window; F6 cycles focus.
    input: { keyboard: true, announce: true, touch: { pinch: true, swipe: { tabs: true } } },
  } as any);

  // --- UI state ---
  let preset = String(init.p ?? '');
  const syncUrl = () => writeState({ l: layoutNow(), w: openNow().join(','), p: preset, pf: ctx.profile }, defaults);
  const poppedOut = () => TOOL_IDS.filter((id) => (wm.getState().windows as Wins)[id]?.status === 'popped-out');

  function refresh() {
    const layout = layoutNow();
    const open = openNow();
    const state = wm.getState() as any;
    for (const b of root.querySelectorAll<HTMLElement>('[data-layout]')) b.setAttribute('aria-pressed', String(b.dataset.layout === layout));
    for (const b of root.querySelectorAll<HTMLElement>('[data-open]')) b.setAttribute('aria-pressed', String(open.includes(b.dataset.open as ToolId)));
    for (const b of root.querySelectorAll<HTMLElement>('[data-profile]')) b.setAttribute('aria-pressed', String(b.dataset.profile === ctx.profile));
    const removed = sanitizeLog.length + [...ctx.rendered.values()].reduce((n, r) => n + (r.report ? removalsOf(r.report).length : 0), 0);
    pipeline.innerHTML = `
      <span class="wb-stage-chip"><b>window-algebra</b> ${open.length} windows · ${esc(layout)} · ${wm.log.length} history step${wm.log.length === 1 ? '' : 's'}</span><span class="wb-arrow">→</span>
      <span class="wb-stage-chip"><b>safe-fragment</b> ${esc(boot.engine)} engine · ${esc(ctx.profile)} · ${removed} removed · <span class="${executed() ? 'bad' : 'ok'}">${executed()} ran</span></span><span class="wb-arrow">→</span>
      <span class="wb-stage-chip"><b>html-modules</b> ${boot.components} components</span>`;
    // history
    undoBtn.disabled = !wm.canUndo;
    redoBtn.disabled = !wm.canRedo;
    historyEl.textContent = `${wm.log.length} step${wm.log.length === 1 ? '' : 's'}`;
    historyEl.dataset.steps = String(wm.log.length);
    // floating: the focused window's placement, which the arrow keys change
    const fid = state.focus.window as string | null;
    const win = fid ? state.windows[fid] : null;
    const pops = poppedOut();
    if (win && win.mode === 'floating') {
      const p = win.placement;
      floatEl.textContent = `${win.title}: x ${Math.round(p.x)} y ${Math.round(p.y)} · ${Math.round(p.width)}×${Math.round(p.height)}`;
      floatEl.dataset.float = `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.width)},${Math.round(p.height)}`;
    } else {
      floatEl.textContent = win ? `${win.title}: tiled (Float focused to move it by keyboard)` : pops.length ? `${pops.length} popped out` : 'no window focused';
      delete floatEl.dataset.float;
    }
    popBtn.textContent = pops.length ? 'Pop back in' : 'Pop out';
    popBtn.dataset.popped = String(pops.length);
  }
  const unsubscribe = wm.subscribe(() => { saveWm(); refresh(); syncUrl(); });
  sanitizeListeners.add(refresh);
  refresh();
  syncUrl();

  // --- the strict-CSP frame reports its counters by postMessage (same origin, one message shape) ---
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frameEl.contentWindow || event.origin !== location.origin) return;
    const d = event.data?.wbTT;
    if (!d || typeof d !== 'object') return;
    const sf = num(d.safeFragmentViolations), ctl = num(d.controlViolations), ran = num(d.ran);
    ttEl.dataset.sf = String(sf); ttEl.dataset.control = String(ctl); ttEl.dataset.blocked = String(!!d.controlBlocked); ttEl.dataset.ran = String(ran);
    ttEl.dataset.engine = String(d.engine ?? '');
    ttEl.className = `wb-tt-status ${sf === 0 && ran === 0 ? 'ok' : 'bad'}`;
    ttEl.textContent = `safe-fragment (${String(d.engine)}, ${String(d.profile)}): ${sf} violation${sf === 1 ? '' : 's'} · ${ran} handlers ran · raw innerHTML control: ${d.controlTried ? (d.controlBlocked ? `blocked, ${ctl} violation${ctl === 1 ? '' : 's'}` : 'NOT blocked') : 'not tried yet'}`;
  };
  addEventListener('message', onMessage);

  // --- presets and actions ---
  const say = (t: string) => { statusEl.textContent = t; };
  /** Back to the default desk and the seed notes, and forget what this planet saved. The cleared state is written straight back, so a reload shows the default desk. */
  function resetDesk() {
    preset = '';
    store.remove(DATA_KEY); store.remove(WM_KEY);
    for (const id of poppedOut()) stage.popouts?.popIn(id);
    for (const id of TOOL_IDS) closeTool(id);
    ctx.notes = SEED_NOTES(); ctx.selected = null; ctx.profile = 'auto'; ctx.rendered.clear(); (window as any)[NS] = [];
    saveNotes();
    wm.setLayout(LAYOUTS[0].spec as any);
    for (const id of ['notes', 'clips'] as ToolId[]) openTool(id);
    wm.focus('notes');
    ctx.emit();
    saveWm();
    say('desk reset: default windows, seed notes, saved state cleared');
  }
  function floatFocused() {
    const id = (wm.getState() as any).focus.window as string | null;
    if (!id) { say('focus a window first (click its title bar)'); return; }
    wm.toggleFloating(id);
    const mode = (wm.getState().windows as Wins)[id]?.mode;
    say(mode === 'floating' ? `${id} floats: Alt+Shift+Arrows move it, Ctrl+Alt+Shift+Arrows resize it` : `${id} is tiled again`);
    // The button took DOM focus; the arrow keys are handled inside the stage, so hand focus back to the window (now, and again once the commit has landed).
    if (mode === 'floating') {
      const back = () => { const v = stage.querySelector<HTMLElement>(`wm-view[data-view="${id}"]`); if (v && !v.contains(document.activeElement)) { if (!v.hasAttribute('tabindex')) v.setAttribute('tabindex', '-1'); v.focus({ preventScroll: true }); } };
      back(); later(back, 80); later(back, 300);
    }
  }
  function togglePop() {
    const out = poppedOut();
    if (out.length) { for (const id of out) stage.popouts?.popIn(id); say('popped back in'); return; }
    const id = (wm.getState() as any).focus.window as string | null;
    if (!id) { say('focus a window first (click its title bar)'); return; }
    if (!stage.popouts) { say('pop-outs are unavailable here'); return; }
    const result: any = stage.popouts.popOut(id);
    const rejected = (result?.events ?? []).find((e: any) => e.type === 'command/rejected');
    say(rejected ? (rejected.reason === 'popup-blocked' ? 'the browser blocked the pop-up: allow pop-ups for this site and try again' : `pop-out refused: ${rejected.reason}`) : `${id} is in its own browser window (Pop back in returns it)`);
  }
  async function applyPreset(name: string) {
    if (name === 'layout') {
      const i = LAYOUTS.findIndex((l) => l.id === layoutNow());
      const next = LAYOUTS[(i + 1) % LAYOUTS.length];
      wm.setLayout(next.spec as any);
      say(`layout → ${next.id} (the windows kept their state; Undo goes back)`);
    } else if (name === 'xss') {
      preset = 'xss';
      openTool('report'); openTool('notes');
      stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      await sleep(60);
      for (let i = 0; !ctx.paste && i < 40; i++) await sleep(50); // wait for the notes window to mount
      if (disposed) return;
      say('pasting the payload and pressing the real submit button…');
      if (!ctx.notes.some((n) => n.title === XSS_TITLE)) {
        if (ctx.paste) await ctx.paste(XSS_TITLE, XSS_PAYLOAD); else ctx.addNote(XSS_TITLE, XSS_PAYLOAD);
      }
      const note = ctx.notes.find((n) => n.title === XSS_TITLE);
      if (note) ctx.selected = note.id;
      ctx.emit();
      wm.focus('report');
      await sleep(600);
      if (disposed) return;
      say(executed() === 0 ? 'payload neutralised: 0 handlers ran. Open the report for what was removed.' : `WARNING: ${executed()} handler(s) ran`);
      ctx.emit();
      syncUrl();
    }
  }

  const onClick = async (e: Event) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-preset],[data-act],[data-layout],[data-open],[data-profile]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    try {
      if (t.dataset.preset) await applyPreset(t.dataset.preset);
      else if (t.dataset.layout) { const l = LAYOUTS.find((x) => x.id === t.dataset.layout)!; wm.setLayout(l.spec as any); }
      else if (t.dataset.profile) {
        ctx.profile = t.dataset.profile as ProfileChoice;
        say(ctx.profile === 'auto' ? 'profile: auto (per note)' : `every note now renders under ${ctx.profile}`);
        ctx.emit(); syncUrl();
      } else if (t.dataset.open) {
        const id = t.dataset.open as ToolId;
        if (openNow().includes(id)) closeTool(id); else openTool(id);
      } else if (t.dataset.act === 'palette') stage.palette?.open();
      else if (t.dataset.act === 'reset') resetDesk();
      else if (t.dataset.act === 'undo') { wm.undo(); say('undo'); }
      else if (t.dataset.act === 'redo') { wm.redo(); say('redo'); }
      else if (t.dataset.act === 'float') floatFocused();
      else if (t.dataset.act === 'popout') togglePop();
      else if (t.dataset.act === 'copy') { syncUrl(); await sleep(200); await copyLink(); say('link copied'); }
    } catch (err) { say(`error: ${(err as Error).message}`); console.error(err); }
  };
  // Only the room's own controls: window-algebra's views carry data-* attributes of their own (data-layout, ...).
  const controls = $('.wb-controls');
  controls.addEventListener('click', onClick);

  // --- cross-tab: notes arrive through the storage event (window state arrives through the stage's sync) ---
  const onStorage = (event: StorageEvent) => {
    if (event.key !== DATA_KEY || event.newValue == null) return;
    const next = readNotes(event.newValue);
    if (!next) return;
    ctx.notes = next;
    for (const id of [...ctx.rendered.keys()]) if (!next.some((n) => n.id === id)) ctx.rendered.delete(id);
    if (ctx.selected && !next.some((n) => n.id === ctx.selected)) ctx.selected = null;
    ctx.emit();
  };
  addEventListener('storage', onStorage);
  function showTabs() {
    if (disposed) return;
    const n = (stage.sync?.peers().length ?? 0) + 1;
    tabsEl.textContent = `${n} tab${n === 1 ? '' : 's'}`;
    tabsEl.dataset.tabs = String(n);
  }
  const tabsTimer = setInterval(showTabs, 600); // peers() also changes when a tab closes, which fires no onSync
  showTabs();
  if (preset === 'xss') later(() => void applyPreset('xss'), 0);

  return () => {
    disposed = true;
    for (const t of timers) clearTimeout(t);
    clearInterval(tabsTimer);
    removeEventListener('storage', onStorage);
    removeEventListener('message', onMessage);
    controls.removeEventListener('click', onClick);
    unsubscribe();
    sanitizeListeners.delete(refresh);
    ctx.onChange.clear();
    for (const id of poppedOut()) { try { stage.popouts?.popIn(id); } catch { /* the popup is closing anyway */ } }
    root.remove(); // disconnects <wa-stage>: its manager, renderer, input, palette, sync and pop-outs detach; the surfaces' cleanups run
    style.remove();
    delete (window as any)[NS];
  };
}

const playground: Playground = {
  id: 'workbench',
  title: 'Untrusted Desk',
  pkg: '@johnhenry/window-algebra',
  hue: 165,
  blurb: 'A tiling desk of notes you should not trust. window-algebra runs the windows (undo/redo, keyboard-movable floating windows, pop-out, saved layouts, two-tab sync); safe-fragment renders every note under a switchable profile, and a strict-CSP, Trusted Types frame proves it. Components are html-modules.',
  docs: 'https://opensource.johnhenry.me/workbench/',
  mount(host) {
    const shell = h('div', { class: 'pg-workbench wb-shell' });
    const content = h('div', { class: 'wb-content' });
    shell.append(content);
    host.append(shell);
    let gone = false;
    let teardown: (() => void) | undefined;
    const loading = h('div', { class: 'loading' }, 'defining the html-modules components…');
    content.append(loading);
    boot().then(
      (b) => {
        if (gone) return;
        loading.remove();
        try { teardown = mountDesk(content, b); } catch (e) {
          const pre = errBox(`Untrusted Desk failed to start:\n${String((e as Error)?.stack ?? e)}`);
          content.append(pre);
          teardown = () => pre.remove();
        }
      },
      (e) => {
        if (gone) return;
        loading.remove();
        content.append(errBox(`Untrusted Desk failed to start:\n${String((e as Error)?.stack ?? e)}`));
      },
    );
    return () => {
      gone = true;
      teardown?.();
      shell.remove();
    };
  },
};
export default playground;
