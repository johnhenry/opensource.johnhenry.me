import type { Playground } from '../registry';
import { ComplexNumber, Rotor4, Bivector4, Vec4, Symbolic, DualNumber, VectorCalculus, type Expr } from '@johnhenry/math';
import { handoffButton } from '../bus';
import { readState, writeState, copyLink } from '../state';
import './math.css';

/* ------------------------------------------------------------------ helpers */

/** Deep-linkable planet state (#/math?mode=…&preset=…&c=…&zoom=…). */
const DEFAULTS = {
  mode: 'fractal',
  preset: '',
  kind: 'julia',
  c: [-0.7269, 0.1889] as [number, number],
  zoom: 1,
  center: [0, 0] as [number, number],
  plane: 'xy',
  expr: '',
  a: 1.5,
  vf: 'well',
  ad: 'single',
  probe: [0.9, 0.4] as [number, number],
};
type MathState = typeof DEFAULTS;

/** What each mode gets from the planet: the initial URL state, a way to update it, and which keys the URL actually set. */
interface RoomCtx {
  initial: MathState;
  has(key: keyof MathState): boolean;
  sync(patch: Partial<MathState>): void;
}

/** "Export as animation →" — sends a payload to the Ecmanim Stage over the handoff bus. */
function exportButton(kind: string, getPayload: () => unknown): HTMLButtonElement {
  const b = handoffButton({ from: 'math', to: 'ecmanim', kind, label: 'Export as animation', getPayload });
  b.classList.add('mo-export');
  b.title = 'Build an ecmanim Scene from this view and play it in the Ecmanim Stage';
  return b;
}

interface Mode {
  el: HTMLElement;
  activate(): void;
  deactivate(): void;
  destroy(): void;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}
const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number, d = 4) => (Number.isFinite(n) ? (Math.abs(n) < 1e-12 ? 0 : n).toFixed(d) : String(n));

/** Size a canvas's backing store to its CSS box × dpr. Returns true if it changed. */
function fit(canvas: HTMLCanvasElement, dprCap = 2): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const hh = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width === w && canvas.height === hh) return false;
  canvas.width = w;
  canvas.height = hh;
  return true;
}

function errText(e: unknown): string {
  return e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
}

/* ================================================================== FRACTAL */

type Palette = Uint8ClampedArray;
function makePalette(d: [number, number, number]): Palette {
  const N = 1024;
  const lut = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = 255 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (t + d[k])));
  }
  return lut;
}
const PALETTES: Record<string, Palette> = {
  nebula: makePalette([0.75, 0.62, 0.45]),
  ember: makePalette([0.0, 0.15, 0.3]),
  ice: makePalette([0.5, 0.35, 0.2]),
};

/** z ← z·z + c until |z| escapes; smooth (fractional) escape count or -1 if bounded. All via ComplexNumber. */
function escapeTime(z0: ComplexNumber, c: ComplexNumber, max: number, out: { n: number }): number {
  let z = z0;
  let ref = z0;
  let period = 8;
  for (let n = 0; n < max; n++) {
    z = z.multiply(z).add(c);
    const m = z.magnitude();
    if (m > 16) {
      out.n += n + 1;
      return n + 1 - Math.log2(Math.log(m));
    }
    // Brent-style periodicity check: an orbit that revisits a point is bounded forever.
    if (z.subtract(ref).magnitude() < 1e-10) { out.n += n + 1; return -1; }
    if (n === period) { ref = z; period *= 2; }
  }
  out.n += max;
  return -1;
}

