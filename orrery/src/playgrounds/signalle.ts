import type { Playground } from '../registry';
import {
  Signal, Computed,
  signal, computed, effect, createEffect, batch, untrack,
} from '@johnhenry/signalle';
import {
  bind, bindAttribute, bindClass, bindList, bindStyle, computedBind,
} from '@johnhenry/signalle/dom';
import { readState, writeState, copyLink } from '../state';
import './signalle.css';

type Sig<T = any> = Signal<T>;

const SVGNS = 'http://www.w3.org/2000/svg';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function fmtAny(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3).replace(/\.?0+$/, ''));
  if (typeof v === 'string') return v.length > 16 ? v.slice(0, 15) + '…' : v;
  if (typeof v === 'boolean') return String(v);
  if (v === undefined) return '…';
  try { const j = JSON.stringify(v); return j.length > 16 ? j.slice(0, 15) + '…' : j; } catch { return String(v); }
}

/* ------------------------------------------------------------------ */
/* The loom: an instrumented reactive graph                            */
/* ------------------------------------------------------------------ */

type Kind = 'source' | 'computed' | 'effect';
interface GNode {
  id: string; label: string; kind: Kind; runs: number; value: string;
  deps: string[]; col: number; row: number; x: number; y: number;
  g?: SVGGElement; valEl?: SVGTextElement; cntEl?: SVGTextElement; sub?: string;
}
interface Control {
  id: string; sig: Sig; kind: 'range' | 'choice';
  min?: number; max?: number; step?: number; options?: string[]; unrelated?: boolean;
  fmt?: (v: any) => string;
  input?: HTMLInputElement | HTMLSelectElement; out?: HTMLElement;
}

class Loom {
  nodes = new Map<string, GNode>();
  bySig = new Map<Sig, GNode>();
  controls: Control[] = [];
  readBuf: GNode[] = [];
  disposers: (() => void)[] = [];
  onRun: (n: GNode) => void = () => {};
  onWrite: (n: GNode, v: unknown) => void = () => {};

  private add(id: string, kind: Kind, label = id, sub?: string): GNode {
    const n: GNode = { id, label, kind, runs: 0, value: '…', deps: [], col: 0, row: 0, x: 0, y: 0, sub };
    this.nodes.set(id, n);
    return n;
  }

  /**
   * Replace the instance's `value` accessor with one that reports every read
   * (and write) to the loom, then delegates to the real Signal/Computed
   * accessor with `this` bound to the real instance so private fields work.
   * Signalle itself reads `dep.value` for every dependency right before it
   * calls a computed's compute function, so this is how edges are discovered.
   */
  private instrument(sig: Sig, n: GNode) {
    let proto = Object.getPrototypeOf(sig);
    let d: PropertyDescriptor | undefined;
    while (proto && !(d = Object.getOwnPropertyDescriptor(proto, 'value'))) proto = Object.getPrototypeOf(proto);
    if (!d) return;
    const desc = d;
    const loom = this;
    Object.defineProperty(sig, 'value', {
      configurable: true,
      get() { loom.readBuf.push(n); return desc.get!.call(sig); },
      set(v) {
        // Report the write first so the UI can open a "change epoch" before
        // Signalle synchronously starts recomputing dependants.
        if (n.kind === 'source' && !Object.is(sig.peek(), v)) { n.runs++; n.value = fmtAny(v); loom.onWrite(n, v); }
        desc.set!.call(sig, v);
      },
    });
    this.bySig.set(sig, n);
  }

  source<T>(id: string, init: T, ctl: Omit<Control, 'id' | 'sig'>): Sig<T> {
    const n = this.add(id, 'source');
    const s = signal<T>(init);
    n.value = fmtAny(init);
    this.instrument(s, n);
    this.controls.push({ id, sig: s, ...ctl });
    return s;
  }

  derive<T>(id: string, deps: Sig[], fn: (...a: any[]) => T, fmt: (v: T) => string = fmtAny): Computed<T> {
    const n = this.add(id, 'computed');
    const loom = this;
    const c = computed<T>(deps, async (...args: any[]) => {
      // The reads Signalle just made for this recompute are the tail of the buffer.
      const reads = loom.readBuf.splice(0).slice(-deps.length);
      for (const r of reads) if (!n.deps.includes(r.id)) n.deps.push(r.id);
      const out = fn(...args);
      n.runs++;
      try { n.value = fmt(out); } catch { n.value = '…'; }
      loom.onRun(n);
      return out;
    });
    this.instrument(c, n);
    this.disposers.push(() => c.dispose());
    return c;
  }

  /** effect(signal, fn): the library's explicit single-signal subscriber. */
  effect<T>(id: string, sig: Sig<T>, fn: (v: T) => void, fmt: (v: T) => string = fmtAny) {
    const n = this.add(id, 'effect', id, 'effect()');
    const dep = this.bySig.get(sig);
    if (dep) n.deps.push(dep.id);
    this.disposers.push(effect(sig, (v: T) => {
      n.runs++;
      try { n.value = fmt(v); } catch { n.value = '…'; }
      this.onRun(n);
      fn(v);
    }));
  }

  /** createEffect(fn): auto-tracked. Edges come from the instrumented reads. */
  auto(id: string, fn: () => string) {
    const n = this.add(id, 'effect', id, 'createEffect()');
    this.disposers.push(createEffect(() => {
      this.readBuf.length = 0;
      const out = fn();
      for (const r of this.readBuf.splice(0)) if (!n.deps.includes(r.id)) n.deps.push(r.id);
      n.runs++; n.value = out;
      this.onRun(n);
    }));
  }

  dispose() { for (const d of this.disposers.splice(0)) { try { d(); } catch { /* ignore */ } } }
}

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

interface Built { stage?: HTMLElement; tick?: () => void; physics?: boolean }
interface Preset { id: string; name: string; blurb: string; build(L: Loom): Built }

const money = (v: number) => typeof v === 'number' ? '$' + v.toFixed(2) : '…';

