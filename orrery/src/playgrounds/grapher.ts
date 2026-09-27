import type { Playground } from '../registry';
import { SessionTable, buildServer, OP_CATALOG, DEFAULT_LIMITS } from '@johnhenry/math-grapher';
import { Symbolic } from '@johnhenry/math';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readState, writeState, copyLink } from '../state';
import './grapher.css';

/* ────────────────────────────────────────────────────────────────────────────
 * Grapher Cells — a notebook over @johnhenry/math-grapher.
 *
 * Everything the page does to the runtime goes through the package's real MCP
 * tool surface: `buildServer(table)` is connected to an MCP `Client` over an
 * in-memory transport, and the notebook, the loop driver and the agent console
 * all speak `client.callTool({ name: "session_*", arguments })`.
 *
 * The runtime holds only data (free cells) and JSON define-specs over its op
 * catalog. Views (plots, traces, tables, loop drivers) are page-side cells:
 * they read runtime values, and function plots are sampled in-page with the
 * same Symbolic grammar `math_eval` uses (the runtime emits no plot spec).
 * ──────────────────────────────────────────────────────────────────────────── */

type Json = unknown;
interface Slider { min: number; max: number; step: number; raw: string }
type Parsed =
  | { kind: 'note'; text: string }
  | { kind: 'input'; name: string; value: Json; slider?: Slider }
  | { kind: 'expr'; name: string; expr: string; vars: string[] }
  | { kind: 'op'; name: string; op: string; args: Record<string, Json> }
  | { kind: 'plot'; y: string; over: string; from: string; to: string }
  | { kind: 'curve'; x: string; y: string; over: string; from: string; to: string }
  | { kind: 'trace'; x: string; y: string }
  | { kind: 'table'; cells: string[] }
  | { kind: 'loop'; assigns: Array<[string, string]> };

interface NbCell {
  uid: number;
  src: string;
  p?: Parsed;
  perr?: string;
  applied?: string; // JSON of the last runtime call applied for this cell
  el?: HTMLElement;
  out?: HTMLElement;
  ta?: HTMLTextAreaElement;
  lastOut?: string;
  trace?: Array<[number, number]>;
}

interface NbPreset {
  title: string;
  kind: 'generic' | 'graph-theory';
  head: string[];
  cells: string[];
  autoplay?: boolean;
}

const NB_PRESETS: Record<string, NbPreset> = {
  curve: {
    title: 'Parametric curve',
    kind: 'generic',
    autoplay: true,
    head: ['# A Lissajous figure. a, b, d and t are free cells; x, y and speed are math_eval cells. The curve view samples x(t), y(t) in-page; the dot is the runtime\'s own value at the current t.'],
    cells: [
      'a = 3 in [1, 8]',
      'b = 2 in [1, 8]',
      'd = 0.5 in [0, 3.1416]',
      't = 0.8 in [0, 6.2832]',
      'x = sin(a*t + d)',
      'y = sin(b*t)',
      'curve (x, y) over t in [0, 2*pi]',
      'speed = hypot(a*cos(a*t + d), b*cos(b*t))',
      'plot speed over t in [0, 2*pi]',
      't_next = t + 0.012 - 2*pi*floor((t + 0.012)/(2*pi))',
      'loop t <- t_next',
    ],
  },
  spring: {
    title: 'Physics sim (dt)',
    kind: 'generic',
    autoplay: true,
    head: ['# A damped spring stepped by explicit Euler. Each loop tick reads x_next, v_next, t_next and writes them back into x, v, t with session_set_cell. Raise dt and watch E climb: explicit Euler pumps energy in.'],
    cells: [
      'k = 6 in [1, 20]',
      'c = 0.25 in [0, 2]',
      'dt = 0.03 in [0.005, 0.15]',
      'x = 1',
      'v = 0',
      't = 0',
      'acc = -k*x - c*v',
      'x_next = x + v*dt',
      'v_next = v + acc*dt',
      't_next = t + dt',
      'E = 0.5*v^2 + 0.5*k*x^2',
      'loop x <- x_next, v <- v_next, t <- t_next',
      'trace (t, x)',
      'trace (x, v)',
      'trace (t, E)',
    ],
  },
  stats: {
    title: 'Data table + stats',
    kind: 'generic',
    head: ['# Six samples as free cells (edit them in the table), summary statistics as computed cells. math_eval only sees numbers, so every sample is its own cell and every statistic is a plain expression over them.'],
    cells: [
      'x1 = 4.2',
      'x2 = 5.1',
      'x3 = 3.8',
      'x4 = 6.4',
      'x5 = 5',
      'x6 = 4.7',
      'table x1 x2 x3 x4 x5 x6',
      'n = 6',
      'total = x1 + x2 + x3 + x4 + x5 + x6',
      'mean = total / n',
      's2 = ((x1-mean)^2 + (x2-mean)^2 + (x3-mean)^2 + (x4-mean)^2 + (x5-mean)^2 + (x6-mean)^2) / (n - 1)',
      'sd = sqrt(s2)',
      'lo = min(min(min(x1, x2), min(x3, x4)), min(x5, x6))',
      'hi = max(max(max(x1, x2), max(x3, x4)), max(x5, x6))',
      'spread = hi - lo',
      'table n total mean s2 sd lo hi spread',
      'z = 5 in [0, 10]',
      'pdf = exp(-((z - mean)/sd)^2/2) / (sd*sqrt(2*pi))',
      'plot pdf over z in [lo - 2, hi + 2]',
    ],
  },
  diamond: {
    title: 'Diamond dependency',
    kind: 'generic',
    head: ['# a feeds b and c; d reads both. One write to a recomputes b, c and d exactly once each. Move k and only h recomputes. Set a to the value it already has (type it in) and nothing recomputes: set() is structurally compared.'],
    cells: [
      'a = 3 in [0, 10]',
      'b = a * 2',
      'c = a + 10',
      'd = b * c',
      'g = floor(a / 4) * 100 + d',
      'k = 5 in [0, 10]',
      'h = k^2',
      'table a b c d g k h',
    ],
  },
  graph: {
    title: 'Graph theory (runtime preset)',
    kind: 'graph-theory',
    head: ['# session_open({ kind: "graph-theory" }) — the runtime\'s own preset: an edge list is parsed, analysed and walked. The page adds Dijkstra and DFS cells over the same `parsed` graph value (a rich Graph that flows between cells and is projected to JSON on read).'],
    cells: [
      'dist = graph_dijkstra {"graph": {"$cell": "parsed"}, "start": {"$cell": "startVertex"}}',
      'dfsOrder = graph_dfs {"graph": {"$cell": "parsed"}, "start": {"$cell": "startVertex"}}',
    ],
  },
};
const PRESET_IDS = Object.keys(NB_PRESETS);

const DEMO: string[] = [
  '# I am a scripted agent. No model: just MCP tool calls against the runtime, replayed.',
  'tools',
  'session_open {"kind": "generic"}',
  'session_set_cell {"cell": "a", "value": 3}',
  'session_set_cell {"cell": "b", "value": 4}',
  'session_set_cell {"cell": "t", "value": 0.6}',
  'session_define {"cell": "x", "op": "math_eval", "args": {"expr": "sin(a*t)", "vars": {"a": {"$cell": "a"}, "t": {"$cell": "t"}}}}',
  'session_define {"cell": "y", "op": "math_eval", "args": {"expr": "cos(b*t)", "vars": {"b": {"$cell": "b"}, "t": {"$cell": "t"}}}}',
  'ui: curve (x, y) over t in [0, 2*pi]',
  'session_define {"cell": "r", "op": "math_eval", "args": {"expr": "hypot(x, y)", "vars": {"x": {"$cell": "x"}, "y": {"$cell": "y"}}}}',
  'session_get_cell {"cell": "r"}',
  'session_explain_cell {"cell": "r"}',
  '# Nudge one parameter: only x and r recompute; y keeps its cache.',
  'session_set_cell {"cell": "a", "value": 5}',
  'session_get_cell {"cell": "r"}',
  'session_define {"cell": "t_next", "op": "math_eval", "args": {"expr": "t + 0.01", "vars": {"t": {"$cell": "t"}}}}',
  'ui: loop t <- t_next',
  'session_list_cells {}',
  'session_snapshot {}',
];

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FN_NAMES = new Set(['sin', 'cos', 'tan', 'exp', 'ln', 'sqrt', 'abs', 'min', 'max', 'hypot', 'atan2', 'floor', 'ceil', 'round', 'sign', 'pi', 'e']);

