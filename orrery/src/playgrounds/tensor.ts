import type { Playground } from '../registry';
import { Tensor, random, type Rng } from '@johnhenry/math-plus-tensor-core';
import { variable, constant, noGrad, nn, optim, type Variable } from '@johnhenry/math-plus-tensor-autograd';
import { ComplexTensor, rfft, irfft } from '@johnhenry/math-plus-fft';
import { butter, sosFilter, freqz, hannWindow, hammingWindow, findPeaks, type Sos } from '@johnhenry/math-plus-signal';
import { resize, normalize } from '@johnhenry/math-plus-image';
import {
  Unit, BASE_UNITS, PREFIXES, dimensionToString, isDimensionless,
  DimensionMismatchError, UnknownUnitError, UnitParseError, type Dimension,
} from '@johnhenry/math-plus-unit';
// ROADMAP 4.2 (Tensor Telemetry dock): backward()/optim.step() already emit "backward" trace
// spans and "optim/gradNorm" metrics on their own whenever a sink is installed (hasSink()-gated
// inside those packages). tensorSummary is the one event type nothing upstream emits by itself,
// so this room emits one per train step — also gated by hasSink() — for the global dock to show.
import { hasSink, tensorSummary } from '@johnhenry/math-plus-telemetry';
import { readState, writeState, copyLink } from '../state';
import './tensor.css';