const PRESETS: Preset[] = [
  {
    id: 'cart', name: 'Shopping cart',
    blurb: 'A diamond: <code>total</code> depends on <code>discounted</code> both directly and through <code>tax</code>. <code>freeShip</code> is a boolean, so its effect only fires when the threshold is crossed. <code>theme</code> lives in the same graph but shares nothing with the cart.',
    build(L) {
      const price = L.source('price', 24, { kind: 'range', min: 1, max: 120, step: 1, fmt: money });
      const qty = L.source('qty', 3, { kind: 'range', min: 1, max: 12, step: 1 });
      const discount = L.source('discount', 10, { kind: 'range', min: 0, max: 50, step: 5, fmt: v => v + '%' });
      const taxRate = L.source('taxRate', 0.08, { kind: 'range', min: 0, max: 0.25, step: 0.01, fmt: v => (v * 100).toFixed(0) + '%' });
      const currency = L.source('currency', 'USD', { kind: 'choice', options: ['USD', 'EUR', 'JPY', 'GBP'] });
      const theme = L.source('theme', 'dusk', { kind: 'choice', options: ['dusk', 'dawn', 'neon'], unrelated: true });

      const subtotal = L.derive('subtotal', [price, qty], (p: number, q: number) => p * q, money);
      const discounted = L.derive('discounted', [subtotal, discount], (s: number, d: number) => s * (1 - d / 100), money);
      const tax = L.derive('tax', [discounted, taxRate], (s: number, r: number) => s * r, money);
      const total = L.derive('total', [discounted, tax], (s: number, t: number) => s + t, money);
      const label = L.derive('label', [total, currency], (t: number, c: string) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(c === 'JPY' ? t * 150 : c === 'EUR' ? t * 0.92 : c === 'GBP' ? t * 0.79 : t), (s: string) => s);
      const freeShip = L.derive('freeShip', [subtotal], (s: number) => s >= 100);
      const palette = L.derive('palette', [theme], (t: string) => ({ dusk: '#b28cff', dawn: '#ffb86b', neon: '#5cf2c1' } as Record<string, string>)[t], s => s);

      const stage = document.createElement('div');
      stage.className = 'sl-receipt';
      stage.innerHTML = `<div class="sl-rc-total">…</div><div class="sl-rc-ship"></div><div class="sl-rc-log"></div>`;
      const [tEl, shipEl, logEl] = Array.from(stage.children) as HTMLElement[];
      L.effect('render', label, (v: string | undefined) => { tEl.textContent = v ?? '…'; }, v => String(v ?? '…'));
      L.effect('banner', freeShip, (v: boolean | undefined) => {
        shipEl.textContent = v ? 'free shipping unlocked' : 'add ' + money(Math.max(0, 100 - (subtotal.peek() ?? 0))) + ' for free shipping';
        shipEl.classList.toggle('on', !!v);
      });
      L.effect('paint', palette, (c: string | undefined) => { if (c) stage.style.setProperty('--rc', c); });
      L.auto('audit', () => {
        const s = `${qty.value}× → ${label.value ?? '…'}`;
        logEl.textContent = 'audit: ' + s;
        return s.length > 16 ? s.slice(0, 15) + '…' : s;
      });
      return { stage };
    },
  },
  {
    id: 'physics', name: 'Bouncing ball',
    blurb: 'One integration step per frame: <code>y, vy, g, dt, e</code> feed <code>vy1 → y1 → bounce</code>, and the loop writes <code>bounce</code> back into <code>y</code> and <code>vy</code> inside <code>batch()</code>. <code>hue</code> only feeds the ball\'s colour, so its counter stays put while the ball flies. Watch the ratios too: <code>batch()</code> defers the two writes and flushes them as a single coordinated propagation wave, so <code>y1</code> and <code>bounce</code> each recompute exactly once per frame even though both of their inputs changed.',
    build(L) {
      const y = L.source('y', 0.9, { kind: 'range', min: 0, max: 1, step: 0.01 });
      const vy = L.source('vy', 0, { kind: 'range', min: -3, max: 3, step: 0.01 });
      const g = L.source('g', -4, { kind: 'range', min: -12, max: 0, step: 0.1 });
      const dt = L.source('dt', 0.016, { kind: 'range', min: 0.004, max: 0.04, step: 0.002 });
      const e = L.source('e', 0.86, { kind: 'range', min: 0.3, max: 1, step: 0.01 });
      const hue = L.source('hue', 280, { kind: 'range', min: 0, max: 360, step: 1, unrelated: true });

      const vy1 = L.derive('vy1', [vy, g, dt], (v: number, gg: number, d: number) => v + gg * d);
      const y1 = L.derive('y1', [y, vy1, dt], (p: number, v: number, d: number) => p + v * d);
      const bounce = L.derive('bounce', [y1, vy1, e], (p: number, v: number, k: number) => p < 0 ? { y: -p * k, vy: -v * k } : { y: p, vy: v },
        (b: { y: number; vy: number }) => `y ${fmtAny(b.y)}`);
      const energy = L.derive('energy', [y, vy, g], (p: number, v: number, gg: number) => 0.5 * v * v + Math.abs(gg) * p);
      const color = L.derive('color', [hue], (h: number) => `hsl(${h} 90% 65%)`, s => s.replace(/ 90% 65%/, ''));

      const stage = document.createElement('div');
      stage.className = 'sl-ball';
      stage.innerHTML = `<svg viewBox="0 0 120 200" preserveAspectRatio="xMidYMid meet"><line x1="10" x2="110" y1="190" y2="190" class="floor"/><circle cx="60" cy="20" r="10" class="ball"/></svg><div class="sl-energy"><i></i></div>`;
      const ball = stage.querySelector('circle')!;
      const bar = stage.querySelector('.sl-energy i') as HTMLElement;
      L.effect('draw', bounce, (b: { y: number; vy: number } | undefined) => { if (b && Number.isFinite(b.y)) ball.setAttribute('cy', String(180 - Math.min(1.1, b.y) * 160)); }, b => b ? fmtAny(b.y) : '…');
      L.effect('meter', energy, (v: number | undefined) => { bar.style.height = Math.min(100, (v ?? 0) * 25) + '%'; });
      L.effect('tint', color, (c: string | undefined) => { if (c) ball.style.fill = c; });

      const tick = () => {
        const b = bounce.peek();
        if (!b || !Number.isFinite(b.y) || !Number.isFinite(b.vy)) return;
        const resting = Math.abs(b.vy) < 0.08 && b.y < 0.01;
        void batch(async () => {
          // once the ball has settled, pick it back up so the demo keeps going
          y.value = resting ? 0.95 : Math.round(b.y * 1e4) / 1e4;
          vy.value = resting ? 0 : b.vy;
        });
      };
      return { stage, tick, physics: true };
    },
  },
  {
    id: 'thermo', name: 'Thermostat',
    blurb: 'Equality cutoff in action: drag <code>celsius</code> and <code>fahrenheit</code>/<code>kelvin</code> recompute every time, but <code>isHot</code> returns the same boolean most of the time, so <code>advice</code> and the <code>alert</code> effect stay still until you cross the threshold.',
    build(L) {
      const c = L.source('celsius', 22, { kind: 'range', min: -20, max: 50, step: 1, fmt: v => v + '°C' });
      const th = L.source('threshold', 30, { kind: 'range', min: 15, max: 40, step: 1, fmt: v => v + '°C' });
      const hum = L.source('humidity', 55, { kind: 'range', min: 5, max: 100, step: 5, fmt: v => v + '%', unrelated: false });
      const units = L.source('units', 'metric', { kind: 'choice', options: ['metric', 'imperial'], unrelated: true });
      const f = L.derive('fahrenheit', [c], (x: number) => x * 9 / 5 + 32);
      const k = L.derive('kelvin', [c], (x: number) => x + 273.15);
      const hot = L.derive('isHot', [c, th], (x: number, t: number) => x >= t);
      const advice = L.derive('advice', [hot], (h: boolean) => h ? 'open windows' : 'all good', s => s);
      const dew = L.derive('dewPoint', [c, hum], (t: number, h: number) => t - (100 - h) / 5);
      const unitLbl = L.derive('unitLabel', [units], (u: string) => u === 'metric' ? '°C' : '°F', s => s);

      const stage = document.createElement('div');
      stage.className = 'sl-thermo';
      stage.innerHTML = `<div class="sl-th-big">…</div><div class="sl-th-adv"></div><div class="sl-th-k"></div>`;
      const [big, adv, kel] = Array.from(stage.children) as HTMLElement[];
      let unitNow = '°C';
      L.effect('display', f, (v: number | undefined) => { if (v !== undefined) big.textContent = unitNow === '°C' ? `${c.peek()}°C` : `${v.toFixed(1)}°F`; });
      L.effect('alert', advice, (v: string | undefined) => { adv.textContent = v ?? ''; adv.classList.toggle('on', v === 'open windows'); });
      L.effect('lab', k, (v: number | undefined) => { kel.textContent = v !== undefined ? `${v.toFixed(2)} K` : ''; });
      L.effect('dewLog', dew, () => {});
      L.effect('unitSwap', unitLbl, (u: string | undefined) => { unitNow = u ?? '°C'; big.textContent = unitNow === '°C' ? `${c.peek()}°C` : `${(f.peek() ?? 0).toFixed(1)}°F`; });
      return { stage };
    },
  },
];