/** Split on commas that are not nested inside () or []. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function constNum(s: string): number {
  const v = Symbolic.evaluate(Symbolic.parse(s), {});
  if (!Number.isFinite(v)) throw new Error(`"${s}" is not a finite constant`);
  return v;
}

function parseSource(src: string): Parsed {
  const s = src.trim();
  if (!s) throw new Error('empty cell: write `name = value`, `name = expression`, or a view such as `plot y over t in [0, 2*pi]`');
  if (s.startsWith('#')) return { kind: 'note', text: s.replace(/^#\s?/gm, '') };
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^plot\s+(\w+)\s+over\s+(\w+)\s+in\s+\[([\s\S]+)\]$/))) {
    const r = splitTop(m[3]);
    if (r.length !== 2) throw new Error('plot range must be [from, to]');
    return { kind: 'plot', y: m[1], over: m[2], from: r[0], to: r[1] };
  }
  if ((m = s.match(/^curve\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s+over\s+(\w+)\s+in\s+\[([\s\S]+)\]$/))) {
    const r = splitTop(m[4]);
    if (r.length !== 2) throw new Error('curve range must be [from, to]');
    return { kind: 'curve', x: m[1], y: m[2], over: m[3], from: r[0], to: r[1] };
  }
  if ((m = s.match(/^trace\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)$/))) return { kind: 'trace', x: m[1], y: m[2] };
  if ((m = s.match(/^table\s+([\s\S]+)$/))) {
    const cells = m[1].split(/[\s,]+/).filter(Boolean);
    for (const c of cells) if (!IDENT.test(c)) throw new Error(`"${c}" is not a cell name`);
    return { kind: 'table', cells };
  }
  if ((m = s.match(/^loop\s+([\s\S]+)$/))) {
    const assigns = splitTop(m[1]).map((part) => {
      const kv = part.split('<-').map((x) => x.trim());
      if (kv.length !== 2 || !IDENT.test(kv[0]) || !IDENT.test(kv[1])) throw new Error(`loop wants "cell <- cell" pairs, got "${part}"`);
      return kv as [string, string];
    });
    return { kind: 'loop', assigns };
  }
  m = s.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/);
  if (!m) throw new Error('expected `name = …`, `plot …`, `curve (x, y) …`, `trace (x, y)`, `table …`, `loop a <- b` or a `# note`');
  const name = m[1];
  const rhs = m[2].trim();
  if (FN_NAMES.has(name)) throw new Error(`"${name}" is a function/constant name in the math_eval grammar; pick another cell name`);
  if (!rhs) throw new Error(`${name} = ? (give it a value or an expression)`);
  if (/^`[\s\S]*`$/.test(rhs)) return { kind: 'input', name, value: rhs.slice(1, -1) };
  const sl = rhs.match(/^(-?[\d.]+(?:e-?\d+)?)\s+in\s+\[([\s\S]+)\]$/i);
  if (sl) {
    const r = splitTop(sl[2]);
    if (r.length !== 2) throw new Error('slider range must be [min, max]');
    const min = constNum(r[0]), max = constNum(r[1]);
    if (!(max > min)) throw new Error('slider max must be greater than min');
    return { kind: 'input', name, value: Number(sl[1]), slider: { min, max, step: (max - min) / 400, raw: `[${r[0]}, ${r[1]}]` } };
  }
  try { return { kind: 'input', name, value: JSON.parse(rhs) }; } catch { /* not JSON */ }
  const om = rhs.match(/^([a-z_][a-z0-9_]*)\s*(\{[\s\S]*\})$/);
  if (om && om[1] in OP_CATALOG) {
    let args: Record<string, Json>;
    try { args = JSON.parse(om[2]); } catch (e) { throw new Error(`${om[1]} args must be JSON: ${(e as Error).message}`); }
    return { kind: 'op', name, op: om[1], args };
  }
  let vars: string[];
  try { vars = Symbolic.freeVariables(Symbolic.parse(rhs)); } catch (e) { throw new Error(`math_eval grammar: ${(e as Error).message}`); }
  if (vars.includes(name)) throw new Error(`${name} reads itself; use a loop (\`loop ${name} <- ${name}_next\`) to feed a value back`);
  return { kind: 'expr', name, expr: rhs, vars };
}

function runtimeName(p?: Parsed): string | null {
  return p && (p.kind === 'input' || p.kind === 'expr' || p.kind === 'op') ? p.name : null;
}

function cellRefs(v: Json, out = new Set<string>()): Set<string> {
  if (v && typeof v === 'object') {
    if (!Array.isArray(v) && typeof (v as { $cell?: unknown }).$cell === 'string') { out.add((v as { $cell: string }).$cell); return out; }
    for (const x of Array.isArray(v) ? v : Object.values(v as object)) cellRefs(x, out);
  }
  return out;
}

function depsOf(p?: Parsed): string[] {
  if (!p) return [];
  if (p.kind === 'expr') return p.vars;
  if (p.kind === 'op') return [...cellRefs(p.args)];
  return [];
}

/** The exact MCP tool call that makes this cell exist in the runtime. */
function runtimeCall(p: Parsed): { name: string; args: Record<string, Json> } | null {
  if (p.kind === 'input') return { name: 'session_set_cell', args: { cell: p.name, value: p.value } };
  if (p.kind === 'expr') {
    const vars: Record<string, Json> = {};
    for (const v of p.vars) vars[v] = { $cell: v };
    return { name: 'session_define', args: { cell: p.name, op: 'math_eval', args: { expr: p.expr, vars } } };
  }
  if (p.kind === 'op') return { name: 'session_define', args: { cell: p.name, op: p.op, args: p.args } };
  return null;
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n) && Math.abs(n) < 1e12) return String(n);
  const a = Math.abs(n);
  if (a !== 0 && (a < 1e-4 || a >= 1e7)) return n.toExponential(4);
  return String(Number(n.toPrecision(6)));
}

function inputSource(name: string, value: Json, slider?: Slider): string {
  if (typeof value === 'number' && slider) return `${name} = ${fmtNum(value)} in ${slider.raw}`;
  if (typeof value === 'string' && value.includes('\n') && !value.includes('`')) return `${name} = \`${value}\``;
  return `${name} = ${typeof value === 'number' ? fmtNum(value) : JSON.stringify(value)}`;
}

function sourceFromSpec(spec: { cell: string; op: string; args: Record<string, Json> }): string {
  if (spec.op === 'math_eval' && typeof spec.args.expr === 'string') {
    const vars = (spec.args.vars ?? {}) as Record<string, Json>;
    const plain = Object.keys(spec.args).every((k) => k === 'expr' || k === 'vars')
      && Object.entries(vars).every(([k, v]) => (v as { $cell?: string })?.$cell === k);
    if (plain) return `${spec.cell} = ${spec.args.expr}`;
  }
  return `${spec.cell} = ${spec.op} ${JSON.stringify(spec.args)}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
function short(v: Json, n = 18): string {
  let s: string;
  if (typeof v === 'number') s = fmtNum(v);
  else if (v === undefined) s = '—';
  else if (v && typeof v === 'object' && (v as { $type?: string }).$type === 'graph') {
    const g = v as { vertices: unknown[]; edges: unknown[] };
    s = `graph ${g.vertices.length}v ${g.edges.length}e`;
  } else s = JSON.stringify(v) ?? String(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function jsonCompact(v: Json, max = 400): string {
  const s = JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Number(fmtNum(x)) || x : x));
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/* ── value rendering ─────────────────────────────────────────────────────── */

function renderValue(v: Json): string {
  if (typeof v === 'number') return `<div class="gc-num">${esc(fmtNum(v))}</div>`;
  if (typeof v === 'string') return `<pre class="gc-str">${esc(JSON.stringify(v))}</pre>`;
  if (typeof v === 'boolean' || v === null) return `<div class="gc-num">${String(v)}</div>`;
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || typeof x !== 'object')) {
      return `<div class="gc-chips">${v.map((x, i) => `<span class="chip">${i > 0 ? '' : ''}${esc(short(x, 24))}</span>`).join('<span class="gc-arrow">→</span>')}</div>`;
    }
    if (v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      const keys = [...new Set(v.flatMap((x) => Object.keys(x as object)))];
      return `<table class="gc-tbl"><tr>${keys.map((k) => `<th>${esc(k)}</th>`).join('')}</tr>${v
        .map((row) => `<tr>${keys.map((k) => `<td>${esc(short((row as Record<string, Json>)[k], 30))}</td>`).join('')}</tr>`)
        .join('')}</table>`;
    }
    return `<pre class="gc-str">${esc(JSON.stringify(v))}</pre>`;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, Json>;
    if (o.$type === 'graph') return renderGraphValue(o as unknown as GraphValue);
    if (Array.isArray(o.matrix) && Array.isArray(o.order)) {
      const order = o.order as string[];
      const mat = o.matrix as Array<Array<number | null>>;
      return `<table class="gc-tbl gc-mat"><tr><th></th>${order.map((k) => `<th>${esc(k)}</th>`).join('')}</tr>${mat
        .map((row, i) => `<tr><th>${esc(order[i])}</th>${row.map((x) => `<td class="${x === null ? 'nil' : ''}">${x === null ? '·' : esc(fmtNum(x))}</td>`).join('')}</tr>`)
        .join('')}</table>`;
    }
    return `<table class="gc-tbl gc-kv">${Object.entries(o)
      .map(([k, x]) => `<tr><th>${esc(k)}</th><td>${x && typeof x === 'object' ? renderValue(x) : esc(short(x, 60))}</td></tr>`)
      .join('')}</table>`;
  }
  return `<div class="gc-num">${esc(String(v))}</div>`;
}

interface GraphValue { $type: 'graph'; directed: boolean; vertices: string[]; edges: Array<{ from: string; to: string; weight: number }> }
function renderGraphValue(g: GraphValue): string {
  const n = g.vertices.length, R = 70, cx = 110, cy = 90;
  const pos = new Map(g.vertices.map((v, i) => [v, [cx + R * Math.cos((i / n) * 2 * Math.PI - Math.PI / 2), cy + R * Math.sin((i / n) * 2 * Math.PI - Math.PI / 2)]]));
  const edges = g.edges.map((e) => {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) return '';
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${g.directed ? 'marker-end="url(#gc-gv-arrow)"' : ''}/><text class="w" x="${mx}" y="${my - 3}">${esc(String(e.weight))}</text>`;
  }).join('');
  const nodes = g.vertices.map((v) => { const p = pos.get(v)!; return `<circle cx="${p[0]}" cy="${p[1]}" r="13"/><text x="${p[0]}" y="${p[1] + 4}">${esc(v)}</text>`; }).join('');
  return `<div class="gc-gv"><svg viewBox="0 0 220 180"><defs><marker id="gc-gv-arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z"/></marker></defs>${edges}${nodes}</svg><div class="gc-gv-meta">{ $type: "graph", ${g.directed ? 'directed' : 'undirected'}, ${n} vertices, ${g.edges.length} edges }</div></div>`;
}