/* ────────────────────────────────────────────────────────────────────────── */
/* shared helpers                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

type TabId = 'grad' | 'fft' | 'image' | 'units';

const DEFAULTS = {
  tab: 'grad' as string,
  // autograd
  ds: 'spiral', hid: 16, act: 'tanh', lr: 0.03, opt: 'adam',
  // fft
  sig: 'mix', flt: 'lowpass', fc: 30, bw: 20, ord: 4, win: 'hann', meth: 'freqz',
  // image
  img: 'zone', op: 'sobel', k: 5, th: 0.5, amt: 1.5, size: 160, eng: 'cpu',
  // units
  expr: '3 m/s * 2 h in km',
};
type State = typeof DEFAULTS;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (x: number, d = 3) => {
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return x.toExponential(d - 1);
  return Number(x.toPrecision(d + 1)).toString();
};
const ms = (x: number) => (x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : Math.round(x).toString()) + ' ms';
const cssVar = (el: Element, name: string, fallback: string) => getComputedStyle(el).getPropertyValue(name).trim() || fallback;
// M13: these charts draw at a fixed internal resolution (e.g. 1000×240 for
// the FFT spectrum) that's then scaled down by CSS to the actual panel width
// (canvas { width:100%; height:auto }). A literal "16px" canvas font looks
// fine at the internal resolution but shrinks with everything else once
// displayed — confirmed live: the spectrum canvas renders at 327/1000 = .33x
// on a phone, so its 16px axis labels come out ~5px on screen; the loss
// curve's 12px labels come out ~7.5px. Scale the canvas font up by exactly
// the inverse of that display ratio so the *rendered* size never drops below
// `minPx`, without changing anything on wider viewports where it already
// renders at/above the minimum.
function chartFontPx(canvas: HTMLCanvasElement, basePx: number, minPx = 11): number {
  const scale = (canvas.clientWidth || canvas.width) / canvas.width;
  return scale > 0 ? Math.max(basePx, minPx / scale) : basePx;
}

// ROADMAP 4.2: runId for this room's telemetry, and a summary-only (never raw values) reducer
// feeding the global Tensor Telemetry dock's tensorSummary panel.
const TELEMETRY_RUN = 'tensor-bench';
function summarizeTensor(t: Tensor) {
  const c = t.contiguous();
  const buf = c.data;
  const n = c.size;
  let min = Infinity, max = -Infinity, sum = 0, finite = 0;
  for (let i = 0; i < n; i++) {
    const v = Number(buf[c.offset + i]);
    if (Number.isFinite(v)) { finite++; if (v < min) min = v; if (v > max) max = v; sum += v; }
  }
  const mean = finite ? sum / finite : 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const v = Number(buf[c.offset + i]);
    if (Number.isFinite(v)) variance += (v - mean) ** 2;
  }
  const std = finite ? Math.sqrt(variance / finite) : 0;
  return {
    shape: t.shape, dtype: t.dtype, device: 'cpu',
    stats: { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 0, mean, std, finite: n ? finite / n : 1 },
  };
}

/** Tiny syntax colouring for the "calls used" panels. */
function hl(code: string): string {
  const re = /(\/\/[^\n]*)|("[^"\n]*")|\b(import|from|const|await|new|for|of|if|return)\b|\b(\d+(?:\.\d+)?(?:e-?\d+)?)\b/g;
  let out = ''; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : 'n';
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function select(label: string, options: [string, string][], value: string): { wrap: HTMLLabelElement; input: HTMLSelectElement } {
  const wrap = el('label', 'field');
  wrap.append(label);
  const input = el('select');
  for (const [v, t] of options) { const o = el('option'); o.value = v; o.textContent = t; input.append(o); }
  input.value = value;
  wrap.append(input);
  return { wrap, input };
}

function range(label: string, min: number, max: number, step: number, value: number, show: (v: number) => string = String) {
  const wrap = el('label', 'field');
  const head = el('span', 'rh');
  const val = el('b');
  head.append(label, val);
  const input = el('input');
  input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
  const sync = () => { val.textContent = show(Number(input.value)); };
  input.addEventListener('input', sync); sync();
  wrap.append(head, input);
  return { wrap, input, sync };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Tab 1 · Autograd — a 2-layer MLP learning a 2-D classification             */
/* ────────────────────────────────────────────────────────────────────────── */

interface Dataset { X: Tensor; Y: Tensor; pts: Float32Array; labels: Uint8Array }

function makeDataset(kind: string, n = 240): Dataset {
  const rng: Rng = random.seed(7);
  const g = () => { // Box-Muller from the tensor-core Rng
    const u = Math.max(1e-9, rng.nextFloat()), v = rng.nextFloat();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const pts = new Float32Array(n * 2), labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, c = 0;
    if (kind === 'xor') {
      const qx = rng.nextFloat() < 0.5 ? -1 : 1, qy = rng.nextFloat() < 0.5 ? -1 : 1;
      x = qx * 0.5 + g() * 0.16; y = qy * 0.5 + g() * 0.16; c = qx * qy > 0 ? 1 : 0;
    } else if (kind === 'circle') {
      c = i % 2;
      const r = c ? 0.25 * rng.nextFloat() + 0.02 : 0.62 + 0.25 * rng.nextFloat();
      const t = rng.nextFloat() * Math.PI * 2;
      x = r * Math.cos(t) + g() * 0.04; y = r * Math.sin(t) + g() * 0.04;
    } else if (kind === 'moons') {
      c = i % 2;
      const t = rng.nextFloat() * Math.PI;
      x = c ? 1 - Math.cos(t) - 0.5 : Math.cos(t) - 0.5; y = c ? 0.35 - Math.sin(t) * 0.8 : Math.sin(t) * 0.8 - 0.35;
      x = x * 0.7 + g() * 0.06; y = y * 0.9 + g() * 0.06;
    } else { // spiral
      c = i % 2;
      const k = Math.floor(i / 2) / (n / 2);
      const r = 0.08 + k * 0.85, t = k * 1.6 * 2 * Math.PI + c * Math.PI;
      x = r * Math.sin(t) + g() * 0.03; y = r * Math.cos(t) + g() * 0.03;
    }
    pts[2 * i] = x; pts[2 * i + 1] = y; labels[i] = c;
  }
  const X = Tensor.fromTypedArray(pts, [n, 2], { dtype: 'f32' });
  const Y = Tensor.from(Array.from(labels), { dtype: 'f32' }).reshape([n, 1]);
  return { X, Y, pts, labels };
}

interface Model { W1: nn.Parameter; b1: nn.Parameter; W2: nn.Parameter; b2: nn.Parameter }

function initModel(hidden: number, seed: number): Model {
  const rng = random.seed(seed);
  return {
    W1: new nn.Parameter(random.normal([2, hidden], { rng }).mul(1.4)),
    b1: new nn.Parameter(random.normal([hidden], { rng }).mul(0.2)),
    W2: new nn.Parameter(random.normal([hidden, 1], { rng }).mul(1 / Math.sqrt(hidden))),
    b2: new nn.Parameter(Tensor.zeros([1], { dtype: 'f32' })),
  };
}

const actVar = (v: Variable, a: string) => (a === 'relu' ? v.relu() : a === 'sigmoid' ? v.sigmoid() : v.tanh());
const actTen = (t: Tensor, a: string) => (a === 'relu' ? t.relu() : a === 'sigmoid' ? t.sigmoid() : t.tanh());

interface GNode { id: number; name: string; kind: 'input' | 'param' | 'op' | 'loss'; shape: readonly number[]; grad?: number; hidden?: number }
interface GEdge { from: number; to: number }

function mountGrad(root: HTMLElement, st: State, save: () => void): () => void {
  root.innerHTML = '';
  const intro = el('p', 'what', `A two-layer perceptron built by hand from <code>Tensor</code>s wrapped as autograd <code>Parameter</code>s. Every step records a define-by-run tape, <code>loss.backward()</code> walks it in reverse, and <code>optim.Adam</code> nudges the weights. The coloured field is the network's prediction over the plane; the graph below is the tape of one forward pass, read straight off <code>variable.node.inputs</code>.`);
  const grid = el('div', 'grad-grid');
  const left = el('div', 'panel');
  const right = el('div', 'panel');
  grid.append(left, right);

  // controls
  const ctr = el('div', 'controls');
  const bTrain = el('button', 'btn primary', 'Train');
  const bStep = el('button', 'btn', 'Step ×10');
  const bReset = el('button', 'btn', 'Reset');
  const dsSel = select('dataset', [['spiral', 'spiral'], ['xor', 'XOR'], ['circle', 'circle'], ['moons', 'moons']], st.ds);
  const actSel = select('activation', [['tanh', 'tanh'], ['relu', 'relu'], ['sigmoid', 'sigmoid']], st.act);
  const optSel = select('optimizer', [['adam', 'Adam'], ['sgd', 'SGD + momentum']], st.opt);
  const hid = range('hidden units', 2, 48, 1, st.hid);
  const lrSel = select('learning rate', [['0.003', '0.003'], ['0.01', '0.01'], ['0.03', '0.03'], ['0.1', '0.1'], ['0.3', '0.3']], String(st.lr));
  ctr.append(bTrain, bStep, bReset, dsSel.wrap, actSel.wrap, optSel.wrap, lrSel.wrap, hid.wrap);

  const field = el('canvas', 'field'); field.width = 360; field.height = 360;
  const stats = el('div', 'stats-row');
  left.append(ctr, field, stats);

  const lossC = el('canvas', 'losscurve'); lossC.width = 520; lossC.height = 150;
  const lossHead = el('div', 'subhead', 'loss (binary cross-entropy, log scale)');
  const code = el('pre', 'code calls');
  right.append(lossHead, lossC, el('div', 'subhead', 'the calls, verbatim'), code);

  const graphPanel = el('div', 'panel graph-panel');
  const graphHead = el('div', 'subhead', 'computation graph of one forward pass · edges carry tensors, labels show ‖∂L/∂tensor‖ after backward');
  const graphSvgWrap = el('div', 'graph-wrap');
  const graphNote = el('div', 'stat');
  graphPanel.append(graphHead, graphSvgWrap, graphNote);

  root.append(intro, grid, graphPanel);

  let data = makeDataset(st.ds);
  let model = initModel(st.hid, 3);
  let opt: optim.Adam | optim.SGD;
  let step = 0; let history: number[] = [];
  let running = false; let raf = 0; let frame = 0;
  const Xv = () => constant(data.X), Yv = () => constant(data.Y);

  const makeOpt = () => {
    const ps = [model.W1, model.b1, model.W2, model.b2];
    opt = st.opt === 'sgd' ? new optim.SGD(ps, { lr: st.lr, momentum: 0.9 }) : new optim.Adam(ps, { lr: st.lr });
  };
  makeOpt();

  const forward = (X: Variable) => actVar(X.matmul(model.W1).add(model.b1), st.act).matmul(model.W2).add(model.b2);

  function trainStep(): number {
    const pred = forward(Xv());
    const loss = nn.binaryCrossEntropy(pred, Yv());
    opt.zeroGrad();
    // runId/step tag the "backward" trace span and "optim/gradNorm" metric these two calls already
    // emit on their own (ROADMAP 4.2) whenever a sink is installed — no other change needed for them.
    loss.backward(undefined, { runId: TELEMETRY_RUN, step });
    opt.step({ runId: TELEMETRY_RUN, step });
    if (hasSink()) tensorSummary(TELEMETRY_RUN, step, 'prediction', summarizeTensor(pred.value));
    step++;
    const l = loss.value.item() as number;
    history.push(l);
    if (history.length > 6000) history = history.filter((_, i) => i % 2 === 0);
    return l;
  }

  // ── decision field ──
  const G = 72;
  const gridPts = new Float32Array(G * G * 2);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    gridPts[2 * (j * G + i)] = -1.2 + (2.4 * (i + 0.5)) / G;
    gridPts[2 * (j * G + i) + 1] = 1.2 - (2.4 * (j + 0.5)) / G;
  }
  const gridT = Tensor.fromTypedArray(gridPts, [G * G, 2], { dtype: 'f32' });
  const off = document.createElement('canvas'); off.width = G; off.height = G;
  const offCtx = off.getContext('2d')!;
  const fctx = field.getContext('2d')!;

  function paintField() {
    const p = noGrad(() => actTen(gridT.matmul(model.W1.value).add(model.b1.value), st.act).matmul(model.W2.value).add(model.b2.value).sigmoid());
    const d = p.data as Float32Array;
    const img = offCtx.createImageData(G, G);
    for (let k = 0; k < G * G; k++) {
      const v = d[k];
      // class 0 → amber, class 1 → blue, 0.5 → dark
      const a = Math.abs(v - 0.5) * 2;
      const [r, g, b] = v > 0.5 ? [70, 130, 255] : [255, 160, 60];
      img.data[4 * k] = 12 + (r - 12) * a * 0.55;
      img.data[4 * k + 1] = 16 + (g - 16) * a * 0.55;
      img.data[4 * k + 2] = 28 + (b - 28) * a * 0.55;
      img.data[4 * k + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
    const W = field.width, H = field.height;
    fctx.imageSmoothingEnabled = true;
    fctx.drawImage(off, 0, 0, W, H);
    // contour at p=0.5 (marching squares lite: mark sign changes)
    fctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) {
      const s = d[j * G + i] > 0.5, r = d[j * G + i + 1] > 0.5, b = d[(j + 1) * G + i] > 0.5;
      if (s !== r || s !== b) fctx.fillRect(((i + 1) * W) / G - 1, ((j + 1) * H) / G - 1, 2, 2);
    }
    // points
    let correct = 0;
    const pd = noGrad(() => actTen(data.X.matmul(model.W1.value).add(model.b1.value), st.act).matmul(model.W2.value).add(model.b2.value)).data as Float32Array;
    for (let i = 0; i < data.labels.length; i++) {
      const x = ((data.pts[2 * i] + 1.2) / 2.4) * W, y = ((1.2 - data.pts[2 * i + 1]) / 2.4) * H;
      const c = data.labels[i];
      const ok = (pd[i] > 0) === (c === 1);
      if (ok) correct++;
      fctx.beginPath(); fctx.arc(x, y, 4, 0, Math.PI * 2);
      fctx.fillStyle = c ? '#6ea0ff' : '#ffab4a';
      fctx.fill();
      fctx.lineWidth = ok ? 1 : 2.2;
      fctx.strokeStyle = ok ? 'rgba(0,0,0,.6)' : '#ff3b5c';
      fctx.stroke();
    }
    return correct / data.labels.length;
  }

  // ── loss curve ──
  const lctx = lossC.getContext('2d')!;
  function paintLoss() {
    const W = lossC.width, H = lossC.height;
    lctx.clearRect(0, 0, W, H);
    lctx.strokeStyle = 'rgba(128,140,170,.18)'; lctx.lineWidth = 1;
    const lo = Math.log10(1e-3), hi = Math.log10(2);
    const yOf = (v: number) => H - 6 - ((Math.log10(Math.max(v, 1e-3)) - lo) / (hi - lo)) * (H - 12);
    lctx.font = `${chartFontPx(lossC, 12)}px ui-monospace, monospace`; lctx.fillStyle = 'rgba(160,170,200,.7)';
    for (const g of [1, 0.1, 0.01]) { const y = yOf(g); lctx.beginPath(); lctx.moveTo(0, y); lctx.lineTo(W, y); lctx.stroke(); lctx.fillText(String(g), 4, y - 3); }
    if (history.length < 2) return;
    lctx.beginPath();
    const n = history.length;
    for (let i = 0; i < n; i++) { const x = 30 + (i / (n - 1)) * (W - 36); const y = yOf(history[i]); i ? lctx.lineTo(x, y) : lctx.moveTo(x, y); }
    lctx.strokeStyle = cssVar(root, '--accent', '#6ea0ff'); lctx.lineWidth = 2; lctx.stroke();
  }

  // ── computation graph ──
  function traceGraph(): { nodes: GNode[]; edges: GEdge[]; tapeNodes: number } {
    const labels = new Map<number, { name: string; kind: GNode['kind'] }>();
    const tag = <T extends Variable>(v: T, name: string, kind: GNode['kind']): T => { labels.set(v.id, { name, kind }); return v; };
    const X = tag(Xv(), 'x', 'input'), Y = tag(Yv(), 'y', 'input');
    tag(model.W1, 'W1', 'param'); tag(model.b1, 'b1', 'param'); tag(model.W2, 'W2', 'param'); tag(model.b2, 'b2', 'param');
    const a1 = tag(X.matmul(model.W1), 'matmul', 'op');
    const h1 = tag(a1.add(model.b1), 'add', 'op');
    const t1 = tag(actVar(h1, st.act), st.act, 'op');
    const a2 = tag(t1.matmul(model.W2), 'matmul ', 'op');
    const z = tag(a2.add(model.b2), 'add ', 'op');
    const L = tag(nn.binaryCrossEntropy(z, Y), 'BCE loss', 'loss');

    // Walk the real tape. Unlabelled nodes (the internals of nn.binaryCrossEntropy) collapse into the labelled consumer.
    const nodes = new Map<number, GNode>(); const edges: GEdge[] = []; const seen = new Set<number>(); let tapeNodes = 0;
    const hiddenCount = new Map<number, number>();
    const sources = (v: Variable, owner: number, acc: Variable[], vis: Set<number>) => {
      if (labels.has(v.id)) { acc.push(v); return; }
      if (vis.has(v.id)) return; vis.add(v.id);
      if (!v.node) return; // unlabelled constant (e.g. a scalar inside BCE)
      hiddenCount.set(owner, (hiddenCount.get(owner) ?? 0) + 1); tapeNodes++;
      for (const i of v.node.inputs) sources(i, owner, acc, vis);
    };
    const visit = (v: Variable) => {
      if (seen.has(v.id)) return; seen.add(v.id);
      if (v.node) tapeNodes++;
      const lab = labels.get(v.id)!;
      nodes.set(v.id, { id: v.id, name: lab.name.trim(), kind: lab.kind, shape: v.shape });
      if (!v.node) return;
      const acc: Variable[] = []; const vis = new Set<number>();
      for (const i of v.node.inputs) sources(i, v.id, acc, vis);
      for (const s of acc) { if (!edges.some((e) => e.from === s.id && e.to === v.id)) edges.push({ from: s.id, to: v.id }); visit(s); }
    };
    visit(L);
    for (const [id, c] of hiddenCount) { const n = nodes.get(id); if (n) n.hidden = c; }

    // Gradients: leaves accumulate .grad on backward. For intermediate tensors, re-run the chain stage by stage,
    // cutting the tape with fresh leaves and handing each stage its upstream gradient via backward(gradOutput).
    const cut = (v: Variable) => variable(v.value);
    const A1 = cut(a1); const h1s = A1.add(model.b1); const H1 = cut(h1s);
    const t1s = actVar(H1, st.act); const T1 = cut(t1s);
    const a2s = T1.matmul(model.W2); const A2 = cut(a2s);
    const zs = A2.add(model.b2); const Z = cut(zs);
    const Ls = nn.binaryCrossEntropy(Z, Y);
    for (const p of [model.W1, model.b1, model.W2, model.b2]) p.zeroGrad();
    Ls.backward();
    zs.backward(Z.grad!); a2s.backward(A2.grad!); t1s.backward(T1.grad!); h1s.backward(H1.grad!);
    X.matmul(model.W1).backward(A1.grad!);
    const norm = (t: Tensor | null) => (t ? Math.sqrt(t.mul(t).sum().item() as number) : undefined);
    const byName: Record<string, number | undefined> = {
      matmul: norm(A1.grad), add: norm(H1.grad), [st.act]: norm(T1.grad), 'matmul ': norm(A2.grad), 'add ': norm(Z.grad),
      W1: norm(model.W1.grad), b1: norm(model.b1.grad), W2: norm(model.W2.grad), b2: norm(model.b2.grad), 'BCE loss': 1,
    };
    for (const [id, lab] of labels) { const n = nodes.get(id); if (n) n.grad = byName[lab.name]; }
    for (const p of [model.W1, model.b1, model.W2, model.b2]) p.zeroGrad();
    return { nodes: [...nodes.values()], edges, tapeNodes };
  }

  function paintGraph() {
    let g: ReturnType<typeof traceGraph>;
    try { g = traceGraph(); } catch (e) { graphSvgWrap.innerHTML = `<pre class="code">${esc(String((e as Error).stack ?? e))}</pre>`; return; }
    const { nodes, edges } = g;
    // layered layout: depth = longest path from any leaf
    const depth = new Map<number, number>();
    const inc = (id: number) => edges.filter((e) => e.to === id).map((e) => e.from);
    const dOf = (id: number): number => {
      if (depth.has(id)) return depth.get(id)!;
      const ins = inc(id); const d = ins.length ? 1 + Math.max(...ins.map(dOf)) : 0;
      depth.set(id, d); return d;
    };
    nodes.forEach((n) => dOf(n.id));
    // put leaves one column before their consumer so the graph reads left→right
    for (const n of nodes) if (n.kind === 'param' || n.kind === 'input') {
      const outs = edges.filter((e) => e.from === n.id).map((e) => dOf(e.to));
      if (outs.length) depth.set(n.id, Math.min(...outs) - 1);
    }
    const maxD = Math.max(...depth.values());
    const cols = new Map<number, GNode[]>();
    for (const n of nodes) { const d = depth.get(n.id)!; if (!cols.has(d)) cols.set(d, []); cols.get(d)!.push(n); }
    const W = 980, H = 250, colW = (W - 120) / Math.max(1, maxD);
    const pos = new Map<number, { x: number; y: number }>();
    for (const [d, list] of cols) {
      list.sort((a, b) => (a.kind === 'op' || a.kind === 'loss' ? 0 : 1) - (b.kind === 'op' || b.kind === 'loss' ? 0 : 1));
      list.forEach((n, i) => {
        const y = list.length === 1 ? H / 2 : n.kind === 'op' || n.kind === 'loss' ? H / 2 : 40 + (i * (H - 80)) / Math.max(1, list.length - 1);
        pos.set(n.id, { x: 60 + d * colW, y });
      });
    }
    // params hug the top, inputs the bottom
    for (const n of nodes) if (n.kind !== 'op' && n.kind !== 'loss') { const p = pos.get(n.id)!; p.y = n.kind === 'param' ? (n.name.startsWith('b') ? 58 : 34) : H - 34; }
    const grads = nodes.map((n) => n.grad ?? 0).filter((x) => x > 0);
    const gmax = Math.max(...grads, 1e-9);
    const width = (gv?: number) => (gv ? 1.2 + 4.5 * Math.sqrt(gv / gmax) : 1.2);
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="autograd computation graph"><defs><marker id="tg-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>`;
    for (const e of edges) {
      const a = pos.get(e.from)!, b = pos.get(e.to)!; const src = nodes.find((n) => n.id === e.from)!;
      const mx = (a.x + b.x) / 2;
      const path = `M${a.x + 26},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x - 30},${b.y}`;
      svg += `<path d="${path}" class="edge fwd" marker-end="url(#tg-arr)"/>`;
      if (src.grad !== undefined) svg += `<path d="${path}" class="edge bwd" style="stroke-width:${width(src.grad).toFixed(2)}"/>`;
      svg += `<text x="${mx}" y="${(a.y + b.y) / 2 - 6}" class="elabel">[${src.shape.join(',')}]</text>`;
    }
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const gtxt = n.grad !== undefined && n.kind !== 'loss' ? `∇ ${fmt(n.grad, 2)}` : n.kind === 'loss' ? 'dL/dL = 1' : 'no grad';
      if (n.kind === 'op' || n.kind === 'loss') {
        svg += `<g class="node ${n.kind}"><rect x="${p.x - (n.kind === 'loss' ? 40 : 30)}" y="${p.y - 17}" width="${n.kind === 'loss' ? 80 : 60}" height="34" rx="17"/><text x="${p.x}" y="${p.y + 4}">${esc(n.name)}</text>`;
        svg += `<text x="${p.x}" y="${p.y + 32}" class="glabel">${gtxt}</text>`;
        if (n.hidden) svg += `<text x="${p.x}" y="${p.y - 28}" class="hlabel">${n.hidden} tape nodes inside</text>`;
        svg += `</g>`;
      } else {
        svg += `<g class="node ${n.kind}"><rect x="${p.x - 26}" y="${p.y - 12}" width="52" height="24" rx="5"/><text x="${p.x}" y="${p.y + 4}">${esc(n.name)}</text>`;
        svg += `<text x="${p.x + (n.kind === 'param' ? 32 : 32)}" y="${p.y + 4}" class="glabel left">${n.kind === 'param' ? gtxt : ''}</text></g>`;
      }
    }
    svg += '</svg>';
    graphSvgWrap.innerHTML = svg;
    graphNote.innerHTML = `${nodes.length} labelled tensors · <b>${g.tapeNodes}</b> tape nodes walked from <code>loss.node.inputs</code> · amber = backward flow, thickness ∝ √‖∇‖ · refreshed every 60 steps while training`;
  }

  function paintCode() {
    const o = st.opt === 'sgd' ? `new optim.SGD(params, { lr: ${st.lr}, momentum: 0.9 })` : `new optim.Adam(params, { lr: ${st.lr} })`;
    code.innerHTML = hl(`import { Tensor, random } from "@johnhenry/math-plus-tensor-core";
import { constant, nn, optim, noGrad } from "@johnhenry/math-plus-tensor-autograd";

const rng = random.seed(3);
const W1 = new nn.Parameter(random.normal([2, ${st.hid}], { rng }).mul(1.4));
const b1 = new nn.Parameter(random.normal([${st.hid}], { rng }).mul(0.2));
const W2 = new nn.Parameter(random.normal([${st.hid}, 1], { rng }));
const b2 = new nn.Parameter(Tensor.zeros([1], { dtype: "f32" }));
const opt = ${o};

// one training step (runs ${running ? 'live, 4 per frame' : 'on Step'})
const X = constant(Tensor.fromTypedArray(pts, [${data.labels.length}, 2], { dtype: "f32" }));
const logits = X.matmul(W1).add(b1).${st.act}().matmul(W2).add(b2);
const loss = nn.binaryCrossEntropy(logits, constant(Y));
opt.zeroGrad(); loss.backward(); opt.step();

// the field: plain Tensor math, no tape
noGrad(() => grid.matmul(W1.value).add(b1.value).${st.act}()
  .matmul(W2.value).add(b2.value).sigmoid());`);
  }

  function paintStats(acc: number) {
    const l = history.length ? history[history.length - 1] : NaN;
    stats.innerHTML = `<span class="stat">step <b>${step}</b></span><span class="stat">loss <b>${fmt(l, 3)}</b></span><span class="stat">accuracy <b>${(acc * 100).toFixed(1)}%</b></span><span class="stat">params <b>${2 * st.hid + st.hid + st.hid + 1}</b></span>`;
  }

  function redraw(graph = true) {
    const acc = paintField(); paintLoss(); paintStats(acc);
    if (graph) paintGraph();
  }

  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!running) return;
    for (let i = 0; i < 4; i++) trainStep();
    frame++;
    redraw(frame % 15 === 0);
  };

  const setRunning = (r: boolean) => {
    running = r; bTrain.textContent = r ? 'Pause' : 'Train'; paintCode();
  };
  bTrain.addEventListener('click', () => setRunning(!running));
  bStep.addEventListener('click', () => { for (let i = 0; i < 10; i++) trainStep(); redraw(); });
  const reset = () => { model = initModel(st.hid, 3 + Math.floor(Math.random() * 1000)); makeOpt(); step = 0; history = []; redraw(); paintCode(); };
  bReset.addEventListener('click', reset);
  dsSel.input.addEventListener('change', () => { st.ds = dsSel.input.value; save(); data = makeDataset(st.ds); reset(); });
  actSel.input.addEventListener('change', () => { st.act = actSel.input.value; save(); reset(); });
  optSel.input.addEventListener('change', () => { st.opt = optSel.input.value; save(); makeOpt(); paintCode(); });
  lrSel.input.addEventListener('change', () => { st.lr = Number(lrSel.input.value); save(); opt.lr = st.lr; paintCode(); });
  hid.input.addEventListener('change', () => { st.hid = Number(hid.input.value); save(); reset(); });

  try {
    paintCode(); redraw();
    setRunning(true);
  } catch (e) {
    root.append(el('pre', 'code', esc(String((e as Error).stack ?? e))));
  }
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); running = false; };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Tab 2 · FFT & Signal                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

