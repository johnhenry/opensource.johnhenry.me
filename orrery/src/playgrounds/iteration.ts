import type { Playground } from '../registry';
import {
  Signal, Computed,
  signal, computed, effect, batch,
} from '@johnhenry/signalle';
import { bindAttribute, computedBind } from '@johnhenry/signalle/dom';
import { readState, writeState, copyLink } from '../state';
import './iteration.css';
import {
  countAsync,
  asyncFrom,
  pause,
  transduceAsync,
  transducers,
  windowedAsync,
  zipAsync,
  mapConcurrentAsync,
  HALT,
  AsyncChannel,
  CHANNEL_END,
  abortable,
  throwIfAborted,
  teeAsync,
  prefetchAsync,
  type Transducer,
  type ReducerStep,
} from '@johnhenry/iteration';

const { map, filter, take, drop, group, dedupe, accumulate } = transducers;

type Sig<T> = Signal<T>;
type Comp<T> = Computed<T>;

// ---------------------------------------------------------------------------
// Reactivity inspector. Every signal/computed/effect in this planet is created
// through `Rx`, which wraps the real signalle primitive and counts how often
// it re-runs (the same instrumentation trick as the Signalle Loom: the
// instance's `value` setter is shadowed so writes are observed, and compute
// functions are wrapped so recomputes are counted). Open the panel and edit a
// stage expression: `stages` and `code` tick, `structure` recomputes but
// returns the same key, so `renderStages` never runs -- that is the equality
// cutoff that keeps your focused input alive.
// ---------------------------------------------------------------------------
type RxKind = 'signal' | 'computed' | 'effect';
interface RxNode {
  name: string; kind: RxKind; runs: number; changes: number; value: string; ambient: boolean;
  last: unknown; flash: boolean; row?: HTMLTableRowElement; valEl?: HTMLElement; runEl?: HTMLElement; chgEl?: HTMLElement;
}
function rxFmt(v: unknown): string {
  if (v === undefined) return '…';
  if (typeof v === 'string') return v.length > 42 ? JSON.stringify(v.slice(0, 40) + '…') : JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  if (Array.isArray(v)) return `Array(${v.length})`;
  try { const j = JSON.stringify(v); return j.length > 42 ? j.slice(0, 41) + '…' : j; } catch { return String(v); }
}
class Rx {
  nodes: RxNode[] = [];
  disposers: (() => void)[] = [];
  panel: HTMLElement;
  private body: HTMLElement;
  private summary: HTMLElement;
  private open = false;
  private raf = 0;
  private epoch: { srcs: string[]; ran: string[]; timer: number } | null = null;
  /** True while an ambient write (a tick, a counter) is still propagating. */
  private inAmbient = false;

  constructor() {
    this.panel = document.createElement('div');
    this.panel.className = 'rx-panel';
    this.panel.hidden = true;
    this.panel.innerHTML = `
      <div class="rx-head"><b>reactivity inspector</b><span class="rx-legend"><i class="k-signal">signal</i><i class="k-computed">computed</i><i class="k-effect">effect</i></span>
      <button type="button" class="btn small" data-rx="reset">reset counters</button></div>
      <div class="rx-summary">Change any control: only the nodes downstream of what you touched flash. (Start-up counts are 2–3 because a signalle <code>computed()</code> is async: it first runs while its inputs are still resolving, then again once they land.)</div>
      <table class="rx-table"><thead><tr><th></th><th>name</th><th>value</th><th title="writes (signal) / recomputes (computed) / runs (effect)">runs</th><th title="times the value actually changed (Object.is)">Δ</th></tr></thead><tbody></tbody></table>`;
    this.body = this.panel.querySelector('tbody')!;
    this.summary = this.panel.querySelector('.rx-summary')!;
    this.panel.querySelector('[data-rx="reset"]')!.addEventListener('click', () => {
      for (const n of this.nodes) { n.runs = 0; n.changes = 0; }
      this.schedule();
    });
  }

  toggle(): boolean {
    this.open = !this.open;
    this.panel.hidden = !this.open;
    if (this.open) this.schedule();
    return this.open;
  }

  private add(name: string, kind: RxKind, ambient = false): RxNode {
    const n: RxNode = { name, kind, runs: 0, changes: 0, value: '…', ambient, last: undefined, flash: false };
    const row = document.createElement('tr');
    row.className = `k-${kind}`;
    row.innerHTML = `<td><span class="rx-dot"></span></td><td class="rx-name">${name}</td><td class="rx-val"></td><td class="rx-run">0</td><td class="rx-chg">0</td>`;
    n.row = row; n.valEl = row.children[2] as HTMLElement; n.runEl = row.children[3] as HTMLElement; n.chgEl = row.children[4] as HTMLElement;
    this.body.appendChild(row);
    this.nodes.push(n);
    return n;
  }

  private ran(n: RxNode, value?: unknown, hasValue = false) {
    n.runs++;
    n.flash = true;
    if (hasValue) {
      if (!Object.is(value, n.last) || n.runs === 1) n.changes++;
      n.last = value;
      n.value = rxFmt(value);
    } else n.value = `ran ×${n.runs}`;
    if (this.epoch && !n.ambient && !this.inAmbient && !this.epoch.ran.includes(n.name)) this.epoch.ran.push(n.name);
    this.schedule();
  }

  private startEpoch(src: string) {
    if (this.epoch) {
      if (!this.epoch.srcs.includes(src)) this.epoch.srcs.push(src);
      return;
    }
    const ep = { srcs: [src], ran: [] as string[], timer: 0 };
    ep.timer = window.setTimeout(() => {
      if (this.epoch !== ep) return;
      this.epoch = null;
      const derived = this.nodes.filter((n) => n.kind !== 'signal' && !n.ambient);
      const skipped = derived.filter((n) => !ep.ran.includes(n.name)).map((n) => n.name);
      const ran = ep.ran.filter((r) => !ep.srcs.includes(r));
      this.summary.innerHTML = `wrote <b>${ep.srcs.join(', ')}</b> → re-ran <b>${ran.length}</b> of ${derived.length}: ${ran.map((r) => `<code>${r}</code>`).join(' ') || '(nothing)'}`
        + (skipped.length ? `<br><span class="rx-skip">untouched: ${skipped.map((r) => `<code>${r}</code>`).join(' ')}</span>` : '');
    }, 180);
    this.epoch = ep;
  }

