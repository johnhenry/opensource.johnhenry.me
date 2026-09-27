/**
 * Tensor Telemetry dock (ROADMAP §4.2).
 *
 * One global @johnhenry/math-plus-telemetry sink, owned by this dock alone.
 * Per the library's own README, `setSink` is a single global slot with no
 * unsubscribe token — a second caller would silently steal every event from
 * this one — so this file is the ONLY place in the app that ever calls
 * `setSink()`. It renders:
 *
 *   - a live sparkline of `optim/gradNorm` metric values. Every optimizer's
 *     `.step()` computes and emits this, but ONLY when `hasSink()` is true
 *     (see math-plus-tensor-autograd/dist/optim.js) — installing this dock
 *     is what switches that computation on, anywhere in the page.
 *   - flame-graph-style bars for `backward` trace spans, emitted by
 *     `Variable#backward` via the library's `timed()` helper, which skips
 *     even the `performance.now()` calls when no sink is installed.
 *   - the latest `tensor.summary` event. Nothing upstream emits these on its
 *     own (only `optim/gradNorm` and `backward` spans are wired in today),
 *     so `src/playgrounds/tensor.ts` now emits one per train step, guarded
 *     by `hasSink()` the same way every other producer is — see the comment
 *     there for the exact hook.
 *   - a pause toggle that calls `setSink(null)` / `setSink(sink)`, a live
 *     `hasSink()` readout, and a "measure cost" probe that runs a tight
 *     backward+step loop with the sink on vs. off and reports the real
 *     wall-clock difference — so "instrumentation is free when unobserved"
 *     is demonstrated, not just asserted.
 *
 * Clock discipline (per the library's README): `metric.time` is
 * `Date.now()`-based; `trace.spans[].start`/`duration` are
 * `performance.now()`-based, and the two are NOT comparable. This file never
 * subtracts one from the other: the sparkline orders `optim/gradNorm` points
 * by arrival using `metric.time`'s own clock only, and the flame bars order
 * spans using `span.start`/`span.duration`'s own clock only.
 */
import { setSink, hasSink, type TrainingEvent } from '@johnhenry/math-plus-telemetry';
import { Tensor, random } from '@johnhenry/math-plus-tensor-core';
import { constant, nn, optim } from '@johnhenry/math-plus-tensor-autograd';
import { registerDevTool } from './dev-drawer';
import './telemetry-dock.css';

const MAX_GRAD_POINTS = 80;
const MAX_SPANS = 24;

interface GradPoint { time: number; value: number } // time: Date.now() ms — metric clock
interface SpanBar { name: string; category: string; start: number; duration: number } // performance.now() ms — span clock
type SummaryEvent = Extract<TrainingEvent, { type: 'tensor.summary' }>;

let mounted = false;

