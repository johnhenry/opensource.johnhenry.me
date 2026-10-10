import type { Playground } from '../registry';
import { readState, writeState, copyLink } from '../state';
import './notebook.css';
/* ────────────────────────────────────────────────────────────────────────────
 * Patchbay Notebook (id: notebook). A small spatial notebook: five libraries, each doing one job.
 *
 *   @johnhenry/patchbay       the canvas. createViewport + attachViewport pan and zoom the world (wheel, ⌘/Ctrl+wheel,
 *                             drag on empty canvas, keyboard); createWires draws one wire per dependency and redraws it
 *                             when a cell moves; connectDrag is the drag-to-connect gesture from a cell's output port.
 *   @johnhenry/window-algebra the cells as floating windows on that canvas: createWindowManager + createDomRenderer +
 *                             attachInput, with `coordinates` (patchbay's) so drags and resizes track the cursor 1:1 at
 *                             any zoom, `config.bounds: "none"` for an unbounded world, and undo/redo with
 *                             `history: { ignore: ['window/focus', 'window/raise'] }` (0.1.3), so clicking a cell is not
 *                             an undo step but moving or resizing it is.
 *   @johnhenry/dataflow       what reruns. Each cell is a node; its wires are `deps`. Statuses (running, done, error,
 *                             waiting, skipped, plus the `stale` flag on the manual cell) come from its onChange, live.
 *                             A branch returns SKIP / skip(reason); the coalesce cell declares `consumesSkip`.
 *   @johnhenry/andbox         where the code runs and the values live: one Worker sandbox. dataflow's run() calls
 *                             sandbox.evaluate(); the cell's value is stored in a virtual module inside the Worker and
 *                             never crosses to the page.
 *   @johnhenry/inspectable    what crosses instead: createInspector().serialize(value, { scope }) inside the Worker
 *                             returns a structured-clone-safe preview; <value-inspector> renders it and fetches deeper
 *                             levels lazily by handle (another evaluate() call), and release(scope) drops a cell's
 *                             handles when it reruns.
 * ──────────────────────────────────────────────────────────────────────────── */
import '@johnhenry/patchbay/patchbay.css';
import { createViewport, attachViewport, createWires, connectDrag, boundsOf, type Coordinates } from '@johnhenry/patchbay';
import { createWindowManager, createState, THEME_CSS, RULES_CSS, type WindowManager } from '@johnhenry/window-algebra';
import { createDomRenderer, attachInput, htmlSurface, createFrameScheduler } from '@johnhenry/window-algebra/browser';
import { createDataflow, skip, type NodeState } from '@johnhenry/dataflow';
import { createSandbox, type Sandbox } from '@johnhenry/andbox';
import { defineValueInspector, type ValueInspector } from '@johnhenry/inspectable/element';
import type { Preview } from '@johnhenry/inspectable';
// The serializer as source text, shipped INTO the Worker (it has no imports and touches no DOM, by design).
import inspectableSource from '@johnhenry/inspectable/serialize?raw';

/* ───────────────────────────── the cells ───────────────────────────── */

interface CellDef {
  id: string;
  title: string;
  kind: 'input' | 'code';
  code: string;
  deps: string[];
  autorun?: boolean;
  consumesSkip?: boolean;
  note: string;
  place: { x: number; y: number; width: number; height: number };
}

const CELLS: CellDef[] = [
  { id: 'n', title: 'n · input', kind: 'input', code: '', deps: [], note: 'A slider. Its value is sent into the Worker as a literal; everything downstream reruns.', place: { x: 20, y: 250, width: 260, height: 200 } },
  { id: 'squares', title: 'squares', kind: 'code', deps: ['n'], note: 'An expression cell.',
    code: 'return Array.from({ length: Math.min(n, 12) }, (_, i) => i * i);', place: { x: 350, y: 0, width: 330, height: 270 } },
  { id: 'big', title: 'big · branch', kind: 'code', deps: ['n'], note: 'Returns skip(reason) unless n ≥ 50.',
    code: 'if (n < 50) return skip("n is under 50");\nreturn { label: "big", n, half: n / 2 };', place: { x: 350, y: 300, width: 330, height: 250 } },
  { id: 'small', title: 'small · branch', kind: 'code', deps: ['n'], note: 'Returns SKIP unless n < 50.',
    code: 'if (n >= 50) return SKIP;\nreturn `small: ${n}`;', place: { x: 350, y: 580, width: 330, height: 240 } },
  { id: 'message', title: 'message · coalesce', kind: 'code', deps: ['big', 'small'], consumesSkip: true, note: 'consumesSkip: runs even when an input skipped (that input arrives as undefined).',
    code: '// whichever branch produced a value\nif (big !== undefined) return `big: ${big.n}`;\nif (small !== undefined) return small;\nreturn SKIP;', place: { x: 760, y: 470, width: 330, height: 290 } },
  { id: 'report', title: 'report · manual', kind: 'code', deps: ['squares', 'n'], autorun: false, note: 'autorun: false. It keeps its last value and turns stale until you run it.',
    code: 'return {\n  total: squares.reduce((a, b) => a + b, 0),\n  scale: (x) => x * n,          // a function: stays in the Worker\n  byIndex: new Map(squares.map((s, i) => [i, s])),\n  nested: { deeper: { deepest: [n, n * 2] } },\n};', place: { x: 760, y: 20, width: 350, height: 410 } },
];
const BROKEN_SQUARES = 'throw new Error("squares broke (on purpose)");';

