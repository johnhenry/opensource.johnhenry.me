import type { Playground } from '../registry';
import {
  textToDom, domToText, domToReact, reactToDom, textToReact, reactToText,
  createElement, createSVGElement, _,
  shadowOpen, shadowClosed, light,
  domToSource,
} from '@johnhenry/domable';
import type { ReactElementLike } from '@johnhenry/domable';
import { handoffButton } from '../bus';
import { readState, writeState, copyLink } from '../state';
import './domable.css';

// ---------------------------------------------------------------------------
// Types for the parts of the library this planet calls
// ---------------------------------------------------------------------------

type ReactNodeish = ReactElementLike | string | null;
/** `shadowOpen`/`shadowClosed`/`light`, keyed the same way the UI's <select> is. */
const CE_FACTORIES = { shadowOpen, shadowClosed, light } as const;

const REACT_ELEMENT = Symbol.for('react.element');
const REACT_FRAGMENT = Symbol.for('react.fragment');

type Fn = 'textToDom' | 'domToText' | 'domToReact' | 'reactToDom' | 'textToReact' | 'reactToText';
const FNS: Fn[] = ['textToDom', 'domToText', 'domToReact', 'reactToDom', 'textToReact', 'reactToText'];

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS: Record<string, string> = {
  card: `<style>
  .card { max-width: 320px; padding: 18px 20px; border-radius: 14px;
    background: linear-gradient(160deg, #10263a, #0a1422);
    border: 1px solid #1f4d63; color: #d9f3ff; font-family: system-ui, sans-serif; }
  .card h3 { margin: 0 0 6px; font-size: 18px; }
  .card p { margin: 0 0 14px; color: #8fb8cc; font-size: 14px; }
  .card .tag { font: 11px ui-monospace, monospace; padding: 2px 8px; border-radius: 99px;
    background: #0e3a4a; color: #6fe3ff; }
  .card button { margin-top: 12px; padding: 7px 14px; border-radius: 8px; border: 0;
    background: #19b4d8; color: #04151c; font-weight: 600; }
</style>
<article class="card" data-id="42">
  <span class="tag">component</span>
  <h3>Prism Card</h3>
  <p>One markup tree, three representations. Edit me anywhere.</p>
  <button type="button" onclick="alert('pwned')">Refract</button>
  <script>console.log('this never runs in the preview')</script>
</article>`,
  list: `<ul class="tree">
  <li>Text
    <ul>
      <li>textToDom</li>
      <li>textToReact</li>
    </ul>
  </li>
  <li>DOM
    <ul>
      <li>domToText</li>
      <li>domToReact <em>(class → className)</em></li>
    </ul>
  </li>
  <li>React-shaped
    <ol>
      <li>reactToDom</li>
      <li>reactToText</li>
    </ol>
  </li>
</ul>`,
  form: `<form class="signup" action="#" style="display:grid;gap:10px;max-width:300px;font-family:system-ui">
  <label>Email <input type="email" name="email" placeholder="you@example.com" required></label>
  <label>Plan
    <select name="plan">
      <option>Hobby</option>
      <option selected>Pro</option>
    </select>
  </label>
  <label><input type="checkbox" name="tos" checked> I accept</label>
  <textarea name="note" rows="2">Hello &amp; welcome</textarea>
  <button disabled>Sign up</button>
</form>`,
  svg: `<svg viewBox="0 0 64 64" width="120" height="120" fill="none" stroke-linejoin="round">
  <polygon points="32,6 58,52 6,52" stroke="#19b4d8" stroke-width="3"></polygon>
  <line x1="2" y1="34" x2="24" y2="30" stroke="#ffffff" stroke-width="2"></line>
  <line x1="40" y1="30" x2="62" y2="22" stroke="#ff5c7a" stroke-width="2"></line>
  <line x1="40" y1="32" x2="62" y2="32" stroke="#ffd166" stroke-width="2"></line>
  <line x1="40" y1="34" x2="62" y2="42" stroke="#6fe38f" stroke-width="2"></line>
</svg>`,
};
const PRESET_LABELS: Record<string, string> = { card: 'card component', list: 'nested list', form: 'form', svg: 'SVG icon' };

const DEFAULT_HS = `h('article', { class: ['card', 'glow'] },
  h('h3', {}, 'Built with createElement'),
  h('p', 'props are optional: a string here is the first child'),
  h('ul', {},
    ...['textToDom', 'domToReact', 'reactToDom'].map((fn, i) =>
      h('li', { 'data-step': String(i + 1) }, h('code', fn)))
  ),
  svg('svg', { viewBox: '0 0 24 24', width: '40', height: '40' },
    svg('circle', { cx: '12', cy: '12', r: '9', fill: 'none',
      stroke: '#19b4d8', 'stroke-width': '2' }),
    svg('path', { d: 'M8 12l3 3 5-6', stroke: '#6fe38f',
      'stroke-width': '2', fill: 'none' }))
)`;