  private schedule() {
    if (!this.open || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      for (const n of this.nodes) {
        n.valEl!.textContent = n.value;
        n.runEl!.textContent = String(n.runs);
        n.chgEl!.textContent = n.kind === 'effect' ? '' : String(n.changes);
        if (n.flash) {
          n.flash = false;
          const row = n.row!;
          row.classList.remove('rx-flash');
          void row.offsetWidth; // restart the animation
          row.classList.add('rx-flash');
        }
      }
    });
  }

  /** signal(): a writable source. Writes are observed by shadowing `value`. */
  signal<T>(name: string, init: T, opts: { ambient?: boolean; fmt?: (v: T) => unknown } = {}): Sig<T> {
    const n = this.add(name, 'signal', opts.ambient);
    const s = signal<T>(init);
    const show = opts.fmt ?? ((v: T) => v);
    n.value = rxFmt(show(init)); n.last = init;
    let proto = Object.getPrototypeOf(s);
    let d: PropertyDescriptor | undefined;
    while (proto && !(d = Object.getOwnPropertyDescriptor(proto, 'value'))) proto = Object.getPrototypeOf(proto);
    const desc = d!;
    const rx = this;
    Object.defineProperty(s, 'value', {
      configurable: true,
      get() { return desc.get!.call(s); },
      set(v: T) {
        if (!Object.is(s.peek(), v)) {
          if (!n.ambient) rx.startEpoch(name);
          else if (!rx.inAmbient) {
            // Signalle propagates through promises (microtasks), so anything
            // that re-runs before the next macrotask was caused by this write.
            rx.inAmbient = true;
            setTimeout(() => { rx.inAmbient = false; }, 0);
          }
          n.last = undefined;
          rx.ran(n, show(v), true);
        }
        desc.set!.call(s, v);
      },
    });
    return s;
  }

  private wrap<T>(n: RxNode, fn: (...a: any[]) => T): (...a: any[]) => Promise<T> {
    return async (...args: any[]) => {
      let out: T;
      try { out = fn(...args); } catch (err) { console.error(`[rx:${n.name}]`, err); out = undefined as T; }
      this.ran(n, out, true);
      return out;
    };
  }

  /** computed(deps, fn): signalle's explicit-dependency derived value. */
  computed<T>(name: string, deps: Sig<any> | Sig<any>[], fn: (...a: any[]) => T, opts: { ambient?: boolean } = {}): Comp<T> {
    const n = this.add(name, 'computed', opts.ambient);
    const c = computed<T>(deps, this.wrap(n, fn));
    this.disposers.push(() => c.dispose());
    return c;
  }

  /** computedBind(el, deps, fn): a computed that writes straight into a DOM property. */
  bound<T>(name: string, el: HTMLElement, deps: Sig<any> | Sig<any>[], fn: (...a: any[]) => T, opts: { property?: keyof HTMLElement; ambient?: boolean } = {}): Comp<T> {
    const n = this.add(name, 'computed', opts.ambient);
    const c = computedBind<T>(el, deps, this.wrap(n, fn), opts.property ? { property: opts.property } : {});
    this.disposers.push(() => c.dispose());
    return c;
  }

  /** effect(sig, fn): the library's single-signal subscriber. */
  effect<T>(name: string, sig: Sig<T>, fn: (v: T) => void, opts: { ambient?: boolean } = {}) {
    const n = this.add(name, 'effect', opts.ambient);
    this.disposers.push(effect(sig, (v: T) => {
      this.ran(n);
      try { fn(v); } catch (err) { console.error(`[rx:${name}]`, err); }
    }));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    if (this.epoch) clearTimeout(this.epoch.timer);
    for (const d of this.disposers.splice(0)) { try { d(); } catch { /* ignore */ } }
  }
}

// ---------------------------------------------------------------------------
// A flatMap transducer is not shipped by the library, but the documented
// step protocol (buffer array + optional `.complete`, see README "The step
// protocol") is a real, public extension point -- this composes with every
// other transducer here and with transduceSync/transduceAsync unmodified.
// ---------------------------------------------------------------------------
function flatMapTd<In, Out>(fn: (item: In) => Iterable<Out>): Transducer<In, Out> {
  return (next: ReducerStep<Out>) => {
    const step: ReducerStep<In> = (buffer, item) => {
      for (const out of fn(item)) {
        const r = next(buffer, out as never);
        if (r === HALT) return HALT;
      }
      return buffer;
    };
    if (next.complete) step.complete = (buffer) => next.complete!(buffer);
    return step;
  };
}