const N = 512; const FS = 512; // 1 second, 1 Hz per bin

function presetSignal(kind: string): Float64Array {
  const x = new Float64Array(N);
  const rng = random.seed(11);
  for (let i = 0; i < N; i++) {
    const t = i / FS;
    if (kind === 'square') x[i] = Math.sign(Math.sin(2 * Math.PI * 6 * t)) * 0.8 || 0.8;
    else if (kind === 'chirp') x[i] = 0.9 * Math.sin(2 * Math.PI * (2 * t + 0.5 * 110 * t * t));
    else if (kind === 'noise') x[i] = 0.7 * Math.sin(2 * Math.PI * 4 * t) + (rng.nextFloat() * 2 - 1) * 0.55;
    else if (kind === 'saw') x[i] = 0.9 * (2 * ((t * 5) % 1) - 1);
    else x[i] = 0.6 * Math.sin(2 * Math.PI * 5 * t) + 0.3 * Math.sin(2 * Math.PI * 42 * t) + 0.18 * Math.sin(2 * Math.PI * 120 * t + 1);
  }
  return x;
}

function mountFFT(root: HTMLElement, st: State, save: () => void): () => void {
  root.innerHTML = '';
  const intro = el('p', 'what', `512 samples at 512 Hz, so each FFT bin is exactly 1 Hz. <code>rfft</code> takes the signal to the frequency domain, a Butterworth filter from <code>butter()</code> is applied either spectrally (multiply every bin by its <code>freqz</code> response, then <code>irfft</code>) or in time with <code>sosFilter</code>, and the result is overlaid on the original. <b>Draw on the waveform</b> to make your own signal.`);
  const ctr = el('div', 'controls');
  const presets = el('div', 'chips');
  for (const [k, t] of [['mix', 'sine mix'], ['square', 'square'], ['saw', 'saw'], ['chirp', 'chirp'], ['noise', 'noisy sine'], ['draw', 'draw ✎']] as const) {
    const b = el('button', 'tb-btn', t); b.dataset.k = k; presets.append(b);
  }
  const flt = select('filter', [['none', 'none'], ['lowpass', 'Butterworth low-pass'], ['highpass', 'Butterworth high-pass'], ['bandpass', 'Butterworth band-pass'], ['bandstop', 'Butterworth band-stop'], ['brick', 'ideal brick-wall (FFT mask)']], st.flt);
  const meth = select('apply', [['freqz', 'spectrally: rfft × freqz → irfft'], ['sos', 'in time: sosFilter']], st.meth);
  const fc = range('cutoff / centre', 1, 250, 1, st.fc, (v) => `${v} Hz`);
  const bw = range('bandwidth', 2, 120, 1, st.bw, (v) => `${v} Hz`);
  const ord = range('order', 1, 8, 1, st.ord);
  const win = select('analysis window', [['none', 'rectangular'], ['hann', 'Hann'], ['hamming', 'Hamming']], st.win);
  ctr.append(flt.wrap, meth.wrap, fc.wrap, bw.wrap, ord.wrap, win.wrap);

  const wavePanel = el('div', 'panel');
  const waveC = el('canvas', 'wave'); waveC.width = 1000; waveC.height = 220;
  const specC = el('canvas', 'spec'); specC.width = 1000; specC.height = 240;
  const legend = el('div', 'legend', `<span><i class="sw orig"></i>original</span><span><i class="sw filt"></i>filtered</span><span><i class="sw resp"></i>|H(f)|</span>`);
  const stats = el('div', 'stats-row');
  wavePanel.append(presets, el('div', 'subhead', 'time domain · drag to draw'), waveC, el('div', 'subhead', 'magnitude spectrum · 0 – 256 Hz'), specC, legend, stats);
  const codePanel = el('div', 'panel');
  const code = el('pre', 'code calls');
  codePanel.append(ctr, el('div', 'subhead', 'the calls, verbatim'), code);
  const grid = el('div', 'fft-grid'); grid.append(wavePanel, codePanel);
  root.append(intro, grid);

  let x = presetSignal(st.sig === 'draw' ? 'mix' : st.sig);
  const syncPresetChips = () => presets.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === st.sig));

  const wctx = waveC.getContext('2d')!, sctx = specC.getContext('2d')!;
  let raf = 0; let dirty = true;

  function design(): Sos | null {
    const nyq = FS / 2; const wn = Math.min(0.999, Math.max(0.001, st.fc / nyq));
    if (st.flt === 'lowpass' || st.flt === 'highpass') return butter(st.ord, wn, { btype: st.flt });
    if (st.flt === 'bandpass' || st.flt === 'bandstop') {
      const lo = Math.max(0.5, st.fc - st.bw / 2), hi = Math.min(nyq - 0.5, st.fc + st.bw / 2);
      return butter(st.ord, [lo / nyq, hi / nyq], { btype: st.flt });
    }
    return null;
  }

  function compute() {
    const t: Record<string, number> = {};
    let t0 = performance.now();
    const xt = Tensor.from(Array.from(x), { dtype: 'f64' });
    const X = rfft(xt); t.rfft = performance.now() - t0;
    // analysis spectrum (windowed, display only)
    const w = st.win === 'hann' ? hannWindow(N) : st.win === 'hamming' ? hammingWindow(N) : null;
    let wsum = N;
    let Xa = X;
    if (w) { const xw = new Float64Array(N); wsum = 0; for (let i = 0; i < N; i++) { xw[i] = x[i] * w[i]; wsum += w[i]; } Xa = rfft(Tensor.fromTypedArray(xw, [N], { dtype: 'f64' })); }
    const sos = design();
    const H = new Float64Array(N / 2 + 1).fill(1); // |H| for display
    let y: Float64Array; let Ymag: Float64Array;
    t0 = performance.now();
    const re = new Float64Array(X.real.data as Float64Array), im = new Float64Array(X.imag.data as Float64Array);
    if (st.flt === 'none') {
      y = x.slice();
    } else if (st.flt === 'brick') {
      for (let k = 0; k < N; k++) { const f = Math.min(k, N - k); if (f > st.fc) { re[k] = 0; im[k] = 0; } }
      for (let k = 0; k <= N / 2; k++) H[k] = k > st.fc ? 0 : 1;
      y = irfft(ComplexTensor.fromParts(Tensor.fromTypedArray(re, [N], { dtype: 'f64' }), Tensor.fromTypedArray(im, [N], { dtype: 'f64' }))).data as Float64Array;
    } else {
      const resp = freqz(sos!, { worN: N / 2 }).response; // w_k = k·π/(N/2) — exactly our FFT bins
      for (let k = 0; k <= N / 2; k++) { const c = resp[Math.min(k, N / 2 - 1)]; H[k] = Math.hypot(c.re, c.im); }
      if (st.meth === 'sos') {
        y = sosFilter(sos!, xt).data as Float64Array;
      } else {
        for (let k = 0; k < N; k++) {
          const m = k <= N / 2 ? k : N - k; const c = resp[Math.min(m, N / 2 - 1)];
          const hr = c.re, hi = k <= N / 2 ? c.im : -c.im; // Hermitian mirror
          const a = re[k], b = im[k];
          re[k] = a * hr - b * hi; im[k] = a * hi + b * hr;
        }
        y = irfft(ComplexTensor.fromParts(Tensor.fromTypedArray(re, [N], { dtype: 'f64' }), Tensor.fromTypedArray(im, [N], { dtype: 'f64' }))).data as Float64Array;
      }
    }
    t.filter = performance.now() - t0;
    // filtered spectrum (same analysis window)
    const yw = new Float64Array(N); for (let i = 0; i < N; i++) yw[i] = y[i] * (w ? w[i] : 1);
    const Y = rfft(Tensor.fromTypedArray(yw, [N], { dtype: 'f64' }));
    const mag = (c: ComplexTensor) => { const r = c.real.data as Float64Array, q = c.imag.data as Float64Array; const o = new Float64Array(N / 2 + 1); for (let k = 0; k <= N / 2; k++) o[k] = (Math.hypot(r[k], q[k]) * (k === 0 || k === N / 2 ? 1 : 2)) / wsum; return o; };
    const Xmag = mag(Xa); Ymag = mag(Y);
    const peaks = findPeaks(Tensor.fromTypedArray(Xmag, [N / 2 + 1], { dtype: 'f64' }), { prominence: 0.04, distance: 3 });
    let ex = 0, ey = 0; for (let i = 0; i < N; i++) { ex += x[i] * x[i]; ey += y[i] * y[i]; }
    return { y, Xmag, Ymag, H, peaks, t, energy: ex ? ey / ex : 0, sos };
  }

  function paint() {
    let r: ReturnType<typeof compute>;
    try { r = compute(); } catch (e) { stats.innerHTML = `<pre class="code err">${esc(String((e as Error).message ?? e))}</pre>`; return; }
    const accent = cssVar(root, '--accent', '#6ea0ff');
    // wave
    const W = waveC.width, Hh = waveC.height;
    wctx.clearRect(0, 0, W, Hh);
    wctx.strokeStyle = 'rgba(128,140,170,.2)'; wctx.beginPath(); wctx.moveTo(0, Hh / 2); wctx.lineTo(W, Hh / 2); wctx.stroke();
    for (let s = 0; s <= 10; s++) { const gx = (s / 10) * W; wctx.beginPath(); wctx.moveTo(gx, Hh / 2 - 4); wctx.lineTo(gx, Hh / 2 + 4); wctx.stroke(); }
    const plot = (arr: Float64Array, color: string, lw: number) => {
      wctx.beginPath(); for (let i = 0; i < N; i++) { const px = (i / (N - 1)) * W, py = Hh / 2 - arr[i] * (Hh / 2 - 12); i ? wctx.lineTo(px, py) : wctx.moveTo(px, py); }
      wctx.strokeStyle = color; wctx.lineWidth = lw; wctx.stroke();
    };
    plot(x, 'rgba(200,210,235,.45)', 1.5);
    if (st.flt !== 'none') plot(r.y, accent, 2.2);
    // spectrum
    const S = specC.width, SH = specC.height, B = N / 2;
    sctx.clearRect(0, 0, S, SH);
    const maxM = Math.max(...r.Xmag, 1e-9);
    const yOf = (m: number) => SH - 20 - Math.sqrt(m / maxM) * (SH - 40);
    sctx.font = `${chartFontPx(specC, 16)}px ui-monospace, monospace`; sctx.fillStyle = 'rgba(160,170,200,.7)';
    for (let f = 0; f <= 256; f += 32) {
      const gx = (f / B) * S;
      const label = `${f}`;
      const tw = sctx.measureText(label).width;
      // clamp fully inside the canvas — the fixed "S - 22" budget was too
      // tight for the 3-digit "256" tick, which got clipped to "25".
      const tx = Math.min(Math.max(gx + 2, 2), S - tw - 2);
      sctx.fillText(label, tx, SH - 4);
      sctx.fillStyle = 'rgba(128,140,170,.12)'; sctx.fillRect(gx, 0, 1, SH - 18); sctx.fillStyle = 'rgba(160,170,200,.7)';
    }
    const bw = S / (B + 1);
    for (let k = 0; k <= B; k++) {
      const gx = (k / B) * S;
      sctx.fillStyle = 'rgba(200,210,235,.28)'; sctx.fillRect(gx - bw / 2, yOf(r.Xmag[k]), Math.max(1, bw - 0.5), SH - 20 - yOf(r.Xmag[k]));
    }
    if (st.flt !== 'none') {
      sctx.fillStyle = accent;
      for (let k = 0; k <= B; k++) { const gx = (k / B) * S; const h = SH - 20 - yOf(r.Ymag[k]); if (h > 0.5) sctx.fillRect(gx - bw / 2, yOf(r.Ymag[k]), Math.max(1, bw - 0.5), h); }
      sctx.beginPath();
      for (let k = 0; k <= B; k++) { const gx = (k / B) * S, gy = 14 + (1 - Math.min(1, r.H[k])) * (SH - 40); k ? sctx.lineTo(gx, gy) : sctx.moveTo(gx, gy); }
      sctx.setLineDash([6, 4]); sctx.strokeStyle = '#ffb454'; sctx.lineWidth = 1.8; sctx.stroke(); sctx.setLineDash([]);
    }
    sctx.fillStyle = 'rgba(230,236,250,.9)';
    for (const i of r.peaks.indices.slice(0, 12)) {
      const gx = (i / B) * S;
      // clamp both axes: a low-frequency peak (e.g. "5 Hz") near the tall
      // left edge of the chart otherwise sits flush against — and clips
      // into — the canvas's top-left corner.
      const lx = Math.min(Math.max(gx + 5, 2), S - 64);
      const ly = Math.max(12, yOf(r.Xmag[i]) - 6);
      sctx.fillText(`${i} Hz`, lx, ly);
    }
    stats.innerHTML = `<span class="stat">rfft <b>${ms(r.t.rfft)}</b></span><span class="stat">filter <b>${ms(r.t.filter)}</b></span><span class="stat">energy kept <b>${(r.energy * 100).toFixed(1)}%</b></span><span class="stat">peaks <b>${r.peaks.indices.slice(0, 6).join(', ') || '—'}</b> Hz</span>${r.sos ? `<span class="stat">SOS sections <b>${r.sos.length}</b></span>` : ''}`;
    paintCode(r.sos);
  }

  function paintCode(sos: Sos | null) {
    const nyq = FS / 2;
    let design = '';
    if (st.flt === 'lowpass' || st.flt === 'highpass') design = `const sos = butter(${st.ord}, ${fmt(st.fc / nyq, 3)}, { btype: "${st.flt}" }); // ${st.fc} Hz / ${nyq} Hz Nyquist`;
    else if (st.flt === 'bandpass' || st.flt === 'bandstop') design = `const sos = butter(${st.ord}, [${fmt(Math.max(0.5, st.fc - st.bw / 2) / nyq, 3)}, ${fmt(Math.min(nyq - 0.5, st.fc + st.bw / 2) / nyq, 3)}], { btype: "${st.flt}" });`;
    let apply = '';
    if (st.flt === 'none') apply = '// no filter: y = x';
    else if (st.flt === 'brick') apply = `// ideal mask: zero every bin above ${st.fc} Hz (and its mirror)\nconst y = irfft(ComplexTensor.fromParts(maskedRe, maskedIm));`;
    else if (st.meth === 'sos') apply = `const y = sosFilter(sos, x);   // zero-state, ${sos?.length ?? 0} biquad sections`;
    else apply = `const { response } = freqz(sos, { worN: ${N / 2} }); // H at w_k = k·π/${N / 2}\n// multiply X[k] by H[k] (conjugate-mirrored above Nyquist)\nconst y = irfft(ComplexTensor.fromParts(Yre, Yim));`;
    code.innerHTML = hl(`import { Tensor } from "@johnhenry/math-plus-tensor-core";
import { ComplexTensor, rfft, irfft } from "@johnhenry/math-plus-fft";
import { butter, freqz, sosFilter, findPeaks, ${st.win === 'hamming' ? 'hammingWindow' : 'hannWindow'} } from "@johnhenry/math-plus-signal";

const x = Tensor.from(samples, { dtype: "f64" }); // [${N}]
const X = rfft(x);                 // full ${N}-point spectrum
${design}
${apply}
${st.win !== 'none' ? `const w = ${st.win === 'hamming' ? 'hammingWindow' : 'hannWindow'}(${N});   // analysis window (display)\n` : ''}findPeaks(magnitude, { prominence: 0.04, distance: 3 });`);
  }

  const loop = () => { raf = requestAnimationFrame(loop); if (dirty) { dirty = false; paint(); } };
  raf = requestAnimationFrame(loop);
  const refresh = () => { dirty = true; save(); };
  const syncVis = () => {
    bw.wrap.style.display = st.flt === 'bandpass' || st.flt === 'bandstop' ? '' : 'none';
    ord.wrap.style.display = st.flt === 'none' || st.flt === 'brick' ? 'none' : '';
    meth.wrap.style.display = st.flt === 'none' || st.flt === 'brick' ? 'none' : '';
    fc.wrap.style.display = st.flt === 'none' ? 'none' : '';
  };
  syncVis(); syncPresetChips();

  presets.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    st.sig = b.dataset.k!;
    if (st.sig === 'draw') x = new Float64Array(N); else x = presetSignal(st.sig);
    syncPresetChips(); refresh();
  });
  flt.input.addEventListener('change', () => { st.flt = flt.input.value; syncVis(); refresh(); });
  meth.input.addEventListener('change', () => { st.meth = meth.input.value; refresh(); });
  win.input.addEventListener('change', () => { st.win = win.input.value; refresh(); });
  fc.input.addEventListener('input', () => { st.fc = Number(fc.input.value); refresh(); });
  bw.input.addEventListener('input', () => { st.bw = Number(bw.input.value); refresh(); });
  ord.input.addEventListener('input', () => { st.ord = Number(ord.input.value); refresh(); });

  // drawing
  let drawing = false; let last = -1;
  const at = (e: PointerEvent) => { const r = waveC.getBoundingClientRect(); return { i: Math.round(((e.clientX - r.left) / r.width) * (N - 1)), v: Math.max(-1, Math.min(1, -(((e.clientY - r.top) / r.height) * 2 - 1) * (waveC.height / 2) / (waveC.height / 2 - 12))) }; };
  const paintAt = (e: PointerEvent) => {
    const { i, v } = at(e); if (i < 0 || i >= N) return;
    if (last >= 0 && last !== i) { const a = Math.min(last, i), b = Math.max(last, i), va = x[last]; for (let k = a; k <= b; k++) x[k] = va + ((v - va) * (k - last)) / (i - last); }
    x[i] = v; last = i; dirty = true;
  };
  const down = (e: PointerEvent) => { drawing = true; last = -1; waveC.setPointerCapture(e.pointerId); if (st.sig !== 'draw') { st.sig = 'draw'; syncPresetChips(); save(); } paintAt(e); };
  const move = (e: PointerEvent) => { if (drawing) paintAt(e); };
  const up = () => { drawing = false; last = -1; };
  waveC.addEventListener('pointerdown', down); waveC.addEventListener('pointermove', move); waveC.addEventListener('pointerup', up); waveC.addEventListener('pointercancel', up);
  return () => cancelAnimationFrame(raf);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Tab 3 · Image kernels — im2col (unfold) × kernel GEMM, CPU or WebGPU       */