/** The planet's own module inside the Worker: inspectable's serializer, plus a value store and a cell runner. */
const RUNTIME = `${inspectableSource}
/* ---- Patchbay Notebook runtime (lives in the andbox Worker) ----
   sandboxImport() may hand back a fresh instance of this module, so the state lives on the Worker's global object:
   it lasts exactly as long as the Worker does (a timeout or kill takes it with it). */
const __nb = (globalThis.__orreryNotebook ??= {
  values: new Map(),
  latest: new Map(),
  skip: Symbol("nb.skip"),
  inspector: createInspector({ depth: 1, maxEntries: 40, maxString: 400, maxSource: 200 }),
});
const __nbValues = __nb.values, __nbLatest = __nb.latest, __nbSkip = __nb.skip, __nbInspector = __nb.inspector;
export async function runCell(id, runId, deps, skipped, code, delayMs) {
  __nbLatest.set(id, runId);
  const args = deps.map((d) => (skipped.includes(d) ? undefined : __nbValues.get(d)));
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  if (__nbLatest.get(id) !== runId) return { superseded: true };
  const skipWith = (reason) => ({ [__nbSkip]: true, reason });
  const fn = new Function(...deps, "SKIP", "skip", '"use strict"; return (async () => {\\n' + code + '\\n})();');
  const value = await fn(...args, __nbSkip, skipWith);
  if (__nbLatest.get(id) !== runId) return { superseded: true }; // a newer run of this cell started: drop this one
  __nbInspector.release(id); // the old value's handles: let it be collected
  if (value === __nbSkip || (value && typeof value === "object" && value[__nbSkip] === true)) {
    __nbValues.delete(id);
    return { skip: true, reason: value === __nbSkip ? undefined : value.reason };
  }
  __nbValues.set(id, value);
  return { preview: __nbInspector.serialize(value, { scope: id }), handles: __nbInspector.size };
}
export function expand(handle) { return __nbInspector.expand(handle) ?? null; }
export function stats() { return { values: [...__nbValues.keys()], handles: __nbInspector.size }; }
`;

/* ───────────────────────────── helpers ───────────────────────────── */

const J = JSON.stringify;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const IGNORED = ['window/focus', 'window/raise'] as const;
const DEFAULTS = { n: 30, slow: true };
type CellResult = { preview: Preview; handles: number } | undefined;

interface CellView {
  def: CellDef;
  el: HTMLElement;
  status: HTMLElement;
  meta: HTMLElement;
  inputs: HTMLElement;
  code?: HTMLTextAreaElement;
  slider?: HTMLInputElement;
  sliderOut?: HTMLElement;
  out: HTMLElement;
  viewer: ValueInspector;
  edited: boolean;
}