/* ── canvas plotting ─────────────────────────────────────────────────────── */

interface Series { pts: Array<[number, number]>; color: string; width?: number }
function drawPlot(cv: HTMLCanvasElement, series: Series[], opts: { equal?: boolean; marker?: [number, number] | null; xl?: string; yl?: string; xr?: [number, number] }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(200, cv.clientWidth), H = Math.max(120, cv.clientHeight);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const all = series.flatMap((s) => s.pts).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (opts.marker && Number.isFinite(opts.marker[0]) && Number.isFinite(opts.marker[1])) all.push(opts.marker);
  if (!all.length) { ctx.fillStyle = '#8a8fa3'; ctx.font = '12px ui-monospace, monospace'; ctx.fillText('no finite samples yet', 12, 20); return; }
  let [x0, x1] = opts.xr ?? [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const ys = all.map((p) => p[1]).sort((a, b) => a - b);
  let y0 = ys[Math.floor(ys.length * 0.005)], y1 = ys[Math.ceil(ys.length * 0.995) - 1];
  if (x1 - x0 < 1e-9) { x0 -= 1; x1 += 1; }
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  // The line's glow (shadowBlur below) extends past the stroked path itself,
  // and the 99.5th-percentile trim above can leave true peak samples just
  // outside [y0, y1] — either way the curve was landing flush against (and
  // getting hard-clipped by) the clip rect's top edge. Pad generously.
  const pad = 0.16 * (y1 - y0); y0 -= pad; y1 += pad;
  const L = 44, Rm = 12, T = 10, B = 22;
  const pw = W - L - Rm, ph = H - T - B;
  let sx = pw / (x1 - x0), sy = ph / (y1 - y0);
  if (opts.equal) { const k = Math.min(sx, sy); sx = k; sy = k; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const X = (x: number) => L + pw / 2 + (x - cx) * sx;
  const Y = (y: number) => T + ph / 2 - (y - cy) * sy;
  // grid
  ctx.strokeStyle = 'rgba(140,150,190,0.12)'; ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(170,176,200,0.75)'; ctx.font = '10px ui-monospace, monospace';
  const ticks = (a: number, b: number, n: number) => { const step = Math.pow(10, Math.floor(Math.log10((b - a) / n))); const m = [1, 2, 5, 10].find((k) => (b - a) / (k * step) <= n)! * step; const out: number[] = []; for (let v = Math.ceil(a / m) * m; v <= b + 1e-9; v += m) out.push(Math.abs(v) < 1e-12 ? 0 : v); return out; };
  const vx0 = cx - pw / 2 / sx, vx1 = cx + pw / 2 / sx;
  const vy0 = cy - ph / 2 / sy, vy1 = cy + ph / 2 / sy;
  for (const t of ticks(vx0, vx1, 6)) { ctx.beginPath(); ctx.moveTo(X(t), T); ctx.lineTo(X(t), H - B); ctx.stroke(); ctx.fillText(fmtNum(Number(t.toPrecision(3))), X(t) - 8, H - 7); }
  for (const t of ticks(vy0, vy1, 4)) { ctx.beginPath(); ctx.moveTo(L, Y(t)); ctx.lineTo(W - Rm, Y(t)); ctx.stroke(); ctx.fillText(fmtNum(Number(t.toPrecision(3))), 4, Y(t) + 3); }
  ctx.strokeStyle = 'rgba(170,176,210,0.35)';
  if (vy0 <= 0 && vy1 >= 0) { ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(W - Rm, Y(0)); ctx.stroke(); }
  if (vx0 <= 0 && vx1 >= 0) { ctx.beginPath(); ctx.moveTo(X(0), T); ctx.lineTo(X(0), H - B); ctx.stroke(); }
  if (opts.xl || opts.yl) { ctx.fillStyle = 'rgba(200,205,230,0.8)'; ctx.fillText(`${opts.yl ?? ''}${opts.xl ? '  vs  ' + opts.xl : ''}`, L + 6, T + 12); }
  ctx.save(); ctx.beginPath(); ctx.rect(L, T, W - L - Rm, H - T - B); ctx.clip();
  for (const s of series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width ?? 2; ctx.shadowColor = s.color; ctx.shadowBlur = 8;
    ctx.beginPath(); let pen = false;
    for (const [x, y] of s.pts) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(Y(y)) > 1e5) { pen = false; continue; }
      if (pen) ctx.lineTo(X(x), Y(y)); else { ctx.moveTo(X(x), Y(y)); pen = true; }
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  if (opts.marker && Number.isFinite(opts.marker[0]) && Number.isFinite(opts.marker[1])) {
    const [mx, my] = opts.marker;
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(X(mx), Y(my), 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* ── the planet ─────────────────────────────────────────────────────────────── */

const STATE_DEFAULTS = { p: 'curve', v: {} as Record<string, Json>, src: [] as string[] };

const playground: Playground = {
  id: 'grapher',
  title: 'Grapher Cells',
  pkg: '@johnhenry/math-grapher',
  hue: 270,
  blurb: 'A headless reactive-cell runtime, driven from a notebook UI and an agent-style command line.',
  docs: 'https://github.com/johnhenry/math-grapher#readme',
  async mount(host) {
    const root = document.createElement('div');
    root.className = 'pg-grapher';
    host.append(root);
    root.innerHTML = `
      <div class="gc-top">
        <div class="gc-presets"></div>
        <span class="spacer"></span>
        <div class="gc-top-actions">
          <button class="btn gc-demo" title="Replay a scripted sequence of MCP tool calls">▶ agent demo</button>
          <button class="btn gc-copy">copy link</button>
        </div>
      </div>
      <div class="gc-main">
        <div class="gc-col">
          <div class="panel gc-nb-panel">
            <div class="gc-h"><b>Notebook</b><span class="stat gc-sid"></span></div>
            <div class="gc-nb"></div>
            <div class="gc-add">
              <button class="btn gc-add-btn">+ cell</button>
              <span class="gc-hint">try <code>w = a*b + 1</code> · <code>n = 4 in [0, 10]</code> · <code>plot w over a in [0, 5]</code> · <code>trace (a, w)</code></span>
            </div>
          </div>
        </div>
        <div class="gc-col gc-side">
          <div class="panel gc-graph-panel">
            <div class="gc-h"><b>Dependency graph</b><span class="gc-legend"><i class="lg set"></i>written <i class="lg rc"></i>recomputed <i class="lg loop"></i>loop</span></div>
            <div class="gc-graph"></div>
            <div class="gc-stats"></div>
          </div>
          <div class="panel gc-explain"></div>
        </div>
      </div>
      <div class="gc-bottom">
        <div class="panel gc-con-panel">
          <div class="gc-h"><b>Agent console</b><span class="stat">speaks the runtime's MCP tools · <code>tools</code>, <code>describe &lt;tool&gt;</code>, <code>&lt;tool&gt; {json}</code></span></div>
          <div class="gc-con-out"></div>
          <div class="gc-con-in"><span class="gc-prompt">agent ›</span><input spellcheck="false" autocomplete="off" placeholder='session_get_cell {"cell": "x"}   (Tab completes tool names)'/></div>
        </div>
        <div class="panel gc-log-panel">
          <div class="gc-h"><b>Runtime calls</b><label class="gc-reads"><input type="checkbox"/> expand read sweeps</label></div>
          <pre class="code gc-setup"></pre>
          <div class="gc-log"></div>
        </div>
      </div>`;
    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
    const nbEl = $('.gc-nb'), graphEl = $('.gc-graph'), statsEl = $('.gc-stats'), explainEl = $('.gc-explain');
    const conOut = $('.gc-con-out'), conIn = $<HTMLInputElement>('.gc-con-in input');
    const logEl = $('.gc-log'), setupEl = $('.gc-setup'), sidEl = $('.gc-sid');
    const readsChk = $<HTMLInputElement>('.gc-reads input');
    const demoBtn = $<HTMLButtonElement>('.gc-demo');

    let alive = true;
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => { const id = window.setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms); timers.add(id); return id; };
    const sleep = (ms: number) => new Promise<void>((r) => later(r, ms));
    const disposers: Array<() => void> = [];
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, ev: K | string, fn: (e: any) => void) => { el.addEventListener(ev, fn); disposers.push(() => el.removeEventListener(ev, fn)); };

    /* ── the real runtime, behind the real MCP surface ── */
    let opCalls = 0;
    const catalog: typeof OP_CATALOG = {};
    for (const [name, entry] of Object.entries(OP_CATALOG)) catalog[name] = { ...entry, fn: (args) => { opCalls++; return entry.fn(args); } };
    let client: Client;
    let server: ReturnType<typeof buildServer>;
    let tools: Array<{ name: string; description?: string; inputSchema: { required?: string[]; properties?: Record<string, unknown> } }>;
    try {
      const table = new SessionTable(DEFAULT_LIMITS, catalog);
      server = buildServer(table);
      const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
      await server.connect(serverSide);
      client = new Client({ name: 'orrery-grapher', version: '1.0.0' });
      await client.connect(clientSide);
      tools = (await client.listTools()).tools as typeof tools;
    } catch (e) {
      root.innerHTML = `<pre class="code">Could not start the math-grapher runtime in the page:\n${esc(msg(e))}</pre>`;
      return () => root.remove();
    }

    let sessionId = '';
    const cells: NbCell[] = [];
    let uidSeq = 1;
    const values = new Map<string, { v?: Json; err?: string }>();
    const rcCount = new Map<string, number>();
    let lastSweep: { changed: string[]; recomputed: string[]; total: number; ops: number; mode: string; fresh: boolean } | null = null;
    let presetId = 'curve';
    let edited = false;
    let freshSession = false; // set when session_resume rebuilt the session (everything recomputes once)

    const setupCode = () => {
      setupEl.innerHTML = esc(`import { SessionTable, buildServer, OP_CATALOG, DEFAULT_LIMITS } from "@johnhenry/math-grapher";
const table  = new SessionTable(DEFAULT_LIMITS, countingCatalog); // OP_CATALOG, each fn wrapped to count calls
const server = buildServer(table);                                // the package's MCP tool surface
const [a, b] = InMemoryTransport.createLinkedPair();
await server.connect(a); await client.connect(b);
const SID = "${sessionId}";`);
      sidEl.textContent = sessionId ? `session ${sessionId.slice(0, 8)}…` : '';
    };

    /* ── call log ── */
    let loopEntry: HTMLElement | null = null;
    function logLine(kind: 'ui' | 'agent' | 'loop' | 'sweep', html: string, details?: string): HTMLElement {
      const d = document.createElement('div');
      d.className = `gc-le ${kind}`;
      d.innerHTML = `<span class="src">${kind}</span><span class="body">${html}</span>${details ? `<div class="det">${details}</div>` : ''}`;
      if (details && readsChk.checked) d.classList.add('open');
      if (details) d.addEventListener('click', () => d.classList.toggle('open'));
      const stick = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
      logEl.append(d);
      while (logEl.children.length > 160) logEl.firstElementChild!.remove();
      if (stick) logEl.scrollTop = logEl.scrollHeight;
      return d;
    }
    const argText = (args: Record<string, Json>) => {
      const a = { ...args };
      const s = JSON.stringify(a, null, 0);
      return 'sessionId' in a ? s.replace(JSON.stringify(a.sessionId), 'SID') : s;
    };
    const callText = (name: string, args: Record<string, Json>) => `client.callTool({ name: <b>"${esc(name)}"</b>, arguments: ${esc(argText(args))} })`;

    async function call(name: string, args: Record<string, Json>, o: { src?: 'ui' | 'agent' | 'loop'; quiet?: boolean; collect?: string[] } = {}): Promise<any> {
      const res = await client.callTool({ name, arguments: args });
      const text = ((res.content ?? []) as Array<{ text?: string }>).map((c) => c.text ?? '').join('');
      if (res.isError) {
        const m = text.replace(/^Error:\s*/, '');
        o.collect?.push(`${callText(name, args)}<br><span class="err">⟵ ${esc(m)}</span>`);
        if (!o.quiet) logLine(o.src ?? 'ui', `${callText(name, args)}<br><span class="err">⟵ ${esc(m)}</span>`);
        throw new Error(m);
      }
      let parsed: any = text;
      try { parsed = JSON.parse(text); } catch { /* plain text */ }
      o.collect?.push(`${callText(name, args)} <span class="res">⟵ ${esc(jsonCompact(parsed, 160))}</span>`);
      if (!o.quiet) logLine(o.src ?? 'ui', `${callText(name, args)}<br><span class="res">⟵ ${esc(jsonCompact(parsed, 300))}</span>`);
      return parsed;
    }

    /* ── serialize all runtime work (the loop skips a frame if busy) ── */
    let chain: Promise<unknown> = Promise.resolve();
    let busy = 0;
    function exclusive<T>(fn: () => Promise<T>): Promise<T> {
      busy++;
      const r = chain.then(() => (alive ? fn() : (undefined as T)));
      chain = r.catch((e) => { if (alive) console.warn('[grapher]', e); }).finally(() => { busy--; });
      return r;
    }

    const byName = (n: string) => cells.find((c) => runtimeName(c.p) === n);

    /* ── dependency order ── */
    function topo(): string[] {
      const out: string[] = [], seen = new Set<string>(), onStack = new Set<string>();
      const visit = (n: string) => {
        if (seen.has(n) || onStack.has(n)) return;
        onStack.add(n);
        const c = byName(n);
        for (const d of depsOf(c?.p)) visit(d);
        onStack.delete(n); seen.add(n);
        if (c && (c.p!.kind === 'expr' || c.p!.kind === 'op')) out.push(n);
      };
      for (const c of cells) { const n = runtimeName(c.p); if (n) visit(n); }
      return out;
    }

    /* ── sweep: read every computed cell deps-first; count which actually ran their op ── */
    async function sweep(changed: string[], mode: 'ui' | 'agent' | 'loop' = 'ui') {
      const order = topo();
      const collect: string[] = [];
      const recomputed: string[] = [];
      const before = opCalls;
      for (const name of order) {
        const b = opCalls;
        try { const r = await call('session_get_cell', { sessionId, cell: name }, { quiet: true, collect }); values.set(name, { v: r.value }); }
        catch (e) { values.set(name, { err: msg(e) }); }
        if (opCalls > b) { recomputed.push(name); rcCount.set(name, (rcCount.get(name) ?? 0) + 1); }
      }
      lastSweep = { changed, recomputed, total: order.length, ops: opCalls - before, mode, fresh: freshSession };
      freshSession = false;
      const summary = `↻ read sweep · ${order.length}× <b>session_get_cell</b> in dependency order → recomputed <b>${recomputed.length ? esc(recomputed.join(', ')) : 'nothing'}</b> · ${opCalls - before} op call${opCalls - before === 1 ? '' : 's'}`;
      if (mode === 'loop') {
        if (loopEntry && loopEntry === logEl.lastElementChild) loopEntry.querySelector('.body')!.innerHTML = loopHtml(summary);
        else loopEntry = logLine('loop', loopHtml(summary));
      } else if (order.length) logLine('sweep', summary, collect.join('<br>'));
      renderOutputs();
      renderGraph(changed, recomputed);
      renderStats();
      renderExplain();
    }
    let tickNo = 0;
    const loopHtml = (summary: string) => `⟳ loop tick <b>#${tickNo}</b> · ${esc(loopDesc)}<br>${summary}`;
    let loopDesc = '';

    /* ── session lifecycle ── */
    async function snapshotSync(src: 'ui' | 'agent' = 'ui', collect?: string[]) {
      const snap = await call('session_snapshot', { sessionId }, { src, quiet: true, collect }) as { free: Record<string, Json>; defines: Array<{ cell: string; op: string; args: Record<string, Json> }> };
      const changed: string[] = [];
      const upsert = (name: string, source: string, key: string) => {
        const ex = byName(name);
        if (ex) {
          if (ex.applied === key) return;
          const keepSlider = ex.p?.kind === 'input' ? ex.p.slider : undefined;
          ex.src = keepSlider && source.startsWith(`${name} = `) && !source.includes('`') ? inputSource(name, JSON.parse(source.slice(name.length + 3)), keepSlider) : source;
          try { ex.p = parseSource(ex.src); ex.perr = undefined; } catch (e) { ex.perr = msg(e); }
          ex.applied = key;
          changed.push(name);
          syncCellDom(ex);
        } else {
          const c: NbCell = { uid: uidSeq++, src: source };
          try { c.p = parseSource(source); } catch (e) { c.perr = msg(e); }
          c.applied = key;
          insertCell(c);
          changed.push(name);
        }
      };
      for (const [name, value] of Object.entries(snap.free)) {
        const rc = { name: 'session_set_cell', args: { cell: name, value } };
        upsert(name, inputSource(name, value), JSON.stringify(rc));
        values.set(name, { v: value });
      }
      for (const spec of snap.defines) {
        const rc = { name: 'session_define', args: { cell: spec.cell, op: spec.op, args: spec.args } };
        upsert(spec.cell, sourceFromSpec(spec), JSON.stringify(rc));
      }
      return changed;
    }

    async function openSession(kind: 'generic' | 'graph-theory') {
      const old = sessionId;
      const r = await call('session_open', { kind }, { src: 'ui' });
      sessionId = r.sessionId;
      if (old) await call('session_close', { sessionId: old }, { src: 'ui' }).catch(() => {});
      setupCode();
    }

    /** The runtime has no delete tool: drop cells by snapshot → edit → resume → close. */
    async function dropCells(names: string[]) {
      const snap = await call('session_snapshot', { sessionId }, { src: 'ui' });
      for (const n of names) delete snap.free[n];
      snap.defines = snap.defines.filter((d: { cell: string }) => !names.includes(d.cell));
      const old = sessionId;
      const r = await call('session_resume', { snapshot: snap }, { src: 'ui' });
      sessionId = r.sessionId;
      await call('session_close', { sessionId: old }, { src: 'ui' });
      for (const n of names) { values.delete(n); rcCount.delete(n); }
      freshSession = true;
      setupCode();
    }

    function clearNotebook() {
      cells.length = 0; nbEl.innerHTML = ''; values.clear(); rcCount.clear(); graphSig = ''; stopLoop();
    }

    async function loadPreset(id: string, init?: { v?: Record<string, Json>; src?: string[] }) {
      stopLoop();
      presetId = NB_PRESETS[id] ? id : 'curve';
      const pr = NB_PRESETS[presetId];
      renderPresetChips();
      clearNotebook();
      logLine('ui', `<i>— preset: ${esc(pr.title)} —</i>`);
      await openSession(pr.kind);
      const srcs = init?.src?.length ? init.src : null;
      edited = !!srcs;
      if (!srcs) {
        for (const s of pr.head) addCellLocal(s);
        await snapshotSync('ui');
      }
      for (const s of srcs ?? pr.cells) addCellLocal(s);
      for (const [k, v] of Object.entries(init?.v ?? {})) {
        const c = byName(k);
        if (c?.p?.kind === 'input') { c.p.value = v; c.src = inputSource(k, v, c.p.slider); }
      }
      for (const c of cells) await applyRuntime(c);
      await sweep(cells.map((c) => runtimeName(c.p)).filter(Boolean) as string[]);
      for (const c of cells) syncCellDom(c);
      saveState();
      if (pr.autoplay && !srcs) { const L = cells.find((c) => c.p?.kind === 'loop'); if (L) startLoop(L); }
    }

    /* ── applying a cell to the runtime ── */
    async function applyRuntime(c: NbCell) {
      if (!c.p) return;
      const rc = runtimeCall(c.p);
      if (!rc) return;
      const key = JSON.stringify(rc);
      if (key === c.applied) return;
      await call(rc.name, { sessionId, ...rc.args }, { src: 'ui' });
      c.applied = key;
      if (c.p.kind === 'input') values.set(c.p.name, { v: c.p.value });
    }

    async function commitCell(c: NbCell) {
      const prevName = runtimeName(c.p);
      let p: Parsed;
      try { p = parseSource(c.src); } catch (e) { c.perr = msg(e); renderCell(c); return; }
      const name = runtimeName(p);
      const clash = name ? cells.find((o) => o !== c && runtimeName(o.p) === name) : null;
      if (clash) { c.perr = `"${name}" is already defined by cell [${cells.indexOf(clash) + 1}]`; renderCell(c); return; }
      c.perr = undefined;
      const wasLoop = c.p?.kind === 'loop';
      c.p = p;
      edited = true;
      if (prevName && prevName !== name) { await dropCells([prevName]); c.applied = undefined; }
      try { await applyRuntime(c); } catch (e) { c.perr = msg(e); }
      if (p.kind === 'trace') c.trace = [];
      if (wasLoop && runningLoop === c && p.kind !== 'loop') stopLoop();
      renderCell(c);
      await sweep(name ? [name] : []);
      saveState();
    }

    /* ── notebook DOM ── */
    function addCellLocal(src: string, at?: number): NbCell {
      const c: NbCell = { uid: uidSeq++, src };
      try { c.p = parseSource(src); } catch (e) { c.perr = msg(e); }
      insertCell(c, at);
      return c;
    }

    function insertCell(c: NbCell, at?: number) {
      const el = document.createElement('div');
      el.className = 'gc-cell';
      el.innerHTML = `
        <div class="gc-cell-h"><span class="gc-idx"></span><span class="gc-kind chip"></span><span class="gc-rc"></span>
          <span class="spacer"></span>
          <button class="gc-ib up" title="move up">↑</button><button class="gc-ib down" title="move down">↓</button><button class="gc-ib del" title="delete cell">✕</button></div>
        <textarea class="gc-src" rows="1" spellcheck="false"></textarea>
        <div class="gc-out"></div>`;
      c.el = el; c.ta = el.querySelector('textarea')!; c.out = el.querySelector('.gc-out') as HTMLElement;
      c.ta.value = c.src;
      let deb = 0;
      c.ta.addEventListener('input', () => {
        c.src = c.ta!.value; autosize(c.ta!);
        clearTimeout(deb);
        deb = window.setTimeout(() => { if (alive) exclusive(() => commitCell(c)); }, 450);
      });
      c.ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && ((c.ta!.value.match(/`/g) ?? []).length % 2 === 0)) {
          e.preventDefault(); clearTimeout(deb); c.src = c.ta!.value; exclusive(() => commitCell(c));
        }
      });
      el.querySelector('.up')!.addEventListener('click', () => move(c, -1));
      el.querySelector('.down')!.addEventListener('click', () => move(c, 1));
      el.querySelector('.del')!.addEventListener('click', () => exclusive(() => deleteCell(c)));
      if (at === undefined || at >= cells.length) { cells.push(c); nbEl.append(el); }
      else { nbEl.insertBefore(el, cells[at].el!); cells.splice(at, 0, c); }
      renumber();
      requestAnimationFrame(() => c.ta && autosize(c.ta));
      renderCell(c);
    }

    function autosize(ta: HTMLTextAreaElement) { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; }
    function renumber() { cells.forEach((c, i) => { c.el!.querySelector('.gc-idx')!.textContent = `[${i + 1}]`; }); }
    function syncCellDom(c: NbCell) {
      if (c.ta && document.activeElement !== c.ta && c.ta.value !== c.src) { c.ta.value = c.src; autosize(c.ta); }
      renderCell(c);
    }

    function move(c: NbCell, d: number) {
      const i = cells.indexOf(c), j = i + d;
      if (j < 0 || j >= cells.length) return;
      cells.splice(i, 1); cells.splice(j, 0, c);
      if (d < 0) nbEl.insertBefore(c.el!, cells[j + 1].el!); else nbEl.insertBefore(c.el!, cells[j - 1].el!.nextSibling);
      renumber(); edited = true; saveState();
      logLine('ui', `<i>reordered the notebook — no runtime call: cells are a graph, not a sequence</i>`);
    }

    async function deleteCell(c: NbCell) {
      const n = runtimeName(c.p);
      if (runningLoop === c) stopLoop();
      cells.splice(cells.indexOf(c), 1); c.el!.remove(); renumber(); edited = true;
      if (n) await dropCells([n]);
      await sweep([]);
      saveState();
    }

    const KIND_LABEL: Record<string, string> = { note: 'note', input: 'free', plot: 'view · plot', curve: 'view · curve', trace: 'view · trace', table: 'view · table', loop: 'driver · loop' };
    function renderCell(c: NbCell) {
      const el = c.el!;
      const p = c.p;
      el.className = `gc-cell k-${c.perr ? 'err' : p?.kind ?? 'err'}`;
      const kind = el.querySelector('.gc-kind') as HTMLElement;
      kind.textContent = c.perr ? 'error' : p ? (p.kind === 'expr' ? 'math_eval' : p.kind === 'op' ? p.op : KIND_LABEL[p.kind]) : '';
      const n = runtimeName(p);
      (el.querySelector('.gc-rc') as HTMLElement).textContent = n && rcCount.get(n) ? `ran ${rcCount.get(n)}×` : '';
      c.lastOut = undefined;
      buildOutput(c);
      renderOutput(c);
    }

    /** Build persistent output widgets (slider, canvas, loop controls). */
    function buildOutput(c: NbCell) {
      const out = c.out!;
      out.innerHTML = '';
      const p = c.p;
      if (c.perr || !p) { out.innerHTML = `<div class="gc-err">${esc(c.perr ?? '')}</div>`; return; }
      if (p.kind === 'input' && p.slider && typeof p.value === 'number') {
        out.innerHTML = `<div class="gc-slider"><input type="range" min="${p.slider.min}" max="${p.slider.max}" step="${p.slider.step}" value="${p.value}"><span class="gc-num sm"></span></div>`;
        const r = out.querySelector('input')!;
        r.addEventListener('input', () => { const v = Number(r.value); setInput(c, v); });
      } else if (p.kind === 'input') {
        out.innerHTML = '';
      } else if (p.kind === 'plot' || p.kind === 'curve' || p.kind === 'trace') {
        out.innerHTML = `<canvas class="gc-cv ${p.kind}"></canvas><div class="gc-cv-note"></div>`;
        if (p.kind === 'trace') c.trace = c.trace ?? [];
      } else if (p.kind === 'loop') {
        out.innerHTML = `<div class="gc-loop"><button class="btn primary run">▶ run</button><button class="btn step">step</button><button class="btn reset">reset</button><span class="stat info"></span></div>`;
        out.querySelector('.run')!.addEventListener('click', () => (runningLoop === c ? stopLoop() : startLoop(c)));
        out.querySelector('.step')!.addEventListener('click', () => { stopLoop(); exclusive(() => tick(c)); });
        out.querySelector('.reset')!.addEventListener('click', () => exclusive(() => resetLoop(c)));
      } else if (p.kind === 'note') {
        out.innerHTML = '';
      } else {
        out.innerHTML = `<div class="gc-val"></div>`;
      }
    }

    function renderOutputs() { for (const c of cells) renderOutput(c); }

    function renderOutput(c: NbCell) {
      const p = c.p, out = c.out!;
      if (!p || c.perr) return;
      const n = runtimeName(p);
      const rcEl = c.el!.querySelector('.gc-rc') as HTMLElement;
      if (n) rcEl.textContent = rcCount.get(n) ? `ran ${rcCount.get(n)}×` : '';
      if (p.kind === 'input') {
        const v = values.get(p.name)?.v ?? p.value;
        if (p.slider) {
          const r = out.querySelector('input[type=range]') as HTMLInputElement | null;
          if (r && document.activeElement !== r && typeof v === 'number') r.value = String(v);
          const s = out.querySelector('.gc-num') as HTMLElement | null;
          if (s) s.textContent = typeof v === 'number' ? fmtNum(v) : '';
        } else {
          const box = out.querySelector('.gc-val') as HTMLElement | null;
          if (box && typeof v === 'number') { const h = `<div class="gc-num sm">${esc(fmtNum(v))}</div>`; if (h !== c.lastOut) { box.innerHTML = h; c.lastOut = h; } }
        }
        return;
      }
      if (p.kind === 'expr' || p.kind === 'op') {
        const val = values.get(p.name);
        const h = !val ? '<div class="gc-dim">not read yet</div>' : val.err ? `<div class="gc-err">${esc(val.err)}</div>` : renderValue(val.v);
        if (h !== c.lastOut) { (out.querySelector('.gc-val') as HTMLElement).innerHTML = h; c.lastOut = h; }
        return;
      }
      if (p.kind === 'table') {
        const rows = p.cells.map((name) => {
          const cc = byName(name); const val = values.get(name);
          return { name, free: cc?.p?.kind === 'input', v: val?.v, err: val?.err ?? (cc ? undefined : 'no such cell') };
        });
        const nums = rows.map((r) => (typeof r.v === 'number' ? Math.abs(r.v) : 0));
        const mx = Math.max(1e-12, ...nums);
        const sig = JSON.stringify(rows);
        if (sig === c.lastOut) return;
        const focused = out.contains(document.activeElement) ? (document.activeElement as HTMLInputElement).dataset.cell : null;
        c.lastOut = sig;
        out.innerHTML = `<table class="gc-tbl gc-grid"><tr><th>cell</th><th>value</th><th></th></tr>${rows.map((r) => `<tr class="${r.free ? 'free' : ''}"><th>${esc(r.name)}</th><td>${r.err ? `<span class="gc-err">${esc(r.err)}</span>` : r.free && typeof r.v === 'number' ? `<input data-cell="${esc(r.name)}" value="${esc(fmtNum(r.v))}">` : esc(short(r.v, 24))}</td><td class="bar"><i style="width:${typeof r.v === 'number' ? (Math.abs(r.v) / mx) * 100 : 0}%"></i></td></tr>`).join('')}</table>`;
        out.querySelectorAll<HTMLInputElement>('input[data-cell]').forEach((inp) => {
          inp.addEventListener('change', () => { const v = Number(inp.value); const cc = byName(inp.dataset.cell!); if (cc && Number.isFinite(v)) setInput(cc, v); });
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
          if (focused && inp.dataset.cell === focused) inp.focus();
        });
        return;
      }
      if (p.kind === 'plot' || p.kind === 'curve') { drawFunctionView(c); return; }
      if (p.kind === 'trace') { drawTraceView(c); return; }
      if (p.kind === 'loop') {
        const run = out.querySelector('.run') as HTMLElement;
        run.textContent = runningLoop === c ? '⏸ pause' : '▶ run';
        (out.querySelector('.info') as HTMLElement).textContent = `${p.assigns.map(([l, r]) => `${l} ← ${r}`).join(' · ')}${runningLoop === c ? ` · tick ${tickNo}` : ''}`;
      }
    }

    /* ── function sampling (page-side; the runtime computes one value per cell) ── */
    const compiled = new Map<string, (env: Record<string, number>) => number>();
    const compile = (expr: string) => { let f = compiled.get(expr); if (!f) { f = Symbolic.compile(expr); compiled.set(expr, f); } return f; };
    function evaluator(over: string, s: number) {
      const memo = new Map<string, number>();
      const ev = (name: string): number => {
        if (name === over) return s;
        const m = memo.get(name); if (m !== undefined) return m;
        memo.set(name, NaN);
        const c = byName(name);
        let v = NaN;
        if (c?.p?.kind === 'expr') { const env: Record<string, number> = {}; for (const d of c.p.vars) env[d] = ev(d); try { v = compile(c.p.expr)(env); } catch { v = NaN; } }
        else { const x = values.get(name)?.v; v = typeof x === 'number' ? x : NaN; }
        memo.set(name, v);
        return v;
      };
      return ev;
    }
    function numEnv(): Record<string, number> { const env: Record<string, number> = {}; for (const [k, x] of values) if (typeof x.v === 'number') env[k] = x.v; return env; }
    function evalRange(s: string): number { return Symbolic.evaluate(Symbolic.parse(s), numEnv()); }

    function drawFunctionView(c: NbCell) {
      const p = c.p as Extract<Parsed, { kind: 'plot' | 'curve' }>;
      const cv = c.out!.querySelector('canvas') as HTMLCanvasElement | null;
      const note = c.out!.querySelector('.gc-cv-note') as HTMLElement;
      if (!cv) return;
      let a: number, b: number;
      try { a = evalRange(p.from); b = evalRange(p.to); } catch (e) { note.innerHTML = `<span class="gc-err">range: ${esc(msg(e))}</span>`; return; }
      const missing = (p.kind === 'plot' ? [p.y] : [p.x, p.y]).filter((n) => !byName(n));
      if (missing.length) { note.innerHTML = `<span class="gc-err">no cell named ${esc(missing.join(', '))}</span>`; return; }
      const N = 360, pts: Array<[number, number]> = [];
      for (let i = 0; i <= N; i++) {
        const s = a + ((b - a) * i) / N;
        const ev = evaluator(p.over, s);
        pts.push(p.kind === 'plot' ? [s, ev(p.y)] : [ev(p.x), ev(p.y)]);
      }
      const overVal = values.get(p.over)?.v;
      let marker: [number, number] | null = null;
      const rt = (n: string) => values.get(n)?.v;
      if (typeof overVal === 'number') {
        const mv = p.kind === 'plot' ? [overVal, rt(p.y)] : [rt(p.x), rt(p.y)];
        if (typeof mv[0] === 'number' && typeof mv[1] === 'number') marker = mv as [number, number];
      }
      drawPlot(cv, [{ pts, color: 'hsl(270 95% 72%)' }], { equal: p.kind === 'curve', marker, xl: p.kind === 'plot' ? p.over : p.x, yl: p.y, xr: p.kind === 'plot' ? [Math.min(a, b), Math.max(a, b)] : undefined });
      const byOver = byName(p.over);
      note.innerHTML = `${N + 1} samples of ${p.kind === 'plot' ? `<b>${esc(p.y)}</b>(${esc(p.over)})` : `(<b>${esc(p.x)}</b>, <b>${esc(p.y)}</b>)`} over ${esc(p.over)} ∈ [${esc(fmtNum(a))}, ${esc(fmtNum(b))}], evaluated in-page with Symbolic.compile (the grammar math_eval uses; the runtime returns single values, not plot specs).${marker ? ` ● = the runtime's own ${p.kind === 'plot' ? esc(p.y) : `(${esc(p.x)}, ${esc(p.y)})`} at ${esc(p.over)} = ${esc(fmtNum(overVal as number))}.` : byOver ? '' : ` ${esc(p.over)} is not a cell, so there is no marker.`}`;
    }

    function drawTraceView(c: NbCell) {
      const p = c.p as Extract<Parsed, { kind: 'trace' }>;
      const cv = c.out!.querySelector('canvas') as HTMLCanvasElement | null;
      if (!cv) return;
      const x = values.get(p.x)?.v, y = values.get(p.y)?.v;
      const tr = (c.trace ??= []);
      if (typeof x === 'number' && typeof y === 'number') {
        const last = tr[tr.length - 1];
        if (!last || last[0] !== x || last[1] !== y) tr.push([x, y]);
        if (tr.length > 1500) tr.splice(0, tr.length - 1500);
      }
      drawPlot(cv, [{ pts: tr, color: 'hsl(190 90% 62%)', width: 1.6 }], { marker: tr[tr.length - 1] ?? null, xl: p.x, yl: p.y });
      (c.out!.querySelector('.gc-cv-note') as HTMLElement).textContent = `${tr.length} points recorded from the runtime's values of ${p.x} and ${p.y} after each update.`;
    }

    /* ── inputs: coalesce slider drags into one set+sweep per drain ── */
    const pending = new Map<NbCell, Json>();
    let draining = false;
    function setInput(c: NbCell, v: Json) {
      pending.set(c, v);
      if (draining) return;
      draining = true;
      exclusive(async () => {
        draining = false;
        const batch = [...pending]; pending.clear();
        const changed: string[] = [];
        for (const [cc, val] of batch) {
          if (cc.p?.kind !== 'input') continue;
          cc.p.value = val;
          cc.src = inputSource(cc.p.name, val, cc.p.slider);
          syncTa(cc);
          await applyRuntime(cc);
          changed.push(cc.p.name);
        }
        await sweep(changed);
        saveState();
      });
    }
    function syncTa(c: NbCell) { if (c.ta && document.activeElement !== c.ta) c.ta.value = c.src; }

    /* ── loop driver: read rhs cells, write lhs cells, sweep ── */
    let runningLoop: NbCell | null = null;
    let loopGen = 0;
    async function tick(c: NbCell) {
      if (c.p?.kind !== 'loop') return;
      tickNo++;
      const vals: Array<[string, Json]> = [];
      for (const [lhs, rhs] of c.p.assigns) {
        try { vals.push([lhs, (await call('session_get_cell', { sessionId, cell: rhs }, { quiet: true })).value]); }
        catch (e) { stopLoop(); logLine('loop', `<span class="err">loop stopped: ${esc(msg(e))}</span>`); return; }
      }
      for (const [lhs, v] of vals) {
        await call('session_set_cell', { sessionId, cell: lhs, value: v }, { quiet: true });
        values.set(lhs, { v });
        const lc = byName(lhs);
        if (lc?.p?.kind === 'input') { lc.p.value = v; lc.src = inputSource(lhs, v, lc.p.slider); lc.applied = JSON.stringify(runtimeCall(lc.p)); syncTa(lc); }
      }
      loopDesc = `${c.p.assigns.length}× session_get_cell (${c.p.assigns.map((a) => a[1]).join(', ')}) → ${c.p.assigns.length}× session_set_cell (${c.p.assigns.map((a) => a[0]).join(', ')})`;
      await sweep(vals.map((v) => v[0]), 'loop');
    }
    function startLoop(c: NbCell) {
      stopLoop();
      runningLoop = c;
      loopEntry = null;
      renderOutput(c);
      const my = ++loopGen;
      (async () => {
        // self-pacing: one tick at a time, ~60/s; browsers throttle timers in background tabs
        while (alive && runningLoop === c && my === loopGen) {
          if (!busy) await exclusive(() => tick(c));
          await sleep(16);
        }
      })();
    }
    function stopLoop() {
      loopGen++;
      const was = runningLoop;
      runningLoop = null;
      if (was?.out) renderOutput(was);
      if (was) saveState();
    }
    async function resetLoop(c: NbCell) {
      stopLoop();
      if (c.p?.kind !== 'loop') return;
      const presetCells = NB_PRESETS[presetId]?.cells ?? [];
      const changed: string[] = [];
      for (const [lhs] of c.p.assigns) {
        const orig = presetCells.map((s) => { try { return parseSource(s); } catch { return null; } }).find((q) => q?.kind === 'input' && q.name === lhs) as Extract<Parsed, { kind: 'input' }> | undefined;
        const lc = byName(lhs);
        if (lc?.p?.kind !== 'input') continue;
        const v = orig ? orig.value : 0;
        lc.p.value = v; lc.src = inputSource(lhs, v, lc.p.slider); syncTa(lc);
        await applyRuntime(lc);
        changed.push(lhs);
      }
      for (const cc of cells) if (cc.p?.kind === 'trace') cc.trace = [];
      tickNo = 0;
      await sweep(changed);
    }

    /* ── dependency graph (SVG) ── */
    let graphSig = '';
    const NW = 124, NH = 40, CW = 160, RH = 54;
    function renderGraph(changed: string[], recomputed: string[]) {
      const names = cells.map((c) => runtimeName(c.p)).filter(Boolean) as string[];
      const deps = new Map(names.map((n) => [n, depsOf(byName(n)?.p)]));
      const ghosts = [...new Set([...deps.values()].flat().filter((d) => !names.includes(d)))];
      const all = [...names, ...ghosts];
      const depth = new Map<string, number>();
      const dOf = (n: string, stack = new Set<string>()): number => {
        if (depth.has(n)) return depth.get(n)!;
        if (stack.has(n)) return 0;
        stack.add(n);
        const ds = deps.get(n) ?? [];
        const d = ds.length ? 1 + Math.max(...ds.map((x) => dOf(x, stack))) : 0;
        stack.delete(n); depth.set(n, d); return d;
      };
      all.forEach((n) => dOf(n));
      const loops: Array<[string, string]> = cells.flatMap((c) => (c.p?.kind === 'loop' ? c.p.assigns.map(([l, r]) => [r, l] as [string, string]) : []));
      const sig = JSON.stringify([all, [...deps], loops]);
      if (sig !== graphSig) {
        graphSig = sig;
        const cols = new Map<number, string[]>();
        for (const n of all) { const d = depth.get(n)!; (cols.get(d) ?? cols.set(d, []).get(d)!).push(n); }
        const maxCol = Math.max(0, ...cols.keys());
        const maxRows = Math.max(1, ...[...cols.values()].map((c) => c.length));
        const W = 24 + (maxCol + 1) * CW, H = 36 + maxRows * RH;
        const pos = new Map<string, [number, number]>();
        for (const [d, ns] of cols) ns.forEach((n, i) => pos.set(n, [16 + d * CW, 18 + i * RH + ((maxRows - ns.length) * RH) / 2]));
        const edges: string[] = [];
        for (const [n, ds] of deps) ds.forEach((d, i) => {
          const a = pos.get(d)!, b = pos.get(n)!;
          // Multiple deps landing on the same target used to all aim at its
          // dead-center port, so their arrowheads piled up in one stack.
          // Spread each incoming edge to its own port along the target's
          // left edge instead.
          const port = ds.length > 1 ? (NH * (i + 1)) / (ds.length + 1) : NH / 2;
          const x1 = a[0] + NW, y1 = a[1] + NH / 2, x2 = b[0], y2 = b[1] + port, mx = (x1 + x2) / 2;
          edges.push(`<path class="gc-edge" data-from="${esc(d)}" data-to="${esc(n)}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 4},${y2}" marker-end="url(#gc-arrow)"/>`);
        });
        for (const [from, to] of loops) {
          const a = pos.get(from), b = pos.get(to);
          if (!a || !b) continue;
          const x1 = a[0] + NW / 2, y1 = a[1] + NH, x2 = b[0] + NW / 2, y2 = b[1] + NH, low = Math.max(y1, y2) + 30;
          edges.push(`<path class="gc-edge loop" data-from="${esc(from)}" data-to="${esc(to)}" d="M${x1},${y1} C${x1},${low} ${x2},${low} ${x2},${y2 + 4}" marker-end="url(#gc-arrow-loop)"/>`);
        }
        const nodes = all.map((n) => {
          const [x, y] = pos.get(n)!;
          const c = byName(n);
          const k = !c ? 'ghost' : c.p!.kind === 'input' ? 'free' : 'computed';
          return `<g class="gc-node ${k}" data-name="${esc(n)}" transform="translate(${x},${y})"><rect class="halo" x="-4" y="-4" width="${NW + 8}" height="${NH + 8}" rx="11"/><rect class="box" width="${NW}" height="${NH}" rx="8"/><text class="nm" x="10" y="16">${esc(n)}</text><text class="vl" x="10" y="31"></text><text class="ct" x="${NW - 8}" y="16" text-anchor="end"></text></g>`;
        }).join('');
        graphEl.innerHTML = `<svg viewBox="0 0 ${W} ${H + (loops.length ? 24 : 0)}" style="max-height:${Math.min(540, Math.max(160, H + 30))}px"><defs>
          <marker id="gc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z"/></marker>
          <marker id="gc-arrow-loop" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z"/></marker></defs>
          ${edges.join('')}${nodes}</svg>${all.length ? '' : '<div class="gc-dim">no runtime cells yet</div>'}`;
        graphEl.querySelectorAll<SVGGElement>('.gc-node').forEach((g) => {
          const n = g.dataset.name!;
          // Edge-highlight-on-hover has no touch equivalent (no :hover on
          // tap), so it's silently unreachable on mobile. Tapping a node
          // already scrolls/pings its cell (via click, below) — fold the
          // same edge highlight into that click so touch gets it too.
          g.addEventListener('mouseenter', () => graphEl.querySelectorAll<SVGPathElement>('.gc-edge').forEach((e) => e.classList.toggle('hl', e.dataset.from === n || e.dataset.to === n)));
          g.addEventListener('mouseleave', () => graphEl.querySelectorAll('.gc-edge.hl').forEach((e) => e.classList.remove('hl')));
          g.addEventListener('click', () => {
            graphEl.querySelectorAll<SVGPathElement>('.gc-edge').forEach((e) => e.classList.toggle('hl', e.dataset.from === n || e.dataset.to === n));
            const c = byName(n); if (c?.el) { c.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.el.classList.remove('ping'); void c.el.offsetWidth; c.el.classList.add('ping'); }
          });
        });
      }
      // values + counts
      graphEl.querySelectorAll<SVGGElement>('.gc-node').forEach((g) => {
        const n = g.dataset.name!;
        const val = values.get(n);
        (g.querySelector('.vl') as SVGTextElement).textContent = !byName(n) ? 'missing' : val?.err ? '⚠ error' : short(val?.v, 17);
        (g.querySelector('.ct') as SVGTextElement).textContent = rcCount.get(n) ? `×${rcCount.get(n)}` : '';
        g.classList.toggle('err', !!val?.err);
      });
      // flashes
      const flash = (el: Element, cls: string) => { el.classList.remove(cls); void (el as SVGGraphicsElement).getBoundingClientRect(); el.classList.add(cls); };
      const hot = new Set([...changed, ...recomputed]);
      for (const n of changed) { const g = graphEl.querySelector(`.gc-node[data-name="${CSS.escape(n)}"]`); if (g) flash(g, 'fl-set'); }
      for (const n of recomputed) { const g = graphEl.querySelector(`.gc-node[data-name="${CSS.escape(n)}"]`); if (g) flash(g, 'fl-rc'); }
      graphEl.querySelectorAll<SVGPathElement>('.gc-edge').forEach((e) => {
        if (e.classList.contains('loop') ? changed.includes(e.dataset.to!) : hot.has(e.dataset.from!) && recomputed.includes(e.dataset.to!)) flash(e, 'fl');
      });
      for (const n of recomputed) { const c = byName(n); if (c?.el) flash(c.el, 'fl-rc'); }
    }

    function renderStats() {
      const rt = cells.filter((c) => runtimeName(c.p)).length;
      const comp = cells.filter((c) => c.p?.kind === 'expr' || c.p?.kind === 'op').length;
      statsEl.innerHTML = `<span class="stat">runtime cells <b>${rt}</b></span><span class="stat">computed <b>${comp}</b></span><span class="stat">op calls <b>${opCalls}</b></span>${lastSweep ? `<span class="stat">last update: <b>${lastSweep.recomputed.length}</b>/${lastSweep.total} recomputed</span>` : ''}`;
    }

    function renderExplain() {
      const s = lastSweep;
      let live = '';
      if (s) {
        const skipped = topo().filter((n) => !s.recomputed.includes(n));
        live = s.changed.length
          ? `<p class="live">Wrote <b>${esc(s.changed.join(', '))}</b>${s.mode === 'loop' ? ' (loop tick)' : s.mode === 'agent' ? ' (agent)' : ''}. CellGraph marked only their dependants dirty. The page then read all ${s.total} computed cells in dependency order: <b>${s.recomputed.length ? esc(s.recomputed.join(', ')) : 'none'}</b> actually ran an op${skipped.length ? `; ${esc(skipped.slice(0, 8).join(', '))}${skipped.length > 8 ? '…' : ''} answered from cache` : ''}.${s.fresh ? ' (The runtime has no delete tool, so removing/renaming a cell went session_snapshot → edit → session_resume: a fresh session, so every cell computed once.)' : ''}</p>`
          : `<p class="live">Read ${s.total} computed cells; ${s.recomputed.length} ran an op.</p>`;
      }
      explainEl.innerHTML = `<div class="gc-h"><b>What's happening</b></div>
        <p>This is the real <code>@johnhenry/math-grapher</code> runtime running in the page: a <code>SessionTable</code> of reactive <code>CellGraph</code> sessions behind the package's own MCP server (<code>buildServer</code>), wired to an MCP <code>Client</code> over an in-memory transport. Nothing here is a mock: every notebook edit, slider drag and loop tick becomes a <code>session_*</code> tool call, logged below.</p>
        <p>Computed cells are JSON <b>define-specs</b> over a closed op catalog (<code>math_eval</code>, <code>graph_*</code>), with <code>{"$cell": "name"}</code> references as the dependency edges. <code>set</code> dirties dependants eagerly; <code>get</code> recomputes lazily. Which cells re-ran is measured, not assumed: the catalog passed to <code>new SessionTable(limits, catalog)</code> counts op calls.</p>
        ${live}`;
    }

    /* ── agent console ── */
    const conLines: string[] = [];
    function conPrint(cls: string, html: string) {
      const d = document.createElement('div');
      d.className = `gc-cl ${cls}`;
      d.innerHTML = html;
      conOut.append(d);
      while (conOut.children.length > 300) conOut.firstElementChild!.remove();
      conOut.scrollTop = conOut.scrollHeight;
    }
    const pretty = (v: Json) => esc(JSON.stringify(v, null, 2) ?? String(v));

    async function agentExec(line: string) {
      const s = line.trim();
      if (!s) return;
      conLines.push(s);
      conPrint('cmd', `<span class="gc-prompt">agent ›</span> ${esc(s)}`);
      if (s.startsWith('#')) { conPrint('note', esc(s)); return; }
      if (s === 'help') {
        conPrint('res', `Commands:\n  tools                   list the runtime's MCP tools (client.listTools())\n  describe &lt;tool&gt;         a tool's description + JSON input schema\n  &lt;tool&gt; {json args}      call it; sessionId is filled in with the notebook's session if you omit it\n  ui: &lt;view source&gt;       add a page-side view cell (plot/curve/trace/table/loop), not a runtime call\n  clear                   clear this console`);
        return;
      }
      if (s === 'clear') { conOut.innerHTML = ''; return; }
      if (s.startsWith('ui:')) {
        const src = s.slice(3).trim();
        const c = addCellLocal(src);
        conPrint('note', `added page-side cell [${cells.indexOf(c) + 1}] — no runtime call`);
        if (c.p?.kind === 'loop') startLoop(c); else renderOutput(c);
        edited = true; saveState();
        return;
      }
      if (s === 'tools') {
        const r = await client.listTools();
        logLine('agent', `client.listTools() <span class="res">⟵ ${r.tools.length} tools</span>`);
        conPrint('res', r.tools.map((t) => `<b>${esc(t.name)}</b>  <span class="gc-dim">${esc((t.description ?? '').split(/(?<=\.)\s/)[0].slice(0, 120))}</span>`).join('\n'));
        return;
      }
      let m = s.match(/^describe\s+(\S+)$/);
      if (m) {
        const t = tools.find((x) => x.name === m![1]);
        if (!t) { conPrint('err', `no tool "${esc(m[1])}" — try: tools`); return; }
        conPrint('res', `<b>${esc(t.name)}</b>\n${esc(t.description ?? '')}\n\ninputSchema: ${pretty(t.inputSchema)}`);
        return;
      }
      m = s.match(/^(?:call\s+)?([a-z_]+)\s*([\s\S]*)$/);
      const tool = m && tools.find((x) => x.name === m![1]);
      if (!m || !tool) { conPrint('err', `unknown command — type <b>help</b> or <b>tools</b>`); return; }
      let args: Record<string, Json> = {};
      if (m[2].trim()) { try { args = JSON.parse(m[2]); } catch (e) { conPrint('err', `arguments must be a JSON object: ${esc(msg(e))}`); return; } }
      if (tool.inputSchema.required?.includes('sessionId') && !('sessionId' in args)) { args = { sessionId, ...args }; conPrint('note', `sessionId filled in: ${sessionId}`); }
      let res: any;
      try { res = await call(tool.name, args, { src: 'agent' }); }
      catch (e) { conPrint('err', `tool error: ${esc(msg(e))}`); return; }
      conPrint('res', pretty(res));
      // the notebook follows the runtime
      const name = tool.name;
      if ((name === 'session_open' || name === 'session_resume') && res?.sessionId) {
        const old = sessionId;
        stopLoop();
        clearNotebook();
        sessionId = res.sessionId;
        if (old && old !== sessionId) await call('session_close', { sessionId: old }, { src: 'ui' }).catch(() => {});
        setupCode();
        presetId = ''; renderPresetChips();
        conPrint('note', `the notebook now follows session ${sessionId.slice(0, 8)}… (its previous session was closed)`);
        const changed = await snapshotSync('agent');
        edited = true;
        await sweep(changed, 'agent');
        saveState();
      } else if (name === 'session_close' && args.sessionId === sessionId) {
        clearNotebook();
        sessionId = '';
        const r = await call('session_open', { kind: 'generic' }, { src: 'ui' });
        sessionId = r.sessionId; setupCode();
        conPrint('note', 'that was the notebook\'s session; it opened a fresh generic one');
        await sweep([]);
      } else if ((name === 'session_set_cell' || name === 'session_define') && args.sessionId === sessionId) {
        const changed = await snapshotSync('agent');
        edited = true;
        await sweep(changed.length ? changed : [String(args.cell)], 'agent');
        saveState();
      }
    }

    let hist = -1;
    on(conIn, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { const v = conIn.value; conIn.value = ''; hist = -1; exclusive(() => agentExec(v)); }
      else if (e.key === 'ArrowUp') { if (conLines.length) { hist = hist < 0 ? conLines.length - 1 : Math.max(0, hist - 1); conIn.value = conLines[hist]; e.preventDefault(); } }
      else if (e.key === 'ArrowDown') { if (hist >= 0) { hist = Math.min(conLines.length - 1, hist + 1); conIn.value = conLines[hist]; e.preventDefault(); } }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const w = conIn.value;
        const hits = [...tools.map((t) => t.name), 'tools', 'describe', 'help', 'clear'].filter((n) => n.startsWith(w));
        if (hits.length === 1) conIn.value = hits[0] + ' ';
        else if (hits.length > 1) conPrint('note', hits.join('  '));
      }
    });

    /* ── scripted agent demo ── */
    let demoRun = 0;
    async function runDemo() {
      const my = ++demoRun;
      demoBtn.textContent = '■ stop demo';
      stopLoop();
      conPrint('note', '── agent demo: replaying MCP tool calls ──');
      for (const line of DEMO) {
        if (my !== demoRun || !alive) break;
        for (let i = 1; i <= line.length; i += 3) { if (my !== demoRun) break; conIn.value = line.slice(0, i); await sleep(12); }
        conIn.value = '';
        await exclusive(() => agentExec(line));
        await sleep(line.startsWith('#') ? 700 : 650);
      }
      if (my === demoRun) { demoRun++; demoBtn.textContent = '▶ agent demo'; }
    }
    on(demoBtn, 'click', () => { if (demoBtn.textContent!.startsWith('■')) { demoRun++; demoBtn.textContent = '▶ agent demo'; } else runDemo(); });

    /* ── presets, deep link ── */
    const chipsEl = $('.gc-presets');
    function renderPresetChips() {
      chipsEl.innerHTML = PRESET_IDS.map((id) => `<button class="gc-chip ${id === presetId ? 'on' : ''}" data-id="${id}">${esc(NB_PRESETS[id].title)}</button>`).join('');
    }
    on(chipsEl, 'click', (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest('button[data-id]') as HTMLElement | null;
      if (b) { demoRun++; demoBtn.textContent = '▶ agent demo'; exclusive(() => loadPreset(b.dataset.id!)); }
    });
    function saveState() {
      const st: typeof STATE_DEFAULTS = { p: presetId || 'curve', v: {}, src: [] };
      if (edited) st.src = cells.map((c) => c.src);
      else {
        for (const s of NB_PRESETS[presetId]?.cells ?? []) {
          let q: Parsed; try { q = parseSource(s); } catch { continue; }
          if (q.kind !== 'input') continue;
          const c = byName(q.name);
          if (c?.p?.kind === 'input' && JSON.stringify(c.p.value) !== JSON.stringify(q.value) && !(runningLoop?.p?.kind === 'loop' && runningLoop.p.assigns.some((a) => a[0] === q.name))) st.v[q.name] = c.p.value;
        }
      }
      writeState(st, STATE_DEFAULTS);
    }
    on($('.gc-copy'), 'click', async () => {
      saveState();
      await sleep(220);
      await copyLink();
      const b = $('.gc-copy'); b.textContent = '✓ copied'; later(() => { b.textContent = 'copy link'; }, 1400);
    });
    on($('.gc-add-btn'), 'click', () => { const c = addCellLocal(''); c.perr = undefined; renderCell(c); c.ta!.focus(); c.el!.scrollIntoView({ block: 'nearest' }); });
    on(readsChk, 'change', () => logEl.querySelectorAll('.gc-le.sweep').forEach((d) => d.classList.toggle('open', readsChk.checked)));
    let rs = 0;
    on(window, 'resize', () => { cancelAnimationFrame(rs); rs = requestAnimationFrame(() => { for (const c of cells) if (c.p && ['plot', 'curve', 'trace'].includes(c.p.kind)) renderOutput(c); }); });

    conPrint('note', 'An agent would see exactly this surface over stdio or HTTP (npx @johnhenry/math-grapher). Type <b>tools</b>, or press <b>▶ agent demo</b>.');

    const init = readState(STATE_DEFAULTS);
    try {
      await exclusive(() => loadPreset(init.p, { v: init.v, src: init.src }));
    } catch (e) {
      explainEl.innerHTML = `<pre class="code">${esc(msg(e))}</pre>`;
    }

    return () => {
      alive = false;
      demoRun++;
      cancelAnimationFrame(rs);
      for (const t of timers) clearTimeout(t);
      for (const d of disposers) d();
      client.close().catch(() => {});
      server.close().catch(() => {});
      root.remove();
    };
  },
};

export default playground;