/* ------------------------------------------------------------------ */
/* Code shown beside the DOM demo — it is exactly what runs below.     */
/* ------------------------------------------------------------------ */

const DOM_CODE = `import { signal, computed } from '@johnhenry/signalle';
import { bind, computedBind, bindAttribute,
         bindClass, bindStyle, bindList } from '@johnhenry/signalle/dom';

// two-way: <input> ⇄ signal
const name  = bind(nameInput,  { property: 'value', events: ['input'], twoWay: true });
const level = bind(levelInput, { property: 'value', events: ['input'], twoWay: true });
const hot   = bind(hotInput,   { property: 'checked', events: ['change'],
                                 twoWay: true, render: v => !!v });
const tags  = bind(tagsInput,  { property: 'value', events: ['input'], twoWay: true });
name.value = 'Ada'; level.value = '62'; tags.value = 'fast, tiny, fine-grained';

// signal → text
computedBind(title, [name], async n => \`Hello, \${n || 'stranger'}\`);
const pct = computed(level, async v => Number(v) || 0);
computedBind(pctText, pct, async p => p + '%');

// signal → style, attribute, class
bindStyle(bar, 'width', pct, '%');
const hue = computed(pct, async p => Math.round(280 - p * 2.2));
bindStyle(card, '--card-hue', hue);
bindAttribute(meter, 'aria-valuenow', pct);
const tier = computed(pct, async p => p > 80 ? 'max' : p > 40 ? 'mid' : 'low');
bindAttribute(card, 'data-tier', tier);
computedBind(tierLabel, tier, async t => \`tier: \${t}\`);
bindClass(card, 'is-hot', hot);

// signal → keyed list (nodes are reused by id)
const items = computed(tags, async t => String(t ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)
  .filter((s, i, all) => all.indexOf(s) === i)   // ids must be unique
  .map(label => ({ id: label, label })));
bindList(tagList, items, item => {
  const li = document.createElement('li');
  li.textContent = item.label;
  return li;
});`;

const EDITOR_PRESETS: { name: string; code: string }[] = [
  {
    name: 'basics', code: `const first = signal('Ada');
const last  = signal('Lovelace');
const full  = computed([first, last], async (f, l) => \`\${f} \${l}\`);

effect(full, v => log('full name:', v));
createEffect(() => log('auto-tracked, reads first only:', first.value));

await sleep(10);
first.value = 'Grace';
await sleep(10);
last.value = 'Hopper';   // the first-only effect does NOT re-run
await sleep(10);
log('done. full =', full.value);`,
  },
  {
    name: 'glitch vs batch', code: `const a = signal(1), b = signal(2), c = signal(3);
const sum = computed([a, b, c], async (x, y, z) => x + y + z);
effect(sum, v => log('sum saw', v));
await sleep(20);

log('--- three plain writes');
a.value = 10; b.value = 20; c.value = 30;
await sleep(20);

log('--- same writes inside batch()');
await batch(async () => { a.value = 100; b.value = 200; c.value = 300; });
await sleep(20);`,
  },
  {
    name: 'equality cutoff', code: `const n = signal(1);
const isEven = computed(n, async v => v % 2 === 0);
const parity = computed(isEven, async e => (e ? 'even' : 'odd'));
effect(parity, v => log('parity effect ran:', v));
await sleep(10);

for (const v of [3, 5, 7, 8, 10, 11]) {
  n.value = v;            // only flips of isEven reach the effect
  await sleep(5);
}`,
  },
  {
    name: 'untrack + cleanup', code: `const count = signal(0);
const label = signal('clicks');

const stop = createEffect(() => {
  const l = untrack(() => label.value); // read without subscribing
  log(\`\${count.value} \${l}\`);
});

await sleep(5); label.value = 'taps';   // no re-run: untracked
await sleep(5); count.value = 1;        // re-runs, sees 'taps'
await sleep(5); stop();
count.value = 2;                         // nobody listening
await sleep(5);
log('stopped cleanly');`,
  },
];

// Persisted: which loom preset is loaded, whether it's autoplaying, and
// which "write your own" editor snippet is active.
const STATE_DEFAULTS = { preset: PRESETS[0].id, autoplay: true, editor: EDITOR_PRESETS[0].name };

/* ------------------------------------------------------------------ */