const EXPLAIN = `
<p><b>Five libraries, one notebook.</b> Every cell's code runs in one <b>andbox</b> Worker; <b>dataflow</b> decides when; the values stay in the Worker and only <b>inspectable</b> previews cross to the page; the cells are <b>window-algebra</b> floating windows on a <b>patchbay</b> canvas, and the wires are the dependencies.</p>
<ul>
  <li><b>What reruns</b> (<a href="https://opensource.johnhenry.me/dataflow/" target="_blank" rel="noopener">dataflow</a>). Move the slider: <code>n</code> reruns, then <code>squares</code>, <code>big</code> and <code>small</code> (in parallel, each once), then <code>message</code>. Slow motion adds a 350 ms pause inside the Worker before each run, so you can see <em>running</em>. One branch always returns <code>SKIP</code> or <code>skip(reason)</code>: it shows <em>skipped</em>, and the skip spreads to anything that depends on it, except <code>message</code>, which declares <code>consumesSkip</code> and coalesces. <code>report</code> is manual (<code>autorun: false</code>): it keeps its value and turns <em>stale</em> until you press ▶. <b>Break squares</b> makes it throw: it shows <em>error</em> and <code>report</code> shows <em>waiting</em>, not a cascade of errors.</li>
  <li><b>Where values live</b> (<a href="https://opensource.johnhenry.me/andbox/" target="_blank" rel="noopener">andbox</a>). dataflow's <code>run(id)</code> is one <code>sandbox.evaluate()</code> that calls the planet's runtime module (<code>defineModule</code>) in the Worker. The value is kept in a <code>Map</code> there, so a function or a <code>Map</code> in <code>report</code> never has to survive <code>postMessage</code>. A run that takes more than 4 s is hard-killed; the notebook then resets the graph and reruns it in a fresh Worker.</li>
  <li><b>What crosses</b> (<a href="https://opensource.johnhenry.me/inspectable/" target="_blank" rel="noopener">inspectable</a>). Inside the Worker, <code>createInspector().serialize(value, { scope: cellId })</code> returns a preview tree; a node deeper than one level carries a <code>handle</code>. Open <code>nested</code> in <code>report</code>: <code>&lt;value-inspector&gt;</code> calls its <code>expand(handle)</code>, which is another <code>evaluate()</code>. When a cell reruns, <code>release(cellId)</code> drops its handles.</li>
  <li><b>The canvas</b> (<a href="https://opensource.johnhenry.me/patchbay/" target="_blank" rel="noopener">patchbay</a>). Drag empty canvas to pan; once you have clicked the canvas the wheel pans it (before that it scrolls the page); <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+wheel or pinch to zoom, or focus the canvas and use <kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd> and the arrows. Each dependency is a <code>createWires</code> wire coloured by its source's status. Drag from a cell's right-hand port (●) onto another cell: <code>connectDrag</code> adds the dependency (a cycle is refused by dataflow and shows as an error). Remove one with the ✕ on an input chip.</li>
  <li><b>The cells</b> (<a href="https://opensource.johnhenry.me/window-algebra/" target="_blank" rel="noopener">window-algebra</a>). Drag a cell's title bar to move it and its corner to resize it; both track the cursor at any zoom because <code>createDomRenderer</code> and <code>attachInput</code> get patchbay's <code>coordinates</code> (<code>toStage</code>, <code>scale</code>). Undo and redo walk moves and resizes; clicking a cell focuses and raises it but is not an undo step, because the manager is created with <code>history: { ignore: ['window/focus', 'window/raise'] }</code>. Undo covers the windows, not the code or the wires.</li>
</ul>
<p><b>Honest limits.</b> andbox's Worker is a separate context, not a security boundary (see its docs); this notebook runs code you type in your own browser. Undo is for window geometry only.</p>`;

/* ───────────────────────────── the planet ───────────────────────────── */