const DEFAULT_CE = `<style>
  :host { display: block; font-family: system-ui, sans-serif; max-width: 340px; }
  .card { border: 1px solid #22415a; border-radius: 14px; padding: 16px 18px;
    background: linear-gradient(160deg, #0f2233, #091421); color: #dbeeff;
    transition: border-color .3s, box-shadow .3s, padding .3s; }
  :host([tone="warn"]) .card { border-color: #f5a524; box-shadow: 0 0 28px #f5a52440; }
  :host([tone="ok"])   .card { border-color: #3ddc97; box-shadow: 0 0 28px #3ddc9740; }
  :host([tone="info"]) .card { border-color: #19b4d8; box-shadow: 0 0 28px #19b4d840; }
  :host([compact]) .card { padding: 6px 10px; font-size: 13px; }
  h4 { margin: 0 0 6px; font-size: 17px; }
  .muted { color: #8aa6bd; font-size: 14px; }
</style>
<div class="card" part="card">
  <h4><slot name="title">Untitled card</slot></h4>
  <div class="muted"><slot>No body content yet.</slot></div>
</div>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** JSON view of a React-shaped tree. Symbols become "Symbol(react.x)" strings. */
function reactToJSON(node: ReactNodeish, full: boolean, hideWs: boolean): unknown {
  if (node === null || typeof node === 'string') return node;
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node.props ?? {})) {
    if (k === 'children') continue;
    props[k] = v;
  }
  const kids = Array.isArray(node.props?.children) ? (node.props!.children as ReactNodeish[]) : node.props?.children !== undefined ? [node.props!.children as ReactNodeish] : [];
  props.children = kids
    .filter((c) => !(hideWs && typeof c === 'string' && c.trim() === ''))
    .map((c) => reactToJSON(c, full, hideWs));
  const type = typeof node.type === 'symbol' ? `Symbol(${Symbol.keyFor(node.type) ?? 'unknown'})` : node.type;
  if (!full) return { type, props };
  return {
    $$typeof: node.$$typeof ? `Symbol(${Symbol.keyFor(node.$$typeof)})` : undefined,
    type,
    key: node.key ?? null,
    ref: node.ref ?? null,
    props,
    _owner: null,
    _store: {},
  };
}

/** Revive JSON back into the real React element shape (real Symbols). */
function jsonToReact(v: unknown): ReactNodeish {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    return { $$typeof: REACT_ELEMENT, type: REACT_FRAGMENT, key: null, ref: null, props: { children: v.map(jsonToReact) }, _owner: null, _store: {} };
  }
  const o = v as Record<string, unknown>;
  let type: string | symbol = REACT_FRAGMENT;
  if (typeof o.type === 'string') {
    const m = o.type.match(/^Symbol\((.+)\)$/);
    type = m ? Symbol.for(m[1]) : o.type;
  }
  const rawProps = (o.props && typeof o.props === 'object' ? o.props : {}) as Record<string, unknown>;
  const props: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(rawProps)) {
    if (k === 'children') continue;
    props[k] = typeof val === 'string' ? val : JSON.stringify(val);
  }
  const ch = rawProps.children;
  props.children = ch === undefined ? [] : (Array.isArray(ch) ? ch : [ch]).map(jsonToReact);
  return { $$typeof: REACT_ELEMENT, type, key: null, ref: null, props, _owner: null, _store: {} };
}

/** Strip anything executable before a tree reaches the live preview. */
function sanitize(root: Node): { scripts: number; handlers: number } {
  let scripts = 0;
  let handlers = 0;
  const kill = 'script,iframe,object,embed,base,meta,link[rel~="import"]';
  if (root instanceof Element || root instanceof DocumentFragment) {
    root.querySelectorAll(kill).forEach((n) => { n.remove(); scripts++; });
    const all = root instanceof Element ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
    for (const el of all) {
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on') || (/(href|src|action|formaction)$/.test(n) && /^\s*javascript:/i.test(a.value))) {
          el.removeAttribute(a.name);
          handlers++;
        }
      }
    }
  }
  return { scripts, handlers };
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return `string(${v.length})`;
  if (v instanceof DocumentFragment) return `DocumentFragment[${v.childNodes.length}]`;
  if (v instanceof Element) return `<${v.localName}> ${v.constructor.name}`;
  if (v instanceof Node) return v.constructor.name;
  if (typeof v === 'object') {
    const t = (v as ReactElementLike).type;
    return `{type: ${typeof t === 'symbol' ? 'Fragment' : JSON.stringify(t)}}`;
  }
  return typeof v;
}

// ---- token diff (LCS) for the round-trip check ----
function tokenize(s: string): string[] {
  const out: string[] = [];
  const re = /<[^>]*>|[^<\s]+|\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[0]);
  return out;
}
type DiffOp = { t: '=' | '-' | '+'; s: string };
function diffTokens(a: string[], b: string[]): DiffOp[] | null {
  const n = a.length, m = b.length;
  if (n * m > 1_500_000) return null;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: '=', s: a[i] }); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) ops.push({ t: '-', s: a[i++] });
    else ops.push({ t: '+', s: b[j++] });
  }
  while (i < n) ops.push({ t: '-', s: a[i++] });
  while (j < m) ops.push({ t: '+', s: b[j++] });
  return ops;
}

// ---------------------------------------------------------------------------
// Planet
// ---------------------------------------------------------------------------

const playground: Playground = {
  id: 'domable',
  title: 'Domable Prism',
  pkg: '@johnhenry/domable',
  hue: 190,
  blurb: 'HTML text, live DOM nodes and React-shaped objects, converted every direction, plus hyperscript and custom elements.',
  docs: 'https://opensource.johnhenry.me/domable/',
  mount(host) {
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
      return id;
    };
    const offs: Array<() => void> = [];
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, ev: K | string, fn: (e: Event) => void) => {
      el.addEventListener(ev, fn);
      offs.push(() => el.removeEventListener(ev, fn));
    };

    const root = document.createElement('div');
    root.className = 'pg-domable';
    root.innerHTML = `
      <section class="panel intro">
        <div class="intro-row">
          <div class="presets"><span class="stat">preset</span>
            ${Object.keys(PRESETS).map((k) => `<button class="btn preset" data-preset="${k}">${PRESET_LABELS[k]}</button>`).join('')}
          </div>
          <div class="toggles">
            <label><input type="checkbox" data-opt="ws" checked> hide whitespace-only text</label>
            <label><input type="checkbox" data-opt="full"> full React shape</label>
          </div>
          <div class="linklet">
            <button class="btn" data-el="copy-link" type="button">Copy link</button>
            <span class="stat" data-el="link-note"></span>
          </div>
        </div>
        <p class="explain">Three panes, one tree. Type HTML on the left, edit the React-shaped JSON on the right, or click into the
        rendered DOM below and type straight into it. Every edit is routed through the real <code>@johnhenry/domable</code> calls,
        and the arrow for each call lights up as it runs.</p>
      </section>

      <section class="prism" data-el="prism">
        <svg class="edges" data-el="edges" aria-hidden="true"></svg>
        <div class="pane pane-html panel" data-pane="html">
          <header><span class="dot"></span>HTML text <span class="stat" data-el="html-stat"></span></header>
          <textarea class="code" data-el="html" spellcheck="false"></textarea>
        </div>
        <div class="pane pane-obj panel" data-pane="obj">
          <header><span class="dot"></span>React-shaped object <span class="stat" data-el="obj-stat"></span></header>
          <textarea class="code" data-el="obj" spellcheck="false"></textarea>
        </div>
        <div class="pane pane-dom panel" data-pane="dom">
          <header><span class="dot"></span>Live DOM <span class="stat">contenteditable, scripts &amp; handlers stripped</span> <span class="stat" data-el="dom-stat"></span></header>
          <div class="preview" data-el="preview"></div>
        </div>
      </section>

      <section class="panel trace">
        <div class="rail" data-el="rail">${FNS.map((f) => `<span class="chip fn" data-fn="${f}">${f}()</span>`).join('')}</div>
        <ol class="log" data-el="log"></ol>
        <div class="warn" data-el="warn" hidden></div>
      </section>

      <section class="panel fidelity">
        <header class="sec-h"><h2>Round-trip fidelity</h2>
          <span class="stat">reactToText(textToReact(html)) vs. the HTML pane</span>
          <span class="verdict" data-el="verdict"></span></header>
        <pre class="code diff" data-el="diff"></pre>
      </section>

      <section class="panel scaffold">
        <header class="sec-h"><h2>Scaffold as files</h2>
          <span class="stat">index.html + components/&lt;name&gt;.js + styles.css, generated from the tree above</span></header>
        <div class="tabs" data-el="scaffold-tabs">
          <button class="tab on" data-scaffold="index.html">index.html</button>
          <button class="tab" data-scaffold="component">components/*.js</button>
          <button class="tab" data-scaffold="styles.css">styles.css</button>
        </div>
        <pre class="code" data-el="scaffold-out"></pre>
        <div class="scaffold-actions" data-el="scaffold-actions"></div>
      </section>

      <section class="panel hs">
        <header class="sec-h"><h2>Hyperscript playground</h2>
          <span class="stat">in scope: <code>h</code> = createElement, <code>svg</code> = createSVGElement, <code>_</code> = fragment</span></header>
        <div class="hs-grid">
          <textarea class="code" data-el="hs-code" spellcheck="false"></textarea>
          <div class="hs-out">
            <div class="preview small" data-el="hs-preview"></div>
            <div class="tabs"><button class="tab on" data-hs="html">domToText</button><button class="tab" data-hs="src">domToSource</button></div>
            <pre class="code" data-el="hs-text"></pre>
          </div>
        </div>
      </section>

      <section class="panel ce">
        <header class="sec-h"><h2>HTML → Custom Element</h2>
          <span class="stat">simple-element builds the class; <code>customElements.define</code> registers it</span></header>
        <div class="ce-grid">
          <div class="ce-left">
            <textarea class="code" data-el="ce-html" spellcheck="false"></textarea>
            <div class="ce-controls">
              <label class="field">factory
                <select data-el="ce-mode"><option value="shadowOpen">shadowOpen</option><option value="shadowClosed">shadowClosed</option><option value="light">light</option></select>
              </label>
              <label class="field">base name <input data-el="ce-name" value="my-card"></label>
              <button class="btn primary" data-el="ce-define">define as &lt;my-card&gt;</button>
            </div>
            <pre class="code ce-code" data-el="ce-code"></pre>
          </div>
          <div class="ce-right">
            <div class="ce-stage" data-el="ce-stage"><div class="stat">Nothing defined yet.</div></div>
            <div class="ce-attrs" data-el="ce-attrs"></div>
            <button class="btn" data-el="ce-add">+ attribute</button>
            <label class="field">light-DOM children (slotted)
              <input data-el="ce-slot" value='<span slot="title">Refracted</span>Attributes restyle me through :host([...]).'>
            </label>
            <div class="stat">domToText(instance), shadow roots serialized as declarative shadow DOM:</div>
            <pre class="code" data-el="ce-ser"></pre>
          </div>
        </div>
      </section>
    `;
    host.appendChild(root);

    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(`[data-el="${sel}"]`) as T;
    const htmlTa = $<HTMLTextAreaElement>('html');
    const objTa = $<HTMLTextAreaElement>('obj');
    const preview = $('preview');
    const prism = $('prism');
    const edges = $<SVGSVGElement>('edges');
    const log = $('log');
    const warnBox = $('warn');
    const opts = { ws: true, full: false };

    // --- deep-linkable state: preset, active pane, and (capped) custom HTML ---
    const SIZE_CAP = 3000; // "a few KB" of hash budget for a custom HTML edit
    const STATE_DEFAULTS = { preset: 'card', pane: 'html', html: '' };
    const initialState = readState<{ preset: string; pane: string; html: string }>(STATE_DEFAULTS);
    const initPreset = PRESETS[initialState.preset] !== undefined ? initialState.preset : 'card';
    const initPane: 'html' | 'obj' | 'dom' = ['html', 'obj', 'dom'].includes(initialState.pane) ? (initialState.pane as 'html' | 'obj' | 'dom') : 'html';
    let activePane: 'html' | 'obj' | 'dom' = initPane;

    function currentSlug(): string {
      return root.querySelector<HTMLElement>('.preset.on')?.dataset.preset ?? 'custom';
    }
    function setActivePane(p: 'html' | 'obj' | 'dom', doPersist = true) {
      activePane = p;
      root.querySelectorAll('.pane').forEach((el) => el.classList.toggle('active-pane', (el as HTMLElement).dataset.pane === p));
      if (doPersist) persist();
    }
    function persist() {
      const key = currentSlug();
      const canonical = PRESETS[key];
      const edited = canonical === undefined || htmlTa.value !== canonical;
      const note = $('link-note');
      if (edited && htmlTa.value.length > SIZE_CAP) {
        note.textContent = `Edit is ${htmlTa.value.length.toLocaleString()} chars — too large for the link; the shareable link falls back to the "${key}" preset.`;
        writeState({ preset: key, pane: activePane, html: '' }, STATE_DEFAULTS);
      } else {
        note.textContent = '';
        writeState({ preset: key, pane: activePane, html: edited ? htmlTa.value : '' }, STATE_DEFAULTS);
      }
    }

    // --- preview lives in a shadow root so preset <style> can't leak into the site ---
    const shadow = preview.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host { display: block; }
      .stage { min-height: 120px; padding: 14px; color: #dfe9f5; font-family: system-ui, sans-serif; outline: none;
        background-image: radial-gradient(circle at 1px 1px, #ffffff10 1px, transparent 0); background-size: 16px 16px; border-radius: 8px; }
      .stage:focus { box-shadow: inset 0 0 0 1px #19b4d880; }
      a { color: #6fe3ff; }
    </style><div class="stage" contenteditable="true" spellcheck="false"></div>`;
    const stage = shadow.querySelector('.stage') as HTMLDivElement;
    on(shadow, 'submit', (e) => e.preventDefault());
    on(stage, 'focus', () => setActivePane('dom'));

    // ------------------------------------------------------------------ edges
    const LABEL: Record<Fn, string> = {
      textToDom: 'textToDom()', domToText: 'domToText()', domToReact: 'domToReact()',
      reactToDom: 'reactToDom()', textToReact: 'textToReact()', reactToText: 'reactToText()',
    };
    function drawEdges() {
      const cr = prism.getBoundingClientRect();
      const r = (sel: string) => {
        const b = prism.querySelector(sel)!.getBoundingClientRect();
        return { l: b.left - cr.left, t: b.top - cr.top, r: b.right - cr.left, b: b.bottom - cr.top, w: b.width, h: b.height };
      };
      const A = r('.pane-html'), B = r('.pane-obj'), C = r('.pane-dom');
      edges.setAttribute('viewBox', `0 0 ${cr.width} ${cr.height}`);
      if (C.t < A.b + 10) { edges.innerHTML = ''; return; } // stacked (mobile) layout
      const yAB = A.t + Math.min(A.h * 0.45, 140);
      const pairs: Array<[number, number, number, number, Fn, Fn]> = [
        [A.r, yAB, B.l, yAB, 'textToReact', 'reactToText'],
        [A.l + A.w * 0.55, A.b, C.l + C.w * 0.18, C.t, 'textToDom', 'domToText'],
        [C.r - C.w * 0.18, C.t, B.l + B.w * 0.45, B.b, 'domToReact', 'reactToDom'],
      ];
      let svg = `<defs>
        <marker id="dm-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="mk"/></marker>
        <marker id="dm-head-lit" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="mk lit"/></marker>
      </defs>`;
      for (const [x1, y1, x2, y2, fwd, back] of pairs) {
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
        const off = 7, pad = 8;
        const seg = (s: number, from: [number, number], to: [number, number], fn: Fn) => {
          const sx = from[0] + nx * off * s, sy = from[1] + ny * off * s;
          const ex = to[0] + nx * off * s, ey = to[1] + ny * off * s;
          const ddx = ex - sx, ddy = ey - sy, dl = Math.hypot(ddx, ddy) || 1;
          const px = ddx / dl, py = ddy / dl;
          const X1 = sx + px * pad, Y1 = sy + py * pad, X2 = ex - px * pad, Y2 = ey - py * pad;
          const mx = (X1 + X2) / 2 + nx * 20 * s, my = (Y1 + Y2) / 2 + ny * 20 * s;
          const lx = nx * s;
          const anchor = Math.abs(lx) > 0.5 ? (lx > 0 ? 'start' : 'end') : 'middle';
          const lyOff = Math.abs(lx) > 0.5 ? 4 : ny * s > 0 ? 10 : -2;
          return `<g class="arrow" data-fn="${fn}">
            <path d="M${X1.toFixed(1)} ${Y1.toFixed(1)}L${X2.toFixed(1)} ${Y2.toFixed(1)}"/>
            <text x="${(mx + (anchor === 'middle' ? 0 : lx * 2)).toFixed(1)}" y="${(my + lyOff).toFixed(1)}" text-anchor="${anchor}">${LABEL[fn]}</text>
          </g>`;
        };
        svg += seg(1, [x1, y1], [x2, y2], fwd);
        svg += seg(-1, [x2, y2], [x1, y1], back);
      }
      edges.innerHTML = svg;
      // restore lit state across redraws
      for (const [f, k] of litNow) edges.querySelector(`.arrow[data-fn="${f}"]`)?.classList.add('lit', ...(k === 'check' ? ['check'] : []));
    }
    const litNow = new Map<Fn, 'main' | 'check'>();
    const litTimers = new Map<Fn, number>();
    function fire(fn: Fn, kind: 'main' | 'check' = 'main') {
      const els = [
        edges.querySelector(`.arrow[data-fn="${fn}"]`),
        root.querySelector(`.rail .fn[data-fn="${fn}"]`),
      ].filter(Boolean) as Element[];
      for (const el of els) {
        el.classList.remove('lit', 'check');
        void (el as HTMLElement).getBoundingClientRect();
        el.classList.add('lit');
        if (kind === 'check') el.classList.add('check');
      }
      litNow.set(fn, kind);
      const prev = litTimers.get(fn);
      if (prev) { clearTimeout(prev); timers.delete(prev); }
      litTimers.set(fn, later(() => {
        litNow.delete(fn);
        for (const el of els) el.classList.remove('lit', 'check');
      }, 1700));
    }
    const ro = new ResizeObserver(() => drawEdges());
    ro.observe(prism);
    offs.push(() => ro.disconnect());

    // ------------------------------------------------------------------ call log
    type Step = { fn: Fn; arg: string; out: string; ms: number; note?: string };
    function call<T>(steps: Step[], fn: Fn, arg: string, run: () => T, delay: number, kind: 'main' | 'check' = 'main'): T {
      const t0 = performance.now();
      const out = run();
      steps.push({ fn, arg, out: describe(out), ms: performance.now() - t0 });
      later(() => fire(fn, kind), delay);
      return out;
    }
    function showLog(title: string, steps: Step[]) {
      log.innerHTML = `<li class="lt">${esc(title)}</li>` + steps.map((s) =>
        `<li><code><b>${s.fn}</b>(${esc(s.arg)})</code> <span class="arrow-t">→</span> <code>${esc(s.out)}</code> <span class="stat">${s.ms.toFixed(2)} ms</span>${s.note ? ` <span class="stat">${esc(s.note)}</span>` : ''}</li>`).join('');
    }

    // ------------------------------------------------------------------ renderers
    let current: ReactNodeish = null;
    function renderJSON() {
      objTa.value = JSON.stringify(reactToJSON(current, opts.full, opts.ws), null, 2);
      $('obj-stat').textContent = `${objTa.value.length} chars`;
    }
    function mountPreview(node: Node) {
      const clean = sanitize(node);
      stage.replaceChildren(node);
      const parts = [`${stage.querySelectorAll('*').length} elements`];
      if (clean.scripts) parts.push(`${clean.scripts} script(s) removed`);
      if (clean.handlers) parts.push(`${clean.handlers} handler(s) removed`);
      $('dom-stat').textContent = parts.join(' · ');
    }
    function setWarn(msg: string | null, isError = false) {
      warnBox.hidden = !msg;
      warnBox.classList.toggle('err', isError);
      warnBox.textContent = msg ?? '';
    }

    function fromHTML() {
      const html = htmlTa.value;
      $('html-stat').textContent = `${html.length} chars`;
      try {
        const steps: Step[] = [];
        const frag = call(steps, 'textToDom', 'html', () => textToDom(html), 0);
        current = call(steps, 'domToReact', 'fragment', () => domToReact(frag), 260);
        renderJSON();
        mountPreview(frag);
        showLog('edit in HTML pane: HTML → DOM → object', steps);
        setWarn(null);
      } catch (err) {
        setWarn(String((err as Error)?.stack ?? err), true);
      }
      fidelity();
      syncDerived();
    }

    function fromObject() {
      let parsed: unknown;
      try { parsed = JSON.parse(objTa.value); } catch (err) {
        setWarn(`JSON: ${(err as Error).message}`, true);
        return;
      }
      try {
        const steps: Step[] = [];
        const obj = jsonToReact(parsed);
        current = obj;
        // Fixed in domable 0.0.1 (was: reactToDom() built every element via
        // createElement() in the XHTML namespace, so an <svg> subtree came back
        // as HTMLUnknownElement and wouldn't paint; this planet used to re-hydrate
        // the preview through textToDom(domToText(dom)) to work around it).
        // reactToDom() now threads the SVG/MathML namespace through its own
        // recursion, so the DOM it returns paints directly.
        const dom = call(steps, 'reactToDom', 'object', () => reactToDom(obj as ReactElementLike | null), 0);
        const html = call(steps, 'domToText', 'dom', () => domToText(dom), 260);
        htmlTa.value = html;
        $('html-stat').textContent = `${html.length} chars`;
        mountPreview(dom);
        setWarn(null);
        showLog('edit in object pane: object → DOM → HTML', steps);
      } catch (err) {
        setWarn(String((err as Error)?.stack ?? err), true);
      }
      fidelity();
      syncDerived();
    }

    function fromDOM() {
      try {
        const steps: Step[] = [];
        const frag = document.createDocumentFragment();
        frag.append(...[...stage.childNodes].map((n) => n.cloneNode(true)));
        const html = call(steps, 'domToText', 'stage', () => domToText(frag), 0);
        current = call(steps, 'domToReact', 'stage', () => domToReact(frag), 120);
        htmlTa.value = html;
        $('html-stat').textContent = `${html.length} chars`;
        renderJSON();
        showLog('edit in live DOM: DOM → HTML and DOM → object', steps);
        setWarn(null);
      } catch (err) {
        setWarn(String((err as Error)?.stack ?? err), true);
      }
      fidelity();
      syncDerived();
    }

    // ------------------------------------------------------------------ fidelity
    function fidelity() {
      const src = htmlTa.value;
      const verdict = $('verdict');
      const out = $('diff');
      try {
        const obj = textToReact(src);
        // A bare top-level string (plain-text-only source) isn't really a
        // ReactElementLike, but reactToDom/reactToText treat a non-object
        // argument the same as an empty fragment (matching real React's own
        // "children must be wrapped" contract) -- passed through as-is here.
        const back = reactToText(obj as ReactElementLike | null);
        later(() => fire('textToReact', 'check'), 700);
        later(() => fire('reactToText', 'check'), 900);
        const ops = diffTokens(tokenize(src), tokenize(back));
        if (src === back) {
          verdict.className = 'verdict ok';
          verdict.textContent = 'byte-identical';
          out.innerHTML = `<span class="same">${esc(back)}</span>`;
          return;
        }
        if (!ops) {
          verdict.className = 'verdict bad';
          verdict.textContent = 'differs (too large to diff)';
          out.textContent = back;
          return;
        }
        const changed = ops.filter((o) => o.t !== '=');
        const onlyWs = changed.every((o) => o.s.trim() === '');
        verdict.className = `verdict ${onlyWs ? 'ok' : 'bad'}`;
        verdict.textContent = onlyWs ? 'equal modulo whitespace' : `${changed.filter((o) => o.t === '-').length} removed · ${changed.filter((o) => o.t === '+').length} added tokens`;
        out.innerHTML = ops.map((o) => o.t === '=' ? `<span class="same">${esc(o.s)}</span>` : `<span class="${o.t === '-' ? 'del' : 'ins'}">${esc(o.s)}</span>`).join('');
      } catch (err) {
        verdict.className = 'verdict bad';
        verdict.textContent = 'error';
        out.textContent = String((err as Error)?.message ?? err);
      }
    }

    // ------------------------------------------------------------------ scaffold-as-files preview + handoff
    let scaffoldTab: 'index.html' | 'component' | 'styles.css' = 'index.html';
    let scaffoldFiles = { indexHtml: '', componentJs: '', stylesCss: '', name: 'card' };
    function buildScaffold() {
      const name = currentSlug();
      const compName = (name.charAt(0).toUpperCase() + name.slice(1)).replace(/[^A-Za-z0-9]/g, '') || 'Component';
      const source = htmlTa.value;
      const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      const cssParts: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = styleRe.exec(source))) cssParts.push(m[1].trim());
      const bodyHtml = source.replace(styleRe, '').trim();
      let hsSrc: string;
      try {
        const frag = textToDom(bodyHtml || '<div></div>');
        hsSrc = domToSource(frag, { indent: '  ', fn: 'h' });
      } catch (err) {
        hsSrc = `/* domToSource failed: ${(err as Error)?.message ?? err} */\nh('div')`;
      }
      const stylesCss = cssParts.length ? cssParts.join('\n\n') + '\n' : '/* no <style> blocks found in this markup */\n';
      const componentJs = `import { createElement as h } from '@johnhenry/domable';\n\nexport default function ${compName}() {\n  return ${hsSrc};\n}\n`;
      const indexHtml = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${esc(compName)}</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n${bodyHtml}\n  <script type="module" src="components/${name}.js"></script>\n</body>\n</html>\n`;
      scaffoldFiles = { indexHtml, componentJs, stylesCss, name };
    }
    function renderScaffold() {
      buildScaffold();
      const out = $('scaffold-out');
      out.textContent = scaffoldTab === 'index.html' ? scaffoldFiles.indexHtml
        : scaffoldTab === 'component' ? scaffoldFiles.componentJs
        : scaffoldFiles.stylesCss;
    }
    function syncDerived() {
      persist();
      renderScaffold();
    }

    // ------------------------------------------------------------------ wiring
    let htmlDeb = 0, objDeb = 0, domDeb = 0;
    const debounce = (id: number, fn: () => void, ms: number) => { if (id) { clearTimeout(id); timers.delete(id); } return later(fn, ms); };
    on(htmlTa, 'input', () => { htmlDeb = debounce(htmlDeb, fromHTML, 160); });
    on(objTa, 'input', () => { objDeb = debounce(objDeb, fromObject, 320); });
    on(stage, 'input', () => { domDeb = debounce(domDeb, fromDOM, 160); });
    on(htmlTa, 'focus', () => setActivePane('html'));
    on(objTa, 'focus', () => setActivePane('obj'));
    root.querySelectorAll<HTMLButtonElement>('.preset').forEach((b) => on(b, 'click', () => {
      root.querySelectorAll('.preset').forEach((x) => x.classList.toggle('on', x === b));
      htmlTa.value = PRESETS[b.dataset.preset!];
      fromHTML();
    }));
    root.querySelectorAll<HTMLInputElement>('[data-opt]').forEach((cb) => on(cb, 'change', () => {
      opts[cb.dataset.opt as 'ws' | 'full'] = cb.checked;
      renderJSON();
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-scaffold]').forEach((b) => on(b, 'click', () => {
      scaffoldTab = b.dataset.scaffold as typeof scaffoldTab;
      root.querySelectorAll('[data-scaffold]').forEach((x) => x.classList.toggle('on', x === b));
      renderScaffold();
    }));
    const scaffoldBtn = handoffButton({
      from: 'domable',
      to: 'studio',
      kind: 'react-tree',
      label: 'Scaffold as files',
      getPayload: () => ({ tree: reactToJSON(current, opts.full, opts.ws), name: currentSlug(), html: htmlTa.value }),
    });
    $('scaffold-actions').appendChild(scaffoldBtn);
    const copyLinkBtn = $<HTMLButtonElement>('copy-link');
    on(copyLinkBtn, 'click', () => {
      const original = copyLinkBtn.textContent;
      void copyLink().then(() => {
        copyLinkBtn.textContent = 'Copied!';
        later(() => { copyLinkBtn.textContent = original; }, 1200);
      });
    });

    // ------------------------------------------------------------------ hyperscript
    const hsTa = $<HTMLTextAreaElement>('hs-code');
    const hsPrev = $('hs-preview');
    const hsText = $('hs-text');
    const hsShadow = hsPrev.attachShadow({ mode: 'open' });
    hsShadow.innerHTML = `<style>
      :host { display:block; }
      .stage { padding: 14px; color:#dfe9f5; font-family: system-ui, sans-serif; min-height: 90px; }
      .card { border:1px solid #1f4d63; border-radius:12px; padding:12px 16px; background:#0c1b29; }
      .glow { box-shadow: 0 0 30px #19b4d830; }
      h3 { margin:0 0 4px; } code { color:#6fe3ff; } li[data-step]::marker { color:#19b4d8; }
    </style><div class="stage"></div>`;
    const hsStage = hsShadow.querySelector('.stage') as HTMLDivElement;
    let hsMode: 'html' | 'src' = 'html';
    let hsNode: Node | null = null;
    function renderHsText() {
      if (!hsNode) return;
      hsText.textContent = hsMode === 'html'
        ? domToText(hsNode)
        : domToSource(hsNode, { indent: '  ', fn: 'h' });
    }
    function runHs() {
      const code = hsTa.value;
      try {
        let factory: (...a: unknown[]) => unknown;
        try { factory = new Function('h', 'svg', '_', `"use strict"; return (${code}\n);`) as typeof factory; }
        catch { factory = new Function('h', 'svg', '_', `"use strict";\n${code}`) as typeof factory; }
        const res = factory(createElement, createSVGElement, _);
        if (!(res instanceof Node)) throw new Error(`Expected a Node, got ${res === undefined ? 'undefined (use return … for statement bodies)' : typeof res}`);
        hsNode = res;
        const shown = res.cloneNode(true);
        sanitize(shown);
        hsStage.replaceChildren(shown);
        hsTa.classList.remove('bad');
        renderHsText();
      } catch (err) {
        hsTa.classList.add('bad');
        hsText.textContent = `⚠ ${(err as Error)?.message ?? err}`;
      }
    }
    let hsDeb = 0;
    on(hsTa, 'input', () => { hsDeb = debounce(hsDeb, runHs, 220); });
    root.querySelectorAll<HTMLButtonElement>('[data-hs]').forEach((b) => on(b, 'click', () => {
      hsMode = b.dataset.hs as 'html' | 'src';
      root.querySelectorAll('[data-hs]').forEach((x) => x.classList.toggle('on', x === b));
      renderHsText();
    }));

    // ------------------------------------------------------------------ custom element
    const ceHtml = $<HTMLTextAreaElement>('ce-html');
    const ceMode = $<HTMLSelectElement>('ce-mode');
    const ceName = $<HTMLInputElement>('ce-name');
    const ceDefine = $<HTMLButtonElement>('ce-define');
    const ceStage = $('ce-stage');
    const ceAttrs = $('ce-attrs');
    const ceSlot = $<HTMLInputElement>('ce-slot');
    const ceSer = $('ce-ser');
    const ceCode = $('ce-code');
    let attrs: Array<[string, string]> = [['tone', 'warn'], ['compact', '']];
    let defined: string | null = null;
    let instance: HTMLElement | null = null;
    let defineCount = 0;
    // The instance lives inside its own shadow root so a `light` element's <style> can't
    // leak into the rest of the site.
    const ceHost = document.createElement('div');
    ceHost.className = 'ce-host';
    const ceShadow = ceHost.attachShadow({ mode: 'open' });

    const baseName = () => {
      const raw = ceName.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'my-card';
      return /^[a-z][a-z0-9]*-/.test(raw) ? raw : `x-${raw}`;
    };
    const syncDefineLabel = () => { ceDefine.textContent = `define as <${baseName()}>`; };
    function serializeInstance() {
      if (!instance) { ceSer.textContent = ''; return; }
      // Fixed in domable 0.0.1 (was: an open shadow root was silently dropped --
      // native getHTML({serializableShadowRoots}) only counts roots created with
      // {serializable: true}, and simple-element's attachShadow() didn't pass that,
      // so this planet used to re-append domToText(instance.shadowRoot) by hand).
      // shadowOpen now attaches with {serializable: true}, and domToText()'s manual
      // fallback walks element.shadowRoot directly regardless -- an open shadow root's
      // Declarative Shadow DOM <template shadowrootmode="open"> comes through on its own.
      let text = domToText(instance);
      if (!instance.shadowRoot && ceMode.value === 'shadowClosed') {
        text += '\n\n/* closed shadow root: invisible to every serializer, by design */';
      }
      ceSer.textContent = text;
    }
    function applyAttrs() {
      if (!instance) return;
      for (const a of [...instance.attributes]) instance.removeAttribute(a.name);
      for (const [k, v] of attrs) {
        if (!k) continue;
        try { instance.setAttribute(k, v); } catch { /* invalid attribute name while typing */ }
      }
      serializeInstance();
    }
    function renderAttrRows() {
      ceAttrs.innerHTML = attrs.map(([k, v], i) => `<div class="attr-row" data-i="${i}">
        <input class="k" value="${esc(k)}" placeholder="name"><span>=</span>
        <input class="v" value="${esc(v)}" placeholder="(empty)">
        ${k === 'tone' ? `<span class="swatches">${['warn', 'ok', 'info', ''].map((t) => `<button class="sw" data-tone="${t}">${t || 'none'}</button>`).join('')}</span>` : ''}
        <button class="x" title="remove">×</button></div>`).join('');
    }
    on(ceAttrs, 'input', (e) => {
      const row = (e.target as HTMLElement).closest('.attr-row') as HTMLElement | null;
      if (!row) return;
      const i = Number(row.dataset.i);
      attrs[i] = [(row.querySelector('.k') as HTMLInputElement).value.trim(), (row.querySelector('.v') as HTMLInputElement).value];
      applyAttrs();
    });
    on(ceAttrs, 'click', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest('.attr-row') as HTMLElement | null;
      if (!row) return;
      const i = Number(row.dataset.i);
      if (t.classList.contains('x')) { attrs.splice(i, 1); renderAttrRows(); applyAttrs(); }
      if (t.classList.contains('sw')) { attrs[i][1] = t.dataset.tone ?? ''; renderAttrRows(); applyAttrs(); }
    });
    on($('ce-add'), 'click', () => { attrs.push(['data-x', '1']); renderAttrRows(); applyAttrs(); });

    function instantiate() {
      if (!defined) return;
      const el = document.createElement(defined);
      for (const [k, v] of attrs) { if (k) { try { el.setAttribute(k, v); } catch { /* skip */ } } }
      try { el.append(textToDom(ceSlot.value)); } catch { /* ignore */ }
      sanitize(el);
      instance = el;
      ceShadow.replaceChildren(el);
      if (ceHost.parentNode !== ceStage) ceStage.replaceChildren(ceHost);
      serializeInstance();
    }
    function define() {
      try {
        const mode = ceMode.value as 'shadowOpen' | 'shadowClosed' | 'light';
        const Cls = CE_FACTORIES[mode](ceHtml.value);
        const name = `${baseName()}-${++defineCount}`;
        customElements.define(name, Cls);
        defined = name;
        ceCode.textContent = `const MyCard = ${mode}(htmlFromTextarea); // @johnhenry/domable\ncustomElements.define("${name}", MyCard);\n// custom element names can never be re-defined, so each click gets a fresh suffix\ndocument.createElement("${name}")  // + your attributes + slotted children`;
        instantiate();
      } catch (err) {
        ceCode.textContent = `⚠ ${(err as Error)?.message ?? err}`;
      }
    }
    on(ceDefine, 'click', define);
    on(ceName, 'input', syncDefineLabel);
    let slotDeb = 0;
    on(ceSlot, 'input', () => { slotDeb = debounce(slotDeb, instantiate, 250); });

    // ------------------------------------------------------------------ default state
    htmlTa.value = initialState.html && initialState.html.length <= SIZE_CAP ? initialState.html : PRESETS[initPreset];
    root.querySelector(`.preset[data-preset="${initPreset}"]`)?.classList.add('on');
    setActivePane(initPane, false);
    hsTa.value = DEFAULT_HS;
    ceHtml.value = DEFAULT_CE;
    renderAttrRows();
    syncDefineLabel();
    // fromHTML() runs synchronously so `current` (and the object/DOM panes) are
    // populated before mount() returns -- e.g. so the "Scaffold as files" handoff
    // button has a real tree to send even if clicked before the first paint.
    // drawEdges() alone waits a frame: it reads layout (getBoundingClientRect())
    // that isn't settled until root's first paint.
    fromHTML();
    requestAnimationFrame(() => drawEdges());
    runHs();
    define();

    return () => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const off of offs) off();
      root.remove();
    };
  },
};

export default playground;