function fractalMode(ctx0: RoomCtx): Mode {
  const el = h('div', { class: 'mo-stage' });
  el.innerHTML = `
    <div class="mo-view">
      <canvas class="mo-main"></canvas>
      <canvas class="mo-overlay"></canvas>
      <div class="mo-hud"></div>
      <div class="mo-progress"></div>
      <div class="mo-hint">click: zoom in · shift/right-click: out · wheel: zoom · hover: orbit</div>
    </div>
    <div class="mo-side">
      <div class="panel">
        <h3>Iteration</h3>
        <div class="mo-formula" data-formula></div>
        <div class="mo-row" data-export></div>
        <div class="mo-row" data-kind>
          <button class="btn" data-k="mandelbrot">Mandelbrot</button>
          <button class="btn" data-k="julia">Julia</button>
        </div>
        <div class="mo-row" data-presets></div>
      </div>
      <div class="panel">
        <h3>c-parameter · drag to set</h3>
        <div class="mo-picker"><canvas></canvas></div>
        <div class="mo-row">
          <button class="btn" data-anim>▶ orbit c around |c| = 0.7885</button>
        </div>
      </div>
      <div class="panel">
        <label class="field">max iterations <span class="stat" data-itv></span><input type="range" min="32" max="1200" step="8" value="160" data-iter></label>
        <label class="field">palette
          <select data-pal>${Object.keys(PALETTES).map(p => `<option>${p}</option>`).join('')}</select>
        </label>
        <div class="mo-kv" data-stats></div>
        <div class="mo-row"><button class="btn" data-reset>reset view</button></div>
      </div>
      <div class="panel mo-how">
        <h3>How it's computed</h3>
        <p>Every pixel is iterated with the library's own complex type — no hand-rolled <code>re*re - im*im</code>. Rendering runs in time-boxed <code>requestAnimationFrame</code> slices (coarse 6×6 blocks first, then full resolution), so the UI never blocks.</p>
<pre class="code">import { ComplexNumber } from '@johnhenry/math';

let z = kind === 'julia' ? pixel : ComplexNumber.Zero;
const c = kind === 'julia' ? juliaC : pixel;
for (let n = 0; n &lt; max; n++) {
  z = z.multiply(z).add(c);
  if (z.magnitude() &gt; 16) return n + 1 - log2(log|z|);
}
// orbit-c animation: ComplexNumber.fromPolar(0.7885, θ)</pre>
      </div>
    </div>`;

  const view = $(el, '.mo-view');
  const canvas = $<HTMLCanvasElement>(el, 'canvas.mo-main');
  const overlay = $<HTMLCanvasElement>(el, 'canvas.mo-overlay');
  const hud = $(el, '.mo-hud');
  const progress = $(el, '.mo-progress');
  const pickerCanvas = $<HTMLCanvasElement>(el, '.mo-picker canvas');
  const iterInput = $<HTMLInputElement>(el, '[data-iter]');
  const statsEl = $(el, '[data-stats]');
  const formulaEl = $(el, '[data-formula]');
  const animBtn = $<HTMLButtonElement>(el, '[data-anim]');
  const ctx = canvas.getContext('2d')!;
  const octx = overlay.getContext('2d')!;
  const pctx = pickerCanvas.getContext('2d')!;

  type Kind = 'mandelbrot' | 'julia';
  const HOME: Record<Kind, { cx: number; cy: number; span: number }> = {
    mandelbrot: { cx: -0.6, cy: 0, span: 3.4 },
    julia: { cx: 0, cy: 0, span: 3.4 },
  };
  const state = {
    kind: 'julia' as Kind,
    cx: 0, cy: 0, span: 3.4,
    c: new ComplexNumber(-0.7269, 0.1889),
    baseIter: 160,
    palette: 'nebula',
    animating: false,
    theta: 0,
  };
  const presets: { name: string; kind: Kind; c?: [number, number]; cx: number; cy: number; span: number }[] = [
    { name: 'Home', kind: 'mandelbrot', cx: -0.6, cy: 0, span: 3.4 },
    { name: 'Seahorse valley', kind: 'mandelbrot', cx: -0.7453, cy: 0.1127, span: 0.012 },
    { name: 'Elephant valley', kind: 'mandelbrot', cx: 0.2855, cy: 0.0115, span: 0.018 },
    { name: 'Douady rabbit', kind: 'julia', c: [-0.123, 0.745], cx: 0, cy: 0, span: 3.2 },
    { name: 'Dendrite', kind: 'julia', c: [0, 1], cx: 0, cy: 0, span: 3.4 },
    { name: 'Siegel disk', kind: 'julia', c: [-0.391, -0.587], cx: 0, cy: 0, span: 3.2 },
    { name: 'Spiral', kind: 'julia', c: [-0.7269, 0.1889], cx: 0, cy: 0, span: 3.4 },
  ];
  let presetName = '';
  // restore from the URL: a named preset first, then any explicit overrides
  {
    const init = ctx0.initial;
    const p = presets.find(q => q.name === init.preset);
    if (p) { presetName = p.name; state.kind = p.kind; if (p.c) state.c = new ComplexNumber(p.c[0], p.c[1]); state.cx = p.cx; state.cy = p.cy; state.span = p.span; }
    if (ctx0.has('kind') && (init.kind === 'julia' || init.kind === 'mandelbrot')) state.kind = init.kind;
    if (ctx0.has('c') && Array.isArray(init.c) && init.c.every(Number.isFinite)) state.c = new ComplexNumber(init.c[0], init.c[1]);
    if (ctx0.has('center') && Array.isArray(init.center) && init.center.every(Number.isFinite)) { state.cx = init.center[0]; state.cy = init.center[1]; }
    else if (!p) { state.cx = HOME[state.kind].cx; state.cy = HOME[state.kind].cy; }
    if (ctx0.has('zoom') && Number(init.zoom) > 0) state.span = HOME[state.kind].span / Number(init.zoom);
  }
  const sig = (n: number, d = 10) => +n.toPrecision(d);
  function syncUrl() {
    ctx0.sync({
      preset: presetName, kind: state.kind,
      c: [sig(state.c.re, 6), sig(state.c.im, 6)],
      zoom: sig(zoomFactor(), 6),
      center: [sig(state.cx, 12), sig(state.cy, 12)],
    });
  }
  $(el, '[data-export]').append(exportButton('math-julia', () => ({
    kind: state.kind,
    c: [state.c.re, state.c.im],
    zoom: zoomFactor(),
    center: [state.cx, state.cy],
    span: state.span,
    iterations: maxIter(),
  })));

  const presetRow = $(el, '[data-presets]');
  for (const p of presets) {
    const b = h('button', { class: 'btn' }, p.name);
    b.addEventListener('click', () => {
      stopAnim();
      presetName = p.name;
      state.kind = p.kind;
      if (p.c) state.c = new ComplexNumber(p.c[0], p.c[1]);
      state.cx = p.cx; state.cy = p.cy; state.span = p.span;
      restart();
    });
    presetRow.append(b);
  }

  const zoomFactor = () => HOME[state.kind].span / state.span;
  const maxIter = () => Math.round(state.baseIter + 60 * Math.max(0, Math.log2(zoomFactor())));

  /* ---- progressive renderer ---- */
  interface Job { passes: number[]; pass: number; y: number; img: ImageData; W: number; H: number; t0: number; iters: { n: number }; max: number; c: ComplexNumber; kind: Kind; cx: number; cy: number; upp: number; done: boolean; ms: number }
  let job: Job | null = null;
  let raf = 0;
  let active = false;

  function restart() {
    fit(canvas, 1.5);
    fit(overlay, 1.5);
    const W = canvas.width, H = canvas.height;
    job = {
      passes: state.animating ? [4] : [6, 1],
      pass: 0, y: 0,
      img: ctx.createImageData(W, H), W, H,
      t0: performance.now(), iters: { n: 0 }, max: maxIter(),
      c: state.c, kind: state.kind, cx: state.cx, cy: state.cy, upp: state.span / W,
      done: false, ms: 0,
    };
    // keep the previous frame visible under the coarse pass
    const prev = ctx.getImageData(0, 0, W, H);
    job.img.data.set(prev.data);
    updateUI();
    setIdleHud();
    drawPicker();
    if (active) syncUrl();
    if (active && !raf) raf = requestAnimationFrame(tick);
  }

  function renderRow(j: Job) {
    const s = j.passes[j.pass];
    const { W, H, img, max, upp } = j;
    const data = img.data;
    const lut = PALETTES[state.palette];
    const y = j.y;
    const im = j.cy - (y + s / 2 - H / 2) * upp;
    for (let x = 0; x < W; x += s) {
      const re = j.cx + (x + s / 2 - W / 2) * upp;
      const p = new ComplexNumber(re, im);
      const t = j.kind === 'mandelbrot' ? escapeTime(ComplexNumber.Zero, p, max, j.iters) : escapeTime(p, j.c, max, j.iters);
      let r = 3, g = 4, b = 12;
      if (t >= 0) {
        const idx = (Math.floor(Math.log2(t + 1) * 0.22 * 1024) % 1024) * 3;
        const fade = 1 - Math.exp(-t / 14);
        r = lut[idx] * fade; g = lut[idx + 1] * fade; b = lut[idx + 2] * fade;
      }
      const yEnd = Math.min(H, y + s), xEnd = Math.min(W, x + s);
      for (let yy = y; yy < yEnd; yy++) {
        let o = (yy * W + x) * 4;
        for (let xx = x; xx < xEnd; xx++) { data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; o += 4; }
      }
    }
    j.y += s;
    if (j.y >= H) { j.pass++; j.y = 0; if (j.pass >= j.passes.length) j.done = true; }
  }

  function tick() {
    raf = 0;
    const j = job;
    if (!j || !active) return;
    const deadline = performance.now() + 14;
    while (!j.done && performance.now() < deadline) renderRow(j);
    ctx.putImageData(j.img, 0, 0);
    const total = j.passes.length;
    const frac = (j.pass + j.y / j.H) / total;
    progress.style.width = `${(j.done ? 1 : frac) * 100}%`;
    progress.style.opacity = j.done ? '0' : '1';
    j.ms = performance.now() - j.t0;
    updateStats();
    if (!j.done) { raf = requestAnimationFrame(tick); return; }
    if (state.animating) {
      state.theta += 0.025;
      state.c = ComplexNumber.fromPolar(0.7885, state.theta);
      restart();
    }
  }

  function updateStats() {
    const j = job;
    if (!j) return;
    statsEl.innerHTML = `
      <span>center</span><span>${fmt(state.cx, 6)} ${state.cy < 0 ? '−' : '+'} ${fmt(Math.abs(state.cy), 6)}i</span>
      <span>zoom</span><span>${zoomFactor() < 10 ? zoomFactor().toFixed(2) : Math.round(zoomFactor()).toLocaleString()}×</span>
      <span>max iter</span><span>${j.max}</span>
      <span>pass</span><span>${j.done ? 'done' : `${Math.min(j.pass + 1, j.passes.length)}/${j.passes.length} (${j.passes[Math.min(j.pass, j.passes.length - 1)]}px blocks)`}</span>
      <span>iterations</span><span>${j.iters.n.toLocaleString()}</span>
      <span>lib calls</span><span>≈${(j.iters.n * 5).toLocaleString()} (mul, add, |z|, sub, |Δz|)</span>
      <span>time</span><span>${j.ms.toFixed(0)} ms</span>`;
  }

  function updateUI() {
    for (const b of el.querySelectorAll<HTMLButtonElement>('[data-kind] .btn')) b.classList.toggle('on', b.dataset.k === state.kind);
    const cStr = `${fmt(state.c.re, 4)} ${state.c.im < 0 ? '−' : '+'} ${fmt(Math.abs(state.c.im), 4)}i`;
    formulaEl.innerHTML = state.kind === 'mandelbrot'
      ? `z<sub>n+1</sub> = z<sub>n</sub>·z<sub>n</sub> + <b>c</b><br><span class="stat">z₀ = 0, <b>c</b> = pixel</span>`
      : `z<sub>n+1</sub> = z<sub>n</sub>·z<sub>n</sub> + <b>c</b><br><span class="stat">z₀ = pixel, <b>c</b> = ${esc(cStr)}</span>`;
    $(el, '[data-itv]').textContent = `base ${state.baseIter} → effective ${maxIter()}`;
    animBtn.classList.toggle('on', state.animating);
    animBtn.textContent = state.animating ? '■ stop orbit' : '▶ orbit c around |c| = 0.7885';
  }

  /* ---- c picker (a small Mandelbrot map of parameter space) ---- */
  let pickerImg: ImageData | null = null;
  const PV = { cx: -0.6, cy: 0, span: 3.3 };
  function renderPickerImage() {
    fit(pickerCanvas, 2);
    const W = pickerCanvas.width, H = pickerCanvas.height;
    const img = pctx.createImageData(W, H);
    const upp = PV.span / W;
    const it = { n: 0 };
    const lut = PALETTES[state.palette];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const p = new ComplexNumber(PV.cx + (x - W / 2) * upp, PV.cy - (y - H / 2) * upp);
      const t = escapeTime(ComplexNumber.Zero, p, 48, it);
      let r = 10, g = 10, b = 26;
      if (t >= 0) { const idx = (Math.floor(Math.log2(t + 1) * 0.22 * 1024) % 1024) * 3; const f = (1 - Math.exp(-t / 8)) * 0.9; r = lut[idx] * f; g = lut[idx + 1] * f; b = lut[idx + 2] * f; }
      for (let dy = 0; dy < 2 && y + dy < H; dy++) for (let dx = 0; dx < 2 && x + dx < W; dx++) {
        const o = ((y + dy) * W + x + dx) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    }
    pickerImg = img;
  }
  function drawPicker() {
    if (!pickerImg || pickerImg.width !== pickerCanvas.width) renderPickerImage();
    if (!pickerImg) return;
    pctx.putImageData(pickerImg, 0, 0);
    const W = pickerCanvas.width, H = pickerCanvas.height, upp = PV.span / W;
    const px = W / 2 + (state.c.re - PV.cx) / upp, py = H / 2 - (state.c.im - PV.cy) / upp;
    const dpr = W / pickerCanvas.clientWidth;
    pctx.strokeStyle = 'rgba(255,255,255,.35)';
    pctx.lineWidth = 1 * dpr;
    pctx.beginPath(); pctx.moveTo(px, 0); pctx.lineTo(px, H); pctx.moveTo(0, py); pctx.lineTo(W, py); pctx.stroke();
    pctx.fillStyle = '#fff';
    pctx.beginPath(); pctx.arc(px, py, 4.5 * dpr, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = getComputedStyle(el).getPropertyValue('--accent') || '#8b5cf6';
    pctx.beginPath(); pctx.arc(px, py, 2.5 * dpr, 0, Math.PI * 2); pctx.fill();
    pctx.font = `${11 * dpr}px ui-monospace, monospace`;
    pctx.fillStyle = 'rgba(255,255,255,.85)';
    pctx.fillText(`c = ${state.c.toString().replace(/(\d\.\d{3})\d+/g, '$1')}`, 6 * dpr, H - 7 * dpr);
  }
  let dragging = false;
  function pickFrom(e: PointerEvent) {
    const r = pickerCanvas.getBoundingClientRect();
    const u = PV.span / r.width;
    state.c = new ComplexNumber(PV.cx + (e.clientX - r.left - r.width / 2) * u, PV.cy - (e.clientY - r.top - r.height / 2) * u);
    if (state.kind !== 'julia') { state.kind = 'julia'; state.cx = 0; state.cy = 0; state.span = HOME.julia.span; }
    presetName = '';
    stopAnim();
    restart();
  }
  const onPickDown = (e: PointerEvent) => { dragging = true; pickerCanvas.setPointerCapture(e.pointerId); pickFrom(e); };
  const onPickMove = (e: PointerEvent) => { if (dragging) pickFrom(e); };
  const onPickUp = () => { dragging = false; };
  pickerCanvas.addEventListener('pointerdown', onPickDown);
  pickerCanvas.addEventListener('pointermove', onPickMove);
  pickerCanvas.addEventListener('pointerup', onPickUp);
  pickerCanvas.addEventListener('pointercancel', onPickUp);

  /* ---- main canvas interaction ---- */
  function toComplex(e: MouseEvent): ComplexNumber {
    const r = canvas.getBoundingClientRect();
    const u = state.span / r.width;
    return new ComplexNumber(state.cx + (e.clientX - r.left - r.width / 2) * u, state.cy - (e.clientY - r.top - r.height / 2) * u);
  }
  function zoomAt(e: MouseEvent, factor: number) {
    const p = toComplex(e);
    state.cx = p.re; state.cy = p.im; state.span *= factor;
    presetName = '';
    stopAnim();
    restart();
  }
  const onClick = (e: MouseEvent) => zoomAt(e, e.shiftKey ? 3 : 1 / 3);
  const onContext = (e: MouseEvent) => { e.preventDefault(); zoomAt(e, 3); };
  let wheelTimer = 0;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = toComplex(e);
    const f = Math.exp(e.deltaY * 0.0015);
    // keep the point under the cursor fixed
    state.cx = p.re + (state.cx - p.re) * f;
    state.cy = p.im + (state.cy - p.im) * f;
    state.span *= f;
    presetName = '';
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => { stopAnim(); restart(); }, 60);
  };
  const onHover = (e: MouseEvent) => {
    fit(overlay, 1.5);
    const W = overlay.width, H = overlay.height;
    octx.clearRect(0, 0, W, H);
    const p = toComplex(e);
    let z = state.kind === 'mandelbrot' ? ComplexNumber.Zero : p;
    const c = state.kind === 'mandelbrot' ? p : state.c;
    const upp = state.span / W;
    const toPx = (q: ComplexNumber): [number, number] => [W / 2 + (q.re - state.cx) / upp, H / 2 - (q.im - state.cy) / upp];
    const pts: [number, number][] = [toPx(z)];
    let escaped = -1;
    const lim = Math.min(maxIter(), 400);
    for (let n = 0; n < lim; n++) {
      z = z.multiply(z).add(c);
      pts.push(toPx(z));
      if (z.magnitude() > 2) { escaped = n + 1; break; }
    }
    const dpr = W / overlay.clientWidth;
    octx.lineWidth = 1.2 * dpr;
    octx.strokeStyle = 'rgba(255,255,255,.55)';
    octx.beginPath();
    pts.forEach(([x, y], i) => (i ? octx.lineTo(x, y) : octx.moveTo(x, y)));
    octx.stroke();
    octx.fillStyle = '#fff';
    for (const [x, y] of pts.slice(0, 60)) { octx.beginPath(); octx.arc(x, y, 1.8 * dpr, 0, Math.PI * 2); octx.fill(); }
    hud.innerHTML = `${state.kind === 'mandelbrot' ? '<b>c</b>' : 'z₀'} = ${esc(p.toString().replace(/(\d\.\d{5})\d+/g, '$1'))}<br>` +
      (escaped > 0 ? `orbit escapes |z|&gt;2 after <b>${escaped}</b> iterations` : `orbit bounded for ${lim} iterations`);
  };
  const onLeave = () => { octx.clearRect(0, 0, overlay.width, overlay.height); setIdleHud(); };
  function setIdleHud() {
    hud.innerHTML = `<b>${state.kind === 'mandelbrot' ? 'Mandelbrot set' : 'Julia set'}</b> · hover to trace an orbit`;
  }
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('contextmenu', onContext);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  // pointer events, not mousemove/mouseleave, so a touch-drag also traces the
  // orbit before the tap's `click` zooms — mousemove never fires on touch, so
  // this "hover to trace an orbit" affordance was previously mouse-only
  // (found in mobile touch audit; verified via Playwright touch emulation).
  canvas.addEventListener('pointerdown', onHover);
  canvas.addEventListener('pointermove', onHover);
  canvas.addEventListener('pointerup', onLeave);
  canvas.addEventListener('pointercancel', onLeave);
  canvas.addEventListener('mouseleave', onLeave);

  /* ---- controls ---- */
  for (const b of el.querySelectorAll<HTMLButtonElement>('[data-kind] .btn')) {
    b.addEventListener('click', () => {
      const k = b.dataset.k as Kind;
      if (k === state.kind) return;
      state.kind = k;
      Object.assign(state, HOME[k]);
      presetName = '';
      stopAnim();
      setIdleHud();
      restart();
    });
  }
  let iterTimer = 0;
  iterInput.addEventListener('input', () => {
    state.baseIter = +iterInput.value;
    updateUI();
    clearTimeout(iterTimer);
    iterTimer = window.setTimeout(restart, 120);
  });
  $<HTMLSelectElement>(el, '[data-pal]').addEventListener('change', e => {
    state.palette = (e.target as HTMLSelectElement).value;
    pickerImg = null;
    restart();
  });
  $(el, '[data-reset]').addEventListener('click', () => { Object.assign(state, HOME[state.kind]); presetName = ''; stopAnim(); restart(); });
  function stopAnim() { state.animating = false; updateUI(); }
  animBtn.addEventListener('click', () => {
    state.animating = !state.animating;
    presetName = '';
    if (state.animating) {
      state.kind = 'julia';
      Object.assign(state, HOME.julia);
      state.theta = state.c.angle();
      state.c = ComplexNumber.fromPolar(0.7885, state.theta);
    }
    updateUI();
    setIdleHud();
    restart();
  });

  const ro = new ResizeObserver(() => { if (active) { pickerImg = null; restart(); } });
  ro.observe(view);

  setIdleHud();
  return {
    el,
    activate() { active = true; restart(); },
    deactivate() { active = false; state.animating = false; updateUI(); cancelAnimationFrame(raf); raf = 0; },
    destroy() {
      active = false;
      cancelAnimationFrame(raf);
      clearTimeout(wheelTimer); clearTimeout(iterTimer);
      ro.disconnect();
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onHover);
      canvas.removeEventListener('pointermove', onHover);
      canvas.removeEventListener('pointerup', onLeave);
      canvas.removeEventListener('pointercancel', onLeave);
      canvas.removeEventListener('mouseleave', onLeave);
      pickerCanvas.removeEventListener('pointerdown', onPickDown);
      pickerCanvas.removeEventListener('pointermove', onPickMove);
      pickerCanvas.removeEventListener('pointerup', onPickUp);
      pickerCanvas.removeEventListener('pointercancel', onPickUp);
    },
  };
}