/* ────────────────────────────────────────────────────────────────────────── */

type GpuMod = typeof import('@johnhenry/math-plus-tensor-webgpu');
type GpuDev = Awaited<ReturnType<GpuMod['createWebGpuDevice']>>;

function sourceImage(kind: string): HTMLCanvasElement {
  const S = 256; const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  if (kind === 'zone') {
    const im = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - S / 2, dy = y - S / 2; const r2 = (dx * dx + dy * dy) / (S * S);
      const v = 0.5 + 0.5 * Math.cos(r2 * 200);
      const k = 4 * (y * S + x);
      im.data[k] = 255 * v; im.data[k + 1] = 255 * (0.35 + 0.65 * v * (x / S)); im.data[k + 2] = 255 * (0.6 + 0.4 * (1 - v)); im.data[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  } else if (kind === 'shapes') {
    const grd = g.createLinearGradient(0, 0, S, S); grd.addColorStop(0, '#12203f'); grd.addColorStop(1, '#3b1d4a'); g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.fillStyle = '#ffb454'; g.beginPath(); g.arc(80, 90, 48, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6ea0ff'; g.fillRect(130, 40, 90, 90);
    g.strokeStyle = '#e8f0ff'; g.lineWidth = 6; g.beginPath(); g.moveTo(20, 230); g.lineTo(120, 150); g.lineTo(236, 236); g.stroke();
    g.fillStyle = '#e8f0ff'; g.font = 'bold 44px system-ui, sans-serif'; g.fillText('ORRERY', 40, 205);
  } else { // checker + noise
    const rng = random.seed(5);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#d9e3ff' : '#243058'; g.fillRect(x * 32, y * 32, 32, 32); }
    const im = g.getImageData(0, 0, S, S);
    for (let i = 0; i < im.data.length; i += 4) { const n = (rng.nextFloat() - 0.5) * 90; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; }
    g.putImageData(im, 0, 0);
  }
  return c;
}

function canvasToTensor(c: HTMLCanvasElement): Tensor {
  const g = c.getContext('2d')!; const { width: W, height: H } = c;
  const d = g.getImageData(0, 0, W, H).data; const f = new Float32Array(W * H * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { f[j] = d[i] / 255; f[j + 1] = d[i + 1] / 255; f[j + 2] = d[i + 2] / 255; }
  return Tensor.fromTypedArray(f, [H, W, 3], { dtype: 'f32' });
}

function tensorToCanvas(t: Tensor, c: HTMLCanvasElement) {
  const [H, W, C] = t.shape as number[];
  c.width = W; c.height = H;
  const g = c.getContext('2d')!; const im = g.createImageData(W, H);
  const d = t.contiguous().data as Float32Array;
  for (let p = 0; p < W * H; p++) {
    for (let ch = 0; ch < 3; ch++) { const v = d[p * C + (C === 1 ? 0 : ch)]; im.data[4 * p + ch] = Math.max(0, Math.min(255, v * 255)); }
    im.data[4 * p + 3] = 255;
  }
  g.putImageData(im, 0, 0);
}

interface KernelSpec { k: number; cols: number[][]; gray: boolean; post: 'none' | 'mag' | 'offset' | 'thresh' | 'norm'; label: string }

function kernelFor(st: State): KernelSpec {
  const k = st.k | 1;
  if (st.op === 'blur' || st.op === 'box') {
    const r = (k - 1) / 2, s = Math.max(0.6, r / 2), w: number[] = [];
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) w.push(st.op === 'box' ? 1 : Math.exp(-(x * x + y * y) / (2 * s * s)));
    const sum = w.reduce((a, b) => a + b, 0);
    return { k, cols: [w.map((v) => v / sum)], gray: false, post: 'none', label: st.op === 'box' ? `${k}×${k} box` : `${k}×${k} Gaussian σ=${fmt(s, 2)}` };
  }
  if (st.op === 'sharpen') { const a = st.amt; return { k: 3, cols: [[0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0]], gray: false, post: 'none', label: `unsharp, amount ${a}` }; }
  if (st.op === 'sobel') return { k: 3, cols: [[-1, 0, 1, -2, 0, 2, -1, 0, 1], [-1, -2, -1, 0, 0, 0, 1, 2, 1]], gray: true, post: 'mag', label: 'Sobel Gx, Gy → √(Gx²+Gy²)' };
  if (st.op === 'laplace') return { k: 3, cols: [[0, 1, 0, 1, -4, 1, 0, 1, 0]], gray: true, post: 'offset', label: 'Laplacian (+0.5 for display)' };
  if (st.op === 'emboss') return { k: 3, cols: [[-2, -1, 0, -1, 1, 1, 0, 1, 2]], gray: false, post: 'offset', label: 'emboss' };
  if (st.op === 'threshold') return { k: 1, cols: [[1]], gray: true, post: 'thresh', label: `gray > ${st.th}` };
  return { k: 1, cols: [[1]], gray: false, post: 'norm', label: 'per-channel standardise' };
}

function mountImage(root: HTMLElement, st: State, save: () => void): () => void {
  root.innerHTML = '';
  const intro = el('p', 'what', `<code>math-plus-image</code> is deliberately small (<code>resize</code> and <code>normalize</code>), so the kernels here are built the tensor way: <code>pad</code> the image, <code>unfold</code> it into a sliding-window view of every k×k patch (zero-copy strides), make it <code>contiguous</code> and multiply the resulting <b>[H·W·C, k²]</b> matrix by a <b>[k², m]</b> kernel matrix. That GEMM is exactly what <code>math-plus-tensor-webgpu</code> can run on the GPU.`);
  const ctr = el('div', 'controls');
  const srcSel = select('image', [['zone', 'zone plate'], ['shapes', 'shapes + text'], ['checker', 'noisy checkerboard'], ['file', 'your file…']], st.img);
  const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.className = 'file';
  const opSel = select('kernel', [['sobel', 'Sobel edges'], ['blur', 'Gaussian blur'], ['box', 'box blur'], ['sharpen', 'sharpen'], ['laplace', 'Laplacian'], ['emboss', 'emboss'], ['threshold', 'threshold'], ['normalize', 'normalize (math-plus-image)']], st.op);
  const kR = range('kernel size', 3, 11, 2, st.k, (v) => `${v}×${v}`);
  const thR = range('threshold', 0, 1, 0.01, st.th, (v) => v.toFixed(2));
  const amtR = range('amount', 0.2, 4, 0.1, st.amt, (v) => v.toFixed(1));
  const sizeSel = select('working size (resize)', [['96', '96 px'], ['160', '160 px'], ['256', '256 px'], ['384', '384 px']], String(st.size));
  const engWrap = el('div', 'engine');
  const bCpu = el('button', 'tb-btn', 'CPU · tensor-core'); const bGpu = el('button', 'tb-btn', 'WebGPU · tensor-webgpu');
  const bBench = el('button', 'btn', 'Benchmark ×10');
  engWrap.append(bCpu, bGpu);
  ctr.append(srcSel.wrap, file, opSel.wrap, kR.wrap, thR.wrap, amtR.wrap, sizeSel.wrap);

  const view = el('div', 'panel');
  const pair = el('div', 'img-pair');
  const inC = el('canvas', 'img'); const outC = el('canvas', 'img');
  const f1 = el('figure'); f1.append(inC, el('figcaption', '', 'input · resize(…, { method: "bilinear" })'));
  const f2 = el('figure'); const cap2 = el('figcaption', ''); f2.append(outC, cap2);
  pair.append(f1, f2);
  const kview = el('div', 'kview');
  const stats = el('div', 'stats-row');
  const gpuNote = el('div', 'stat gpu-note');
  const bars = el('div', 'bars');
  view.append(pair, stats, bars);
  const side = el('div', 'panel');
  const code = el('pre', 'code calls');
  side.append(ctr, el('div', 'subhead', 'engine'), engWrap, gpuNote, bBench, el('div', 'subhead', 'kernel matrix'), kview, el('div', 'subhead', 'the calls, verbatim'), code);
  const grid = el('div', 'img-grid'); grid.append(view, side);
  root.append(intro, grid);

  let base: Tensor | null = null; let fileCanvas: HTMLCanvasElement | null = null;
  let gpuMod: GpuMod | null = null; let gpu: GpuDev | null = null; let gpuReason: string | null = 'checking…';
  let disposed = false; let busy = false; let again = false;
  const timings: { cpu?: number; gpu?: number; im2col?: number; verdict?: string } = {};

  const syncVis = () => {
    kR.wrap.style.display = st.op === 'blur' || st.op === 'box' ? '' : 'none';
    thR.wrap.style.display = st.op === 'threshold' ? '' : 'none';
    amtR.wrap.style.display = st.op === 'sharpen' ? '' : 'none';
    file.style.display = st.img === 'file' ? '' : 'none';
    bCpu.classList.toggle('on', st.eng !== 'gpu'); bGpu.classList.toggle('on', st.eng === 'gpu');
    bGpu.disabled = !gpu;
    gpuNote.textContent = gpu ? `adapter: ${gpu.info?.vendor || 'unknown'} ${gpu.info?.architecture || ''}`.trim() + (/swiftshader/i.test(`${gpu.info?.vendor} ${gpu.info?.architecture}`) ? ' (a software rasteriser: expect WebGPU to be slow here)' : '') : `WebGPU unavailable: ${gpuReason}`;
  };

  function loadBase() {
    const src = st.img === 'file' && fileCanvas ? fileCanvas : sourceImage(st.img === 'file' ? 'zone' : st.img);
    const raw = canvasToTensor(src);
    const [h, w] = raw.shape as number[]; const s = st.size;
    const scale = s / Math.max(h, w);
    base = resize(raw, { height: Math.max(8, Math.round(h * scale)), width: Math.max(8, Math.round(w * scale)) }, { method: 'bilinear' });
    tensorToCanvas(base, inC);
  }

  /** im2col: pad → unfold (a view) → contiguous → [H·W·C, k²] */
  function im2col(img: Tensor, k: number): Tensor {
    const [H, W, C] = img.shape as number[]; const r = (k - 1) / 2;
    if (k === 1) return img.reshape([H * W * C, 1]);
    return img.pad([[r, r], [r, r], [0, 0]]).unfold([k, k], [0, 1]).contiguous().reshape([H * W * C, k * k]);
  }

  async function run(engine: 'cpu' | 'gpu'): Promise<{ out: Tensor; tIm: number; tMul: number }> {
    const spec = kernelFor(st);
    let img = base!;
    const [H, W] = img.shape as number[];
    if (spec.gray) img = img.matmul(Tensor.from([0.299, 0.587, 0.114], { dtype: 'f32' }).reshape([3, 1])); // [H,W,1]
    const C = img.shape[2];
    if (spec.post === 'norm') {
      const t0 = performance.now();
      const flat = img.reshape([H * W, 3]); const mean = flat.mean(0).toArray() as number[]; const sd = flat.std(0).toArray() as number[];
      const z = normalize(img, { mean, std: sd.map((v) => v || 1) });
      return { out: z.mul(0.22).add(0.5), tIm: 0, tMul: performance.now() - t0 };
    }
    let t0 = performance.now();
    const P = im2col(img, spec.k);
    const tIm = performance.now() - t0;
    const m = spec.cols.length; const kk = spec.k * spec.k;
    const Kd = new Float32Array(kk * m); spec.cols.forEach((col, j) => col.forEach((v, i) => { Kd[i * m + j] = v; }));
    const K = Tensor.fromTypedArray(Kd, [kk, m], { dtype: 'f32' });
    t0 = performance.now();
    let out: Tensor;
    if (engine === 'gpu' && gpu) {
      const g = gpu;
      const Pg = await g.fromTensor(P), Kg = await g.fromTensor(K);
      const r = g.scope(() => {
        let y = Pg.matmul(Kg);                                    // [HWC, m] on the GPU
        if (spec.post === 'mag') y = y.mul(y).sum(-1).sqrt();     // √(Gx²+Gy²)
        else if (spec.post === 'offset') y = y.add(0.5);
        else if (spec.post === 'thresh') y = y.greater(st.th).cast('f32');
        return y;
      });
      out = await r.toTensor();
      for (const a of [Pg, Kg, r]) a.dispose();
    } else {
      let y = P.matmul(K);
      if (spec.post === 'mag') y = y.mul(y).sum(-1).sqrt();
      else if (spec.post === 'offset') y = y.add(0.5);
      else if (spec.post === 'thresh') y = y.gt(st.th).cast('f32');
      out = y;
    }
    const tMul = performance.now() - t0;
    return { out: out.reshape([H, W, C]), tIm, tMul };
  }

  function paintKernel() {
    const spec = kernelFor(st);
    if (spec.k === 1) { kview.innerHTML = `<div class="stat">${spec.post === 'norm' ? 'normalize(img, { mean, std }) — per-channel (x − μ)/σ, no kernel' : 'pointwise: gray.gt(t).cast("f32") — no neighbourhood'}</div>`; return; }
    const html = spec.cols.map((col, j) => {
      const mx = Math.max(...col.map(Math.abs)) || 1;
      const cells = col.map((v) => `<span style="--a:${(Math.abs(v) / mx).toFixed(2)}" class="${v < 0 ? 'neg' : 'pos'}" title="${v}">${spec.k <= 5 ? fmt(v, 2) : ''}</span>`).join('');
      return `<div class="kcol"><div class="kgrid" style="grid-template-columns:repeat(${spec.k},1fr)">${cells}</div>${spec.cols.length > 1 ? `<div class="stat">column ${j}${spec.post === 'mag' ? (j ? ' · Gy' : ' · Gx') : ''}</div>` : ''}</div>`;
    }).join('');
    kview.innerHTML = `<div class="klist">${html}</div>`;
  }

  function paintCode() {
    const spec = kernelFor(st); const [H, W] = (base?.shape ?? [st.size, st.size]) as number[];
    const C = spec.gray ? 1 : 3; const kk = spec.k * spec.k; const m = spec.cols.length;
    const post = spec.post === 'mag' ? '.mul(y).sum(-1).sqrt()' : spec.post === 'offset' ? '.add(0.5)' : spec.post === 'thresh' ? (st.eng === 'gpu' ? `.greater(${st.th}).cast("f32")` : `.gt(${st.th}).cast("f32")`) : '';
    const r = (spec.k - 1) / 2;
    const common = `import { Tensor } from "@johnhenry/math-plus-tensor-core";
import { resize, normalize } from "@johnhenry/math-plus-image";

const img = resize(pixels, { height: ${H}, width: ${W} }, { method: "bilinear" }); // [${H},${W},3] f32
${spec.gray ? `const gray = img.matmul(Tensor.from([0.299, 0.587, 0.114], { dtype: "f32" }).reshape([3, 1]));\n` : ''}`;
    if (spec.post === 'norm') { code.innerHTML = hl(common + `const z = normalize(img, { mean, std });   // mean/std from img.reshape([-1,3]).mean(0) / .std(0)`); return; }
    const patches = spec.k === 1 ? `const P = gray.reshape([${H * W * C}, 1]);` : `const P = ${spec.gray ? 'gray' : 'img'}.pad([[${r}, ${r}], [${r}, ${r}], [0, 0]])
  .unfold([${spec.k}, ${spec.k}], [0, 1])   // [${H},${W},${C},${spec.k},${spec.k}] view, no copy
  .contiguous().reshape([${H * W * C}, ${kk}]);`;
    const body = st.eng === 'gpu'
      ? `import { createWebGpuDevice } from "@johnhenry/math-plus-tensor-webgpu";
const gpu = await createWebGpuDevice();
const Pg = await gpu.fromTensor(P), Kg = await gpu.fromTensor(K);
const y = gpu.scope(() => { const y = Pg.matmul(Kg); return y${post}; });
const out = (await y.toTensor()).reshape([${H}, ${W}, ${C}]);`
      : `const y = P.matmul(K);                  // [${H * W * C}, ${m}]
const out = y${post}.reshape([${H}, ${W}, ${C}]);`;
    code.innerHTML = hl(common + patches + `\nconst K = Tensor.fromTypedArray(kernel, [${kk}, ${m}], { dtype: "f32" }); // ${spec.label}\n` + body);
  }

  function paintBars() {
    const rows: [string, number | undefined, string][] = [['im2col (pad + unfold + contiguous)', timings.im2col, 'im'], ['GEMM + post · CPU', timings.cpu, 'cpu'], ['GEMM + post · WebGPU (incl. upload/readback)', timings.gpu, 'gpu']];
    const mx = Math.max(...rows.map((r) => r[1] ?? 0), 1e-3);
    bars.innerHTML = rows.filter((r) => r[1] !== undefined).map(([l, v, c]) => `<div class="bar ${c}"><span class="bl">${l}</span><span class="bt"><i style="width:${((v! / mx) * 100).toFixed(1)}%"></i></span><b>${ms(v!)}</b></div>`).join('')
      + (timings.verdict ? `<div class="stat">tensor-webgpu's own <code>chooseGemmBackend(${timings.verdict})</code></div>` : '');
  }

  async function update() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      if (!base) loadBase();
      const eng = st.eng === 'gpu' && gpu ? 'gpu' : 'cpu';
      const r = await run(eng);
      if (disposed) return;
      tensorToCanvas(r.out, outC);
      timings.im2col = r.tIm; timings[eng] = r.tMul;
      const spec = kernelFor(st);
      cap2.textContent = `${spec.label} · ${eng === 'gpu' ? 'WebGPU' : 'CPU'}`;
      const [H, W] = base!.shape as number[];
      if (gpuMod && spec.k > 1) timings.verdict = `${H * W * (spec.gray ? 1 : 3)}, ${spec.cols.length}, ${spec.k * spec.k}) → "${gpuMod.chooseGemmBackend(H * W * (spec.gray ? 1 : 3), spec.cols.length, spec.k * spec.k)}"`;
      else timings.verdict = undefined;
      stats.innerHTML = `<span class="stat">image <b>${H}×${W}</b></span><span class="stat">patch matrix <b>[${H * W * (spec.gray ? 1 : 3)}, ${spec.k * spec.k}]</b></span><span class="stat">engine <b>${eng}</b></span>`;
      paintBars(); paintKernel(); paintCode();
    } catch (e) {
      stats.innerHTML = `<pre class="code err">${esc(String((e as Error).stack ?? e))}</pre>`;
    } finally {
      busy = false;
      if (again && !disposed) { again = false; update(); }
    }
  }

  async function bench() {
    if (!base) return;
    bBench.disabled = true; bBench.textContent = 'running…';
    try {
      const med = async (e: 'cpu' | 'gpu') => { const t: number[] = []; for (let i = 0; i < 10; i++) { t.push((await run(e)).tMul); } t.sort((a, b) => a - b); return t[5]; };
      timings.cpu = await med('cpu');
      if (gpu) { await run('gpu'); timings.gpu = await med('gpu'); }
      paintBars();
    } catch (e) { stats.innerHTML = `<pre class="code err">${esc(String(e))}</pre>`; }
    bBench.disabled = false; bBench.textContent = 'Benchmark ×10';
  }

  // WebGPU detection, guarded: only import the package when navigator.gpu exists.
  (async () => {
    try {
      if (!('gpu' in navigator)) { gpuReason = 'navigator.gpu is not defined in this browser'; return; }
      gpuMod = await import('@johnhenry/math-plus-tensor-webgpu');
      gpuReason = await gpuMod.webGpuUnavailableReason();
      if (gpuReason) return;
      const dev = await gpuMod.createWebGpuDevice();
      if (disposed) { dev.destroy(); return; }
      gpu = dev;
    } catch (e) { gpuReason = (e as Error).message || String(e); }
    finally { if (!disposed) { if (!gpu && st.eng === 'gpu') st.eng = 'cpu'; syncVis(); update(); } }
  })();

  const changed = (fn: () => void, rebase = false) => () => { fn(); save(); syncVis(); if (rebase) base = null; update(); };
  srcSel.input.addEventListener('change', changed(() => { st.img = srcSel.input.value; if (st.img === 'file' && !fileCanvas) file.click(); }, true));
  file.addEventListener('change', () => {
    const f = file.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f); const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); const s = Math.min(1, 512 / Math.max(im.width, im.height)); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height); fileCanvas = c; URL.revokeObjectURL(url); base = null; update(); };
    im.src = url;
  });
  opSel.input.addEventListener('change', changed(() => { st.op = opSel.input.value; }));
  kR.input.addEventListener('input', changed(() => { st.k = Number(kR.input.value); }));
  thR.input.addEventListener('input', changed(() => { st.th = Number(thR.input.value); }));
  amtR.input.addEventListener('input', changed(() => { st.amt = Number(amtR.input.value); }));
  sizeSel.input.addEventListener('change', changed(() => { st.size = Number(sizeSel.input.value); timings.cpu = timings.gpu = undefined; }, true));
  bCpu.addEventListener('click', changed(() => { st.eng = 'cpu'; }));
  bGpu.addEventListener('click', changed(() => { st.eng = 'gpu'; }));
  bBench.addEventListener('click', bench);

  syncVis(); update();
  return () => { disposed = true; try { gpu?.destroy(); } catch {} };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Tab 4 · Units — a tiny expression language over math-plus-unit            */