const playground: Playground = {
  id: 'signalle',
  title: 'Signalle Loom',
  pkg: '@johnhenry/signalle',
  hue: 280,
  blurb: 'Fine-grained signals with optional DOM bindings. Only what changed re-runs, and you can watch it.',
  docs: 'https://opensource.johnhenry.me/signalle/',

  mount(host) {
    const ac = new AbortController();
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, ev: K | string, fn: (e: any) => void) =>
      el.addEventListener(ev, fn, { signal: ac.signal });
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => { const t = window.setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    let raf = 0;
    let alive = true;

    const root = document.createElement('div');
    root.className = 'pg-signalle';
    root.innerHTML = `
      <div class="panel sl-intro">
        <p>Every box below is a real <code>signal()</code>, <code>computed()</code>, <code>effect()</code> or
        <code>createEffect()</code> from <b>@johnhenry/signalle</b>. The edges are not drawn from a config:
        each instance's <code>value</code> accessor is wrapped, and whatever Signalle reads right before it calls a compute
        function becomes an arrow. Change a source and the nodes that actually re-run flash; everything else dims and its counter
        stays put.</p>
      </div>

      <section class="panel sl-loom">
        <div class="sl-bar">
          <div class="sl-presets"></div>
          <span class="sl-spacer"></span>
          <label class="sl-toggle"><input type="checkbox" class="sl-auto" checked> <span>autoplay</span></label>
          <button class="btn sl-reset">reset counters</button>
          <button class="btn sl-copy-link" type="button">🔗 copy link</button>
        </div>
        <p class="sl-blurb"></p>
        <div class="sl-loom-grid">
          <div class="sl-graph-wrap"><svg class="sl-graph"></svg>
            <div class="sl-legend"><span class="k-source">signal</span><span class="k-computed">computed</span><span class="k-effect">effect</span><span class="k-count">n = runs</span></div>
          </div>
          <div class="sl-side">
            <div class="sl-controls"></div>
            <div class="sl-stage"></div>
          </div>
        </div>
        <div class="sl-summary stat">waiting for a change…</div>
      </section>

      <section class="panel sl-batch">
        <h2>Batching: three writes, how many reactions?</h2>
        <p class="sl-muted">Three sources <code>a</code>, <code>b</code>, <code>c</code> feed <code>sum = computed([a, b, c])</code>.
        Watchers: an <code>effect(sum)</code> and an auto-tracked <code>createEffect</code>. Each button writes new values to all three.</p>
        <div class="grid-2">
          <div>
            <pre class="code sl-small">// plain
a.value = x; b.value = y; c.value = z;

// batched
await batch(async () => {
  a.value = x; b.value = y; c.value = z;
});</pre>
            <div class="sl-batch-btns">
              <button class="btn sl-nobatch">write without batch</button>
              <button class="btn primary sl-yesbatch">write inside batch()</button>
            </div>
          </div>
          <div>
            <div class="sl-table-wrap">
              <table class="sl-table">
                <thead><tr><th>mode</th><th>sum recomputes</th><th>effect(sum) runs</th><th>values effect saw</th><th>createEffect runs</th></tr></thead>
                <tbody class="sl-batch-rows"><tr class="sl-empty"><td colspan="5">click a button…</td></tr></tbody>
              </table>
            </div>
            <p class="sl-muted sl-small-p">Without <code>batch()</code>, the first write starts a recompute before the others land, so
            <code>effect(sum)</code> can observe an intermediate (glitch) total. <code>batch()</code> queues the three signals and, on flush, drives
            them through a single coordinated propagation wave, so <code>sum</code> recomputes exactly once no matter how many of its
            dependencies changed. <code>createEffect</code> coalesces its re-runs on a macrotask, so it only ever sees the settled value.</p>
          </div>
        </div>
      </section>

      <section class="panel sl-dom">
        <h2>DOM bindings: signals straight into elements</h2>
        <p class="sl-muted">Using <code>@johnhenry/signalle/dom</code>. No render function, no diffing: each binding is one effect that writes one property. The mutation feed at the bottom shows exactly which DOM writes happened.</p>
        <div class="grid-2">
          <div class="sl-dom-live">
            <div class="sl-dom-inputs">
              <label class="field">name <input class="d-name" type="text"></label>
              <label class="field">level <input class="d-level" type="range" min="0" max="100"></label>
              <label class="field">tags (comma separated) <input class="d-tags" type="text"></label>
              <label class="sl-toggle"><input class="d-hot" type="checkbox"> <span>hot</span></label>
            </div>
            <div class="sl-card d-card">
              <h3 class="d-title"></h3>
              <div class="sl-meter d-meter" role="meter" aria-valuemin="0" aria-valuemax="100"><div class="d-bar"></div></div>
              <div class="sl-card-row"><span class="d-pct"></span><span class="d-tier-label"></span></div>
              <ul class="d-tags-list"></ul>
            </div>
            <div class="sl-muts"></div>
          </div>
          <pre class="code sl-dom-code"></pre>
        </div>
      </section>

      <section class="panel sl-editor">
        <h2>Write your own</h2>
        <p class="sl-muted">In scope: <code>signal</code>, <code>computed</code>, <code>effect</code>, <code>createEffect</code>, <code>batch</code>, <code>untrack</code>, plus
        <code>log(...)</code> and <code>await sleep(ms)</code>. Every <code>effect</code>/<code>createEffect</code> run is logged automatically. Cmd/Ctrl+Enter runs.</p>
        <div class="sl-ed-presets"></div>
        <div class="grid-2">
          <textarea class="code sl-code" spellcheck="false"></textarea>
          <div class="sl-ed-right">
            <div class="sl-ed-bar"><button class="btn primary sl-run">run</button><span class="stat sl-ed-stat"></span></div>
            <pre class="code sl-log"></pre>
          </div>
        </div>
      </section>

      <section class="panel sl-explain">
        <h2>How Signalle tracks dependencies</h2>
        <p>The README credits "linked lists for dependencies" as more efficient than Set-based tracking, and the source shows what that means.
        Every <code>Signal</code> owns two doubly linked lists: <code>#computedDeps</code> (computeds that derive from it) and
        <code>#effects</code> (subscriber callbacks). Subscribing appends a node at the tail in O(1) and hands back a closure that unlinks it;
        disposing clears both lists. When you write <code>.value</code>, the signal bumps a version counter and walks <code>#computedDeps</code>
        first, asking each to <code>recompute()</code>, then walks <code>#effects</code>. A <code>Computed</code> declares its dependencies up front as an
        array, remembers the version it last saw <em>per dependency</em>, and skips work when none has moved, which is what keeps the diamond in the cart
        preset from computing <code>total</code> twice. If a recompute yields an <code>Object.is</code>-equal value, the setter returns early and nothing
        downstream is notified; that is the equality cutoff you see stopping <code>freeShip</code> and <code>isHot</code>. <code>createEffect</code>
        is the one auto-tracked primitive: a module-level tracker records each <code>.value</code> read while the effect runs, and re-runs are
        coalesced with <code>setTimeout(0)</code>. <code>batch()</code> flips a static flag so writes are queued on a shared linked list and flushed once when
        the outermost batch finishes.</p>
      </section>`;
    host.appendChild(root);
    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;

    /* ================= Loom ================= */
    const svg = $<SVGSVGElement>('.sl-graph');
    const controlsEl = $('.sl-controls');
    const stageEl = $('.sl-stage');
    const summaryEl = $('.sl-summary');
    const blurbEl = $('.sl-blurb');
    const autoBox = $<HTMLInputElement>('.sl-auto');
    const presetsEl = $('.sl-presets');
    const copyLinkBtn = $<HTMLButtonElement>('.sl-copy-link');

    // ---- deep link: preset, autoplay, editor snippet ----
    const state = readState(STATE_DEFAULTS);
    let autoplayWanted = state.autoplay;
    const syncUrl = () => writeState(state, STATE_DEFAULTS);
    on(copyLinkBtn, 'click', async () => {
      syncUrl();
      await wait(200); // writeState is debounced
      await copyLink();
      copyLinkBtn.textContent = '✓ copied';
      later(() => { copyLinkBtn.textContent = '🔗 copy link'; }, 1400);
    });

    let loom: Loom | null = null;
    let built: Built = {};
    let epoch: { cause: string; ran: Set<string>; timer: number } | null = null;
    let epochFade = 0;
    let autoTimer = 0;

    const flash = (n: GNode) => {
      if (!n.g) return;
      n.g.classList.remove('flash');
      void (n.g as unknown as HTMLElement).getBoundingClientRect();
      n.g.classList.add('flash', 'ran');
      if (n.cntEl) n.cntEl.textContent = String(n.runs);
      if (n.valEl) n.valEl.textContent = n.value;
      svg.querySelectorAll(`path[data-to="${n.id}"]`).forEach(p => {
        p.classList.remove('flow'); void (p as unknown as HTMLElement).getBoundingClientRect(); p.classList.add('flow', 'ran');
      });
    };

    const endEpoch = () => {
      if (!epoch || !loom) return;
      const ran = epoch.ran;
      const all = [...loom.nodes.values()];
      const skipped = all.filter(n => !ran.has(n.id));
      const ranNames = all.filter(n => ran.has(n.id) && n.kind !== 'source').map(n => n.id);
      summaryEl.innerHTML = `<b>${esc(epoch.cause)}</b> → re-ran <b>${ranNames.length}</b>: ${ranNames.map(esc).join(', ') || 'nothing (value unchanged)'}
        <span class="sl-skip">· untouched ${skipped.length}: ${skipped.map(n => esc(n.id)).join(', ')}</span>`;
      epoch = null;
      clearTimeout(epochFade);
      epochFade = later(() => {
        svg.classList.remove('epoch');
        svg.querySelectorAll('.ran, .flow').forEach(e => e.classList.remove('ran', 'flow'));
      }, 900);
    };

    const noteActivity = (n: GNode, cause?: string) => {
      if (built.physics && playing) return; // continuous stream: no per-change summary
      if (!epoch) {
        clearTimeout(epochFade);
        svg.querySelectorAll('.ran, .flow').forEach(e => e.classList.remove('ran', 'flow'));
        svg.classList.add('epoch');
        epoch = { cause: cause ?? n.id, ran: new Set(), timer: 0 };
      }
      epoch.ran.add(n.id);
      clearTimeout(epoch.timer);
      epoch.timer = later(endEpoch, 140);
    };

    let pinnedNode: string | null = null;
    function layout(L: Loom) {
      const nodes = [...L.nodes.values()];
      const depth = new Map<string, number>();
      const d = (n: GNode, seen = new Set<string>()): number => {
        if (depth.has(n.id)) return depth.get(n.id)!;
        if (seen.has(n.id)) return 0;
        seen.add(n.id);
        const v = n.deps.length ? 1 + Math.max(...n.deps.map(id => d(L.nodes.get(id)!, seen))) : 0;
        depth.set(n.id, v);
        return v;
      };
      nodes.forEach(n => (n.col = d(n)));
      // effects go in the last column so the right edge reads as "the outside world"
      const maxCol = Math.max(...nodes.filter(n => n.kind !== 'effect').map(n => n.col));
      nodes.forEach(n => { if (n.kind === 'effect') n.col = maxCol + 1; });
      const cols: GNode[][] = [];
      nodes.forEach(n => (cols[n.col] ??= []).push(n));
      // barycentric ordering, a couple of sweeps
      cols[0]?.forEach((n, i) => (n.row = i));
      for (let pass = 0; pass < 3; pass++) {
        for (let c = 1; c < cols.length; c++) {
          const col = cols[c] ?? [];
          col.forEach(n => {
            const rs = n.deps.map(id => L.nodes.get(id)!.row);
            (n as any)._bc = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : n.row;
          });
          col.sort((a, b) => (a as any)._bc - (b as any)._bc);
          let last = -1;
          col.forEach(n => { n.row = Math.max(Math.round((n as any)._bc), last + 1); last = n.row; });
        }
      }
      const colW = 150, rowH = 62, w = 118, h = 46, padX = 12, padY = 14;
      let maxRow = 0;
      nodes.forEach(n => { n.x = padX + n.col * colW; n.y = padY + n.row * rowH; maxRow = Math.max(maxRow, n.row); });
      const W = padX * 2 + (cols.length - 1) * colW + w;
      const H = padY * 2 + maxRow * rowH + h;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      // Render at (approximately) 1 SVG user-unit == 1 CSS px, never smaller: with
      // width:100% + aspect-ratio, a graph with many columns (deep dependency chains)
      // got squeezed to fit the panel width, shrinking 12px node-label text down to
      // ~7px in the process. Below the 620px floor, stretch up to fill the panel
      // (small graphs still look intentional); above it, render at native size and
      // let .sl-graph-wrap's overflow-x:auto handle the scroll instead of the font.
      const renderW = Math.max(W, 620);
      svg.style.width = `${renderW}px`;
      svg.style.height = `${Math.round((H * renderW) / W)}px`;
      svg.innerHTML = `<defs><marker id="sl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="sl-arrowhead"/></marker></defs>`;
      const edges = document.createElementNS(SVGNS, 'g');
      svg.appendChild(edges);
      nodes.forEach(n => n.deps.forEach(id => {
        const a = L.nodes.get(id)!;
        const x1 = a.x + w, y1 = a.y + h / 2, x2 = n.x, y2 = n.y + h / 2, mx = (x1 + x2) / 2;
        const p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 2},${y2}`);
        p.setAttribute('marker-end', 'url(#sl-arrow)');
        p.dataset.to = n.id;
        p.dataset.from = a.id;
        edges.appendChild(p);
      }));
      nodes.forEach(n => {
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('class', `sl-node k-${n.kind}${L.controls.find(c => c.id === n.id && c.unrelated) ? ' unrelated' : ''}`);
        g.setAttribute('transform', `translate(${n.x},${n.y})`);
        const rx = n.kind === 'source' ? 23 : n.kind === 'effect' ? 4 : 10;
        g.innerHTML = `<rect class="halo" x="-4" y="-4" width="${w + 8}" height="${h + 8}" rx="${rx + 4}"/>
          <rect class="body" width="${w}" height="${h}" rx="${rx}"/>
          <text class="lbl" x="12" y="18">${esc(n.label)}</text>
          <text class="val" x="12" y="36"></text>
          <circle class="cbg" cx="${w - 14}" cy="14" r="10"/>
          <text class="cnt" x="${w - 14}" y="18" text-anchor="middle"></text>
          <title>${esc(n.id)} (${n.sub ?? n.kind})</title>`;
        n.g = g;
        n.valEl = g.querySelector('.val') as SVGTextElement;
        n.cntEl = g.querySelector('.cnt') as SVGTextElement;
        n.valEl.textContent = n.value;
        n.cntEl.textContent = String(n.runs);
        svg.appendChild(g);
        on(g, 'mouseenter', () => { if (!pinnedNode) { svg.classList.add('hovering'); highlightChain(L, n.id, true); } });
        on(g, 'mouseleave', () => {
          if (pinnedNode) { svg.classList.add('hovering'); highlightChain(L, pinnedNode, true); }
          else { svg.classList.remove('hovering'); highlightChain(L, n.id, false); }
        });
        // hover has no touch equivalent, so tapping a node pins the same
        // dependency-chain highlight (tap again, or tap another node, to
        // change it); this also gives mouse users a way to lock it in place.
        on(g, 'click', () => {
          if (pinnedNode === n.id) { pinnedNode = null; svg.classList.remove('hovering'); highlightChain(L, n.id, false); }
          else { pinnedNode = n.id; svg.classList.add('hovering'); highlightChain(L, n.id, true); }
        });
      });
    }

    function highlightChain(L: Loom, id: string, onFlag: boolean) {
      const down = new Set<string>([id]);
      let grew = true;
      while (grew) { grew = false; for (const n of L.nodes.values()) if (!down.has(n.id) && n.deps.some(d => down.has(d))) { down.add(n.id); grew = true; } }
      const up = new Set<string>([id]);
      grew = true;
      while (grew) { grew = false; for (const n of L.nodes.values()) if (up.has(n.id)) for (const d of n.deps) if (!up.has(d)) { up.add(d); grew = true; } }
      for (const n of L.nodes.values()) n.g?.classList.toggle('chain', onFlag && (down.has(n.id) || up.has(n.id)));
      svg.querySelectorAll('path[data-to]').forEach(p => {
        const el = p as SVGPathElement;
        const inChain = (down.has(el.dataset.to!) && down.has(el.dataset.from!)) || (up.has(el.dataset.to!) && up.has(el.dataset.from!));
        el.classList.toggle('chain', onFlag && inChain);
      });
    }

    function buildControls(L: Loom) {
      controlsEl.innerHTML = '';
      for (const c of L.controls) {
        const row = document.createElement('label');
        row.className = 'sl-ctl' + (c.unrelated ? ' unrelated' : '');
        const fmt = c.fmt ?? fmtAny;
        if (c.kind === 'range') {
          row.innerHTML = `<span class="nm">${esc(c.id)}</span><input type="range" min="${c.min}" max="${c.max}" step="${c.step}"><output></output>`;
          const inp = row.querySelector('input')!;
          inp.value = String(c.sig.peek());
          on(inp, 'input', () => { stopAuto(); c.sig.value = Number(inp.value); });
          c.input = inp;
        } else {
          row.innerHTML = `<span class="nm">${esc(c.id)}</span><select>${c.options!.map(o => `<option>${esc(o)}</option>`).join('')}</select><output></output>`;
          const sel = row.querySelector('select')!;
          sel.value = String(c.sig.peek());
          on(sel, 'change', () => { stopAuto(); c.sig.value = sel.value; });
          c.input = sel;
        }
        c.out = row.querySelector('output')!;
        c.out.textContent = fmt(c.sig.peek());
        controlsEl.appendChild(row);
      }
      if (built.physics) {
        const row = document.createElement('div');
        row.className = 'sl-phys-btns';
        row.innerHTML = `<button class="btn primary sl-play">pause</button><button class="btn sl-step">step</button><button class="btn sl-drop">drop</button>`;
        controlsEl.appendChild(row);
        const play = row.querySelector('.sl-play') as HTMLButtonElement;
        on(play, 'click', () => { setPlaying(!playing); autoplayWanted = playing; state.autoplay = playing; syncUrl(); });
        on(row.querySelector('.sl-step')!, 'click', () => { setPlaying(false); built.tick?.(); });
        on(row.querySelector('.sl-drop')!, 'click', () => { const L2 = loom!; const y = L2.controls.find(c => c.id === 'y')!.sig; const vy = L2.controls.find(c => c.id === 'vy')!.sig; void batch(async () => { y.value = 0.95; vy.value = 0; }); });
      }
    }

    let playing = false;
    function setPlaying(p: boolean) {
      playing = p;
      autoBox.checked = p;
      const btn = root.querySelector('.sl-play');
      if (btn) btn.textContent = p ? 'pause' : 'play';
      cancelAnimationFrame(raf);
      if (p) {
        svg.classList.remove('epoch');
        summaryEl.innerHTML = 'streaming: the loop writes <b>y</b> and <b>vy</b> in one <b>batch()</b> per frame. Pause, then drag <b>hue</b> to see the physics nodes stay dark.';
        const loop = () => { if (!alive || !playing) return; built.tick?.(); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
      }
    }

    function stopAuto() {
      if (built.physics) { if (playing) setPlaying(false); return; }
      autoBox.checked = false;
      clearTimeout(autoTimer);
    }
    function scheduleAuto() {
      clearTimeout(autoTimer);
      if (!autoBox.checked || !loom || built.physics) return;
      autoTimer = later(() => {
        if (!loom) return;
        const cs = loom.controls;
        const c = cs[Math.floor(Math.random() * cs.length)];
        if (c.kind === 'range') {
          const steps = Math.round((c.max! - c.min!) / c.step!);
          c.sig.value = +(c.min! + Math.floor(Math.random() * (steps + 1)) * c.step!).toFixed(4);
        } else {
          const opts = c.options!.filter(o => o !== c.sig.peek());
          c.sig.value = opts[Math.floor(Math.random() * opts.length)];
        }
        scheduleAuto();
      }, 1700);
    }
    on(autoBox, 'change', () => {
      autoplayWanted = autoBox.checked;
      state.autoplay = autoplayWanted;
      syncUrl();
      if (built.physics) setPlaying(autoBox.checked);
      else scheduleAuto();
    });

    function loadPreset(p: Preset) {
      cancelAnimationFrame(raf);
      playing = false;
      clearTimeout(autoTimer);
      if (epoch) clearTimeout(epoch.timer);
      epoch = null;
      loom?.dispose();
      const L = new Loom();
      loom = L;
      stageEl.innerHTML = '';
      presetsEl.querySelectorAll('button').forEach(b => b.classList.toggle('primary', b.dataset.id === p.id));
      blurbEl.innerHTML = p.blurb;
      try {
        built = p.build(L);
      } catch (err) {
        stageEl.innerHTML = `<pre class="code">${esc(String((err as Error)?.stack ?? err))}</pre>`;
        return;
      }
      if (built.stage) stageEl.appendChild(built.stage);
      let settled = false;
      L.onRun = n => { if (loom !== L) return; if (settled) noteActivity(n); flash(n); };
      L.onWrite = (n, v) => {
        if (loom !== L) return;
        const c = L.controls.find(c => c.id === n.id);
        if (c) {
          if (c.input && c.input.value !== String(v)) c.input.value = String(v);
          if (c.out) c.out.textContent = (c.fmt ?? fmtAny)(v);
        }
        noteActivity(n, `${n.id} ← ${(c?.fmt ?? fmtAny)(v)}`);
        flash(n);
      };
      // Initial computations are async; lay out once they settle so edges exist.
      layout(L);
      buildControls(L);
      summaryEl.textContent = 'initial run: every node computed once. Now change a source.';
      later(() => {
        if (loom !== L) return;
        settled = true;
        svg.classList.remove('epoch');
        layout(L); // refresh with any late-discovered edges and values
        if (built.physics) setPlaying(autoplayWanted);
        else { autoBox.checked = autoplayWanted; if (autoplayWanted) scheduleAuto(); }
      }, 60);
    }

    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = p.name;
      b.dataset.id = p.id;
      on(b, 'click', () => { loadPreset(p); state.preset = p.id; syncUrl(); });
      presetsEl.appendChild(b);
    });
    on($('.sl-reset'), 'click', () => {
      if (!loom) return;
      for (const n of loom.nodes.values()) { n.runs = 0; if (n.cntEl) n.cntEl.textContent = '0'; }
      summaryEl.textContent = 'counters reset.';
    });
    loadPreset(PRESETS.find(p => p.id === state.preset) ?? PRESETS[0]);

    /* ================= Batching ================= */
    const batchDisposers: (() => void)[] = [];
    {
      const a = signal(1), b = signal(2), c = signal(3);
      let rec = 0, eff = 0, auto = 0;
      let seen: number[] = [];
      const sum = computed([a, b, c], async (x: number, y: number, z: number) => { rec++; return x + y + z; });
      batchDisposers.push(() => sum.dispose());
      batchDisposers.push(effect(sum, (v: number | undefined) => { eff++; if (v !== undefined) seen.push(v); }));
      batchDisposers.push(createEffect(() => { void sum.value; auto++; }));
      const rows = $('.sl-batch-rows');
      let busy = false;
      let base = 3;
      const trial = async (useBatch: boolean) => {
        if (busy) return;
        busy = true;
        await wait(30);
        rec = 0; eff = 0; auto = 0; seen = [];
        base++;
        const [x, y, z] = [base * 10 + 1, base * 10 + 2, base * 10 + 3];
        if (useBatch) await batch(async () => { a.value = x; b.value = y; c.value = z; });
        else { a.value = x; b.value = y; c.value = z; }
        await wait(40);
        if (!alive) return;
        rows.querySelector('.sl-empty')?.remove();
        const tr = document.createElement('tr');
        tr.className = useBatch ? 'yes' : 'no';
        const final = x + y + z;
        tr.innerHTML = `<td>${useBatch ? 'batch()' : 'plain'}</td><td><b>${rec}</b></td><td><b>${eff}</b></td>
          <td>${seen.map(v => `<span class="${v === final ? 'ok' : 'glitch'}">${v}</span>`).join(' ')}</td><td><b>${auto}</b></td>`;
        rows.prepend(tr);
        while (rows.children.length > 6) rows.lastElementChild!.remove();
        busy = false;
      };
      on($('.sl-nobatch'), 'click', () => void trial(false));
      on($('.sl-yesbatch'), 'click', () => void trial(true));
      // Prefill both rows so the comparison is visible with zero clicks.
      void (async () => { await wait(80); await trial(false); await trial(true); })();
    }

    /* ================= DOM bindings ================= */
    const mo = new MutationObserver(records => {
      const box = $('.sl-muts');
      const lines = records.slice(-8).map(r => {
        const t = r.target as Element;
        const who = t.nodeType === 3 ? (t.parentElement?.className ?? 'text') : (t as Element).className?.toString?.() ?? t.nodeName;
        const tag = (who.split(' ').find((c: string) => c.startsWith('d-')) ?? who.split(' ')[0] ?? '').replace(/^d-/, '');
        if (r.type === 'attributes') return `attr   ${r.attributeName} on .${tag} = ${(t as Element).getAttribute(r.attributeName!) ?? '∅'}`;
        if (r.type === 'childList') return `nodes  +${r.addedNodes.length} −${r.removedNodes.length} in .${tag}`;
        return `text   .${tag}`;
      });
      for (const l of lines) {
        const div = document.createElement('div');
        div.textContent = l;
        box.prepend(div);
      }
      while (box.children.length > 7) box.lastElementChild!.remove();
    });
    try {
      $('.sl-dom-code').textContent = DOM_CODE;
      const nameInput = $<HTMLInputElement>('.d-name');
      const levelInput = $<HTMLInputElement>('.d-level');
      const hotInput = $<HTMLInputElement>('.d-hot');
      const tagsInput = $<HTMLInputElement>('.d-tags');
      const card = $('.d-card'), title = $('.d-title'), bar = $('.d-bar'), meter = $('.d-meter'), pctText = $('.d-pct'), tagList = $('.d-tags-list');
      const tierLabel = $('.d-tier-label');

      const name = bind<string>(nameInput, { property: 'value' as any, events: ['input'], twoWay: true });
      const level = bind<string>(levelInput, { property: 'value' as any, events: ['input'], twoWay: true });
      const hot = bind<boolean>(hotInput, { property: 'checked' as any, events: ['change'], twoWay: true, render: (v: unknown) => !!v as any });
      const tags = bind<string>(tagsInput, { property: 'value' as any, events: ['input'], twoWay: true });
      name.value = 'Ada'; level.value = '62'; tags.value = 'fast, tiny, fine-grained';

      computedBind(title, [name], async (n: string) => `Hello, ${n || 'stranger'}`);
      const pct = computed(level, async (v: string) => Number(v) || 0);
      computedBind(pctText, pct, async (p: number) => p + '%');
      bindStyle(bar, 'width', pct, '%');
      const hue = computed(pct, async (p: number) => Math.round(280 - p * 2.2));
      bindStyle(card, '--card-hue', hue);
      bindAttribute(meter, 'aria-valuenow', pct);
      const tier = computed(pct, async (p: number) => p > 80 ? 'max' : p > 40 ? 'mid' : 'low');
      bindAttribute(card, 'data-tier', tier);
      computedBind(tierLabel, tier, async (t: string) => `tier: ${t}`);
      bindClass(card as any, 'is-hot', hot);
      const items = computed(tags, async (t: string) => String(t ?? '')
        .split(',').map(s => s.trim()).filter(Boolean)
        .filter((s, i, arr) => arr.indexOf(s) === i)
        .map(label => ({ id: label, label })));
      bindList(tagList as any, items as any, (item: { id: string; label: string }) => {
        const li = document.createElement('li');
        li.textContent = item.label;
        return li;
      });
      later(() => mo.observe(card, { subtree: true, attributes: true, childList: true, characterData: true }), 120);
      // Nudge it once so the mutation feed isn't empty on arrival.
      later(() => { if (alive && document.activeElement !== levelInput) level.value = '74'; }, 900);
      later(() => { if (alive && document.activeElement !== hotInput) hot.value = true; }, 1500);
    } catch (err) {
      $('.sl-dom-live').innerHTML = `<pre class="code">${esc(String((err as Error)?.stack ?? err))}</pre>`;
    }

    /* ================= Editor ================= */
    const codeEl = $<HTMLTextAreaElement>('.sl-code');
    const logEl = $('.sl-log');
    const edStat = $('.sl-ed-stat');
    const edPresets = $('.sl-ed-presets');
    let gen = 0;
    let edDisposers: (() => void)[] = [];
    const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...a: unknown[]) => Promise<unknown>;

    const show = (v: unknown) => typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();

    const runEditor = async () => {
      const my = ++gen;
      edDisposers.splice(0).forEach(d => { try { d(); } catch { /* */ } });
      logEl.innerHTML = '';
      const t0 = performance.now();
      let effN = 0, runs = 0;
      const line = (cls: string, text: string) => {
        if (my !== gen || !alive) return;
        const div = document.createElement('div');
        div.className = cls;
        div.innerHTML = `<span class="t">${(performance.now() - t0).toFixed(1).padStart(6)}ms</span> ${esc(text)}`;
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
        edStat.innerHTML = `effects <b>${effN}</b> · effect runs <b>${runs}</b>`;
      };
      const api = {
        signal: signal,
        computed: (deps: any, fn: any) => { const c = computed(deps, fn); edDisposers.push(() => c.dispose()); return c; },
        effect: (sig: Sig, fn: (v: any) => void) => {
          const id = ++effN; let k = 0;
          const u = effect(sig, (v: any) => { if (my !== gen) return; k++; runs++; line('eff', `effect#${id} run ${k} (value ${show(v)})`); return fn(v); });
          edDisposers.push(u);
          return u;
        },
        createEffect: (fn: () => void) => {
          const id = ++effN; let k = 0;
          const u = createEffect(() => { if (my !== gen) return; k++; runs++; line('eff', `createEffect#${id} run ${k}`); fn(); });
          edDisposers.push(u);
          return u;
        },
        batch: batch,
        untrack: untrack,
        log: (...a: unknown[]) => line('user', a.map(show).join(' ')),
        sleep: (ms: number) => wait(ms),
      };
      try {
        const fn = new AsyncFunction(...Object.keys(api), codeEl.value);
        await fn(...Object.values(api));
        await wait(30);
        line('done', '✓ finished');
      } catch (err) {
        line('err', String((err as Error)?.message ?? err));
      }
    };
    on(window, 'unhandledrejection', (e: PromiseRejectionEvent) => {
      if (!alive) return;
      const msg = String(e.reason?.message ?? e.reason);
      const div = document.createElement('div');
      div.className = 'err';
      div.textContent = 'async error (inside a computed?): ' + msg;
      logEl.appendChild(div);
      e.preventDefault();
    });
    const startEditor = EDITOR_PRESETS.find(p => p.name === state.editor) ?? EDITOR_PRESETS[0];
    EDITOR_PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'btn' + (p.name === startEditor.name ? ' primary' : '');
      b.textContent = p.name;
      on(b, 'click', () => {
        edPresets.querySelectorAll('button').forEach(x => x.classList.remove('primary'));
        b.classList.add('primary');
        codeEl.value = p.code;
        state.editor = p.name;
        syncUrl();
        void runEditor();
      });
      edPresets.appendChild(b);
    });
    codeEl.value = startEditor.code;
    on($('.sl-run'), 'click', () => void runEditor());
    on(codeEl, 'keydown', (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void runEditor(); }
    });
    later(() => void runEditor(), 200);

    return () => {
      alive = false;
      gen++;
      ac.abort();
      cancelAnimationFrame(raf);
      timers.forEach(t => clearTimeout(t));
      timers.clear();
      if (epoch) clearTimeout(epoch.timer);
      loom?.dispose();
      loom = null;
      batchDisposers.forEach(d => { try { d(); } catch { /* */ } });
      edDisposers.forEach(d => { try { d(); } catch { /* */ } });
      mo.disconnect();
      root.remove();
    };
  },
};

export default playground;