// ---------------------------------------------------------------------------
// Hand-rolled sources. The library has no RNG / timer / word-list sources of
// its own (only `pause`, which these lean on) -- every *stage* below is a
// real @johnhenry/iteration export.
// ---------------------------------------------------------------------------
async function* randomAsync(min: number, max: number): AsyncGenerator<number> {
  while (true) yield Math.round((min + Math.random() * (max - min)) * 100) / 100;
}
async function* tickerAsync(ms: number): AsyncGenerator<number> {
  let i = 0;
  while (true) {
    await pause(ms);
    yield i++;
  }
}
async function* lettersAsync(): AsyncGenerator<string> {
  let i = 0;
  while (true) yield String.fromCharCode(97 + (i++ % 26));
}
function wordsList(text: string): string[] {
  return text.split(/\s+/).map((w) => w.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Config model
// ---------------------------------------------------------------------------
type SourceKind = 'count' | 'random' | 'ticker' | 'words';
interface SourceConfig {
  kind: SourceKind;
  start: number;
  step: number;
  min: number;
  max: number;
  intervalMs: number;
  words: string;
}
function defaultSource(): SourceConfig {
  return {
    kind: 'count',
    start: 1,
    step: 1,
    min: 0,
    max: 100,
    intervalMs: 400,
    words: 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima',
  };
}

type StageKind =
  | 'map' | 'filter' | 'take' | 'drop' | 'chunk' | 'window'
  | 'zip' | 'flatMap' | 'dedupe' | 'scan' | 'asyncMap';

interface Stage {
  id: number;
  kind: StageKind;
  expr: string;
  init: string;
  keyExpr: string;
  n: number;
  concurrency: number;
  latencyMs: number;
  ordered: boolean;
  zipWith: 'index' | 'letters' | 'random';
}

let nextStageId = 1;
function makeStage(kind: StageKind): Stage {
  const base: Stage = {
    id: nextStageId++,
    kind,
    expr: 'x => x',
    init: '0',
    keyExpr: '',
    n: 3,
    concurrency: 3,
    latencyMs: 500,
    ordered: true,
    zipWith: 'letters',
  };
  switch (kind) {
    case 'map': return { ...base, expr: 'x => x * 2' };
    case 'filter': return { ...base, expr: 'x => x % 2 === 0' };
    case 'take': return { ...base, n: 10 };
    case 'drop': return { ...base, n: 3 };
    case 'chunk': return { ...base, n: 4 };
    case 'window': return { ...base, n: 3 };
    case 'zip': return { ...base, zipWith: 'letters' };
    case 'flatMap': return { ...base, expr: 'x => [x, x * 10]' };
    case 'dedupe': return { ...base, keyExpr: '' };
    case 'scan': return { ...base, expr: '(acc, x) => acc + x', init: '0' };
    case 'asyncMap': return { ...base, expr: 'x => `fetched:${x}`', concurrency: 3, latencyMs: 600 };
  }
}

const STAGE_LABELS: Record<StageKind, string> = {
  map: 'map', filter: 'filter', take: 'take', drop: 'drop', chunk: 'chunk (group)',
  window: 'window', zip: 'zip', flatMap: 'flatMap', dedupe: 'dedupe', scan: 'scan (accumulate)',
  asyncMap: 'async map (bounded)',
};

interface State {
  source: SourceConfig;
  stages: Stage[];
  speedMs: number;
  maxTokens: number;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
function presetFizzbuzz(): { source: SourceConfig; stages: Stage[] } {
  const source = { ...defaultSource(), kind: 'count' as const, start: 1, step: 1 };
  const s1 = makeStage('map');
  s1.expr = "x => (x % 15 === 0 ? 'fizzbuzz' : x % 3 === 0 ? 'fizz' : x % 5 === 0 ? 'buzz' : String(x))";
  const s2 = makeStage('take');
  s2.n = 30;
  return { source, stages: [s1, s2] };
}
function presetSlidingAverage(): { source: SourceConfig; stages: Stage[] } {
  const source = { ...defaultSource(), kind: 'random' as const, min: 0, max: 100 };
  const s1 = makeStage('window');
  s1.n = 5;
  const s2 = makeStage('map');
  s2.expr = 'w => (w.reduce((a, b) => a + b, 0) / w.length).toFixed(2)';
  const s3 = makeStage('take');
  s3.n = 20;
  return { source, stages: [s1, s2, s3] };
}
function presetRateLimitedFetch(): { source: SourceConfig; stages: Stage[] } {
  const source = {
    ...defaultSource(),
    kind: 'words' as const,
    words: Array.from({ length: 16 }, (_, i) => `/api/resource/${i}`).join(' '),
  };
  const s1 = makeStage('asyncMap');
  s1.expr = "x => ({ url: x, status: 200 })";
  s1.concurrency = 3;
  s1.latencyMs = 700;
  const s2 = makeStage('take');
  s2.n = 12;
  return { source, stages: [s1, s2] };
}

// ---------------------------------------------------------------------------
// Compile-time-ish helpers for user expressions
// ---------------------------------------------------------------------------
function compileFn(exprText: string): (...args: unknown[]) => unknown {
  const trimmed = exprText.trim();
  if (!trimmed) throw new Error('Expression is empty.');
  // eslint-disable-next-line no-new-func
  const fn = new Function(`"use strict"; return (${trimmed});`)();
  if (typeof fn !== 'function') throw new Error('Expression must evaluate to a function, e.g. "x => x + 1".');
  return fn as (...args: unknown[]) => unknown;
}
function compileValue(exprText: string): unknown {
  const trimmed = exprText.trim();
  if (trimmed === '') return undefined;
  // eslint-disable-next-line no-new-func
  return new Function(`"use strict"; return (${trimmed});`)();
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Deep links: the pipeline is serialised as diffs against each kind's
// defaults, so `#/iteration?stages=[{"kind":"take","n":5}]` is enough.
// ---------------------------------------------------------------------------
type StageLink = Partial<Omit<Stage, 'id'>> & { kind: StageKind };
type SourceLink = Partial<SourceConfig> & { kind: SourceKind };
const STAGE_KINDS = Object.keys(STAGE_LABELS) as StageKind[];
const SOURCE_KINDS: SourceKind[] = ['count', 'random', 'ticker', 'words'];

function stageToLink(stage: Stage): StageLink {
  const base = makeStageTemplate(stage.kind);
  const out: StageLink = { kind: stage.kind };
  for (const k of Object.keys(base) as (keyof Stage)[]) {
    if (k === 'id' || k === 'kind') continue;
    if (stage[k] !== base[k]) (out as Record<string, unknown>)[k] = stage[k];
  }
  return out;
}
function makeStageTemplate(kind: StageKind): Stage {
  const s = makeStage(kind);
  nextStageId--; // templates don't consume ids
  return s;
}
function stageFromLink(link: unknown): Stage | null {
  if (!link || typeof link !== 'object') return null;
  const l = link as Record<string, unknown>;
  if (!STAGE_KINDS.includes(l.kind as StageKind)) return null;
  const stage = makeStage(l.kind as StageKind);
  for (const [k, v] of Object.entries(l)) {
    if (k === 'id' || k === 'kind' || !(k in stage)) continue;
    if (typeof v === typeof (stage as unknown as Record<string, unknown>)[k]) (stage as unknown as Record<string, unknown>)[k] = v;
  }
  return stage;
}
function sourceToLink(cfg: SourceConfig): SourceLink {
  const base = defaultSource();
  const out: SourceLink = { kind: cfg.kind };
  for (const k of Object.keys(base) as (keyof SourceConfig)[]) {
    if (k !== 'kind' && cfg[k] !== base[k]) (out as Record<string, unknown>)[k] = cfg[k];
  }
  return out;
}
function sourceFromLink(link: unknown): SourceConfig {
  const cfg = defaultSource();
  if (!link || typeof link !== 'object') return cfg;
  const l = link as Record<string, unknown>;
  if (SOURCE_KINDS.includes(l.kind as SourceKind)) cfg.kind = l.kind as SourceKind;
  for (const [k, v] of Object.entries(l)) {
    if (k !== 'kind' && k in cfg && typeof v === typeof (cfg as unknown as Record<string, unknown>)[k]) (cfg as unknown as Record<string, unknown>)[k] = v;
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------
const playground: Playground = {
  id: 'iteration',
  title: 'Iteration Pipes',
  pkg: '@johnhenry/iteration',
  hue: 175,
  blurb: 'Transducers and iterator algebra, visualised as data flowing through pipes.',
  docs: 'https://www.npmjs.com/package/@johnhenry/iteration',

  mount(host: HTMLElement) {
    // -- deep-linked initial state -------------------------------------------
    const defaultStages = [makeStage('map'), makeStage('take')];
    defaultStages[1].n = 24;
    const linkDefaults = {
      src: sourceToLink(defaultSource()) as unknown,
      stages: defaultStages.map(stageToLink) as unknown,
      speed: 260,
      max: 40,
    };
    const initial = readState(linkDefaults);
    const initialStages = Array.isArray(initial.stages)
      ? (initial.stages as unknown[]).map(stageFromLink).filter((s): s is Stage => !!s)
      : defaultStages;

    // -- reactive state (signalle) --------------------------------------------
    const rx = new Rx();
    const source = rx.signal<SourceConfig>('source', sourceFromLink(initial.src), { fmt: sourceToLink });
    const stages = rx.signal<Stage[]>('stages', initialStages, { fmt: (st) => st.map((s) => s.kind).join(' → ') });
    const speedMs = rx.signal<number>('speedMs', Number(initial.speed) || 260);
    const maxTokens = rx.signal<number>('maxTokens', Number(initial.max) || 40);
    const running = rx.signal<boolean>('running', false, { ambient: true });
    const sinkCount = rx.signal<number>('sinkCount', 0, { ambient: true });
    const errorMsg = rx.signal<string>('error', '', { ambient: true });

    let stopRequested = false;
    let runToken = 0; // invalidates a previous in-flight run when a new one starts

    // DOM refs populated by renderStages()
    let countRefs: HTMLElement[] = []; // index 0 = source, 1..n = stages, n+1 = sink node
    let trackRefs: HTMLElement[] = []; // trackRefs[i] connects node i -> node i+1
    const badgeRefs = new Map<number, HTMLElement[]>();

    host.innerHTML = `
      <div class="pg-iteration">
        <div class="rx-bar">
          <button class="btn small" data-action="toggle-rx" aria-pressed="false">◉ reactivity inspector</button>
          <button class="btn small" data-action="copy-link">⧉ copy link</button>
          <span class="stat" id="linkNote">planet state lives in <code>signal()</code>s; the URL is a <code>computed()</code> of them</span>
        </div>
        <div id="rxSlot"></div>
        <div class="panel" id="sourcePanel"></div>
        <div class="panel" id="pipelinePanel">
          <h3>Pipeline <span class="stat">(arrange the chain, then hit Run)</span></h3>
          <div class="pipe-scroll"><div class="pipe-row" id="pipeRow"></div></div>
          <div class="add-stage-row">
            <select id="addStageKind" class="mono">
              ${Object.entries(STAGE_LABELS).map(([k, label]) => `<option value="${k}">${label}</option>`).join('')}
            </select>
            <button class="btn" data-action="add-stage">+ Add stage</button>
          </div>
        </div>
        <div class="grid-2">
          <div class="panel">
            <h3>Run</h3>
            <div class="row">
              <label class="field">Speed (ms/token)<input type="range" id="speedRange" min="30" max="800" step="10" value="${speedMs.peek()}"></label>
              <label class="field">Max tokens<input type="number" id="maxTokens" min="5" max="500" value="${maxTokens.peek()}"></label>
            </div>
            <div class="btn-row">
              <button class="btn primary" data-action="run">Run</button>
              <button class="btn" data-action="stop">Stop</button>
              <button class="btn small" data-action="preset-fizzbuzz">Preset: fizzbuzz stream</button>
              <button class="btn small" data-action="preset-avg">Preset: sliding average</button>
              <button class="btn small" data-action="preset-fetch">Preset: rate-limited fetch sim</button>
            </div>
            <pre class="code error-box" id="errorBox" hidden></pre>
          </div>
          <div class="panel">
            <h3>Sink <span class="stat">(<b id="sinkCount">0</b> items)</span></h3>
            <ol class="sink-list" id="sinkList"></ol>
          </div>
        </div>
        <div class="panel">
          <h3>Composed code</h3>
          <pre class="code" id="codePre"></pre>
        </div>

        <div class="panel bp-panel">
          <h3>Backpressure &amp; cancellation lab <span class="stat">a slow consumer, a bursty producer, and the primitives that keep them honest</span></h3>
          <p class="hint">
            A single producer <code>put()</code>s into an <code>AsyncChannel({ limit })</code> — a bounded buffer, real
            backpressure: once it's full, <code>put()</code>'s returned promise doesn't resolve until a <code>take()</code>
            frees a slot. <code>teeAsync(2)</code> splits that one channel into two independent lanes reading the same
            items at their own pace. Lane B additionally wraps its half in <code>prefetchAsync(n, …)</code>, which eagerly
            reads ahead into its own buffer while the consumer is busy — watch its "wait per item" bars flatten out
            compared to lane A's, especially when the producer bursts. <code>abortable(iterable, signal)</code> wraps every
            consumer loop so <b>Stop</b> rejects them promptly mid-<code>await</code>; the producer checks
            <code>throwIfAborted(signal)</code> itself before every <code>put()</code>, the kill switch that stops it from
            even trying to make more work.
          </p>
          <div class="bp-controls">
            <label class="field"><span class="bp-field-label">channel capacity (limit) <span class="ck-val" id="bpCapacityVal">3</span></span><input type="range" id="bpCapacity" min="1" max="12" step="1" value="3"></label>
            <label class="field"><span class="bp-field-label">producer interval (ms) <span class="ck-val" id="bpProduceMsVal">120</span></span><input type="range" id="bpProduceMs" min="20" max="600" step="20" value="120"></label>
            <label class="field"><span class="bp-field-label">producer burst chance <span class="ck-val" id="bpBurstVal">35</span>%</span><input type="range" id="bpBurst" min="0" max="80" step="5" value="35"></label>
            <label class="field"><span class="bp-field-label">consumer interval (ms, both lanes) <span class="ck-val" id="bpConsumeMsVal">260</span></span><input type="range" id="bpConsumeMs" min="40" max="800" step="20" value="260"></label>
            <label class="field"><span class="bp-field-label">prefetch depth (lane B) <span class="ck-val" id="bpPrefetchVal">4</span></span><input type="range" id="bpPrefetch" min="1" max="10" step="1" value="4"></label>
          </div>
          <div class="btn-row">
            <button class="btn primary" id="bpStart">▶ Start</button>
            <button class="btn" id="bpStop" disabled>■ Stop (abortable + throwIfAborted)</button>
          </div>
          <div class="bp-meter-row">
            <div class="bp-meter">
              <span class="bp-meter-label">channel buffer <b id="bpBufferLabel">0</b>/<b id="bpBufferCap">3</b></span>
              <div class="bp-meter-track"><div class="bp-meter-fill" id="bpBufferFill"></div></div>
              <span class="bp-blocked" id="bpBlocked" hidden>⏸ producer BLOCKED — put() pending, buffer full (backpressure)</span>
            </div>
          </div>
          <div class="grid-2 bp-lanes">
            <div class="bp-lane">
              <h4>Lane A — direct <span class="stat">teeAsync(2)[0], no prefetch</span></h4>
              <div class="bp-bars" id="bpBarsA"></div>
              <div class="stat">avg wait <b id="bpAvgA">–</b> ms · items <b id="bpCountA">0</b></div>
            </div>
            <div class="bp-lane">
              <h4>Lane B — prefetch(n) <span class="stat">teeAsync(2)[1] wrapped in prefetchAsync</span></h4>
              <div class="bp-bars" id="bpBarsB"></div>
              <div class="stat">avg wait <b id="bpAvgB">–</b> ms · items <b id="bpCountB">0</b></div>
            </div>
          </div>
          <div class="bp-log" id="bpLog"></div>
        </div>
      </div>`;

    const sinkListEl = host.querySelector('#sinkList') as HTMLOListElement;
    const sinkCountEl = host.querySelector('#sinkCount') as HTMLElement;
    const codeEl = host.querySelector('#codePre') as HTMLElement;
    const errorEl = host.querySelector('#errorBox') as HTMLElement;
    const pipeRowEl = host.querySelector('#pipeRow') as HTMLElement;
    const sourcePanel = host.querySelector('#sourcePanel') as HTMLElement;
    const pipelinePanel = host.querySelector('#pipelinePanel') as HTMLElement;
    const speedRange = host.querySelector('#speedRange') as HTMLInputElement;
    const maxTokensInput = host.querySelector('#maxTokens') as HTMLInputElement;
    const linkNote = host.querySelector('#linkNote') as HTMLElement;
    host.querySelector('#rxSlot')!.appendChild(rx.panel);

    // -- rendering (pure string builders) ----------------------------------

    function sourceFieldsHTML(cfg: SourceConfig): string {
      switch (cfg.kind) {
        case 'count':
          return `
            <label class="field">start<input type="number" data-src-field="start" value="${cfg.start}"></label>
            <label class="field">step<input type="number" data-src-field="step" value="${cfg.step}"></label>`;
        case 'random':
          return `
            <label class="field">min<input type="number" data-src-field="min" value="${cfg.min}"></label>
            <label class="field">max<input type="number" data-src-field="max" value="${cfg.max}"></label>`;
        case 'ticker':
          return `<label class="field">interval (ms)<input type="number" data-src-field="intervalMs" min="20" value="${cfg.intervalMs}"></label>`;
        case 'words':
          return `<label class="field wide">words (space separated)<input type="text" data-src-field="words" value="${escapeHtml(cfg.words)}"></label>`;
      }
    }

    function renderSourcePanel(cfg: SourceConfig) {
      sourcePanel.innerHTML = `
        <h3>Source</h3>
        <div class="row">
          <label class="field">kind
            <select id="sourceKind">
              <option value="count">counting integers</option>
              <option value="random">random numbers</option>
              <option value="ticker">async ticking stream</option>
              <option value="words">array of words</option>
            </select>
          </label>
          ${sourceFieldsHTML(cfg)}
        </div>`;
      (sourcePanel.querySelector('#sourceKind') as HTMLSelectElement).value = cfg.kind;
    }

    function stageFieldsHTML(stage: Stage): string {
      const id = stage.id;
      switch (stage.kind) {
        case 'map':
        case 'filter':
        case 'flatMap':
          return `<label class="field">fn<input type="text" data-stage-id="${id}" data-field="expr" value="${escapeHtml(stage.expr)}"></label>`;
        case 'take':
        case 'drop':
        case 'chunk':
        case 'window':
          return `<label class="field">n<input type="number" min="1" data-stage-id="${id}" data-field="n" value="${stage.n}"></label>`;
        case 'zip':
          return `<label class="field">zip with
            <select data-stage-id="${id}" data-field="zipWith">
              <option value="letters" ${stage.zipWith === 'letters' ? 'selected' : ''}>letters (a, b, c...)</option>
              <option value="index" ${stage.zipWith === 'index' ? 'selected' : ''}>index (0, 1, 2...)</option>
              <option value="random" ${stage.zipWith === 'random' ? 'selected' : ''}>random numbers</option>
            </select></label>`;
        case 'dedupe':
          return `<label class="field">key fn (optional)<input type="text" placeholder="x => x" data-stage-id="${id}" data-field="keyExpr" value="${escapeHtml(stage.keyExpr)}"></label>`;
        case 'scan':
          return `
            <label class="field">reducer<input type="text" data-stage-id="${id}" data-field="expr" value="${escapeHtml(stage.expr)}"></label>
            <label class="field">init<input type="text" data-stage-id="${id}" data-field="init" value="${escapeHtml(stage.init)}"></label>`;
        case 'asyncMap':
          return `
            <label class="field">fn<input type="text" data-stage-id="${id}" data-field="expr" value="${escapeHtml(stage.expr)}"></label>
            <label class="field">concurrency<input type="number" min="1" max="8" data-stage-id="${id}" data-field="concurrency" value="${stage.concurrency}"></label>
            <label class="field">latency (ms)<input type="number" min="0" data-stage-id="${id}" data-field="latencyMs" value="${stage.latencyMs}"></label>
            <label class="field checkbox"><input type="checkbox" data-stage-id="${id}" data-field="ordered" ${stage.ordered ? 'checked' : ''}> ordered</label>`;
      }
    }

    function nodeHTML(kind: 'source' | 'sink'): string {
      if (kind === 'source') {
        return `<div class="node source"><span class="kind-name">source</span><span class="count">out: <b data-count>0</b></span></div>`;
      }
      return `<div class="node sink"><span class="kind-name">sink</span><span class="count">out: <b data-count>0</b></span></div>`;
    }

    function stageNodeHTML(stage: Stage, index: number, total: number): string {
      const kindOptions = Object.entries(STAGE_LABELS)
        .map(([k, label]) => `<option value="${k}" ${k === stage.kind ? 'selected' : ''}>${label}</option>`)
        .join('');
      const badges = stage.kind === 'asyncMap'
        ? `<div class="badge-row">${Array.from({ length: stage.concurrency }, () => '<div class="inflight-badge"></div>').join('')}</div>`
        : '';
      return `
        <div class="node stage" data-stage-box="${stage.id}">
          <div class="stage-head">
            <select data-stage-id="${stage.id}" data-field="kind" class="mono">${kindOptions}</select>
            <div class="stage-btns">
              <button data-action="move-up" data-stage-id="${stage.id}" ${index === 0 ? 'disabled' : ''} title="Move left">&larr;</button>
              <button data-action="move-down" data-stage-id="${stage.id}" ${index === total - 1 ? 'disabled' : ''} title="Move right">&rarr;</button>
              <button data-action="remove-stage" data-stage-id="${stage.id}" title="Remove">&times;</button>
            </div>
          </div>
          ${stageFieldsHTML(stage)}
          ${badges}
          <span class="count">out: <b data-count>0</b></span>
        </div>`;
    }

    function renderStages(list: Stage[]) {
      const html = [nodeHTML('source')];
      list.forEach((stage, i) => {
        html.push('<div class="pipe-track"><div class="pipe-dot" style="display:none"></div></div>');
        html.push(stageNodeHTML(stage, i, list.length));
      });
      html.push('<div class="pipe-track"><div class="pipe-dot" style="display:none"></div></div>');
      html.push(nodeHTML('sink'));
      pipeRowEl.innerHTML = html.join('');

      const nodeEls = Array.from(pipeRowEl.querySelectorAll('.node')) as HTMLElement[];
      countRefs = nodeEls.map((el) => el.querySelector('[data-count]') as HTMLElement);
      trackRefs = Array.from(pipeRowEl.querySelectorAll('.pipe-track')) as HTMLElement[];

      badgeRefs.clear();
      list.forEach((stage) => {
        if (stage.kind !== 'asyncMap') return;
        const box = pipeRowEl.querySelector(`[data-stage-box="${stage.id}"]`);
        if (!box) return;
        badgeRefs.set(stage.id, Array.from(box.querySelectorAll('.inflight-badge')) as HTMLElement[]);
      });
    }

    function codeForSource(cfg: SourceConfig): string {
      switch (cfg.kind) {
        case 'count': return `countAsync(${cfg.start}, Infinity, ${cfg.step})`;
        case 'random': return `randomAsync(${cfg.min}, ${cfg.max})  // custom: yields Math.random() in range`;
        case 'ticker': return `tickerAsync(${cfg.intervalMs})  // await pause(${cfg.intervalMs}) between ticks`;
        case 'words': return `asyncFrom(${wordsList(cfg.words).map((w) => JSON.stringify(w)).join(', ')})`;
      }
    }
    function codeForStage(stage: Stage, prev: string): string {
      switch (stage.kind) {
        case 'map': return `transduceAsync(map(${stage.expr}))(${prev})`;
        case 'filter': return `transduceAsync(filter(${stage.expr}))(${prev})`;
        case 'take': return `transduceAsync(take(${stage.n}))(${prev})`;
        case 'drop': return `transduceAsync(drop(${stage.n}))(${prev})`;
        case 'chunk': return `transduceAsync(group(${stage.n}))(${prev})`;
        case 'dedupe': return `transduceAsync(dedupe(${stage.keyExpr.trim() || ''}))(${prev})`;
        case 'scan': return `transduceAsync(accumulate(${stage.expr}, ${stage.init}))(${prev})`;
        case 'flatMap': return `transduceAsync(flatMapTd(${stage.expr}))(${prev})  // custom transducer, ReducerStep protocol`;
        case 'window': return `windowedAsync(${prev}, ${stage.n})`;
        case 'zip': return `zipAsync(${prev}, ${stage.zipWith}Async())`;
        case 'asyncMap': return `mapConcurrentAsync(${stage.expr}, ${prev}, { concurrency: ${stage.concurrency}, ordered: ${stage.ordered} })  // + await pause(${stage.latencyMs}) simulated latency`;
      }
    }
    function composeCode(src: SourceConfig, list: Stage[], speed: number): string {
      const lines = [
        `import {`,
        `  countAsync, asyncFrom, pause, transduceAsync, transducers,`,
        `  windowedAsync, zipAsync, mapConcurrentAsync,`,
        `} from '@johnhenry/iteration';`,
        `const { map, filter, take, drop, group, dedupe, accumulate } = transducers;`,
        ``,
        `let s0 = ${codeForSource(src)};`,
      ];
      list.forEach((stage, i) => lines.push(`let s${i + 1} = ${codeForStage(stage, `s${i}`)};`));
      const last = `s${list.length}`;
      lines.push('', `for await (const value of ${last}) {`, `  console.log(value);`, `  await pause(${speed}); // paced for visualization`, `}`);
      return lines.join('\n');
    }

    // -- the reactive graph ---------------------------------------------------
    //   source ─┬─ sourceKind ──▶ renderSource        (only when the kind flips)
    //           └─ syncSource                          (patches unfocused inputs)
    //   stages ─┬─ structure ───▶ renderStages        (ids/kinds/concurrency only)
    //           └─ syncStages
    //   source, stages, speedMs ──▶ code  (computedBind → <pre>)
    //   source, stages, speedMs, maxTokens ──▶ link ──▶ writeState
    //   running ──▶ lock · sinkCount ──▶ sinkLabel · error ──▶ errorText/errorHidden

    const sourceKind = rx.computed('sourceKind', source, (s: SourceConfig) => s.kind);
    rx.effect('renderSource', sourceKind, () => renderSourcePanel(source.peek()));
    rx.effect('syncSource', source, (cfg) => {
      sourcePanel.querySelectorAll<HTMLInputElement>('[data-src-field]').forEach((el) => {
        if (el === document.activeElement) return;
        const v = String((cfg as unknown as Record<string, unknown>)[el.dataset.srcField!]);
        if (el.value !== v) el.value = v;
      });
    });

    const structure = rx.computed('structure', stages, (list: Stage[]) =>
      list.map((s) => `${s.id}:${s.kind}${s.kind === 'asyncMap' ? ':' + s.concurrency : ''}`).join('|'));
    rx.effect('renderStages', structure, () => renderStages(stages.peek()));
    rx.effect('syncStages', stages, (list) => {
      pipeRowEl.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-stage-id][data-field]').forEach((el) => {
        if (el === document.activeElement || el.dataset.field === 'kind') return;
        const st = list.find((s) => s.id === Number(el.dataset.stageId));
        if (!st) return;
        const v = (st as unknown as Record<string, unknown>)[el.dataset.field!];
        if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!v;
        else if (el.value !== String(v)) el.value = String(v);
      });
    });

    rx.bound('code', codeEl, [source, stages, speedMs], composeCode);

    const link = rx.computed('link', [source, stages, speedMs, maxTokens], (src: SourceConfig, list: Stage[], speed: number, max: number) =>
      JSON.stringify({ src: sourceToLink(src), stages: list.map(stageToLink), speed, max }));
    rx.effect('writeURL', link, (json) => {
      // isConnected: a planet whose route was superseded mid-load must not rewrite the next planet's URL.
      if (json && host.isConnected) writeState(JSON.parse(json), linkDefaults);
    });

    rx.effect('lockControls', running, (on) => {
      sourcePanel.classList.toggle('locked', on);
      pipelinePanel.classList.toggle('locked', on);
    }, { ambient: true });
    rx.bound('sinkLabel', sinkCountEl, sinkCount, (n: number) => String(n), { ambient: true });
    rx.bound('errorText', errorEl, errorMsg, (m: string) => m, { ambient: true });
    bindAttribute(errorEl, 'hidden', rx.computed('errorHidden', errorMsg, (m: string) => !m, { ambient: true }));
    speedRange.value = String(speedMs.peek());
    maxTokensInput.value = String(maxTokens.peek());

    // -- animation / counters -----------------------------------------------

    const timers = new Set<number>();
    function later(fn: () => void, ms: number) {
      const t = window.setTimeout(() => { timers.delete(t); fn(); }, ms);
      timers.add(t);
    }

    function pulse(el: HTMLElement | undefined) {
      if (!el) return;
      el.classList.remove('pulse');
      // restart animation
      requestAnimationFrame(() => el.classList.add('pulse'));
      later(() => el.classList.remove('pulse'), 260);
    }

    function animateTrack(index: number) {
      const track = trackRefs[index];
      if (!track) return;
      const dot = document.createElement('div');
      dot.className = 'pipe-dot';
      const duration = Math.max(120, Math.min(speedMs.peek(), 900));
      dot.style.transitionDuration = `${duration}ms`;
      track.appendChild(dot);
      requestAnimationFrame(() => { dot.style.left = 'calc(100% - 10px)'; });
      later(() => dot.remove(), duration + 200);
    }

    function bumpCount(nodeIndex: number) {
      const el = countRefs[nodeIndex];
      if (el) el.textContent = String((Number(el.textContent) || 0) + 1);
      pulse(el?.closest('.node') as HTMLElement | undefined);
      animateTrack(nodeIndex);
    }

    function setInFlight(stageId: number, n: number) {
      const badges = badgeRefs.get(stageId);
      if (!badges) return;
      badges.forEach((b, i) => b.classList.toggle('active', i < n));
    }

    function resetVisuals() {
      countRefs.forEach((el) => { if (el) el.textContent = '0'; });
      sinkCount.value = 0;
      sinkListEl.innerHTML = '';
      errorMsg.value = '';
    }

    function pushSink(item: unknown) {
      const n = sinkCount.peek() + 1;
      sinkCount.value = n;
      const sinkNodeCount = countRefs[countRefs.length - 1];
      if (sinkNodeCount) sinkNodeCount.textContent = String(n);
      pulse(sinkNodeCount?.closest('.node') as HTMLElement | undefined);
      const li = document.createElement('li');
      const idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = String(n);
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = typeof item === 'string' ? item : JSON.stringify(item);
      li.append(idx, val);
      sinkListEl.appendChild(li);
      sinkListEl.scrollTop = sinkListEl.scrollHeight;
      while (sinkListEl.children.length > 300) sinkListEl.removeChild(sinkListEl.firstElementChild!);
    }

    // -- pipeline construction ------------------------------------------------

    function makeSource(cfg: SourceConfig): AsyncIterable<unknown> {
      switch (cfg.kind) {
        case 'count': return countAsync(cfg.start, Infinity, cfg.step);
        case 'random': return randomAsync(cfg.min, cfg.max);
        case 'ticker': return tickerAsync(cfg.intervalMs);
        case 'words': return asyncFrom(...wordsList(cfg.words));
      }
    }
    function makeZipSource(kind: Stage['zipWith']): AsyncIterable<unknown> {
      switch (kind) {
        case 'index': return countAsync(0, Infinity, 1);
        case 'letters': return lettersAsync();
        case 'random': return randomAsync(0, 100);
      }
    }

    async function* instrument<T>(iter: AsyncIterable<T>, onItem: () => void): AsyncGenerator<T> {
      for await (const item of iter) {
        onItem();
        yield item;
      }
    }

    function applyStage(prev: AsyncIterable<unknown>, stage: Stage): AsyncIterable<unknown> {
      switch (stage.kind) {
        case 'map': return transduceAsync(map(compileFn(stage.expr)))(prev);
        case 'filter': return transduceAsync(filter(compileFn(stage.expr) as (x: unknown) => boolean))(prev);
        case 'take': return transduceAsync(take(stage.n))(prev);
        case 'drop': return transduceAsync(drop(stage.n))(prev);
        case 'chunk': return transduceAsync(group(stage.n))(prev);
        case 'dedupe': return transduceAsync(dedupe(stage.keyExpr.trim() ? compileFn(stage.keyExpr) : undefined))(prev);
        case 'scan': return transduceAsync(accumulate(compileFn(stage.expr) as (a: unknown, b: unknown) => unknown, compileValue(stage.init)))(prev);
        case 'flatMap': return transduceAsync(flatMapTd(compileFn(stage.expr) as (x: unknown) => Iterable<unknown>))(prev);
        case 'window': return windowedAsync(prev, stage.n);
        case 'zip': return zipAsync(prev, makeZipSource(stage.zipWith));
        case 'asyncMap': {
          const fn = compileFn(stage.expr);
          let inFlight = 0;
          const wrapped = async (item: unknown) => {
            inFlight++;
            setInFlight(stage.id, inFlight);
            try {
              const jitter = Math.random() * stage.latencyMs * 0.4;
              await pause(stage.latencyMs + jitter);
              return fn(item);
            } finally {
              inFlight--;
              setInFlight(stage.id, inFlight);
            }
          };
          return mapConcurrentAsync(wrapped, prev, { concurrency: Math.max(1, stage.concurrency), ordered: stage.ordered });
        }
      }
    }

    async function runPipeline() {
      if (running.peek()) return;
      running.value = true;
      stopRequested = false;
      const myToken = ++runToken;
      resetVisuals();

      try {
        let iter: AsyncIterable<unknown> = instrument(makeSource(source.peek()), () => bumpCount(0));
        stages.peek().forEach((stage, i) => {
          const raw = applyStage(iter, stage);
          iter = instrument(raw, () => bumpCount(i + 1));
        });

        let n = 0;
        for await (const item of iter) {
          if (myToken !== runToken || stopRequested) break;
          pushSink(item);
          n++;
          if (n >= maxTokens.peek()) break;
          await pause(speedMs.peek());
        }
      } catch (err) {
        errorMsg.value = err instanceof Error ? err.message : String(err);
      } finally {
        if (myToken === runToken) running.value = false;
      }
    }

    function stopPipeline() {
      stopRequested = true;
      runToken++; // invalidate the current run so a stray tick can't keep animating
      running.value = false;
    }

    // -- events: every handler is just a signal write ------------------------

    function patchStage(id: number, patch: Partial<Stage>) {
      stages.value = stages.peek().map((s) => (s.id === id ? { ...s, ...patch } : s));
    }

    function onInput(e: Event) {
      const target = e.target as HTMLElement;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
      if (target === speedRange) { speedMs.value = Number(speedRange.value); return; }
      if (target === maxTokensInput) { maxTokens.value = Number(maxTokensInput.value) || 40; return; }

      const srcField = target.getAttribute('data-src-field');
      if (srcField) {
        const val = target.type === 'number' ? Number(target.value) : target.value;
        source.value = { ...source.peek(), [srcField]: val };
        return;
      }

      const stageIdAttr = target.getAttribute('data-stage-id');
      const field = target.getAttribute('data-field');
      if (stageIdAttr && field) {
        if (field === 'kind') return; // handled in onChange (replaces the stage)
        let val: unknown = target.value;
        if (target instanceof HTMLInputElement && target.type === 'checkbox') val = target.checked;
        else if (target instanceof HTMLInputElement && target.type === 'number') val = Number(target.value);
        patchStage(Number(stageIdAttr), { [field]: val } as Partial<Stage>);
      }
    }

    function onChange(e: Event) {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLSelectElement && target.id === 'sourceKind') {
        source.value = { ...defaultSource(), kind: target.value as SourceKind };
        return;
      }
      if (target instanceof HTMLSelectElement && target.getAttribute('data-field') === 'kind') {
        const id = Number(target.getAttribute('data-stage-id'));
        const fresh = makeStage(target.value as StageKind);
        fresh.id = id;
        stages.value = stages.peek().map((s) => (s.id === id ? fresh : s));
        return;
      }
      onInput(e);
    }

    function onClick(e: Event) {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.getAttribute('data-action');
      const idAttr = target.getAttribute('data-stage-id');
      const id = idAttr ? Number(idAttr) : undefined;
      const list = stages.peek();

      switch (action) {
        case 'add-stage': {
          const kind = (host.querySelector('#addStageKind') as HTMLSelectElement).value as StageKind;
          stages.value = [...list, makeStage(kind)];
          break;
        }
        case 'remove-stage':
          stages.value = list.filter((s) => s.id !== id);
          break;
        case 'move-up': {
          const idx = list.findIndex((s) => s.id === id);
          if (idx > 0) {
            const next = [...list];
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            stages.value = next;
          }
          break;
        }
        case 'move-down': {
          const idx = list.findIndex((s) => s.id === id);
          if (idx >= 0 && idx < list.length - 1) {
            const next = [...list];
            [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
            stages.value = next;
          }
          break;
        }
        case 'run': runPipeline(); break;
        case 'stop': stopPipeline(); break;
        case 'preset-fizzbuzz': applyPreset(presetFizzbuzz()); break;
        case 'preset-avg': applyPreset(presetSlidingAverage()); break;
        case 'preset-fetch': applyPreset(presetRateLimitedFetch()); break;
        case 'toggle-rx': target.setAttribute('aria-pressed', String(rx.toggle())); break;
        case 'copy-link':
          copyLink().then(() => {
            linkNote.textContent = 'link copied: the URL reproduces this exact pipeline';
            later(() => { linkNote.innerHTML = 'planet state lives in <code>signal()</code>s; the URL is a <code>computed()</code> of them'; }, 2200);
          });
          break;
      }
    }

    function applyPreset(preset: { source: SourceConfig; stages: Stage[] }) {
      stopPipeline();
      void batch(async () => {
        source.value = preset.source;
        stages.value = preset.stages;
      });
    }

    // ---------------------------------------------------------------------------
    // Backpressure & cancellation lab. Independent of the reactive pipeline
    // above -- its own AsyncChannel, its own AbortController, plain DOM.
    // ---------------------------------------------------------------------------
    const bpCapacityIn = host.querySelector('#bpCapacity') as HTMLInputElement;
    const bpCapacityVal = host.querySelector('#bpCapacityVal') as HTMLElement;
    const bpProduceMsIn = host.querySelector('#bpProduceMs') as HTMLInputElement;
    const bpProduceMsVal = host.querySelector('#bpProduceMsVal') as HTMLElement;
    const bpBurstIn = host.querySelector('#bpBurst') as HTMLInputElement;
    const bpBurstVal = host.querySelector('#bpBurstVal') as HTMLElement;
    const bpConsumeMsIn = host.querySelector('#bpConsumeMs') as HTMLInputElement;
    const bpConsumeMsVal = host.querySelector('#bpConsumeMsVal') as HTMLElement;
    const bpPrefetchIn = host.querySelector('#bpPrefetch') as HTMLInputElement;
    const bpPrefetchVal = host.querySelector('#bpPrefetchVal') as HTMLElement;
    const bpStartBtn = host.querySelector('#bpStart') as HTMLButtonElement;
    const bpStopBtn = host.querySelector('#bpStop') as HTMLButtonElement;
    const bpBufferLabel = host.querySelector('#bpBufferLabel') as HTMLElement;
    const bpBufferCap = host.querySelector('#bpBufferCap') as HTMLElement;
    const bpBufferFill = host.querySelector('#bpBufferFill') as HTMLElement;
    const bpBlockedEl = host.querySelector('#bpBlocked') as HTMLElement;
    const bpBarsA = host.querySelector('#bpBarsA') as HTMLElement;
    const bpBarsB = host.querySelector('#bpBarsB') as HTMLElement;
    const bpAvgA = host.querySelector('#bpAvgA') as HTMLElement;
    const bpAvgB = host.querySelector('#bpAvgB') as HTMLElement;
    const bpCountA = host.querySelector('#bpCountA') as HTMLElement;
    const bpCountB = host.querySelector('#bpCountB') as HTMLElement;
    const bpLogEl = host.querySelector('#bpLog') as HTMLElement;

    let bpRunning = false;
    let bpAbort: AbortController | null = null;
    let bpChannelRef: AsyncChannel<number> | null = null;
    /** Mirrors the channel's own cache size: ++ right after a put() resolves, -- right after a take(). */
    let bpBufferCount = 0;
    let bpProducerBlockedSince = 0;
    const bpTimers = new Set<number>();
    function bpLater(fn: () => void, ms: number) {
      const t = window.setTimeout(() => { bpTimers.delete(t); fn(); }, ms);
      bpTimers.add(t);
    }

    function bpLog(msg: string) {
      const line = document.createElement('div');
      line.className = 'bp-log-line';
      line.textContent = `${new Date().toLocaleTimeString([], { hour12: false })} · ${msg}`;
      bpLogEl.appendChild(line);
      while (bpLogEl.children.length > 50) bpLogEl.removeChild(bpLogEl.firstElementChild!);
      bpLogEl.scrollTop = bpLogEl.scrollHeight;
    }

    function bpPaintBuffer(capacity: number, blocked: boolean) {
      bpBufferLabel.textContent = String(bpBufferCount);
      bpBufferCap.textContent = String(capacity);
      bpBufferFill.style.width = `${capacity ? Math.min(100, (bpBufferCount / capacity) * 100) : 0}%`;
      bpBlockedEl.hidden = !blocked;
    }

    function bpPushBar(container: HTMLElement, waitMs: number, maxMs: number) {
      const bar = document.createElement('div');
      bar.className = 'bp-bar';
      bar.style.height = `${Math.max(3, Math.min(100, (waitMs / maxMs) * 100))}%`;
      bar.title = `${waitMs.toFixed(0)} ms wait for this item`;
      container.appendChild(bar);
      while (container.children.length > 36) container.removeChild(container.firstElementChild!);
      container.scrollLeft = container.scrollWidth;
    }

    /** Wraps channel.take() as an async generator, and is the single shared upstream teeAsync(2) splits. */
    async function* bpChannelSource(channel: AsyncChannel<number>, capacity: number): AsyncGenerator<number> {
      while (true) {
        const v = await channel.take();
        if (v === CHANNEL_END) return;
        bpBufferCount = Math.max(0, bpBufferCount - 1);
        bpPaintBuffer(capacity, bpProducerBlockedSince > 0);
        yield v as number;
      }
    }

    async function bpProducer(
      channel: AsyncChannel<number>,
      capacity: number,
      signal: AbortSignal,
      produceMsGetter: () => number,
      burstChanceGetter: () => number,
    ) {
      let i = 0;
      while (true) {
        throwIfAborted(signal); // the kill switch: bail before doing any more work, not just downstream
        const willBlock = bpBufferCount >= capacity;
        if (willBlock) {
          bpProducerBlockedSince = performance.now();
          bpPaintBuffer(capacity, true);
          bpLog(`producer BLOCKED on put(${i}) — buffer full (${bpBufferCount}/${capacity})`);
        }
        await channel.put(i);
        if (willBlock) {
          bpLog(`producer UNBLOCKED — put(${i}) accepted after ${(performance.now() - bpProducerBlockedSince).toFixed(0)} ms`);
          bpProducerBlockedSince = 0;
        }
        bpBufferCount++;
        bpPaintBuffer(capacity, false);
        i++;
        if (signal.aborted) return;
        const burst = Math.random() * 100 < burstChanceGetter();
        await pause(burst ? produceMsGetter() * 3 : produceMsGetter());
      }
    }

    async function bpConsumeLane(
      label: 'A' | 'B',
      source: AsyncIterable<number>,
      signal: AbortSignal,
      consumeMsGetter: () => number,
      barsEl: HTMLElement,
      avgEl: HTMLElement,
      countEl: HTMLElement,
    ) {
      const gen = abortable(source, signal);
      let n = 0;
      let total = 0;
      try {
        while (true) {
          const t0 = performance.now();
          const { value, done } = await gen.next();
          if (done) break;
          const waitMs = performance.now() - t0;
          n++;
          total += waitMs;
          bpPushBar(barsEl, waitMs, Math.max(60, consumeMsGetter() * 1.5));
          avgEl.textContent = (total / n).toFixed(0);
          countEl.textContent = String(n);
          bpLog(`lane ${label}: got ${value} after ${waitMs.toFixed(0)} ms wait`);
          await pause(consumeMsGetter());
        }
      } catch {
        /* aborted -- abortable() rejects the in-flight next() promptly */
      }
    }

    function bpStartLab() {
      if (bpRunning) return;
      bpRunning = true;
      bpStartBtn.disabled = true;
      bpStopBtn.disabled = false;
      bpCapacityIn.disabled = true;
      bpPrefetchIn.disabled = true;
      bpLogEl.innerHTML = '';
      bpBarsA.innerHTML = '';
      bpBarsB.innerHTML = '';
      bpAvgA.textContent = '–';
      bpAvgB.textContent = '–';
      bpCountA.textContent = '0';
      bpCountB.textContent = '0';
      bpBufferCount = 0;
      bpProducerBlockedSince = 0;

      const capacity = Math.max(1, Number(bpCapacityIn.value));
      const prefetchDepth = Math.max(1, Number(bpPrefetchIn.value));
      bpPaintBuffer(capacity, false);

      const ac = new AbortController();
      bpAbort = ac;
      const channel = new AsyncChannel<number>({ limit: capacity });
      bpChannelRef = channel;

      const [laneA, laneBRaw] = teeAsync(2)(bpChannelSource(channel, capacity));
      const laneB = prefetchAsync(prefetchDepth, laneBRaw);

      void bpProducer(channel, capacity, ac.signal, () => Number(bpProduceMsIn.value), () => Number(bpBurstIn.value)).catch(() => {});
      void bpConsumeLane('A', laneA, ac.signal, () => Number(bpConsumeMsIn.value), bpBarsA, bpAvgA, bpCountA);
      void bpConsumeLane('B', laneB, ac.signal, () => Number(bpConsumeMsIn.value), bpBarsB, bpAvgB, bpCountB);
      bpLog(`started — AsyncChannel({ limit: ${capacity} }) → teeAsync(2) → lane A direct, lane B prefetchAsync(${prefetchDepth}, …)`);
    }

    function bpStopLab() {
      if (!bpRunning) return;
      bpRunning = false;
      bpStartBtn.disabled = false;
      bpStopBtn.disabled = true;
      bpCapacityIn.disabled = false;
      bpPrefetchIn.disabled = false;
      bpAbort?.abort();
      bpAbort = null;
      // Unstick anything left waiting on the channel: break() resolves a
      // pending take() (idle-buffer case) with CHANNEL_END; the extra take()
      // calls drain any producer still blocked in put() on a full buffer, so
      // no dangling promise is left awaiting forever inside the closure.
      const ch = bpChannelRef;
      bpChannelRef = null;
      if (ch) {
        void ch.break().catch(() => {});
        const capacity = Math.max(1, Number(bpCapacityIn.value));
        for (let i = 0; i < capacity + 2; i++) void ch.take().catch(() => {});
      }
      bpBlockedEl.hidden = true;
      bpLog('stopped — abort() rejects both abortable() consumer loops; throwIfAborted() stops the producer before its next put()');
    }

    bpCapacityIn.addEventListener('input', () => { bpCapacityVal.textContent = bpCapacityIn.value; });
    bpProduceMsIn.addEventListener('input', () => { bpProduceMsVal.textContent = bpProduceMsIn.value; });
    bpBurstIn.addEventListener('input', () => { bpBurstVal.textContent = bpBurstIn.value; });
    bpConsumeMsIn.addEventListener('input', () => { bpConsumeMsVal.textContent = bpConsumeMsIn.value; });
    bpPrefetchIn.addEventListener('input', () => { bpPrefetchVal.textContent = bpPrefetchIn.value; });
    bpStartBtn.addEventListener('click', bpStartLab);
    bpStopBtn.addEventListener('click', bpStopLab);
    bpLater(bpStartLab, 400); // auto-start so the lab is already running with zero input, like the pipe above

    host.addEventListener('input', onInput);
    host.addEventListener('change', onChange);
    host.addEventListener('click', onClick);

    // Effects on computeds fire after their first (async) compute; wait a
    // tick so the pipe nodes exist before the first run animates them.
    later(() => { if (!stopRequested) runPipeline(); }, 0);

    return () => {
      stopRequested = true;
      runToken++;
      for (const t of timers) clearTimeout(t);
      host.removeEventListener('input', onInput);
      host.removeEventListener('change', onChange);
      host.removeEventListener('click', onClick);
      rx.dispose();
      bpAbort?.abort();
      bpChannelRef?.break().catch(() => {});
      for (const t of bpTimers) clearTimeout(t);
      host.innerHTML = '';
    };
  },
};

export default playground;