/* ────────────────────────────────────────────────────────────────────────── */

type UNode =
  | { t: 'q'; v: number; u: string | null }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: UNode; b: UNode }
  | { t: 'pow'; a: UNode; n: number }
  | { t: 'neg'; a: UNode };

function parseUnits(src: string): { ast: UNode; target: string | null } {
  let target: string | null = null;
  const m = /^(.*\S)\s+(?:in|to|->|→)\s+(\S.*)$/.exec(src.trim());
  let body = src.trim();
  if (m) { body = m[1]; target = m[2].trim(); }
  let i = 0;
  const ws = () => { while (i < body.length && /\s/.test(body[i])) i++; };
  const peek = () => { ws(); return body[i]; };
  const unitRun = (): string | null => {
    ws();
    const r = /^[A-Za-zµ°][A-Za-z0-9µ°_]*(?:\^-?\d+)?(?:[*/][A-Za-zµ°][A-Za-z0-9µ°_]*(?:\^-?\d+)?)*/.exec(body.slice(i));
    if (!r) return null; i += r[0].length; return r[0];
  };
  const atom = (): UNode => {
    const c = peek();
    if (c === '(') { i++; const e = sum(); if (peek() !== ')') throw new UnitParseError(`expected ")" at ${i}`); i++; return e; }
    if (c === '-') { i++; return { t: 'neg', a: power() }; }
    const num = /^(\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/i.exec(body.slice(i));
    if (num) { i += num[0].length; const u = unitRun(); return { t: 'q', v: Number(num[0]), u }; }
    const u = unitRun();
    if (u) return { t: 'q', v: 1, u };
    throw new UnitParseError(`unexpected ${c === undefined ? 'end of input' : `"${c}"`} at column ${i + 1}`);
  };
  const power = (): UNode => { let a = atom(); while (peek() === '^') { i++; ws(); const n = /^-?\d+/.exec(body.slice(i)); if (!n) throw new UnitParseError('expected an integer exponent'); i += n[0].length; a = { t: 'pow', a, n: Number(n[0]) }; } return a; };
  const product = (): UNode => { let a = power(); for (;;) { const c = peek(); if (c === '*' || c === '/' || c === '×' || c === '÷') { i++; a = { t: 'bin', op: c === '*' || c === '×' ? '*' : '/', a, b: power() }; } else return a; } };
  const sum = (): UNode => { let a = product(); for (;;) { const c = peek(); if (c === '+' || c === '-') { i++; a = { t: 'bin', op: c, a, b: product() }; } else return a; } };
  const ast = sum();
  if (peek() !== undefined) throw new UnitParseError(`unexpected "${peek()}" at column ${i + 1}`);
  return { ast, target };
}

function evalUnits(n: UNode): Unit {
  switch (n.t) {
    case 'q': return n.u ? Unit.of(n.v, n.u) : Unit.dimensionless(n.v);
    case 'neg': return evalUnits(n.a).mul(-1);
    case 'pow': return evalUnits(n.a).pow(n.n);
    case 'bin': {
      const a = evalUnits(n.a), b = evalUnits(n.b);
      if (n.op === '+') return a.add(b);
      if (n.op === '-') return a.sub(b);
      if (n.op === '*') return b.isDimensionless ? a.mul(b.value) : a.isDimensionless ? b.mul(a.value) : a.mul(b);
      return b.isDimensionless ? a.div(b.value) : a.div(b);
    }
  }
}

function codeUnits(n: UNode): string {
  switch (n.t) {
    case 'q': return n.u ? `Unit.of(${n.v}, "${n.u}")` : `Unit.dimensionless(${n.v})`;
    case 'neg': return `${codeUnits(n.a)}.mul(-1)`;
    case 'pow': return `${codeUnits(n.a)}.pow(${n.n})`;
    case 'bin': {
      const m = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' }[n.op];
      const b = n.b.t === 'q' && !n.b.u ? String(n.b.v) : codeUnits(n.b);
      return `${codeUnits(n.a)}\n  .${m}(${b})`;
    }
  }
}

const CANDIDATES = [
  'm', 'km', 'cm', 'mm', 'um', 'nm', 'in', 'ft', 'yd', 'mi',
  'kg', 'g', 'mg', 'lb', 'oz', 's', 'ms', 'min', 'h', 'day',
  'm/s', 'km/h', 'mi/h', 'ft/s', 'm/s^2', 'ft/s^2', 'N', 'kN', 'lb*ft/s^2', 'J', 'kJ', 'MJ', 'W*h', 'kW*h', 'W', 'kW', 'MW',
  'Pa', 'kPa', 'MPa', 'L', 'mL', 'm^3', 'ft^3', 'in^3', 'm^2', 'km^2', 'ft^2', 'Hz', 'kHz', 'MHz', 'GHz', 'K', 'degC', 'degF', 'mol', 'A', 'mA',
  'kg/m^3', 'g/L', 'J/s', 'N*m', 'kg*m/s', 'm^3/s', 'L/min', 'km/s', 'cm/s', 'mi/day', 'kg*m/s^2', 'g*cm/s^2', 'mN', 'MN', 'GJ', 'mW', 'GW', 'kJ/s', 'mm', 'mi^2', 'yd^3', 'mmol', 'mg/L',
];

const UNIT_PRESETS = [
  '3 m/s * 2 h in km', '70 kg * 9.81 m/s^2', '70 kg * 9.81 m/s^2 in N', '1 mi / 4 min in km/h', '2 kW * 3 h in MJ',
  '(1 ft)^3 in L', '100 degC to degF', '5 lb * 2 ft/s^2 in N', '1.5 m + 20 cm in in', '1 L / 2 min in m^3/s',
  '3 m + 2 kg',
];

function mountUnits(root: HTMLElement, st: State, save: () => void): () => void {
  root.innerHTML = '';
  const intro = el('p', 'what', `A tiny expression language compiled to <code>Unit</code> calls. Every quantity is a magnitude plus a seven-slot dimension vector; <code>mul</code>/<code>div</code> combine dimensions, <code>add</code>/<code>sub</code>/<code>to</code> demand they match and throw <code>DimensionMismatchError</code> otherwise. Try <code>3 m + 2 kg</code>.`);
  const panel = el('div', 'panel units');
  const input = el('input', 'uexpr'); input.value = st.expr; input.spellcheck = false; input.setAttribute('aria-label', 'unit expression');
  const chips = el('div', 'chips');
  for (const p of UNIT_PRESETS) { const b = el('button', 'tb-btn', esc(p)); b.dataset.e = p; chips.append(b); }
  const result = el('div', 'uresult');
  const grid = el('div', 'units-grid');
  const left = el('div', 'panel'); const right = el('div', 'panel');
  const dimsView = el('div', 'dims'); const table = el('div', 'utable');
  const code = el('pre', 'code calls');
  left.append(el('div', 'subhead', 'dimension vector'), dimsView, el('div', 'subhead', 'the calls, verbatim'), code);
  right.append(el('div', 'subhead', 'same quantity, every compatible unit (each row is a real .to() call)'), table);
  grid.append(left, right);
  panel.append(input, chips, result);
  const known = el('details', 'known');
  const prefixable = Object.entries(BASE_UNITS).filter(([, d]) => d.prefixable).map(([k]) => k);
  known.innerHTML = `<summary>units the table knows (${Object.keys(BASE_UNITS).length}) · SI prefixes (${Object.keys(PREFIXES).length})</summary><div class="stat">${Object.keys(BASE_UNITS).map((k) => `<span class="chip">${esc(k)}</span>`).join(' ')}</div><div class="stat">prefixable: ${prefixable.join(', ')} · prefixes: ${Object.keys(PREFIXES).join(' ')}</div>`;
  root.append(intro, panel, grid, known);

  const DIMS: (keyof Dimension)[] = ['length', 'mass', 'time', 'current', 'temperature', 'amount', 'luminosity'];
  const SYM: Record<string, string> = { length: 'L', mass: 'M', time: 'T', current: 'I', temperature: 'Θ', amount: 'N', luminosity: 'J' };

  const run = () => {
    const src = input.value;
    let ast: UNode; let target: string | null;
    try {
      ({ ast, target } = parseUnits(src));
    } catch (e) { result.innerHTML = `<div class="uerr"><b>${esc((e as Error).name)}</b> ${esc((e as Error).message)}</div>`; return; }
    const callCode = `import { Unit } from "@johnhenry/math-plus-unit";\n\nconst q = ${codeUnits(ast)}${target ? `\n  .to("${target}")` : ''};\nq.toString(6); q.dimension;`;
    code.innerHTML = hl(callCode);
    let q: Unit;
    try {
      q = evalUnits(ast);
      if (target) q = q.to(target);
    } catch (e) {
      const kind = e instanceof DimensionMismatchError ? 'DimensionMismatchError' : e instanceof UnknownUnitError ? 'UnknownUnitError' : e instanceof UnitParseError ? 'UnitParseError' : (e as Error).name;
      result.innerHTML = `<div class="uerr"><b>${kind}</b> ${esc((e as Error).message)}</div>`;
      table.innerHTML = ''; dimsView.innerHTML = '';
      return;
    }
    const dimStr = isDimensionless(q.dimension) ? 'dimensionless' : dimensionToString(q.dimension);
    result.innerHTML = `<div class="uval">${esc(fmt(q.value, 6))} <span class="usym">${esc(q.symbol)}</span></div><div class="stat">dimension <b>${esc(dimStr)}</b> · symbol <b>${esc(q.symbol || '—')}</b></div>`;
    dimsView.innerHTML = DIMS.map((d) => {
      const v = q.dimension[d] ?? 0;
      return `<div class="drow ${v ? 'on' : ''}"><span class="dn">${SYM[d]} <small>${d}</small></span><span class="dbar">${v ? `<i class="${v > 0 ? 'p' : 'n'}" style="width:${Math.min(50, Math.abs(v) * 12.5)}%"></i>` : ''}</span><b>${v > 0 ? '+' : ''}${v}</b></div>`;
    }).join('');
    const rows: string[] = [];
    const seen = new Set<string>();
    for (const c of [q.symbol, ...CANDIDATES]) {
      if (!c || seen.has(c)) continue; seen.add(c);
      try { const v = q.to(c).value; rows.push(`<button class="urow${c === q.symbol ? ' cur' : ''}" data-u="${esc(c)}"><span class="uv">${esc(fmt(v, 6))}</span><span class="us">${esc(c)}</span></button>`); } catch { /* incompatible dimension */ }
    }
    table.innerHTML = rows.length ? rows.join('') : '<div class="stat">no candidate units share this dimension</div>';
  };

  chips.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (!b) return; input.value = b.dataset.e!; st.expr = input.value; save(); run(); });
  input.addEventListener('input', () => { st.expr = input.value; save(); run(); });
  table.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    const { target } = (() => { try { return parseUnits(input.value); } catch { return { target: null }; } })();
    const base = target ? input.value.replace(/\s+(?:in|to|->|→)\s+\S.*$/, '') : input.value;
    input.value = `${base} in ${b.dataset.u}`; st.expr = input.value; save(); run();
  });
  run();
  return () => {};
}