const playground: Playground = {
  id: 'notebook',
  title: 'Patchbay Notebook',
  pkg: '@johnhenry/patchbay',
  hue: 262,
  blurb: 'A spatial notebook: cells are floating windows on a pan/zoom canvas, wires are dependencies, code runs in a Worker and only previews come back.',
  docs: 'https://opensource.johnhenry.me/patchbay/',
  mount(host) {
    const init = readState(DEFAULTS);
    let n = Math.max(0, Math.min(100, Math.round(Number(init.n) || 0)));
    let slow = init.slow !== false;
    let disposed = false;
    const offs: Array<() => void> = [];
    const on = (el: EventTarget, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => { el.addEventListener(type, fn, opts); offs.push(() => el.removeEventListener(type, fn, opts)); };

    defineValueInspector(); // <value-inspector>, once per page (defineValueInspector skips a registered tag)

    // window-algebra's CSS, scoped to this visit like the Untrusted Desk does.
    const style = document.createElement('style');
    style.setAttribute('data-pg-notebook', '');
    style.textContent = `${THEME_CSS}\n${RULES_CSS}`;
    document.head.append(style);

    const root = document.createElement('div');
    root.className = 'pg-notebook';
    root.innerHTML = `
      <div class="panel nb-bar">
        <div class="nb-row" role="group" aria-label="Presets">
          <span class="nb-label">Try</span>
          <button class="btn" data-act="n30">n = 30 (small branch)</button>
          <button class="btn" data-act="n80">n = 80 (big branch)</button>
          <button class="btn" data-act="break" data-broken="false">Break squares</button>
          <button class="btn primary" data-act="run-report">▶ Run report</button>
          <button class="btn" data-act="runall">Run all</button>
          <label class="nb-check"><input type="checkbox" data-el="slow"> slow motion (350 ms in the Worker)</label>
          <button class="btn" data-act="copy">Copy link</button>
        </div>
        <div class="nb-row" role="group" aria-label="Canvas and history">
          <span class="nb-label">Canvas</span>
          <button class="btn" data-act="zoom-out" aria-label="Zoom out">−</button>
          <span class="stat" data-el="zoom" data-zoom="1">100%</span>
          <button class="btn" data-act="zoom-in" aria-label="Zoom in">+</button>
          <button class="btn" data-act="fit">Fit</button>
          <span class="nb-sep"></span>
          <span class="nb-label">Windows</span>
          <button class="btn" data-act="undo" disabled>Undo</button>
          <button class="btn" data-act="redo" disabled>Redo</button>
          <span class="stat" data-el="history" data-steps="0">0 undo steps</span>
          <span class="nb-why">clicks focus and raise cells without adding a step (<code>history.ignore</code>)</span>
        </div>
        <div class="nb-legend" aria-label="Status legend">
          ${['idle', 'running', 'done', 'waiting', 'skipped', 'error', 'stale'].map((s) => `<span class="nb-pill is-${s}">${s}</span>`).join('')}
          <span class="stat nb-worker" data-el="worker">Worker: starting…</span>
        </div>
      </div>
      <div class="nb-stage patchbay-stage" tabindex="0" aria-label="Notebook canvas: drag empty space to pan, Ctrl or Cmd plus wheel to zoom">
        <div class="patchbay-world nb-world">
          <svg class="patchbay-wires nb-wires" aria-hidden="true"></svg>
          <div class="nb-wm"></div>
        </div>
      </div>
      <div class="nb-roles">
        ${[
          ['patchbay', 'the canvas and the wires', 'patchbay'],
          ['window-algebra', 'the cells, moved and undone', 'window-algebra'],
          ['dataflow', 'what reruns, and each status', 'dataflow'],
          ['andbox', 'where the code runs and values live', 'andbox'],
          ['inspectable', 'the previews that cross', 'inspectable'],
        ].map(([name, role, slug]) => `<a class="nb-role" href="https://opensource.johnhenry.me/${slug}/" target="_blank" rel="noopener"><b>@johnhenry/${name}</b><span>${role}</span></a>`).join('')}
      </div>
      <details class="panel nb-explain" open><summary>What's happening</summary><div>${EXPLAIN}</div></details>`;
    host.append(root);

    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
    const stage = $('.nb-stage');
    const world = $('.nb-world');
    const svg = $<SVGSVGElement>('.nb-wires');
    const wmRoot = $('.nb-wm');
    const zoomEl = $('[data-el="zoom"]');
    const historyEl = $('[data-el="history"]');
    const workerEl = $('[data-el="worker"]');
    const undoBtn = $<HTMLButtonElement>('[data-act="undo"]');
    const redoBtn = $<HTMLButtonElement>('[data-act="redo"]');
    const breakBtn = $<HTMLButtonElement>('[data-act="break"]');
    const slowBox = $<HTMLInputElement>('[data-el="slow"]');
    slowBox.checked = slow;

    /* ---- patchbay: the viewport ---- */
    const viewport = createViewport({ minZoom: 0.25, maxZoom: 2.5 });
    const { coordinates, detach: detachViewport } = attachViewport(viewport, { container: stage, world });
    const coords: Coordinates = coordinates;
    // The canvas sits in a scrolling page: a plain wheel over it scrolls the page until the canvas is clicked (then the wheel pans
    // it, patchbay's default). ⌘/Ctrl+wheel and pinch always zoom. A capture listener on an ancestor keeps the event from patchbay.
    let canvasActive = false;
    on(document, 'pointerdown', (e: PointerEvent) => { canvasActive = stage.contains(e.target as Node); stage.classList.toggle('is-active', canvasActive); }, { capture: true });
    on(root, 'wheel', (e: WheelEvent) => {
      if (!stage.contains(e.target as Node) || e.ctrlKey || e.metaKey || canvasActive) return;
      e.stopPropagation();
    }, { capture: true });
    const showZoom = () => { const z = viewport.zoom; zoomEl.textContent = `${Math.round(z * 100)}%`; zoomEl.dataset.zoom = z.toFixed(3); };
    offs.push(viewport.subscribe(showZoom) as unknown as () => void);
    showZoom();

    /* ---- the cells' DOM ---- */
    const views = new Map<string, CellView>();
    const deps = new Map<string, string[]>(CELLS.map((c) => [c.id, [...c.deps]]));
    const codeOf = new Map<string, string>(CELLS.map((c) => [c.id, c.code]));
    const states = new Map<string, NodeState<CellResult>>();

    for (const def of CELLS) {
      const el = document.createElement('div');
      el.className = 'nb-cell';
      el.dataset.cell = def.id;
      el.innerHTML = `
        <span class="nb-port in" title="input"></span>
        <span class="nb-port out" data-port="${def.id}" title="drag onto another cell to make it depend on ${def.id}"></span>
        <div class="nb-cell-head">
          <span class="nb-pill is-idle" data-el="status">idle</span>
          <span class="nb-meta stat" data-el="meta"></span>
          <button class="nb-run" data-run="${def.id}" title="${def.autorun === false ? 'run this manual cell' : 'rerun this cell'}">▶</button>
        </div>
        <div class="nb-inputs" data-el="inputs"></div>
        ${def.kind === 'input'
          ? `<label class="nb-slider"><input type="range" min="0" max="100" step="1" data-el="slider" aria-label="n"><output data-el="slider-out"></output></label><p class="nb-note">${esc(def.note)}</p>`
          : `<textarea class="nb-code" spellcheck="false" data-patchbay-ignore aria-label="${esc(def.id)} code" data-el="code"></textarea><p class="nb-note">${esc(def.note)} <span class="nb-hint">⌘/Ctrl+Enter applies an edit.</span></p>`}
        <div class="nb-out" data-patchbay-ignore data-el="out"><value-inspector open></value-inspector><div class="nb-msg" data-el="msg"></div></div>`;
      const view: CellView = {
        def, el,
        status: el.querySelector('[data-el="status"]')!,
        meta: el.querySelector('[data-el="meta"]')!,
        inputs: el.querySelector('[data-el="inputs"]')!,
        code: el.querySelector<HTMLTextAreaElement>('[data-el="code"]') ?? undefined,
        slider: el.querySelector<HTMLInputElement>('[data-el="slider"]') ?? undefined,
        sliderOut: el.querySelector<HTMLElement>('[data-el="slider-out"]') ?? undefined,
        out: el.querySelector('[data-el="out"]')!,
        viewer: el.querySelector('value-inspector') as ValueInspector,
        edited: false,
      };
      if (view.code) view.code.value = def.code;
      if (view.slider) { view.slider.value = String(n); view.sliderOut!.textContent = String(n); }
      view.viewer.expand = async (handle: string) => {
        if (!sandbox) return undefined;
        const r = await sandbox.evaluate(`const rt = await sandboxImport('nb-runtime'); return rt.expand(${J(handle)});`, { timeoutMs: 4000 });
        refreshWorkerStats();
        return (r as any) ?? undefined;
      };
      views.set(def.id, view);
    }

    /* ---- window-algebra: the cells as floating windows on the canvas ---- */
    // Seed the windows on a throwaway manager, so the real manager's undo history starts at this arrangement.
    const seed = createWindowManager({ state: createState({ layout: { type: 'columns' }, config: { bounds: 'none', gap: 0, inset: 0 } } as any) });
    for (const def of CELLS) seed.create({ id: def.id, title: def.title, mode: 'floating', placement: def.place } as any);
    const surfaces = new Map<string, ReturnType<typeof htmlSurface>>();
    const surfaceFor = (id: string) => {
      const view = views.get(id);
      if (!view) return undefined;
      if (!surfaces.has(id)) surfaces.set(id, htmlSurface(view.el));
      return surfaces.get(id);
    };
    const renderer = createDomRenderer({ root: wmRoot, surfaceFor, chrome: { buttons: [] }, coordinates: coords });
    const wm: WindowManager = createWindowManager({
      state: seed.getState(),
      renderer,
      schedule: createFrameScheduler(),
      history: { limit: 100, ignore: [...IGNORED] },
    });
    const detachInput = attachInput({ root: wmRoot, wm, coordinates: coords });
    wm.render();

    /* The visible undo stack: window-algebra keeps snapshots, not labels, so this mirrors which commands became steps,
       by the manager's own rules (a gesture is one step; an ignored type is logged but never a step). */
    const past: string[] = [];
    let future: string[] = [];
    let lastGesture: unknown = null;
    const labelOf = (c: any) => `${c.type.replace('window/', '')} ${c.id ?? ''}`.trim();
    let prevState = wm.getState();
    const unsubscribeWm = wm.subscribe((state, events, command: any) => {
      const changed = state !== prevState;
      prevState = state;
      if (command && changed) {
        const token = command.gesture;
        if (token != null && future.length === 0 && lastGesture === token) { /* the same drag: one step */ }
        else if ((IGNORED as readonly string[]).includes(command.type) && command.history !== true) lastGesture = null;
        else { past.push(labelOf(command)); if (past.length > 100) past.shift(); future = []; lastGesture = token ?? null; }
      }
      if (!wm.canUndo) past.length = 0;
      if (!wm.canRedo) future = [];
      void events;
      showHistory();
      scheduleWires();
    });
    function showHistory() {
      undoBtn.disabled = !wm.canUndo;
      redoBtn.disabled = !wm.canRedo;
      historyEl.textContent = `${past.length} undo step${past.length === 1 ? '' : 's'}${past.length ? `: ${past.slice(-3).join(' · ')}` : ''}`;
      historyEl.dataset.steps = String(past.length);
      historyEl.dataset.redo = String(future.length);
    }
    showHistory();

    /* ---- patchbay: the wires (one per dependency), from the cells' port elements ---- */
    const portOf = (id: string, side: 'in' | 'out') => views.get(id)?.el.querySelector<HTMLElement>(`.nb-port.${side}`);
    const wires = createWires<string>({
      svg,
      resolve: (endpoint) => {
        const [id, side] = endpoint.split(':') as [string, 'in' | 'out'];
        const port = portOf(id, side);
        if (!port || !port.isConnected) return undefined;
        const r = port.getBoundingClientRect();
        return coords.toWorld(r.left + r.width / 2, r.top + r.height / 2);
      },
    });
    let wireRaf = 0;
    // After a state change the renderer commits on the next frame; measure the ports the frame after that.
    function scheduleWires() {
      cancelAnimationFrame(wireRaf);
      wireRaf = requestAnimationFrame(() => { wireRaf = requestAnimationFrame(() => wires.update()); });
    }
    function drawWires() {
      const keep: string[] = [];
      for (const [id, list] of deps) {
        for (const dep of list) {
          const key = `${dep}->${id}`;
          keep.push(key);
          const st = states.get(dep)?.status ?? 'idle';
          wires.set(key, { from: `${dep}:out`, to: `${id}:in`, className: `nb-wire is-${st}`, title: `${dep} → ${id} (${dep} is ${st})` });
        }
      }
      wires.retain(keep);
      scheduleWires();
    }
    offs.push(viewport.subscribe(() => scheduleWires()) as unknown as () => void);

    /* ---- andbox: one Worker sandbox, with the runtime module defined in it ---- */
    let sandbox: Sandbox | null = null;
    const broken = new Set<string>();
    let restarting = false;
    async function startSandbox() {
      const sb = await createSandbox({ defaultTimeoutMs: 4000, onConsole: (level, ...args) => console.debug(`[notebook worker:${level}]`, ...args) });
      if (disposed) { void sb.dispose(); return null; }
      await sb.defineModule('nb-runtime', RUNTIME);
      return sb;
    }
    async function refreshWorkerStats() {
      if (!sandbox) return;
      try {
        const s = await sandbox.evaluate(`const rt = await sandboxImport('nb-runtime'); return rt.stats();`, { timeoutMs: 2000 }) as { values: string[]; handles: number };
        workerEl.textContent = `Worker holds ${s.values.length} value${s.values.length === 1 ? '' : 's'} (${s.values.join(', ') || 'none'}) · ${s.handles} live handle${s.handles === 1 ? '' : 's'}`;
        workerEl.dataset.values = String(s.values.length);
        workerEl.dataset.handles = String(s.handles);
      } catch { /* the Worker is being replaced */ }
    }

    /* ---- dataflow: the scheduler ---- */
    const flow = createDataflow<CellResult>({
      async run(id, { runId, deps: ds, skipped }) {
        const sb = sandbox;
        if (!sb) throw new Error('the Worker is not running');
        if (broken.has(id)) throw new Error('this cell timed out and was disabled; edit its code to try again');
        const view = views.get(id)!;
        const code = view.def.kind === 'input' ? `return ${n};` : codeOf.get(id)!;
        let res: any;
        try {
          res = await sb.evaluate(
            `const rt = await sandboxImport('nb-runtime'); return rt.runCell(${J(id)}, ${runId}, ${J(ds)}, ${J(skipped)}, ${J(code)}, ${slow ? 350 : 0});`,
            { timeoutMs: 4000 },
          );
        } catch (err) {
          const e = err as Error;
          if (e.name === 'TimeoutError' && !restarting) {
            // andbox terminated the Worker: every value in it is gone. Reset the graph and rerun it in a fresh one.
            broken.add(id);
            restarting = true;
            queueMicrotask(async () => {
              const old = sandbox; sandbox = null; try { await old?.dispose(); } catch { /* already gone */ }
              sandbox = await startSandbox();
              restarting = false;
              if (sandbox && !disposed) { flow.reset(); flow.runAll(); }
            });
          }
          throw new Error(`${e.name}: ${e.message}`);
        }
        if (res?.skip) return skip(res.reason);
        if (res?.superseded) return undefined;
        void refreshWorkerStats();
        return { preview: res.preview as Preview, handles: res.handles as number };
      },
      onChange(id, state) {
        states.set(id, state);
        paint(id, state);
        drawWires();
      },
    });
    for (const def of CELLS) flow.set(def.id, { deps: deps.get(def.id)!, autorun: def.autorun !== false, consumesSkip: def.consumesSkip ?? false });

    function paint(id: string, state: NodeState<CellResult>) {
      const view = views.get(id);
      if (!view) return;
      const label = state.stale ? `${state.status} · stale` : state.status;
      view.status.textContent = label;
      view.status.className = `nb-pill is-${state.status}${state.stale ? ' is-stale' : ''}`;
      view.el.dataset.status = state.status;
      view.el.dataset.stale = String(state.stale);
      view.el.dataset.version = String(state.version);
      view.meta.textContent = `v${state.version} · run ${state.runId}${flow.autorun(id) === false ? ' · manual' : ''}${flow.consumesSkip(id) ? ' · consumesSkip' : ''}`;
      const msg = view.out.querySelector<HTMLElement>('[data-el="msg"]')!;
      if (state.status === 'done' && state.result) {
        view.viewer.hidden = false;
        if (view.viewer.value !== state.result.preview) view.viewer.value = state.result.preview;
        msg.textContent = '';
      } else if (state.status === 'skipped') {
        view.viewer.hidden = true;
        const s = state.skip!;
        msg.textContent = s.source === id ? `skipped by its own run${s.reason !== undefined ? `: ${String(s.reason)}` : ' (SKIP)'}` : `skipped: ${s.source} skipped${s.reason !== undefined ? ` (${String(s.reason)})` : ''}, and it spread here`;
      } else if (state.status === 'error') {
        view.viewer.hidden = true;
        msg.textContent = state.cycle ? 'on a dependency cycle: dataflow refuses it (remove a wire)' : String((state.error as Error)?.message ?? state.error);
      } else if (state.status === 'waiting') {
        view.viewer.hidden = true;
        msg.textContent = 'waiting: an input errored, is missing or has not run';
      } else if (state.status === 'running') {
        msg.textContent = view.viewer.hidden ? 'running in the Worker…' : '';
      } else if (state.status === 'idle') {
        view.viewer.hidden = true;
        msg.textContent = 'not run yet';
      }
    }

    function paintInputs(id: string) {
      const view = views.get(id)!;
      const list = deps.get(id)!;
      view.inputs.innerHTML = list.length
        ? `<span class="stat">inputs</span>${list.map((d) => `<span class="nb-chip">${esc(d)}<button data-cut="${esc(d)}->${esc(id)}" aria-label="remove input ${esc(d)} from ${esc(id)}" title="remove this dependency">✕</button></span>`).join('')}`
        : '<span class="stat">no inputs</span>';
    }
    for (const def of CELLS) paintInputs(def.id);

    function setDeps(id: string, next: string[]) {
      deps.set(id, next);
      const def = views.get(id)!.def;
      flow.set(id, { deps: next, autorun: def.autorun !== false, consumesSkip: def.consumesSkip ?? false });
      flow.invalidate(id);
      paintInputs(id);
      drawWires();
    }

    /* ---- interactions ---- */
    function applyCode(id: string) {
      const view = views.get(id)!;
      if (!view.code) return;
      codeOf.set(id, view.code.value);
      broken.delete(id);
      view.edited = false;
      view.el.classList.remove('is-edited');
      flow.invalidate(id); // autorun: reruns; manual: stale
    }
    for (const view of views.values()) {
      if (view.code) {
        const ta = view.code;
        on(ta, 'input', () => { view.edited = true; view.el.classList.add('is-edited'); });
        on(ta, 'keydown', (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); applyCode(view.def.id); }
        });
        on(ta, 'blur', () => { if (view.edited) applyCode(view.def.id); });
      }
      if (view.slider) {
        on(view.slider, 'input', () => { setN(Number(view.slider!.value)); });
      }
      // Ports: a pointerdown on the output port starts patchbay's drag-to-connect; stop it reaching window-algebra
      // (which would start a move) and patchbay's own pan.
      const out = view.el.querySelector<HTMLElement>('.nb-port.out')!;
      on(out, 'pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const from = view.def.id;
        const r = out.getBoundingClientRect();
        connectDrag<string>({
          svg,
          event: e,
          from: coords.toWorld(r.left + r.width / 2, r.top + r.height / 2),
          toWorld: coords.toWorld,
          hitTest: (x, y) => (document.elementFromPoint(x, y)?.closest<HTMLElement>('.nb-cell')?.dataset.cell) || undefined,
          onHover: (target) => { for (const v of views.values()) v.el.classList.toggle('is-target', v.def.id === target && target !== from); },
          onConnect: (target) => {
            if (target === from) return;
            const list = deps.get(target)!;
            if (list.includes(from)) return;
            setDeps(target, [...list, from]);
          },
        });
      });
    }
    function setN(v: number) {
      n = Math.max(0, Math.min(100, Math.round(v)));
      const view = views.get('n')!;
      if (view.slider && Number(view.slider.value) !== n) view.slider.value = String(n);
      if (view.sliderOut) view.sliderOut.textContent = String(n);
      flow.invalidate('n');
      writeState({ n, slow }, DEFAULTS);
    }

    on(root, 'click', async (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-run],[data-cut]');
      if (!t || (t as HTMLButtonElement).disabled) return;
      if (t.dataset.cut) {
        const [dep, id] = t.dataset.cut.split('->');
        setDeps(id, deps.get(id)!.filter((d) => d !== dep));
        return;
      }
      if (t.dataset.run) { flow.run(t.dataset.run); return; }
      const act = t.dataset.act;
      const r = stage.getBoundingClientRect();
      const center = { x: r.width / 2, y: r.height / 2 };
      if (act === 'n30') setN(30);
      else if (act === 'n80') setN(80);
      else if (act === 'break') {
        const brokenNow = codeOf.get('squares') === BROKEN_SQUARES;
        const view = views.get('squares')!;
        view.code!.value = brokenNow ? CELLS[1].code : BROKEN_SQUARES;
        applyCode('squares');
        breakBtn.textContent = brokenNow ? 'Break squares' : 'Fix squares';
        breakBtn.dataset.broken = String(!brokenNow);
      } else if (act === 'run-report') flow.run('report');
      else if (act === 'runall') flow.runAll();
      else if (act === 'zoom-in') viewport.zoomAt(center, 1.25);
      else if (act === 'zoom-out') viewport.zoomAt(center, 1 / 1.25);
      else if (act === 'fit') fit();
      else if (act === 'undo') { if (past.length) future.unshift(past.pop()!); lastGesture = null; wm.undo(); showHistory(); }
      else if (act === 'redo') { if (future.length) past.push(future.shift()!); lastGesture = null; wm.redo(); showHistory(); }
      else if (act === 'copy') { writeState({ n, slow }, DEFAULTS); await new Promise((res) => setTimeout(res, 200)); await copyLink(); t.textContent = 'Copied'; setTimeout(() => { if (!disposed) t.textContent = 'Copy link'; }, 1200); }
    });
    on(slowBox, 'change', () => { slow = slowBox.checked; writeState({ n, slow }, DEFAULTS); });

    function fit() {
      const rects = Object.values((wm.getState() as any).windows).map((w: any) => w.placement);
      const b = boundsOf(rects);
      if (!b) return;
      const r = stage.getBoundingClientRect();
      viewport.fit(b, { width: r.width, height: r.height }, { padding: 28, maxZoom: 1 });
    }

    /* ---- boot ---- */
    drawWires();
    requestAnimationFrame(() => { if (!disposed) fit(); });
    const ro = new ResizeObserver(() => scheduleWires());
    ro.observe(stage);
    startSandbox().then(
      (sb) => {
        if (!sb || disposed) return;
        sandbox = sb;
        workerEl.textContent = 'Worker ready';
        flow.runAll();
      },
      (err) => { workerEl.textContent = `Worker failed to start: ${(err as Error)?.message ?? err}`; workerEl.classList.add('bad'); },
    );

    return () => {
      disposed = true;
      cancelAnimationFrame(wireRaf);
      ro.disconnect();
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      flow.pause();
      unsubscribeWm();
      detachInput();
      renderer.destroy();
      detachViewport();
      wires.clear();
      const sb = sandbox; sandbox = null;
      void sb?.dispose().catch(() => {});
      root.remove();
      style.remove();
    };
  },
};
export default playground;