/* ==================================================================== ROTOR */

type PlaneName = 'xy' | 'xz' | 'xw' | 'yz' | 'yw' | 'zw';
const PLANES: Record<PlaneName, Bivector4> = {
  xy: new Bivector4(1, 0, 0, 0, 0, 0),
  xz: new Bivector4(0, 1, 0, 0, 0, 0),
  xw: new Bivector4(0, 0, 1, 0, 0, 0),
  yz: new Bivector4(0, 0, 0, 1, 0, 0),
  yw: new Bivector4(0, 0, 0, 0, 1, 0),
  zw: new Bivector4(0, 0, 0, 0, 0, 1),
};
const COMPLEMENT: Record<PlaneName, PlaneName> = { xy: 'zw', zw: 'xy', xz: 'yw', yw: 'xz', xw: 'yz', yz: 'xw' };
const AXIS: Record<string, Vec4> = { x: Vec4.Ex, y: Vec4.Ey, z: Vec4.Ez, w: Vec4.Ew };

function rotorMode(ctx0: RoomCtx): Mode {
  const el = h('div', { class: 'mo-stage' });
  el.innerHTML = `
    <div class="mo-view">
      <canvas class="mo-main" style="cursor:grab"></canvas>
      <div class="mo-hud"></div>
      <div class="mo-hint">drag: orbit camera</div>
    </div>
    <div class="mo-side">
      <div class="panel">
        <h3>Rotation plane (bivector)</h3>
        <div class="mo-row" data-export></div>
        <div class="mo-row" data-planes>${(Object.keys(PLANES) as PlaneName[]).map(p => `<button class="btn" data-p="${p}">${p}</button>`).join('')}</div>
        <label class="field">angle θ <span class="stat" data-angv></span><input type="range" min="-720" max="720" step="0.5" value="0" data-ang></label>
        <div class="mo-row">
          <button class="btn" data-spin>■ pause</button>
          <button class="btn" data-clear>clear trail</button>
        </div>
        <label class="mo-check"><input type="checkbox" data-double checked> double rotation (+ orthogonal plane <b data-comp></b>)</label>
        <label class="field">second-plane speed k <span class="stat" data-kv></span><input type="range" min="-3" max="3" step="0.01" value="1.618" data-k></label>
        <label class="mo-check"><input type="checkbox" data-tess checked> show tesseract rotated by the same rotor</label>
      </div>
      <div class="panel">
        <h3>Vector v</h3>
        <div class="mo-inline">
          <label class="field">x<input type="range" min="-1.5" max="1.5" step="0.01" value="1.1" data-vx></label>
          <label class="field">y<input type="range" min="-1.5" max="1.5" step="0.01" value="0.35" data-vy></label>
          <label class="field">z<input type="range" min="-1.5" max="1.5" step="0.01" value="0.55" data-vz></label>
          <label class="field">w<input type="range" min="-1.5" max="1.5" step="0.01" value="0" data-vw></label>
        </div>
      </div>
      <div class="panel">
        <h3>Rotor R — live components</h3>
        <div class="mo-bars" data-bars></div>
        <div class="mo-kv" data-rk></div>
      </div>
      <div class="panel mo-how">
        <h3>How it's computed</h3>
        <p>A rotor is <code>scalar + bivector(6) + pseudoscalar</code>. It rotates by the sandwich product <code>R v R̃</code>. In 4D a rotor can spin two orthogonal planes at once — a <em>double rotation</em>, which is what makes the pseudoscalar non-zero. The camera orbit is also a <code>Rotor4</code>; only the final 4D→3D→2D perspective is hand-written.</p>
<pre class="code">import { Rotor4, Bivector4, Vec4 } from '@johnhenry/math';

const R1 = Rotor4.fromBivectorAngle(plane, θ);
const R  = double
  ? Rotor4.fromBivectorAngle(orthoPlane, k*θ).multiply(R1)
  : R1;
const v2 = R.apply(new Vec4(x, y, z, w));   // R v R̃
R.multiply(R.reverse());                    // ≈ 1 (unit rotor)
R.toBivectorAngle();                        // simple rotors only</pre>
      </div>
    </div>`;

  const canvas = $<HTMLCanvasElement>(el, 'canvas.mo-main');
  const hud = $(el, '.mo-hud');
  const ctx = canvas.getContext('2d')!;
  const angIn = $<HTMLInputElement>(el, '[data-ang]');
  const kIn = $<HTMLInputElement>(el, '[data-k]');
  const dblIn = $<HTMLInputElement>(el, '[data-double]');
  const tessIn = $<HTMLInputElement>(el, '[data-tess]');
  const spinBtn = $<HTMLButtonElement>(el, '[data-spin]');
  const vIns = (['x', 'y', 'z', 'w'] as const).map(a => $<HTMLInputElement>(el, `[data-v${a}]`));
  const barsEl = $(el, '[data-bars]');
  const rkEl = $(el, '[data-rk]');

  const state = {
    plane: 'xy' as PlaneName,
    theta: 0,
    double: true,
    k: 1.618,
    spinning: true,
    yaw: -0.55,
    pitch: 0.42,
    tess: true,
  };
  if (ctx0.initial.plane in PLANES) state.plane = ctx0.initial.plane as PlaneName;
  $(el, '[data-export]').append(exportButton('math-rotor', () => {
    const sweep = !state.spinning && Math.abs(state.theta) > 0.05 ? state.theta : 2 * Math.PI;
    return {
      planes: state.double ? [state.plane, COMPLEMENT[state.plane]] : [state.plane],
      k: state.k,
      angle: sweep,
      vector: vec().toArray(),
      steps: Math.round(Math.max(60, Math.min(360, (Math.abs(sweep) / (2 * Math.PI)) * 180))),
      camera: { yaw: state.yaw, pitch: state.pitch },
    };
  }));
  let trail: Vec4[] = [];
  let raf = 0;
  let active = false;
  let dirty = true;
  let lastT = 0;

  const COMPS: [string, (r: Rotor4) => number, string][] = [
    ['s', r => r.scalar, ''], ['e12', r => r.bivector.xy, ''], ['e13', r => r.bivector.xz, ''], ['e14', r => r.bivector.xw, ''],
    ['e23', r => r.bivector.yz, ''], ['e24', r => r.bivector.yw, ''], ['e34', r => r.bivector.zw, ''], ['e1234', r => r.pseudoscalar, 'ps'],
  ];
  barsEl.innerHTML = COMPS.map(([n, , cls]) => `<div class="mo-bar ${cls}"><span class="lbl">${n}</span><span class="track"><span class="fill"></span></span><span class="val"></span></div>`).join('');
  const barEls = [...barsEl.querySelectorAll<HTMLElement>('.mo-bar')];

  const vec = () => new Vec4(+vIns[0].value, +vIns[1].value, +vIns[2].value, +vIns[3].value);
  function rotorAt(theta: number): Rotor4 {
    const R1 = Rotor4.fromBivectorAngle(PLANES[state.plane], theta);
    return state.double ? Rotor4.fromBivectorAngle(PLANES[COMPLEMENT[state.plane]], state.k * theta).multiply(R1) : R1;
  }
  const camera = () => Rotor4.fromBivectorAngle(PLANES.yz, state.pitch).multiply(Rotor4.fromBivectorAngle(PLANES.xz, state.yaw));

  function draw() {
    fit(canvas, 2);
    const W = canvas.width, H = canvas.height;
    const dpr = W / canvas.clientWidth;
    const unit = Math.min(W, H) * 0.27;
    const cx = W / 2, cy = H / 2;
    const cam = camera();
    const accent = getComputedStyle(el).getPropertyValue('--accent').trim() || '#8b5cf6';
    const proj = (p: Vec4): [number, number, number] => {
      const q = cam.apply(p);
      const f4 = 3 / (3 - q.w);
      const x = q.x * f4, y = q.y * f4, z = q.z * f4;
      const g = 7 / (7 - z);
      return [cx + x * g * unit, cy - y * g * unit, q.w];
    };
    ctx.clearRect(0, 0, W, H);
    // backdrop glow
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
    grd.addColorStop(0, 'rgba(90,60,180,.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    const R = rotorAt(state.theta);
    const v = vec();
    const v2 = R.apply(v);

    // axes
    ctx.lineWidth = 1 * dpr;
    ctx.font = `${12 * dpr}px ui-monospace, monospace`;
    for (const [name, col] of [['x', '#ff6b6b'], ['y', '#51cf66'], ['z', '#4dabf7']] as const) {
      const a = AXIS[name];
      const [x0, y0] = proj(a.scale(-1.7)), [x1, y1] = proj(a.scale(1.7));
      ctx.strokeStyle = col + '66'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(name, x1 + 4 * dpr, y1);
    }

    // tesseract
    if (state.tess) {
      const verts: [number, number, number][] = [];
      const raw: Vec4[] = [];
      for (let i = 0; i < 16; i++) {
        const p = new Vec4(i & 1 ? 0.55 : -0.55, i & 2 ? 0.55 : -0.55, i & 4 ? 0.55 : -0.55, i & 8 ? 0.55 : -0.55);
        const rp = R.apply(p);
        raw.push(rp);
        verts.push(proj(rp));
      }
      for (let i = 0; i < 16; i++) for (let b = 1; b < 16; b <<= 1) {
        const j = i ^ b;
        if (j < i) continue;
        const w = (raw[i].w + raw[j].w) / 2; // −0.55..0.55 mostly
        const t = Math.max(0, Math.min(1, (w + 0.8) / 1.6));
        ctx.strokeStyle = `rgba(${Math.round(120 + 110 * t)},${Math.round(140 - 40 * t)},255,${0.18 + 0.3 * t})`;
        ctx.lineWidth = (0.8 + 1.2 * t) * dpr;
        ctx.beginPath(); ctx.moveTo(verts[i][0], verts[i][1]); ctx.lineTo(verts[j][0], verts[j][1]); ctx.stroke();
      }
    }

    // rotation plane disc(s)
    const planes: PlaneName[] = state.double ? [state.plane, COMPLEMENT[state.plane]] : [state.plane];
    planes.forEach((pl, idx) => {
      const a = AXIS[pl[0]], b = AXIS[pl[1]];
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const t = (i / 96) * Math.PI * 2;
        const [x, y] = proj(a.scale(Math.cos(t) * 1.25).add(b.scale(Math.sin(t) * 1.25)));
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.fillStyle = idx ? 'rgba(245,165,36,.07)' : 'rgba(139,92,246,.10)';
      ctx.strokeStyle = idx ? 'rgba(245,165,36,.45)' : 'rgba(170,140,255,.45)';
      ctx.fill(); ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.stroke(); ctx.setLineDash([]);
    });

    // predicted orbit (ghost): sweep θ through the library rotor
    ctx.beginPath();
    const sweep = state.double ? 4 * Math.PI : 2 * Math.PI;
    for (let i = 0; i <= 240; i++) {
      const [x, y] = proj(rotorAt((i / 240) * sweep).apply(v));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1 * dpr; ctx.stroke();

    // trail
    for (let i = 1; i < trail.length; i++) {
      const [x0, y0] = proj(trail[i - 1]), [x1, y1] = proj(trail[i]);
      ctx.strokeStyle = `rgba(200,180,255,${(i / trail.length) * 0.9})`;
      ctx.lineWidth = (1 + 2 * (i / trail.length)) * dpr;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }

    // arrows
    const arrow = (to: Vec4, col: string, w: number) => {
      const [ox, oy] = proj(Vec4.Zero), [tx, ty] = proj(to);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w * dpr;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tx, ty); ctx.stroke();
      const ang = Math.atan2(ty - oy, tx - ox), L = 11 * dpr;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.lineTo(tx - L * Math.cos(ang - 0.4), ty - L * Math.sin(ang - 0.4));
      ctx.lineTo(tx - L * Math.cos(ang + 0.4), ty - L * Math.sin(ang + 0.4));
      ctx.closePath(); ctx.fill();
      return [tx, ty] as const;
    };
    arrow(v, 'rgba(255,255,255,.35)', 1.5);
    const [tx, ty] = arrow(v2, accent, 3);
    ctx.shadowColor = accent; ctx.shadowBlur = 16 * dpr;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tx, ty, 4 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText("v' = RvR̃", tx + 8 * dpr, ty - 8 * dpr);

    // readouts
    COMPS.forEach(([, get], i) => {
      const val = get(R);
      const bar = barEls[i];
      const fill = bar.querySelector<HTMLElement>('.fill')!;
      const pct = Math.max(-1, Math.min(1, val)) * 50;
      fill.style.left = `${pct < 0 ? 50 + pct : 50}%`;
      fill.style.width = `${Math.abs(pct)}%`;
      bar.querySelector<HTMLElement>('.val')!.textContent = fmt(val, 4);
    });
    const RR = R.multiply(R.reverse());
    let recovered = '';
    if (Math.abs(R.pseudoscalar) < 1e-9) {
      try {
        const { plane, angle } = R.toBivectorAngle();
        const names = ['xy', 'xz', 'xw', 'yz', 'yw', 'zw'];
        const arr = plane.toArray();
        const bi = arr.map((c, i) => (Math.abs(c) > 1e-6 ? `${fmt(c, 2)}e${names[i]}` : '')).filter(Boolean).join(' + ') || '0';
        recovered = `${(angle * 180 / Math.PI).toFixed(1)}° in ${bi}`;
      } catch (e) { recovered = errText(e); }
    } else {
      recovered = 'compound (double rotation) — no single plane';
    }
    const shadow = v2.dropW();
    rkEl.innerHTML = `
      <span>|R|</span><span>${fmt(R.magnitude, 6)}</span>
      <span>R·R̃</span><span>${fmt(RR.scalar, 6)} (scalar part)</span>
      <span>simple?</span><span>${esc(recovered)}</span>
      <span>v</span><span>(${v.toArray().map(n => fmt(n, 2)).join(', ')})</span>
      <span>v'</span><span>(${v2.toArray().map(n => fmt(n, 3)).join(', ')})</span>
      <span>|v| → |v'|</span><span>${fmt(v.magnitude, 4)} → ${fmt(v2.magnitude, 4)}</span>
      <span>3D shadow</span><span>${fmt(Math.hypot(...shadow), 4)} (w = ${fmt(v2.w, 3)})</span>`;
    hud.innerHTML = `R = fromBivectorAngle(<b>e<sub>${state.plane}</sub></b>, θ)${state.double ? ` · fromBivectorAngle(<b>e<sub>${COMPLEMENT[state.plane]}</sub></b>, kθ)` : ''}<br>θ = ${(state.theta * 180 / Math.PI).toFixed(1)}°${state.double ? ` · kθ = ${(state.k * state.theta * 180 / Math.PI).toFixed(1)}° · pseudoscalar = ${fmt(R.pseudoscalar, 3)}` : ''}`;
    $(el, '[data-angv]').textContent = `${(state.theta * 180 / Math.PI).toFixed(1)}°`;
    $(el, '[data-kv]').textContent = state.k.toFixed(3);
    $(el, '[data-comp]').textContent = `e${COMPLEMENT[state.plane]}`;
  }

  function pushTrail() {
    trail.push(rotorAt(state.theta).apply(vec()));
    if (trail.length > 420) trail = trail.slice(-420);
  }

  function loop(t: number) {
    raf = 0;
    if (!active) return;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    if (state.spinning) {
      state.theta += dt * 0.9;
      if (state.theta > 4 * Math.PI) state.theta -= 4 * Math.PI;
      angIn.value = String((state.theta * 180) / Math.PI);
      pushTrail();
      dirty = true;
    }
    if (dirty) { draw(); dirty = false; }
    raf = requestAnimationFrame(loop);
  }

  const updPlaneBtns = () => { for (const b of el.querySelectorAll<HTMLButtonElement>('[data-planes] .btn')) b.classList.toggle('on', b.dataset.p === state.plane); };
  for (const b of el.querySelectorAll<HTMLButtonElement>('[data-planes] .btn')) {
    b.addEventListener('click', () => { state.plane = b.dataset.p as PlaneName; trail = []; updPlaneBtns(); ctx0.sync({ plane: state.plane }); dirty = true; });
  }
  angIn.addEventListener('input', () => { state.theta = (+angIn.value * Math.PI) / 180; setSpin(false); pushTrail(); dirty = true; });
  kIn.addEventListener('input', () => { state.k = +kIn.value; trail = []; dirty = true; });
  dblIn.addEventListener('change', () => { state.double = dblIn.checked; trail = []; dirty = true; });
  tessIn.addEventListener('change', () => { state.tess = tessIn.checked; dirty = true; });
  for (const i of vIns) i.addEventListener('input', () => { trail = []; dirty = true; });
  function setSpin(on: boolean) { state.spinning = on; spinBtn.textContent = on ? '■ pause' : '▶ spin'; spinBtn.classList.toggle('on', on); }
  spinBtn.addEventListener('click', () => setSpin(!state.spinning));
  $(el, '[data-clear]').addEventListener('click', () => { trail = []; dirty = true; });

  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    state.yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
    state.pitch = Math.max(-1.5, Math.min(1.5, drag.pitch + (e.clientY - drag.y) * 0.008));
    dirty = true;
  };
  const onUp = () => { drag = null; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  const ro = new ResizeObserver(() => { dirty = true; });
  ro.observe(canvas);

  updPlaneBtns();
  setSpin(true);
  return {
    el,
    activate() { active = true; lastT = 0; dirty = true; ctx0.sync({ plane: state.plane }); if (!raf) raf = requestAnimationFrame(loop); },
    deactivate() { active = false; cancelAnimationFrame(raf); raf = 0; },
    destroy() {
      active = false; cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    },
  };
}

/* ================================================================= SYMBOLIC */

function symbolicMode(ctx0: RoomCtx): Mode {
  const PRESETS: { e: string; a?: number }[] = [
    { e: 'sin(a*x)*exp(-x^2/8)', a: 1.5 },
    { e: 'x^3 - a*x', a: 3 },
    { e: 'x^4 - a*x^2 + 1', a: 3 },
    { e: 'sin(x)/x' },
    { e: 'piecewise(x < 0, -x, x^2)' },
    { e: 'a*tanh(x) + sigmoid(3*x)', a: 1 },
    { e: '|x| - 1' },
    { e: 'x*cos(a*x)', a: 2 },
  ];
  const el = h('div', { class: 'mo-stage' });
  el.innerHTML = `
    <div class="mo-view">
      <canvas class="mo-main"></canvas>
      <div class="mo-hud"></div>
      <div class="mo-hint">drag: pan · wheel: zoom · click: set Taylor center</div>
    </div>
    <div class="mo-side">
      <div class="panel">
        <h3>f(x) =</h3>
        <input class="mo-expr" spellcheck="false" autocomplete="off" data-expr>
        <div class="mo-row" data-export></div>
        <div class="mo-row" data-presets>${PRESETS.map((p, i) => `<button class="btn" data-i="${i}">${esc(p.e)}</button>`).join('')}</div>
        <label class="field">parameter a <span class="stat" data-av></span><input type="range" min="-5" max="5" step="0.01" value="1.5" data-a></label>
        <div class="mo-legend">
          <span><i style="background:var(--accent)"></i>f</span>
          <span><i style="background:#4cc9f0"></i>f′ (symbolic)</span>
          <span><i style="background:#f5a524"></i>Taylor</span>
          <span><i style="background:rgba(160,120,255,.4);height:8px"></i>∫ area</span>
        </div>
        <pre class="code mo-err" data-err hidden></pre>
      </div>
      <div class="panel">
        <label class="field">Taylor order <span class="stat" data-ov></span><input type="range" min="0" max="12" step="1" value="5" data-order></label>
        <div class="mo-inline">
          <label class="field">∫ from<input type="number" step="0.5" value="-1" data-lo></label>
          <label class="field">to<input type="number" step="0.5" value="2" data-hi></label>
        </div>
      </div>
      <div class="panel">
        <h3>Symbolic results</h3>
        <div class="mo-kv" data-out></div>
      </div>
      <div class="panel mo-how">
        <h3>How it's computed</h3>
        <p>The text is parsed into an AST, differentiated symbolically, compiled once into a closure tree, and sampled once per pixel column. The Taylor polynomial, antiderivative, roots and definite integral all come from the same <code>Symbolic</code> class.</p>
<pre class="code">import { Symbolic } from '@johnhenry/math';

const ast = Symbolic.parse(src);
Symbolic.assertVariables(ast, ['x', 'a']);
const f  = Symbolic.compile(ast);
const d  = Symbolic.differentiate(ast, 'x');
const fx = Symbolic.substitute(ast, 'a', String(a));
Symbolic.taylor(fx, 'x', x0, order);
Symbolic.integrate(ast, 'x');
Symbolic.integrateDefinite(fx, lo, hi, 'x');
Symbolic.solve(fx, 'x');  // polynomials ≤ deg 6
Symbolic.toLatex(ast);</pre>
      </div>
    </div>`;

  const canvas = $<HTMLCanvasElement>(el, 'canvas.mo-main');
  const hud = $(el, '.mo-hud');
  const ctx = canvas.getContext('2d')!;
  const exprIn = $<HTMLInputElement>(el, '[data-expr]');
  const aIn = $<HTMLInputElement>(el, '[data-a]');
  const orderIn = $<HTMLInputElement>(el, '[data-order]');
  const loIn = $<HTMLInputElement>(el, '[data-lo]');
  const hiIn = $<HTMLInputElement>(el, '[data-hi]');
  const errEl = $<HTMLPreElement>(el, '[data-err]');
  const outEl = $(el, '[data-out]');

  const vw = { x0: -6, x1: 6, y0: -3, y1: 3 };
  let hoverX: number | null = null;
  let center = 0.5;
  let active = false;
  let raf = 0;

  interface Compiled {
    src: string; ast: Expr;
    f: (env: Record<string, number>) => number;
    df: (env: Record<string, number>) => number;
    dStr: string; intStr: string; latex: string;
  }
  interface Numeric { taylor: ((env: Record<string, number>) => number) | null; taylorStr: string; area: number | string; roots: number[]; rootsStr: string }
  let comp: Compiled | null = null;
  let num: Numeric | null = null;

  function compileExpr(): void {
    const src = exprIn.value.trim();
    if (active) ctx0.sync({ expr: src, a: +aIn.value });
    try {
      const ast = Symbolic.parse(src);
      Symbolic.assertVariables(ast, ['x', 'a']);
      const d = Symbolic.differentiate(ast, 'x');
      let intStr: string;
      try { intStr = Symbolic.toString(Symbolic.integrate(ast, 'x')) + ' + C'; } catch (e) { intStr = `— (${e instanceof Error ? e.constructor.name : 'error'}: no elementary antiderivative found)`; }
      let latex = '';
      try { latex = Symbolic.toLatex(ast); } catch { latex = '—'; }
      comp = { src, ast, f: Symbolic.compile(ast), df: Symbolic.compile(d), dStr: Symbolic.toString(d), intStr, latex };
      exprIn.classList.remove('bad');
      errEl.hidden = true;
      computeNumeric();
    } catch (e) {
      exprIn.classList.add('bad');
      errEl.hidden = false;
      errEl.textContent = errText(e);
    }
    schedule();
  }

  function computeNumeric(): void {
    if (!comp) return;
    const a = +aIn.value;
    const fx = Symbolic.substitute(comp.ast, 'a', `(${a})`);
    let taylor: Numeric['taylor'] = null, taylorStr = '';
    try {
      const t = Symbolic.taylor(fx, 'x', center, +orderIn.value);
      taylor = Symbolic.compile(t);
      taylorStr = Symbolic.toString(t).replace(/(\d\.\d{4})\d+/g, '$1');
    } catch (e) { taylorStr = errText(e); }
    let area: number | string;
    const lo = +loIn.value, hi = +hiIn.value;
    try { area = Symbolic.integrateDefinite(fx, lo, hi, 'x'); } catch (e) { area = errText(e); }
    let roots: number[] = [], rootsStr = '';
    try {
      const sols = Symbolic.solve(fx, 'x');
      roots = sols.map(s => Symbolic.evaluate(s)).filter(Number.isFinite);
      rootsStr = sols.length ? sols.map(s => `${Symbolic.toString(s)}`).join(',  ') + (roots.length ? `  ≈ ${roots.map(r => fmt(r, 4)).join(', ')}` : '') : 'none (real)';
    } catch (e) { rootsStr = /not a polynomial/.test(String(e)) ? '— closed-form solve covers polynomials up to degree 6' : `— ${errText(e)}`; }
    num = { taylor, taylorStr, area, roots, rootsStr };
    renderOut();
  }

  function renderOut() {
    if (!comp || !num) return;
    const lo = +loIn.value, hi = +hiIn.value;
    outEl.innerHTML = `
      <span>f</span><span>${esc(Symbolic.toString(comp.ast))}</span>
      <span>f′</span><span>${esc(comp.dStr)}</span>
      <span>∫f dx</span><span>${esc(comp.intStr)}</span>
      <span>∫<sub>${lo}</sub><sup>${hi}</sup></span><span>${typeof num.area === 'number' ? `<b style="color:var(--accent)">${fmt(num.area, 6)}</b>` : esc(num.area)}</span>
      <span>roots</span><span>${esc(num.rootsStr)}</span>
      <span>T<sub>${orderIn.value}</sub>@${fmt(center, 2)}</span><span>${esc(num.taylorStr)}</span>
      <span>LaTeX</span><span class="mo-latex">${esc(comp.latex)}</span>`;
    $(el, '[data-av]').textContent = (+aIn.value).toFixed(2);
    $(el, '[data-ov]').textContent = orderIn.value;
  }

  function schedule() { if (active && !raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }

  function draw() {
    fit(canvas, 2);
    const W = canvas.width, H = canvas.height, dpr = W / canvas.clientWidth;
    // keep aspect sane: y-range follows x-range proportion
    const X = (x: number) => ((x - vw.x0) / (vw.x1 - vw.x0)) * W;
    const Y = (y: number) => H - ((y - vw.y0) / (vw.y1 - vw.y0)) * H;
    const ix = (px: number) => vw.x0 + (px / W) * (vw.x1 - vw.x0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, W, H);
    // grid
    const step = (range: number) => { const r = range / 8; const p = 10 ** Math.floor(Math.log10(r)); return [1, 2, 5, 10].map(m => m * p).find(s => s >= r) ?? p * 10; };
    const sx = step(vw.x1 - vw.x0), sy = step(vw.y1 - vw.y0);
    ctx.lineWidth = 1; ctx.font = `${10.5 * dpr}px ui-monospace, monospace`;
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let x = Math.ceil(vw.x0 / sx) * sx; x <= vw.x1; x += sx) { const px = X(x); ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke(); if (Math.abs(x) > 1e-9) ctx.fillText(+x.toFixed(6) + '', px + 3 * dpr, Math.min(H - 4 * dpr, Math.max(12 * dpr, Y(0) + 13 * dpr))); }
    for (let y = Math.ceil(vw.y0 / sy) * sy; y <= vw.y1; y += sy) { const py = Y(y); ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke(); if (Math.abs(y) > 1e-9) ctx.fillText(+y.toFixed(6) + '', Math.min(W - 30 * dpr, Math.max(3 * dpr, X(0) + 4 * dpr)), py - 3 * dpr); }
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), H); ctx.stroke();
    if (!comp) return;
    const a = +aIn.value;
    const env: Record<string, number> = { x: 0, a };
    const evalAt = (fn: (e: Record<string, number>) => number, x: number) => { env.x = x; try { return fn(env); } catch { return NaN; } };
    const accent = getComputedStyle(el).getPropertyValue('--accent').trim() || '#8b5cf6';
    const yr = vw.y1 - vw.y0;

    // area
    const lo = +loIn.value, hi = +hiIn.value;
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo !== hi) {
      const a0 = Math.min(lo, hi), a1 = Math.max(lo, hi);
      ctx.fillStyle = 'rgba(160,120,255,.22)';
      ctx.beginPath(); ctx.moveTo(X(a0), Y(0));
      const n = Math.max(2, Math.round((X(a1) - X(a0)) / 2));
      for (let i = 0; i <= n; i++) { const x = a0 + ((a1 - a0) * i) / n; const y = evalAt(comp.f, x); ctx.lineTo(X(x), Y(Number.isFinite(y) ? Math.max(vw.y0 - yr, Math.min(vw.y1 + yr, y)) : 0)); }
      ctx.lineTo(X(a1), Y(0)); ctx.closePath(); ctx.fill();
    }

    const curve = (fn: (e: Record<string, number>) => number, col: string, width: number, dash: number[] = []) => {
      ctx.strokeStyle = col; ctx.lineWidth = width * dpr; ctx.setLineDash(dash.map(d => d * dpr));
      ctx.beginPath();
      let pen = false, prev = NaN;
      for (let px = 0; px <= W; px += 1) {
        const y = evalAt(fn, ix(px));
        if (!Number.isFinite(y) || (Number.isFinite(prev) && Math.abs(y - prev) > yr * 1.5)) { pen = false; prev = y; continue; }
        const py = Math.max(-H, Math.min(2 * H, Y(y)));
        pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        pen = true; prev = y;
      }
      ctx.stroke(); ctx.setLineDash([]);
    };
    curve(comp.df, '#4cc9f0', 1.4, [5, 4]);
    if (num?.taylor) curve(num.taylor, '#f5a524', 1.6);
    ctx.shadowColor = accent; ctx.shadowBlur = 10 * dpr;
    curve(comp.f, accent, 2.6);
    ctx.shadowBlur = 0;

    // taylor center
    const fc = evalAt(comp.f, center);
    if (Number.isFinite(fc)) { ctx.fillStyle = '#f5a524'; ctx.beginPath(); ctx.arc(X(center), Y(fc), 4.5 * dpr, 0, Math.PI * 2); ctx.fill(); }
    // roots
    for (const r of num?.roots ?? []) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(X(r), Y(0), 4 * dpr, 0, Math.PI * 2); ctx.stroke(); }

    // hover tangent
    if (hoverX !== null) {
      const x = hoverX, y = evalAt(comp.f, x), m = evalAt(comp.df, x);
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1 * dpr;
      ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); ctx.stroke();
      if (Number.isFinite(y)) {
        if (Number.isFinite(m)) {
          const dx = (vw.x1 - vw.x0) * 0.12;
          ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.3 * dpr;
          ctx.beginPath(); ctx.moveTo(X(x - dx), Y(y - m * dx)); ctx.lineTo(X(x + dx), Y(y + m * dx)); ctx.stroke();
        }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(x), Y(y), 4 * dpr, 0, Math.PI * 2); ctx.fill();
      }
      const t = num?.taylor ? evalAt(num.taylor, x) : NaN;
      hud.innerHTML = `x = <b>${fmt(x, 4)}</b><br>f(x) = ${fmt(y, 5)}<br>f′(x) = ${fmt(m, 5)} <span class="stat">(tangent)</span><br>T(x) = ${fmt(t, 5)} <span class="stat">err ${fmt(Math.abs(t - y), 5)}</span>`;
    } else {
      hud.innerHTML = `<b>f</b>, <span style="color:#4cc9f0">f′</span> and <span style="color:#f5a524">Taylor</span> · a = ${a.toFixed(2)}`;
    }
  }

  /* interaction */
  const xAt = (e: MouseEvent) => { const r = canvas.getBoundingClientRect(); return vw.x0 + ((e.clientX - r.left) / r.width) * (vw.x1 - vw.x0); };
  const yAt = (e: MouseEvent) => { const r = canvas.getBoundingClientRect(); return vw.y1 - ((e.clientY - r.top) / r.height) * (vw.y1 - vw.y0); };
  let pan: { x: number; y: number; v: typeof vw; moved: boolean } | null = null;
  const onDown = (e: PointerEvent) => { pan = { x: e.clientX, y: e.clientY, v: { ...vw }, moved: false }; canvas.setPointerCapture(e.pointerId); };
  const onMove = (e: PointerEvent) => {
    if (pan) {
      const r = canvas.getBoundingClientRect();
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
      if (pan.moved) {
        const ux = (pan.v.x1 - pan.v.x0) / r.width, uy = (pan.v.y1 - pan.v.y0) / r.height;
        vw.x0 = pan.v.x0 - dx * ux; vw.x1 = pan.v.x1 - dx * ux; vw.y0 = pan.v.y0 + dy * uy; vw.y1 = pan.v.y1 + dy * uy;
      }
    }
    hoverX = xAt(e);
    schedule();
  };
  const onUp = (e: PointerEvent) => {
    if (pan && !pan.moved) { center = +xAt(e).toFixed(3); computeNumeric(); }
    pan = null;
    schedule();
  };
  const onLeave = () => { hoverX = null; schedule(); };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const f = Math.exp(e.deltaY * 0.0015), x = xAt(e), y = yAt(e);
    vw.x0 = x + (vw.x0 - x) * f; vw.x1 = x + (vw.x1 - x) * f; vw.y0 = y + (vw.y0 - y) * f; vw.y1 = y + (vw.y1 - y) * f;
    schedule();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  let t1 = 0, t2 = 0;
  exprIn.addEventListener('input', () => { clearTimeout(t1); t1 = window.setTimeout(compileExpr, 150); });
  aIn.addEventListener('input', () => { ctx0.sync({ a: +aIn.value }); renderOut(); schedule(); clearTimeout(t2); t2 = window.setTimeout(computeNumeric, 60); });
  for (const i of [orderIn, loIn, hiIn]) i.addEventListener('input', () => { computeNumeric(); schedule(); });
  for (const b of el.querySelectorAll<HTMLButtonElement>('[data-presets] .btn')) {
    b.addEventListener('click', () => {
      const p = PRESETS[+b.dataset.i!];
      exprIn.value = p.e;
      if (p.a !== undefined) aIn.value = String(p.a);
      compileExpr();
    });
  }
  const ro = new ResizeObserver(() => {
    // keep y-range proportional to canvas aspect
    const r = canvas.getBoundingClientRect();
    if (r.width > 0) { const cy = (vw.y0 + vw.y1) / 2; const half = ((vw.x1 - vw.x0) * (r.height / r.width)) / 2; vw.y0 = cy - half; vw.y1 = cy + half; }
    schedule();
  });
  ro.observe(canvas);

  exprIn.value = ctx0.initial.expr || PRESETS[0].e;
  aIn.value = String(ctx0.has('a') && Number.isFinite(+ctx0.initial.a) ? +ctx0.initial.a : PRESETS[0].a);
  compileExpr();
  $(el, '[data-export]').append(exportButton('math-graph', () => ({
    expr: exprIn.value.trim(),
    xRange: [+vw.x0.toPrecision(8), +vw.x1.toPrecision(8)],
    a: +aIn.value,
  })));

  return {
    el,
    activate() { active = true; ctx0.sync({ expr: exprIn.value.trim(), a: +aIn.value }); schedule(); },
    deactivate() { active = false; cancelAnimationFrame(raf); raf = 0; },
    destroy() {
      active = false; cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
}

/* =============================================================== VECTOR CALC */

/** A scalar potential Φ; its field is ∇Φ, computed point-by-point via VectorCalculus.gradient (real autodiff, not a closed form). */
interface VFPresetGradient {
  id: 'well' | 'saddle';
  short: string;
  label: string;
  kind: 'gradient';
  potential: (xs: DualNumber[]) => DualNumber;
  /** Same field, DualNumber-native (for divergence/curl3D — composing autodiff-of-autodiff isn't supported, so this is hand-derived). */
  fieldDual: (xs: DualNumber[]) => [DualNumber, DualNumber];
}
/** A vector field with no scalar potential (not conservative) — evaluated directly. */
interface VFPresetDirect {
  id: 'vortex';
  short: string;
  label: string;
  kind: 'direct';
  field: (x: number, y: number) => [number, number];
  fieldDual: (xs: DualNumber[]) => [DualNumber, DualNumber];
}
type VFPreset = VFPresetGradient | VFPresetDirect;

const VF_PRESETS: VFPreset[] = [
  {
    id: 'well', short: 'Potential well', label: 'Potential well · Φ = ½(x²+y²) · F = ∇Φ', kind: 'gradient',
    potential: xs => xs[0].pow(2).add(xs[1].pow(2)).multiply(0.5),
    fieldDual: xs => [xs[0], xs[1]],
  },
  {
    id: 'saddle', short: 'Saddle', label: 'Saddle · Φ = ½(x²−y²) · F = ∇Φ', kind: 'gradient',
    potential: xs => xs[0].pow(2).subtract(xs[1].pow(2)).multiply(0.5),
    fieldDual: xs => [xs[0], xs[1].negate()],
  },
  {
    id: 'vortex', short: 'Vortex', label: 'Vortex · F = (−y, x) — not a gradient field', kind: 'direct',
    field: (x, y) => [-y, x],
    fieldDual: xs => [xs[1].negate(), xs[0]],
  },
];

function sampleField(preset: VFPreset, x: number, y: number): [number, number] {
  if (preset.kind === 'gradient') {
    const g = VectorCalculus.gradient(preset.potential, [x, y]);
    return [g[0] ?? 0, g[1] ?? 0];
  }
  return preset.field(x, y);
}
function divergenceAt(preset: VFPreset, x: number, y: number): number {
  try { return VectorCalculus.divergence(preset.fieldDual, [x, y]); } catch { return NaN; }
}
/** z-component of curl3D with the field embedded in the z=0 plane (F_z ≡ 0) — the usual 2D scalar curl. */
function curlZAt(preset: VFPreset, x: number, y: number): number {
  try {
    const f3 = (xs: DualNumber[]): DualNumber[] => {
      const [fx, fy] = preset.fieldDual([xs[0], xs[1]]);
      return [fx, fy, DualNumber.constant(0)];
    };
    return VectorCalculus.curl3D(f3, [x, y, 0])[2];
  } catch { return NaN; }
}

/** A JS function alongside a hand-matched DualNumber version of the same formula, so forward-mode AD and the symbolic derivative are provably comparing the same math. */
interface ADPreset { id: string; label: string; expr: string; vars: string[]; point: number[]; dual: (xs: DualNumber[]) => DualNumber }
const AD_PRESETS: ADPreset[] = [
  {
    id: 'single', label: 'sin(1.5x)·e^(−x²/8)', expr: 'sin(1.5*x)*exp(-x^2/8)', vars: ['x'], point: [0.8],
    dual: xs => DualNumber.sin(xs[0].multiply(1.5)).multiply(DualNumber.exp(xs[0].pow(2).multiply(-1 / 8))),
  },
  {
    id: 'poly-trig', label: 'x²y + sin(xy)', expr: 'x^2*y + sin(x*y)', vars: ['x', 'y'], point: [1.1, 0.6],
    dual: xs => xs[0].pow(2).multiply(xs[1]).add(DualNumber.sin(xs[0].multiply(xs[1]))),
  },
  {
    id: 'log-cube', label: 'log(x²+1) − y³', expr: 'log(x^2+1) - y^3', vars: ['x', 'y'], point: [1.4, -0.7],
    dual: xs => DualNumber.log(xs[0].pow(2).add(1)).subtract(xs[1].pow(3)),
  },
];

const DOMAIN = 3; // half-width of the vector-field view (world units), also sent to Ecmanim as xRange/yRange

function vectorMode(ctx0: RoomCtx): Mode {
  const el = h('div', { class: 'mo-stage' });
  el.innerHTML = `
    <div class="mo-view">
      <canvas class="mo-main"></canvas>
      <div class="mo-hud"></div>
      <div class="mo-hint">hover: move the probe · div/curl update live</div>
    </div>
    <div class="mo-side">
      <div class="panel">
        <h3>Vector field</h3>
        <div class="mo-formula" data-vf-formula></div>
        <div class="mo-row" data-export></div>
        <div class="mo-row" data-vf-presets></div>
        <div class="mo-kv" data-vf-stats></div>
      </div>
      <div class="panel">
        <h3>Forward-mode AD vs symbolic</h3>
        <div class="mo-row" data-ad-presets></div>
        <div class="mo-formula" data-ad-formula></div>
        <div class="mo-inline">
          <label class="field">x <span class="stat" data-ad-xv></span><input type="range" min="-2.5" max="2.5" step="0.01" value="0.8" data-ad-x></label>
          <label class="field" data-ad-yfield>y <span class="stat" data-ad-yv></span><input type="range" min="-2.5" max="2.5" step="0.01" value="0.6" data-ad-y></label>
        </div>
        <div class="mo-kv" data-ad-out></div>
      </div>
      <div class="panel mo-how">
        <h3>How it's computed</h3>
        <p>The AD panel evaluates the same formula twice: once through <code>DualNumber</code> arithmetic (exact forward-mode autodiff, no finite differences), once through <code>Symbolic</code> differentiation — and shows they agree to float precision. The field panel samples <code>VectorCalculus.gradient</code> at every grid point for the two potential fields, and probes <code>divergence</code>/<code>curl3D</code> live under the cursor.</p>
<pre class="code">import { DualNumber, VectorCalculus } from '@johnhenry/math';

DualNumber.derivative(f, x);           // single variable
DualNumber.gradient(f, point);         // f: (xs: DualNumber[]) =&gt; DualNumber
VectorCalculus.symbolicGradient(expr, vars, point); // the comparison

VectorCalculus.gradient(potential, [x, y]);     // ∇Φ, per grid point
VectorCalculus.divergence(field, [x, y]);       // tr(Jacobian)
VectorCalculus.curl3D(field3, [x, y, 0])[2];    // 2D curl = ẑ-component</pre>
      </div>
    </div>`;

  const canvas = $<HTMLCanvasElement>(el, 'canvas.mo-main');
  const hud = $(el, '.mo-hud');
  const ctx = canvas.getContext('2d')!;
  const xIn = $<HTMLInputElement>(el, '[data-ad-x]');
  const yIn = $<HTMLInputElement>(el, '[data-ad-y]');
  const yField = $(el, '[data-ad-yfield]');

  const state = {
    vfIdx: 0,
    adIdx: 0,
    adPoint: [...AD_PRESETS[0].point] as number[],
    probe: [0.9, 0.4] as [number, number],
  };
  {
    const init = ctx0.initial;
    if (ctx0.has('vf')) { const i = VF_PRESETS.findIndex(p => p.id === init.vf); if (i >= 0) state.vfIdx = i; }
    if (ctx0.has('ad')) { const i = AD_PRESETS.findIndex(p => p.id === init.ad); if (i >= 0) { state.adIdx = i; state.adPoint = [...AD_PRESETS[i].point]; } }
    if (ctx0.has('probe') && Array.isArray(init.probe) && init.probe.length === 2 && init.probe.every(Number.isFinite)) {
      state.probe = [init.probe[0], init.probe[1]];
    }
  }
  const sig = (n: number, d = 6) => +n.toPrecision(d);
  function syncUrl() {
    ctx0.sync({ vf: VF_PRESETS[state.vfIdx].id, ad: AD_PRESETS[state.adIdx].id, probe: [sig(state.probe[0]), sig(state.probe[1])] });
  }
  $(el, '[data-export]').append(exportButton('math-vector-field', () => ({
    preset: VF_PRESETS[state.vfIdx].id,
    xRange: [-DOMAIN, DOMAIN, 0.5],
    yRange: [-DOMAIN, DOMAIN, 0.5],
    probe: state.probe,
  })));

  let active = false;
  let raf = 0;

  /* ---- vector field grid ---- */
  const vfRow = $(el, '[data-vf-presets]');
  for (let i = 0; i < VF_PRESETS.length; i++) {
    const b = h('button', { class: 'btn', 'data-i': String(i) }, VF_PRESETS[i].short);
    b.addEventListener('click', () => { state.vfIdx = i; updateVFButtons(); syncUrl(); schedule(); });
    vfRow.append(b);
  }
  function updateVFButtons() {
    for (const b of el.querySelectorAll<HTMLButtonElement>('[data-vf-presets] .btn')) b.classList.toggle('on', b.dataset.i === String(state.vfIdx));
    $(el, '[data-vf-formula]').textContent = VF_PRESETS[state.vfIdx].label;
  }

  function toField(e: PointerEvent): [number, number] {
    const r = canvas.getBoundingClientRect();
    const aspect = r.height / r.width;
    const xr = DOMAIN, yr = DOMAIN * aspect;
    return [-xr + ((e.clientX - r.left) / r.width) * 2 * xr, yr - ((e.clientY - r.top) / r.height) * 2 * yr];
  }
  function updateStats() {
    const preset = VF_PRESETS[state.vfIdx];
    const div = divergenceAt(preset, state.probe[0], state.probe[1]);
    const curl = curlZAt(preset, state.probe[0], state.probe[1]);
    hud.innerHTML = `<b>${esc(preset.label)}</b><br>at (${fmt(state.probe[0], 2)}, ${fmt(state.probe[1], 2)}): div F = ${fmt(div, 4)} · curl F·ẑ = ${fmt(curl, 4)}`;
    $(el, '[data-vf-stats]').innerHTML = `
      <span>div F (probe)</span><span>${fmt(div, 6)}</span>
      <span>curl F·ẑ (probe)</span><span>${fmt(curl, 6)}</span>
      <span>probe</span><span>(${fmt(state.probe[0], 3)}, ${fmt(state.probe[1], 3)})</span>`;
  }

  function draw() {
    fit(canvas, 2);
    const W = canvas.width, H = canvas.height, dpr = W / canvas.clientWidth;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, W, H);
    const preset = VF_PRESETS[state.vfIdx];
    const aspect = H / W;
    const xr = DOMAIN, yr = DOMAIN * aspect;
    const cols = 17;
    const rows = Math.max(3, Math.round(cols * aspect));
    const toPx = (x: number, y: number): [number, number] => [((x + xr) / (2 * xr)) * W, (1 - (y + yr) / (2 * yr)) * H];
    const cellW = W / (cols - 1);
    const pts: { x: number; y: number; v: [number, number] }[] = [];
    let maxMag = 0;
    for (let j = 0; j < rows; j++) {
      const y = yr - (j / (rows - 1)) * 2 * yr;
      for (let i = 0; i < cols; i++) {
        const x = -xr + (i / (cols - 1)) * 2 * xr;
        const v = sampleField(preset, x, y);
        pts.push({ x, y, v });
        maxMag = Math.max(maxMag, Math.hypot(v[0], v[1]));
      }
    }
    for (const p of pts) {
      const mag = Math.hypot(p.v[0], p.v[1]);
      const t = maxMag > 1e-9 ? mag / maxMag : 0;
      const [px, py] = toPx(p.x, p.y);
      const len = cellW * (0.16 + 0.6 * t);
      const ang = Math.atan2(-p.v[1], p.v[0]); // canvas y is flipped vs field y
      const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
      const col = `hsl(${260 - t * 220}, 80%, ${55 + t * 10}%)`;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
      const L = 5 * dpr;
      ctx.beginPath(); ctx.moveTo(ex, ey);
      ctx.lineTo(ex - L * Math.cos(ang - 0.5), ey - L * Math.sin(ang - 0.5));
      ctx.lineTo(ex - L * Math.cos(ang + 0.5), ey - L * Math.sin(ang + 0.5));
      ctx.closePath(); ctx.fill();
    }
    const [ppx, ppy] = toPx(state.probe[0], state.probe[1]);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.arc(ppx, ppy, 13 * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ppx, ppy, 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
    updateStats();
  }
  function schedule() { if (active && !raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }

  // pointer events (not mousemove) so the probe can be moved by touch-drag too,
  // not just mouse hover — plain mousemove never fires on touch devices, which
  // left this probe permanently stuck at its initial position on mobile
  // (found in mobile touch audit, confirmed via Playwright touch emulation).
  const onMove = (e: PointerEvent) => { state.probe = toField(e); schedule(); syncUrl(); };
  canvas.addEventListener('pointerdown', onMove);
  canvas.addEventListener('pointermove', onMove);

  /* ---- forward-mode AD vs symbolic ---- */
  const adRow = $(el, '[data-ad-presets]');
  for (let i = 0; i < AD_PRESETS.length; i++) {
    const b = h('button', { class: 'btn', 'data-i': String(i) }, AD_PRESETS[i].label);
    b.addEventListener('click', () => {
      state.adIdx = i;
      state.adPoint = [...AD_PRESETS[i].point];
      xIn.value = String(state.adPoint[0]);
      yIn.value = String(state.adPoint[1] ?? 0);
      renderAD();
      syncUrl();
    });
    adRow.append(b);
  }
  function renderAD() {
    const preset = AD_PRESETS[state.adIdx];
    for (const b of el.querySelectorAll<HTMLButtonElement>('[data-ad-presets] .btn')) b.classList.toggle('on', b.dataset.i === String(state.adIdx));
    $(el, '[data-ad-formula]').textContent = `f = ${preset.expr}`;
    yField.style.display = preset.vars.length < 2 ? 'none' : '';
    $(el, '[data-ad-xv]').textContent = state.adPoint[0].toFixed(2);
    $(el, '[data-ad-yv]').textContent = (state.adPoint[1] ?? 0).toFixed(2);
    const point = preset.vars.map((_, i) => state.adPoint[i] ?? 0);
    const pointRecord: Record<string, number> = {};
    preset.vars.forEach((v, i) => (pointRecord[v] = point[i]));
    let dual: number[];
    try {
      dual = preset.vars.length === 1
        ? [DualNumber.derivative(x => preset.dual([x]), point[0])]
        : DualNumber.gradient(preset.dual, point);
    } catch (e) { dual = preset.vars.map(() => NaN); }
    let sym: number[];
    try { sym = VectorCalculus.symbolicGradient(preset.expr, preset.vars, pointRecord); }
    catch (e) { sym = preset.vars.map(() => NaN); }
    const rows = preset.vars
      .map((v, i) => `<span>∂f/∂${v} (DualNumber)</span><span>${fmt(dual[i], 8)}</span><span>∂f/∂${v} (Symbolic)</span><span>${fmt(sym[i], 8)}</span>`)
      .join('');
    const maxDiff = Math.max(...preset.vars.map((_, i) => Math.abs(dual[i] - sym[i])));
    $(el, '[data-ad-out]').innerHTML = `${rows}<span>max |Δ|</span><span>${fmt(maxDiff, 12)} ${maxDiff < 1e-6 ? '✓ agree' : ''}</span>`;
  }
  xIn.addEventListener('input', () => { state.adPoint[0] = +xIn.value; renderAD(); });
  yIn.addEventListener('input', () => { state.adPoint[1] = +yIn.value; renderAD(); });

  const ro = new ResizeObserver(() => { if (active) schedule(); });
  ro.observe(el);

  xIn.value = String(state.adPoint[0]);
  yIn.value = String(state.adPoint[1] ?? AD_PRESETS[state.adIdx].point[1] ?? 0);
  updateVFButtons();
  renderAD();

  return {
    el,
    activate() { active = true; schedule(); },
    deactivate() { active = false; cancelAnimationFrame(raf); raf = 0; },
    destroy() {
      active = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onMove);
      canvas.removeEventListener('pointermove', onMove);
    },
  };
}

/* ==================================================================== PLANET */

const playground: Playground = {
  id: 'math',
  title: 'Math Observatory',
  pkg: '@johnhenry/math',
  hue: 260,
  blurb: 'Complex numbers, rotors and linear algebra rendered as living fractals and fields.',
  docs: 'https://opensource.johnhenry.me/math/',
  mount(host) {
    const root = h('div', { class: 'pg-math' });
    host.append(root);
    const urlKeys = new Set(new URLSearchParams(location.hash.split('?')[1] ?? '').keys());
    const url: MathState = readState(DEFAULTS);
    const ctx: RoomCtx = {
      initial: { ...url },
      has: k => urlKeys.has(k),
      sync(patch) {
        Object.assign(url, patch);
        // only the active mode's keys belong in the link
        const m = url.mode;
        const pick: Partial<MathState> = { mode: m };
        if (m === 'fractal') Object.assign(pick, { preset: url.preset, kind: url.kind, c: url.c, zoom: url.zoom, center: url.center });
        if (m === 'rotor') pick.plane = url.plane;
        if (m === 'symbolic') Object.assign(pick, { expr: url.expr, a: url.a });
        if (m === 'vector') Object.assign(pick, { vf: url.vf, ad: url.ad, probe: url.probe });
        writeState(pick, DEFAULTS);
      },
    };
    // The tab strip scrolls horizontally on its own (see .mo-tabs-row in
    // math.css); copy-link sits outside it so it never gets pushed onto its
    // own wrapped row (issue #42, Math Observatory P2, M4/M6).
    const tabsRow = h('div', { class: 'mo-tabs-row' });
    const tabs = h('div', { class: 'mo-tabs', role: 'tablist' });
    tabsRow.append(tabs);
    root.append(tabsRow);
    const body = h('div');
    root.append(body);

    const defs: { id: string; label: string; make: () => Mode }[] = [
      { id: 'fractal', label: '◐ Complex fractals', make: () => fractalMode(ctx) },
      { id: 'rotor', label: '⟳ Rotors in 4D', make: () => rotorMode(ctx) },
      { id: 'symbolic', label: 'ƒ Symbolic plotter', make: () => symbolicMode(ctx) },
      { id: 'vector', label: '∇ Vector calculus', make: () => vectorMode(ctx) },
    ];
    const modes = new Map<string, Mode>();
    let current: Mode | null = null;
    const errBox = h('pre', { class: 'code mo-err' });

    function show(id: string) {
      const d = defs.find(x => x.id === id) ?? defs[0];
      for (const b of tabs.querySelectorAll<HTMLButtonElement>('.btn')) b.setAttribute('aria-selected', String(b.dataset.id === d.id));
      current?.deactivate();
      body.innerHTML = '';
      url.mode = d.id;
      ctx.sync({});
      try {
        let m = modes.get(d.id);
        if (!m) { m = d.make(); modes.set(d.id, m); }
        body.append(m.el);
        current = m;
        m.activate();
      } catch (e) {
        current = null;
        errBox.textContent = `This mode failed to start.\n\n${(e as Error)?.stack ?? e}`;
        body.append(errBox);
      }
    }
    for (const d of defs) {
      const b = h('button', { class: 'btn', role: 'tab', 'data-id': d.id }, d.label);
      b.addEventListener('click', () => show(d.id));
      tabs.append(b);
    }
    const linkBtn = h('button', { class: 'btn mo-link', title: 'Copy a link to exactly this view' }, '🔗 copy link');
    let linkTimer = 0;
    linkBtn.addEventListener('click', async () => {
      await new Promise(r => setTimeout(r, 200)); // writeState is debounced
      await copyLink();
      linkBtn.textContent = '✓ copied';
      clearTimeout(linkTimer);
      linkTimer = window.setTimeout(() => { linkBtn.textContent = '🔗 copy link'; }, 1400);
    });
    tabsRow.append(linkBtn);
    show(url.mode);

    return () => {
      clearTimeout(linkTimer);
      current?.deactivate();
      for (const m of modes.values()) m.destroy();
      modes.clear();
      root.remove();
    };
  },
};
export default playground;