/* ────────────────────────────────────────────────────────────────────────── */
/* the planet                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

const TABS: [TabId, string, string, (root: HTMLElement, st: State, save: () => void) => () => void][] = [
  ['grad', 'Autograd', 'tensor-core + tensor-autograd', mountGrad],
  ['fft', 'FFT & Signal', 'fft + signal', mountFFT],
  ['image', 'Image', 'image + tensor-webgpu', mountImage],
  ['units', 'Units', 'unit', mountUnits],
];

const playground: Playground = {
  id: 'tensor',
  title: 'Tensor Bench',
  pkg: '@johnhenry/math-plus-*',
  hue: 250,
  blurb: 'Autograd, FFT, signals, image kernels and units from the twenty-one math-plus packages.',
  docs: 'https://opensource.johnhenry.me/math/',
  mount(host) {
    const st = readState(DEFAULTS);
    if (!TABS.some((t) => t[0] === st.tab)) st.tab = 'grad';
    const save = () => writeState(st, DEFAULTS);
    const root = el('div', 'pg-tensor');
    // M4: 4 tabs + a spacer + "copy link" all in one flex-wrap row ragged-wrapped
    // into 3 rows at phone width (Autograd alone on row 1, Units + copy link
    // orphaned on row 3 — confirmed live). Tabs get their own single-row
    // horizontal-scroll strip; copy link moves to a row of its own below it
    // (M6: one consistent place) instead of competing for room-head space.
    const tabrow = el('div', 'tabrow');
    const bar = el('div', 'tabbar');
    const body = el('div', 'tabbody');
    for (const [id, name, pk] of TABS) {
      const b = el('button', 'tab', `<b>${name}</b><small>${pk}</small>`); b.dataset.tab = id; b.setAttribute('role', 'tab'); bar.append(b);
    }
    const link = el('button', 'tb-btn copy', 'copy link');
    tabrow.append(bar, link);
    root.append(tabrow, body);
    host.append(root);

    let cleanup: (() => void) | null = null;
    const show = (id: string) => {
      if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
      st.tab = id; save();
      bar.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      const pane = el('div', `pane pane-${id}`);
      body.replaceChildren(pane);
      try { cleanup = TABS.find((t) => t[0] === id)![3](pane, st, save); }
      catch (e) { pane.append(el('pre', 'code err', esc(String((e as Error).stack ?? e)))); }
    };
    bar.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.tab'); if (b && b.dataset.tab !== st.tab) show(b.dataset.tab!); });
    link.addEventListener('click', async () => { await copyLink(); link.textContent = 'copied ✓'; setTimeout(() => { link.textContent = 'copy link'; }, 1400); });
    show(st.tab);
    return () => { if (cleanup) { try { cleanup(); } catch {} } };
  },
};
export default playground;