/** Mount the dock once, globally. Call exactly once from main.ts. */
export function mountTelemetryDock(): void {
  if (mounted) return; // one dock, one global sink slot — never install twice
  mounted = true;

  const gradPoints: GradPoint[] = [];
  const spans: SpanBar[] = [];
  let latestSummary: SummaryEvent | null = null;
  let totalEvents = 0;
  let lastEventAt = 0; // Date.now(), display-only ("Ns ago"), never mixed with span timing
  let dirty = true;

  // The dock used to be its own floating root (`.telemetry-dock`) appended to
  // document.body, with a `.td-handle` toggle button that collapsed it to a
  // small circle. Both are gone — this pane now lives inside the Dev Drawer,
  // whose own tab strip is the toggle. Everything below queries `container`
  // (the drawer's pane element) instead of the old dock's own `root`.
  // The `.td-count`/`.td-dot` readouts that used to live inside the removed
  // handle are relocated into the body's own top stat row so the same
  // information stays visible.
  let container!: HTMLElement;
  registerDevTool({
    id: 'telemetry',
    label: 'Telemetry',
    icon: '📈',
    mount(host) {
      container = host;
      container.classList.add('telemetry-dock-pane');
      container.innerHTML = `
        <div class="td-row stat">
          <span class="td-dot"></span>
          <span class="td-count">0 events</span>
          &middot; hasSink(): <b class="td-hassink">true</b>
          &middot; last event <span class="td-age">&mdash;</span>
        </div>
        <div class="td-row">
          <button class="btn primary td-pause" type="button">Pause</button>
          <button class="btn td-probe" type="button">Measure cost</button>
        </div>
        <div class="td-row td-probe-result"></div>
        <div class="td-empty">No tensor/autograd activity captured yet. Visit <a href="#/tensor">Tensor Bench</a> and train a model &mdash; this sink is global, so real autograd work from any room lights it up.</div>
        <div class="td-live" hidden>
          <div class="td-section">
            <div class="td-label">gradient norm &middot; optim/gradNorm</div>
            <canvas class="td-spark" width="280" height="40"></canvas>
            <div class="stat td-spark-stat">&mdash;</div>
          </div>
          <div class="td-section">
            <div class="td-label">backward spans &middot; flame</div>
            <div class="td-flame"></div>
          </div>
          <div class="td-section">
            <div class="td-label">tensorSummary</div>
            <pre class="code td-summary">&mdash;</pre>
          </div>
        </div>
        <div class="td-clock-note">metric.time is Date.now(); trace spans use performance.now() &mdash; the two clocks are never compared against each other here.</div>`;
    },
  });

  const root = container;
  const pauseBtn = root.querySelector<HTMLButtonElement>('.td-pause')!;
  const probeBtn = root.querySelector<HTMLButtonElement>('.td-probe')!;
  const hasSinkEl = root.querySelector<HTMLElement>('.td-hassink')!;
  const ageEl = root.querySelector<HTMLElement>('.td-age')!;
  const countEl = root.querySelector<HTMLElement>('.td-count')!;
  const probeResultEl = root.querySelector<HTMLElement>('.td-probe-result')!;
  const emptyEl = root.querySelector<HTMLElement>('.td-empty')!;
  const liveEl = root.querySelector<HTMLElement>('.td-live')!;
  const sparkEl = root.querySelector<HTMLCanvasElement>('.td-spark')!;
  const sparkStatEl = root.querySelector<HTMLElement>('.td-spark-stat')!;
  const flameEl = root.querySelector<HTMLElement>('.td-flame')!;
  const summaryEl = root.querySelector<HTMLElement>('.td-summary')!;

  /** The dock's own sink — the one global slot this app ever installs. */
  function onEvent(e: TrainingEvent): void {
    totalEvents++;
    lastEventAt = Date.now();
    if (e.type === 'metric' && e.name === 'optim/gradNorm') {
      gradPoints.push({ time: e.time, value: e.value });
      if (gradPoints.length > MAX_GRAD_POINTS) gradPoints.splice(0, gradPoints.length - MAX_GRAD_POINTS);
    } else if (e.type === 'trace') {
      for (const s of e.spans) spans.push({ name: s.name, category: s.category, start: s.start, duration: s.duration });
      if (spans.length > MAX_SPANS) spans.splice(0, spans.length - MAX_SPANS);
    } else if (e.type === 'tensor.summary') {
      latestSummary = e;
    }
    dirty = true;
  }

  let capturing = true;
  function goLive(): void {
    setSink(onEvent);
    capturing = true;
    root.classList.add('live'); root.classList.remove('paused');
    pauseBtn.textContent = 'Pause';
    dirty = true;
  }
  function goPaused(): void {
    setSink(null);
    capturing = false;
    root.classList.add('paused'); root.classList.remove('live');
    pauseBtn.textContent = 'Resume';
    dirty = true;
  }
  pauseBtn.addEventListener('click', () => (capturing ? goPaused() : goLive()));
  goLive(); // the dock owns the global slot from the moment it mounts

  /* ---- cost probe: a real backward+step loop, timed with the sink on vs. off ------ */
  /** A tiny, self-contained 2-layer MLP step — isolated from whatever Tensor Bench is doing. */
  function makeBenchStep(): () => void {
    const rng = random.seed(11);
    const n = 64, hidden = 8;
    const xs = new Float32Array(n * 2);
    for (let i = 0; i < xs.length; i++) xs[i] = rng.nextFloat() * 2 - 1;
    const ys = new Float32Array(n);
    for (let i = 0; i < n; i++) ys[i] = xs[2 * i] * xs[2 * i + 1] > 0 ? 1 : 0;
    const X = constant(Tensor.fromTypedArray(xs, [n, 2], { dtype: 'f32' }));
    const Y = constant(Tensor.fromTypedArray(ys, [n, 1], { dtype: 'f32' }));
    const W1 = new nn.Parameter(random.normal([2, hidden], { rng }).mul(1.2));
    const b1 = new nn.Parameter(Tensor.zeros([hidden], { dtype: 'f32' }));
    const W2 = new nn.Parameter(random.normal([hidden, 1], { rng }).mul(1 / Math.sqrt(hidden)));
    const b2 = new nn.Parameter(Tensor.zeros([1], { dtype: 'f32' }));
    const adam = new optim.Adam([W1, b1, W2, b2], { lr: 0.01 });
    return () => {
      const pred = X.matmul(W1).add(b1).tanh().matmul(W2).add(b2);
      const loss = nn.binaryCrossEntropy(pred, Y);
      adam.zeroGrad();
      loss.backward();
      adam.step();
    };
  }

  function runProbe(): void {
    probeBtn.disabled = true;
    probeResultEl.textContent = 'measuring…';
    // Let the "measuring…" label paint before the synchronous loops below block the thread.
    requestAnimationFrame(() => {
      const wasCapturing = capturing;
      try {
        const stepOff = makeBenchStep();
        const stepOn = makeBenchStep();
        let probeEvents = 0;
        const countingSink = () => { probeEvents++; }; // throwaway — never touches the dock's real buffers

        // Warm up BOTH code paths before measuring anything: a naive "measure off, then measure
        // on" comparison is biased because V8's JIT keeps optimizing the shared tensor-op methods
        // across the whole run, so whichever half runs second looks artificially faster regardless
        // of sink state. (An earlier version of this probe reported a negative "overhead" for
        // exactly this reason — measurement noise, not a real result.)
        setSink(null); for (let i = 0; i < 300; i++) stepOff();
        setSink(countingSink); for (let i = 0; i < 300; i++) stepOn();

        // Many short rounds, flipping which condition goes first each round (so residual JIT/GC
        // drift lands on both conditions equally) — then compare MEDIANS across rounds rather than
        // sums, so a single round stalled by an unrelated tab/process doesn't skew the result.
        const rounds = 16, perRound = 300;
        const offTimes: number[] = [], onTimes: number[] = [];
        probeEvents = 0;
        const runOff = () => { setSink(null); const t = performance.now(); for (let i = 0; i < perRound; i++) stepOff(); offTimes.push(performance.now() - t); };
        const runOn = () => { setSink(countingSink); const t = performance.now(); for (let i = 0; i < perRound; i++) stepOn(); onTimes.push(performance.now() - t); };
        for (let r = 0; r < rounds; r++) { if (r % 2 === 0) { runOff(); runOn(); } else { runOn(); runOff(); } }

        const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
        const offMs = median(offTimes), onMs = median(onTimes);
        const offUs = (offMs / perRound) * 1000;
        const onUs = (onMs / perRound) * 1000;
        const overheadPct = offMs > 0 ? ((onMs - offMs) / offMs) * 100 : 0;
        probeResultEl.textContent =
          `${perRound}-iter median of ${rounds} alternating rounds (performance.now) — sink off: ${offMs.toFixed(2)}ms (${offUs.toFixed(2)}µs/iter) · ` +
          `sink on: ${onMs.toFixed(2)}ms (${onUs.toFixed(2)}µs/iter, ${probeEvents} events emitted across all rounds) · ` +
          `overhead: ${overheadPct >= 0 ? '+' : ''}${overheadPct.toFixed(1)}%`;
      } finally {
        // Restore whatever the pause toggle said before the probe ran.
        if (wasCapturing) setSink(onEvent); else setSink(null);
        probeBtn.disabled = false;
      }
    });
  }
  probeBtn.addEventListener('click', runProbe);

  /* ---- render loop -------------------------------------------------------------- */
  function fmtMs(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
    if (ms < 10) return `${ms.toFixed(2)}ms`;
    return `${ms.toFixed(1)}ms`;
  }
  function fmtNum(x: number): string {
    if (!Number.isFinite(x)) return String(x);
    const a = Math.abs(x);
    return a !== 0 && (a < 1e-3 || a >= 1e5) ? x.toExponential(3) : x.toPrecision(4);
  }

  function paintSpark(): void {
    const ctx = sparkEl.getContext('2d');
    if (!ctx) return;
    const w = sparkEl.width, h = sparkEl.height;
    ctx.clearRect(0, 0, w, h);
    if (gradPoints.length < 2) return;
    const values = gradPoints.map((p) => p.value);
    const lo = Math.min(...values), hi = Math.max(...values);
    const span = hi - lo || 1;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * (w - 4) + 2;
      const y = h - 4 - ((v - lo) / span) * (h - 8);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    // `--accent` is a document-wide custom property (see src/styles/base.css /
    // circuit/tokens.css) that this pane never overrides locally, so reading
    // it off `root` (== the drawer's pane element) returns the same value
    // `document.documentElement` would — kept as `root` for minimal diff.
    ctx.strokeStyle = getComputedStyle(root).getPropertyValue('--accent').trim() || '#6ea0ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const last = values[values.length - 1];
    sparkStatEl.textContent = `last ${last.toExponential(2)} · min ${lo.toExponential(2)} · max ${hi.toExponential(2)} · n=${values.length}`;
  }

  function paintFlame(): void {
    if (spans.length === 0) { flameEl.innerHTML = ''; return; }
    const maxDur = Math.max(...spans.map((s) => s.duration), 1e-6);
    const rows = spans.slice(-12).reverse().map((s) => {
      const pct = Math.max(2, (s.duration / maxDur) * 100);
      return `<div class="td-flame-bar" title="${s.name} · ${s.category} · start=${s.start.toFixed(2)}ms (performance.now)">
        <div class="td-flame-fill" style="width:${pct}%"></div>
        <span class="td-flame-dur">${s.name} ${fmtMs(s.duration)}</span>
      </div>`;
    });
    flameEl.innerHTML = rows.join('');
  }

  function paintSummary(): void {
    if (!latestSummary) { summaryEl.textContent = '—'; return; }
    const t = latestSummary.tensor;
    summaryEl.textContent =
      `${latestSummary.name}  (run ${latestSummary.runId} · step ${latestSummary.step})\n` +
      `shape [${t.shape.join(', ')}]  dtype ${t.dtype}  device ${t.device}\n` +
      `min ${fmtNum(t.stats.min)}  max ${fmtNum(t.stats.max)}  mean ${fmtNum(t.stats.mean)}  std ${fmtNum(t.stats.std)}  finite ${(t.stats.finite * 100).toFixed(1)}%`;
  }

  function tick(): void {
    requestAnimationFrame(tick);
    // These stay live even without new events — hasSink() is a real, direct call, not a mirrored flag.
    hasSinkEl.textContent = String(hasSink());
    ageEl.textContent = totalEvents === 0 ? '—' : `${Math.max(0, Math.round((Date.now() - lastEventAt) / 1000))}s ago`;
    countEl.textContent = `${totalEvents} event${totalEvents === 1 ? '' : 's'}`;
    if (!dirty) return;
    dirty = false;
    const hasData = totalEvents > 0;
    emptyEl.hidden = hasData;
    liveEl.hidden = !hasData;
    if (!hasData) return;
    paintSpark();
    paintFlame();
    paintSummary();
  }
  requestAnimationFrame(tick);
}
