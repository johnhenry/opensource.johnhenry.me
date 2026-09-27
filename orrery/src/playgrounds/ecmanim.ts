import type { Playground } from '../registry';
import { receive, handoffBanner, type Handoff } from '../bus';
import { readState, writeState, copyLink } from '../state';
import './ecmanim.css';

/**
 * Ecmanim Stage — a manim-style Scene plays live on a <canvas>.
 *
 * The code shown beside the canvas is not a transcription: each preset's source
 * string is compiled with `new Function` and bound to the real
 * `@johnhenry/ecmanim/browser` exports, so what you read is exactly what runs.
 */

type Lib = typeof import('@johnhenry/ecmanim/browser');

interface Preset { id: string; name: string; note: string; source: string }

const PRESETS: Preset[] = [
  {
    id: 'morph',
    name: 'Circle → Square',
    note: 'Write a title, Create a circle, then Transform its Bézier points into a square and spin it.',
    source: `import { Scene, Text, Circle, Square, Create, Write, Transform,
  Rotate, Indicate, FadeOut, Group, BLUE, GOLD, PI } from "@johnhenry/ecmanim/browser";

class CircleToSquare extends Scene {
  async construct() {
    const title = new Text("ecmanim", { fontSize: 1.1, color: GOLD });
    title.moveTo([0, 2.6, 0]);
    await this.play(new Write(title), { runTime: 1.2 });

    const circle = new Circle({ radius: 1.6, color: BLUE, fillOpacity: 0.35 });
    await this.play(new Create(circle), { runTime: 1.2 });

    const square = new Square({ sideLength: 3, color: GOLD, fillOpacity: 0.35 });
    square.moveTo([0, -0.3, 0]);
    await this.play(new Transform(circle, square), { runTime: 1.4 });
    await this.play(new Rotate(circle, PI / 2), { runTime: 1 });
    await this.play(new Indicate(title));
    await this.wait(0.6);
    await this.play(new FadeOut(new Group(title, circle)));
  }
}`,
  },
  {
    id: 'orbit',
    name: 'Polygon orbit',
    note: 'A hexagon Rotates in place while six dots ride MoveAlongPath around a Circle, launched with LaggedStart.',
    source: `import { Scene, RegularPolygon, Circle, Dot, Create, GrowFromCenter,
  Rotate, MoveAlongPath, LaggedStart, AnimationGroup, FadeOut, Group,
  TEAL, PINK, GOLD, TAU, rate_functions } from "@johnhenry/ecmanim/browser";

class PolygonOrbit extends Scene {
  async construct() {
    const hex = new RegularPolygon(6, { color: TEAL, fillOpacity: 0.25 });
    hex.scale(1.6);
    const ring = new Circle({ radius: 3, color: "#666666", strokeWidth: 3 });
    await this.play(new Create(ring), new GrowFromCenter(hex));

    const colors = [PINK, GOLD, TEAL, PINK, GOLD, TEAL];
    const dots = colors.map((color) => new Dot({ point: [3, 0, 0], radius: 0.14, color }));
    this.add(...dots); // MoveAlongPath moves a mobject; it doesn't introduce it
    const orbits = dots.map((d) => new MoveAlongPath(d, ring, { runTime: 4, rateFunc: rate_functions.linear }));

    await this.play(
      new AnimationGroup([
        new Rotate(hex, TAU, { runTime: 5, rateFunc: rate_functions.linear }),
        new LaggedStart(orbits, { lagRatio: 0.15 }),
      ]),
    );
    await this.play(new FadeOut(new Group(hex, ring, ...dots)));
  }
}`,
  },
  {
    id: 'graph',
    name: 'Axes + graph',
    note: 'Axes.plot() samples a function into a VMobject; a Dot traces it, then the curve Transforms into a new function.',
    source: `import { Scene, Axes, Dot, Text, Create, Write, Transform,
  MoveAlongPath, FadeIn, FadeOut, Group, BLUE, YELLOW, RED, rate_functions } from "@johnhenry/ecmanim/browser";

class GraphIt extends Scene {
  async construct() {
    const axes = new Axes({
      xRange: [-4, 4, 1], yRange: [-2, 2, 1],
      xLength: 11, yLength: 5.5, color: "#888888",
    });
    await this.play(new Create(axes), { runTime: 1.2 });

    const wave = axes.plot((x) => Math.sin(1.5 * x), { color: BLUE });
    const label = new Text("y = sin(1.5x)", { fontSize: 0.45, color: BLUE });
    label.moveTo([4.6, 3.3, 0]);
    await this.play(new Create(wave), new Write(label), { runTime: 1.5 });

    const dot = new Dot({ point: axes.c2p(-4, Math.sin(-6)), color: YELLOW, radius: 0.12 });
    await this.play(new FadeIn(dot), { runTime: 0.3 });
    await this.play(new MoveAlongPath(dot, wave, { runTime: 2.5, rateFunc: rate_functions.linear }));

    const bump = axes.plot((x) => 1.8 * Math.exp(-x * x / 2) - 0.3, { color: RED });
    const label2 = new Text("y = 1.8·e^(−x²/2)", { fontSize: 0.45, color: RED });
    label2.moveTo([4.4, 3.3, 0]);
    await this.play(
      new Transform(wave, bump, { rateFunc: rate_functions.smooth }),
      new FadeOut(label), new FadeIn(label2),
      new FadeOut(dot),
      { runTime: 1.6 },
    );
    await this.wait(0.8);
    await this.play(new FadeOut(new Group(axes, wave, label2)));
  }
}`,
  },
  {
    id: 'ripple',
    name: 'Ripple of dots',
    note: 'A grid of Dots grows in, then a plain addUpdater() drives a radial sine wave every frame during wait().',
    source: `import { Scene, Dot, VGroup, GrowFromCenter, LaggedStart, FadeOut,
  interpolateColor, BLUE, PINK } from "@johnhenry/ecmanim/browser";

class Ripple extends Scene {
  async construct() {
    const dots = [];
    for (let i = -9; i <= 9; i++) {
      for (let j = -5; j <= 5; j++) {
        const home = [i * 0.7, j * 0.7, 0];
        const d = new Dot({ point: home, radius: 0.09, color: BLUE });
        d.home = home;
        d.r = Math.hypot(home[0], home[1]);
        dots.push(d);
      }
    }
    dots.sort((a, b) => a.r - b.r); // grow outward from the centre
    await this.play(
      new LaggedStart(dots.map((d) => new GrowFromCenter(d)), { lagRatio: 0.004 }),
      { runTime: 1.6 },
    );

    const field = new VGroup(...dots);
    let t = 0;
    field.addUpdater((_m, dt) => {
      t += dt;
      for (const d of dots) {
        const wave = Math.sin(d.r * 1.6 - t * 4);
        const lift = 0.28 * wave * Math.exp(-d.r / 7);
        d.moveTo([d.home[0], d.home[1] + lift, 0]);
        d.setColor(interpolateColor(BLUE, PINK, (wave + 1) / 2));
      }
    });
    this.add(field);
    await this.wait(5);
    field.clearUpdaters();
    await this.play(new FadeOut(field));
  }
}`,
  },
];

/* ------------------------------------------------ scenes from the Math Observatory */

/** Handoff kinds the Math Observatory sends here (see math.ts). */
export interface RotorPayload { planes: string[]; k: number; angle: number; vector: number[]; steps: number; camera?: { yaw: number; pitch: number } }
export interface JuliaPayload { kind: 'julia' | 'mandelbrot'; c: [number, number]; zoom: number; center: [number, number]; span: number; iterations: number }
export interface GraphPayload { expr: string; xRange: [number, number]; a: number }
export interface VectorFieldPayload { preset: 'well' | 'saddle' | 'vortex'; xRange: [number, number, number]; yRange: [number, number, number]; probe: [number, number] }
export interface Generated { kind: string; payload: unknown }

const PLANE_NAMES = ['xy', 'xz', 'xw', 'yz', 'yw', 'zw'];
/** Number literal safe to splice into generated source. */
const lit = (v: unknown, d = 4, fallback = 0): string => {
  const x = Number(v);
  return String(Number.isFinite(x) ? +x.toFixed(d) : fallback);
};
const bivec = (p: string) => `new Bivector4(${PLANE_NAMES.map((q) => (q === p ? 1 : 0)).join(', ')})`;

function rotorSource(p: RotorPayload): string {
  const planes = (Array.isArray(p.planes) ? p.planes : ['xy']).filter((q) => PLANE_NAMES.includes(q)).slice(0, 2);
  if (!planes.length) planes.push('xy');
  const v = [0, 1, 2, 3].map((i) => lit(p.vector?.[i], 3));
  const steps = Math.max(30, Math.min(600, Math.round(Number(p.steps) || 180)));
  const angle = Number(p.angle) || 2 * Math.PI;
  const deg = Math.round((angle * 180) / Math.PI);
  const needed = [...new Set([...planes, 'yz', 'xz'])];
  return `import { Scene, Line, Arrow, Dot, Text, VMobject, VGroup, TracedPath, ValueTracker,
  UpdateFromAlphaFunc, Create, Write, FadeIn, FadeOut, alwaysRedraw, rate_functions,
  GOLD, PURPLE_B, GREY, RED, GREEN, BLUE } from "@johnhenry/ecmanim/browser";
import { Rotor4, Bivector4, Vec4 } from "@johnhenry/math";

// ← exported from the Math Observatory (Rotors in 4D)
const PLANES = ${JSON.stringify(planes)};   // rotation plane(s)
const K      = ${lit(p.k, 3, 1)};            // second-plane speed (double rotation)
const ANGLE  = ${lit(angle, 4)};           // ${deg}° of θ
const V      = new Vec4(${v.join(', ')});
const STEPS  = ${steps};             // one rotor sample per frame

const E = { ${needed.map((q) => `${q}: ${bivec(q)}`).join(',\n            ')} };
const rotorAt = (t) => {
  const R1 = Rotor4.fromBivectorAngle(E[PLANES[0]], t);
  return PLANES[1] ? Rotor4.fromBivectorAngle(E[PLANES[1]], K * t).multiply(R1) : R1;
};
// same camera as the Observatory: itself a Rotor4, then 4D→3D→2D perspective
const CAM = Rotor4.fromBivectorAngle(E.yz, ${lit(p.camera?.pitch ?? 0.42, 3)}).multiply(Rotor4.fromBivectorAngle(E.xz, ${lit(p.camera?.yaw ?? -0.55, 3)}));
const project = (p4) => {
  const q = CAM.apply(p4);
  const f = 3 / (3 - q.w), g = 7 / (7 - q.z * f);
  return [q.x * f * g * 2.5, q.y * f * g * 2.5 - 0.3, 0];
};

class RotorFromObservatory extends Scene {
  async construct() {
    const title = new Text("v' = R v ~R   ·   plane " + PLANES.join(" + ") + (PLANES[1] ? "  (k = " + K + ")" : ""), { fontSize: 0.42, color: GOLD });
    title.moveTo([0, 3.45, 0]);
    const axes = new VGroup(...[["x", RED], ["y", GREEN], ["z", BLUE]].map(([a, color]) => {
      const u = new Vec4(a === "x" ? 1.7 : 0, a === "y" ? 1.7 : 0, a === "z" ? 1.7 : 0, 0);
      return new Line(project(u.scale(-1)), project(u), { color, strokeWidth: 2, strokeOpacity: 0.6 });
    }));
    await this.play(new Write(title), new Create(axes), { runTime: 1.2 });

    // ghost of the whole orbit, sampled through the library rotor
    const ghost = new VMobject({ strokeColor: GREY, strokeWidth: 2, strokeOpacity: 0.45 });
    ghost.setPointsAsCorners(Array.from({ length: STEPS + 1 }, (_, i) =>
      project(rotorAt((i / STEPS) * ANGLE).apply(V))));
    await this.play(new Create(ghost), { runTime: 1 });

    const theta = new ValueTracker(0);
    const tip = () => project(rotorAt(theta.getValue()).apply(V));
    const trail = new TracedPath(tip, { strokeColor: PURPLE_B, strokeWidth: 5 });
    const arrow = alwaysRedraw(() => new Arrow([0, -0.3, 0], tip(), { color: GOLD, buff: 0, strokeWidth: 6 }));
    const head = alwaysRedraw(() => new Dot({ point: tip(), radius: 0.09, color: "#ffffff" }));
    const readout = alwaysRedraw(() => {
      const t = new Text("θ = " + Math.round(theta.getValue() * 180 / Math.PI) + "°", { fontSize: 0.36, color: "#dddddd" });
      t.moveTo([-5.6, -3.4, 0]);
      return t;
    });
    this.add(trail, arrow, head, readout);
    await this.play(
      new UpdateFromAlphaFunc(theta, (m, a) => m.setValue(a * ANGLE)),
      { runTime: STEPS / 30, rateFunc: rate_functions.linear },
    );
    await this.wait(1);
    arrow.clearUpdaters(); head.clearUpdaters(); readout.clearUpdaters(); trail.clearUpdaters();
    await this.play(new FadeOut(new VGroup(title, axes, ghost, trail, arrow, head, readout)));
  }
}`;
}

function juliaSource(p: JuliaPayload): string {
  const mandel = p.kind === 'mandelbrot';
  const [cr, ci] = Array.isArray(p.c) ? p.c : [-0.7269, 0.1889];
  const [cx, cy] = Array.isArray(p.center) ? p.center : [0, 0];
  const span = Number(p.span) > 0 ? Number(p.span) : 3.4;
  const iters = Math.max(16, Math.min(400, Math.round(Number(p.iterations) || 160)));
  return `import { Scene, Square, VGroup, Text, FadeIn, FadeOut, Write, Transform,
  interpolateColor, rate_functions, GOLD } from "@johnhenry/ecmanim/browser";
import { ComplexNumber } from "@johnhenry/math";

// ← exported from the Math Observatory (Complex fractals)
const KIND     = "${mandel ? 'mandelbrot' : 'julia'}";
const C        = new ComplexNumber(${lit(cr, 6)}, ${lit(ci, 6)});
const CENTER   = [${lit(cx, 8)}, ${lit(cy, 8)}];
const SPAN     = ${lit(span * 1.25, 10, 3.4)};        // view width, a little wider than the Observatory's (zoom ${lit(p.zoom, 2, 1)}×)
const MAX_ITER = ${iters};            // capped for a live scene
const COLS = 64, ROWS = 36;       // deliberately low-res: one Square per sample

/** Escape time of one sample, iterated with the library's ComplexNumber. */
function escape(p) {
  let z = KIND === "julia" ? p : ComplexNumber.Zero;
  const c = KIND === "julia" ? C : p;
  for (let n = 0; n < MAX_ITER; n++) {
    z = z.multiply(z).add(c);
    if (z.magnitude() > 4) return n + 1;
  }
  return -1; // bounded
}

/** Sample the set around \`center\` (span = visible width) into Squares, bucketed by escape time. */
function sampleSet(center, span) {
  const cell = 14.2 / COLS, upp = span / COLS;
  const bands = Array.from({ length: 7 }, () => []);
  let focus = null, best = -1;
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const x = (i + 0.5 - COLS / 2), y = (ROWS / 2 - j - 0.5);
    const p = new ComplexNumber(center[0] + x * upp, center[1] + y * upp);
    const t = escape(p);
    // the slowest-escaping sample near the middle sits right on the boundary: zoom there
    const score = t < 0 ? -1 : t - 0.8 * Math.hypot(x, y);
    if (score > best) { best = score; focus = { world: [x * cell, y * cell, 0], z: [p.re, p.im] }; }
    if (t >= 0 && t < 3) continue; // leave the fast-escaping background empty
    const s = t < 0 ? 1 : Math.min(0.999, Math.log2(t - 1) / 5);
    const color = t < 0 ? GOLD : interpolateColor("#2a1f7a", "#ff4fd8", s);
    const sq = new Square({ sideLength: cell * 1.04, color, fillOpacity: 1, strokeWidth: 0 });
    sq.moveTo([x * cell, y * cell, 0]);
    bands[t < 0 ? 6 : Math.min(5, Math.floor(s * 6))].push(sq);
  }
  return { bands: bands.map((b) => new VGroup(...b)), focus };
}

class JuliaFromObservatory extends Scene {
  async construct() {
    const { bands, focus } = sampleSet(CENTER, SPAN);
    const set = new VGroup(...bands);
    // fade the escape-time bands in from the outside (fast) to the inside (bounded)
    for (const band of bands) {
      if (band.submobjects.length) await this.play(new FadeIn(band), { runTime: 0.45 });
    }
    const label = new Text(KIND === "julia" ? "c = " + C.toString().replace(/(\\.\\d{4})\\d+/g, "$1") : "Mandelbrot", { fontSize: 0.4, color: "#ffffff" });
    label.moveTo([-4.6, -3.55, 0]);
    await this.play(new Write(label), { runTime: 0.8 });
    await this.wait(0.5);

    // zoom 3× into a boundary point (bringing it to the centre), then resample at the new scale
    const target = set.copy().scale(3, { aboutPoint: focus.world }).shift(focus.world.map((v) => -v));
    await this.play(new Transform(set, target), { runTime: 2, rateFunc: rate_functions.smooth });
    const finer = new VGroup(...sampleSet(focus.z, SPAN / 3).bands);
    await this.play(new FadeOut(set), new FadeIn(finer), { runTime: 1.2 });
    await this.wait(1.2);
    await this.play(new FadeOut(new VGroup(finer, label)));
  }
}`;
}

function graphSource(p: GraphPayload): string {
  let [x0, x1] = Array.isArray(p.xRange) ? p.xRange.map(Number) : [-6, 6];
  if (!(Number.isFinite(x0) && Number.isFinite(x1)) || x0 === x1) { x0 = -6; x1 = 6; }
  if (x0 > x1) [x0, x1] = [x1, x0];
  return `import { Scene, Axes, VGroup, Dot, Text, Create, Write, FadeIn, FadeOut,
  MoveAlongPath, rate_functions, YELLOW, PURPLE_B } from "@johnhenry/ecmanim/browser";
import { Symbolic } from "@johnhenry/math";

// ← exported from the Math Observatory (Symbolic plotter)
const EXPR    = ${JSON.stringify(String(p.expr ?? 'sin(x)'))};
const X_RANGE = [${lit(x0, 4)}, ${lit(x1, 4)}];
const A       = ${lit(p.a, 3)};

const f = Symbolic.compile(Symbolic.parse(EXPR));   // AST → closure tree
const y = (x) => { try { return f({ x, a: A }); } catch { return NaN; } };

/**
 * Axes place data 0 at world 0, so a range must contain 0 to draw where you'd expect.
 * Near-zero ranges are extended to 0; far ones are plotted relative to their midpoint.
 * Returns [lo, hi, offset] with data plotted as (value - offset).
 */
const frame = (lo, hi) => {
  const w = hi - lo;
  if (lo <= 0 && hi >= 0) return [lo, hi, 0];
  if (lo > 0 && lo < 0.5 * w) return [0, hi, 0];
  if (hi < 0 && -hi < 0.5 * w) return [lo, 0, 0];
  const mid = (lo + hi) / 2;
  return [lo - mid, hi - mid, mid];
};
/** A tidy tick step for a range. */
const tick = (r) => { const s = r / 8, p = 10 ** Math.floor(Math.log10(s)); return [1, 2, 5, 10].map((m) => m * p).find((t) => t >= s); };

class GraphFromObservatory extends Scene {
  async construct() {
    // y-range from the 5th–95th percentile of samples, padded
    const xs = Array.from({ length: 400 }, (_, i) => X_RANGE[0] + (i / 399) * (X_RANGE[1] - X_RANGE[0]));
    const ys = xs.map(y).filter(Number.isFinite).sort((a, b) => a - b);
    let lo = ys[Math.floor(ys.length * 0.05)] ?? -1, hi = ys[Math.floor(ys.length * 0.95)] ?? 1;
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;

    const [ax0, ax1, ox] = frame(X_RANGE[0], X_RANGE[1]);
    const [ay0, ay1, oy] = frame(lo, hi);
    const axes = new Axes({
      xRange: [ax0, ax1, tick(ax1 - ax0)], yRange: [ay0, ay1, tick(ay1 - ay0)],
      xLength: 11.5, yLength: 5.6, color: "#888888",
    });
    // split into finite, in-range runs so poles and gaps don't draw spikes
    const runs = [];
    let run = null;
    for (const x of Array.from({ length: 361 }, (_, i) => X_RANGE[0] + (i / 360) * (X_RANGE[1] - X_RANGE[0]))) {
      const v = y(x), ok = Number.isFinite(v) && v >= lo - pad && v <= hi + pad;
      if (ok && !run) runs.push(run = [x, x]);
      else if (ok) run[1] = x;
      else run = null;
    }
    const curves = runs.filter(([a, b]) => b > a).map(([a, b]) =>
      axes.plot((u) => y(u + ox) - oy, { xRange: [a - ox, b - ox, (b - a) / 120], color: PURPLE_B, strokeWidth: 5 }));
    const board = new VGroup(axes, ...curves);
    board.shift(board.getCenter().map((c) => -c)).shift([0, -0.35, 0]); // Axes put data 0 at world 0

    const title = new Text("f(x) = " + EXPR + (EXPR.includes("a") ? "   (a = " + A + ")" : ""), { fontSize: 0.4, color: PURPLE_B });
    title.moveTo([0, 3.55, 0]);
    await this.play(new Create(axes), new Write(title), { runTime: 1.4 });
    for (const c of curves) await this.play(new Create(c), { runTime: 2.2 / curves.length, rateFunc: rate_functions.linear });

    if (curves.length) {
      const longest = curves.reduce((m, c) => (c.points.length > m.points.length ? c : m));
      const dot = new Dot({ point: longest.pointFromProportion(0), color: YELLOW, radius: 0.11 });
      await this.play(new FadeIn(dot), { runTime: 0.3 });
      await this.play(new MoveAlongPath(dot, longest, { runTime: 3, rateFunc: rate_functions.linear }));
      await this.play(new FadeOut(dot), { runTime: 0.3 });
    }
    await this.wait(0.8);
    await this.play(new FadeOut(new VGroup(board, title)));
  }
}`;
}

function vectorFieldSource(p: VectorFieldPayload): string {
  const preset = p.preset === 'saddle' || p.preset === 'vortex' ? p.preset : 'well';
  const xr = Array.isArray(p.xRange) && p.xRange.length === 3 ? p.xRange.map(Number) : [-3, 3, 0.5];
  const yr = Array.isArray(p.yRange) && p.yRange.length === 3 ? p.yRange.map(Number) : [-3, 3, 0.5];
  const probe = Array.isArray(p.probe) && p.probe.length === 2 ? p.probe.map(Number) : [0.9, 0.4];
  const label = preset === 'well' ? 'Potential well  Φ = ½(x²+y²)   F = ∇Φ'
    : preset === 'saddle' ? 'Saddle  Φ = ½(x²−y²)   F = ∇Φ'
    : 'Vortex  F = (−y, x)   — not a gradient field';
  return `import { Scene, ArrowVectorField, StreamLines, Text, Dot, Group,
  Write, Create, FadeIn, FadeOut, GOLD, BLUE_E, TEAL, RED } from "@johnhenry/ecmanim/browser";
import { DualNumber, VectorCalculus } from "@johnhenry/math";

// ← exported from the Math Observatory (Vector calculus)
const PRESET  = "${preset}";
const X_RANGE = [${lit(xr[0])}, ${lit(xr[1])}, ${lit(xr[2], 3, 0.5)}];
const Y_RANGE = [${lit(yr[0])}, ${lit(yr[1])}, ${lit(yr[2], 3, 0.5)}];
const PROBE   = [${lit(probe[0])}, ${lit(probe[1])}];
const LABEL   = ${JSON.stringify(label)};

// Same field the Observatory offered: a scalar potential for the gradient
// presets (rendered via VectorCalculus.gradient, point by point — real
// autodiff, not a closed form) and a DualNumber-native form of the field
// itself (for VectorCalculus.divergence / .curl3D — composing autodiff of
// autodiff isn't supported, so this is the same formula hand-derived once).
const potentialDual = (xs) => PRESET === "saddle"
  ? xs[0].pow(2).subtract(xs[1].pow(2)).multiply(0.5)
  : xs[0].pow(2).add(xs[1].pow(2)).multiply(0.5);
const fieldDual = (xs) => PRESET === "vortex"
  ? [xs[1].negate(), xs[0]]
  : [xs[0], PRESET === "saddle" ? xs[1].negate() : xs[1]];
const field3Dual = (xs) => {
  const [fx, fy] = fieldDual([xs[0], xs[1]]);
  return [fx, fy, DualNumber.constant(0)];
};

/** The field function ArrowVectorField/StreamLines sample: point [x, y, z] → vector [vx, vy, vz]. */
function fieldXY(point) {
  const [x, y] = point;
  if (PRESET === "vortex") return [-y, x, 0];
  const g = VectorCalculus.gradient(potentialDual, [x, y]);
  return [g[0], g[1], 0];
}

const DIVERGENCE = VectorCalculus.divergence(fieldDual, PROBE);
const CURL_Z = VectorCalculus.curl3D(field3Dual, [PROBE[0], PROBE[1], 0])[2];

class VectorFieldFromObservatory extends Scene {
  async construct() {
    const title = new Text(LABEL, { fontSize: 0.4, color: GOLD });
    title.moveTo([0, 3.5, 0]);
    await this.play(new Write(title), { runTime: 1 });

    const field = new ArrowVectorField(fieldXY, {
      xRange: X_RANGE, yRange: Y_RANGE,
      minColor: BLUE_E, maxColor: RED, strokeWidth: 2.5,
    });
    await this.play(new Create(field), { runTime: 2 });

    const probe = new Dot({ point: [PROBE[0], PROBE[1], 0], radius: 0.11, color: "#ffffff" });
    const readout = new Text(
      "div F = " + DIVERGENCE.toFixed(3) + "    curl F·ẑ = " + CURL_Z.toFixed(3) + "    at (" + PROBE[0] + ", " + PROBE[1] + ")",
      { fontSize: 0.32, color: TEAL },
    );
    readout.moveTo([0, -3.4, 0]);
    await this.play(new FadeIn(probe), new Write(readout), { runTime: 0.8 });
    await this.wait(1);

    const stream = new StreamLines(fieldXY, {
      xRange: X_RANGE, yRange: Y_RANGE, strokeWidth: 1.6,
      minColor: BLUE_E, maxColor: TEAL, virtualTime: 3, dt: 0.05,
    });
    await this.play(new FadeOut(field), new FadeIn(stream), { runTime: 1.2 });
    await this.wait(1.5);
    await this.play(new FadeOut(new Group(title, stream, probe, readout)));
  }
}`;
}

/** Build a fifth "From Math Observatory" scene from a math-* handoff. */
export function sceneFromMath(g: Generated): Preset | null {
  const p = (g.payload ?? {}) as any;
  if (g.kind === 'math-rotor') return {
    id: 'math', name: 'From Math Observatory', source: rotorSource(p),
    note: `A Rotor4 exported from the Math Observatory: the vector is spun ${Math.round((Number(p.angle) || 2 * Math.PI) * 180 / Math.PI)}° through ${(p.planes ?? []).map((q: string) => 'e' + q).join(' + ')} with R v R̃ each frame, leaving a TracedPath trail.`,
  };
  if (g.kind === 'math-julia') return {
    id: 'math', name: 'From Math Observatory', source: juliaSource(p),
    note: `The ${p.kind === 'mandelbrot' ? 'Mandelbrot' : 'Julia'} set you were looking at, resampled at 64×36 with ComplexNumber: Squares fade in by escape-time band, then a Transform zooms 3× onto a boundary point and a finer sample cross-fades in.`,
  };
  if (g.kind === 'math-graph') return {
    id: 'math', name: 'From Math Observatory', source: graphSource(p),
    note: `f(x) = ${String(p.expr)} compiled by Symbolic.compile and drawn with Axes.plot over the Observatory's x-range; poles and gaps split the curve into runs.`,
  };
  if (g.kind === 'math-vector-field') return {
    id: 'math', name: 'From Math Observatory', source: vectorFieldSource(p),
    note: `The ${p.preset === 'vortex' ? 'vortex field' : p.preset === 'saddle' ? 'saddle potential' : 'potential well'} from the Observatory: an ArrowVectorField sampled with VectorCalculus.gradient, its divergence and curl3D recomputed live at the probe point, then a StreamLines pass traces the flow.`,
  };
  return null;
}

/** Modules a scene's source may import from, keyed by specifier. */
type Mods = Record<string, Record<string, unknown>>;
const ECM = '@johnhenry/ecmanim/browser';

/**
 * Compile a scene's source against the real library namespaces. Every
 * `import { … } from "<specifier>"` line is bound to the matching module in
 * `mods` (ecmanim always; @johnhenry/math for scenes exported from the Math
 * Observatory), so the text in the code pane is exactly what runs.
 */
export function compile(mods: Mods, source: string): any {
  const re = /import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["'];?/g;
  const binds: string[] = [];
  for (const m of source.matchAll(re)) {
    const spec = m[2];
    const mod = mods[spec];
    if (!mod) throw new Error(`Unknown module in this sandbox: "${spec}"`);
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const missing = names.filter((n) => !(n in mod));
    if (missing.length) throw new Error(`Not exported by ${spec}: ${missing.join(', ')}`);
    binds.push(`const { ${names.join(', ')} } = __mods[${JSON.stringify(spec)}];`);
  }
  const body = source.replace(re, '');
  const cls = body.match(/class\s+(\w+)\s+extends/);
  if (!cls) throw new Error('No `class X extends Scene` found in source');
  const fn = new Function('__mods', `${binds.join('\n')}\n${body}\nreturn ${cls[1]};`);
  return fn(mods);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

/** Tiny highlighter: keywords, strings, numbers, comments, capitalised identifiers. */
function highlight(src: string): string {
  const re = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|\b(import|from|class|extends|async|await|const|let|new|return|for|of|this)\b|\b(\d+(?:\.\d+)?)\b|\b([A-Z][A-Za-z0-9_]*)\b/g;
  let out = '';
  let last = 0;
  for (const m of src.matchAll(re)) {
    out += escapeHtml(src.slice(last, m.index));
    const [tok, com, str, kw, num, cap] = m;
    const cls = com ? 'c' : str ? 's' : kw ? 'k' : num ? 'n' : cap ? 't' : '';
    out += `<span class="tk-${cls}">${escapeHtml(tok)}</span>`;
    last = m.index! + tok.length;
  }
  return out + escapeHtml(src.slice(last));
}

const BG = '#0b0f1c';
const FPS = 30;
const W = 1280;
const H = 720;

class Cancelled extends Error {}

const playground: Playground = {
  id: 'ecmanim',
  title: 'Ecmanim Stage',
  pkg: '@johnhenry/ecmanim',
  hue: 45,
  blurb: 'A TypeScript manim. Same Scene code renders in Node and, right here, in canvas.',
  docs: 'https://opensource.johnhenry.me/ecmanim/',
  mount(host) {
    // Pick up a scene exported from another planet (Math Observatory) before anything else.
    const incoming: Handoff | null = receive('ecmanim');
    const DEFAULTS = { scene: PRESETS[0].id, speed: 1, gen: '' };
    const st = readState(DEFAULTS);
    let generated: Generated | null = null;
    if (incoming && incoming.kind.startsWith('math-')) {
      generated = { kind: incoming.kind, payload: incoming.payload };
      st.scene = 'math';
    } else if (st.gen) {
      try { generated = JSON.parse(st.gen) as Generated; } catch { generated = null; }
    }
    const fromMath = generated ? sceneFromMath(generated) : null;
    if (!fromMath) generated = null;
    const scenes: Preset[] = fromMath ? [...PRESETS, fromMath] : PRESETS;
    const initial = scenes.find((p) => p.id === st.scene) ?? scenes[0];
    const initialSpeed = Math.max(0.25, Math.min(3, Number(st.speed) || 1));

    const root = document.createElement('div');
    root.className = 'pg-ecmanim';
    root.innerHTML = `
      <div class="em-bar panel">
        <div class="em-picker" role="tablist"></div>
        <div class="em-controls">
          <button class="btn primary em-play" disabled>▶ Play</button>
          <label class="em-speed">speed <input type="range" min="0.25" max="3" step="0.25" value="1"> <span class="chip">1×</span></label>
          <button class="btn em-dl" disabled>⤓ Download WebM</button>
          <button class="btn em-link" title="Copy a link to this scene and speed">🔗 copy link</button>
        </div>
      </div>
      <div class="em-main">
        <div class="em-stage">
          <div class="em-canvas-wrap">
            <canvas width="${W}" height="${H}"></canvas>
            <div class="em-loading"><div class="em-spinner"></div><span>loading ecmanim…</span></div>
          </div>
          <div class="em-status">
            <span class="chip em-state">idle</span>
            <span class="em-time mono">t = 0.00s</span>
            <span class="em-frames mono">frame 0</span>
            <span class="em-anim mono"></span>
          </div>
          <p class="em-note"></p>
          <div class="em-explain">
            <b>What's happening</b>
            <p><code>construct()</code> is an ordinary async script. Each <code>this.play(...)</code> advances the scene's
            own clock one frame at a time and hands the mobject list to a <code>frameHandler</code>; here that handler is a
            <code>CanvasRenderer</code> drawing to this canvas and pacing itself with <code>requestAnimationFrame</code>
            (the speed slider rescales the pacing). The same class, unmodified, renders to MP4 in Node via
            <code>render(Scene)</code> — and <b>Download WebM</b> replays it through <code>record()</code> and
            <code>MediaRecorder</code>.</p>
          </div>
        </div>
        <div class="em-code-col">
          <div class="em-code-head"><span class="chip em-file"></span><span class="em-code-hint">compiled live from this text</span></div>
          <pre class="code em-code"></pre>
          <pre class="code em-err" hidden></pre>
        </div>
      </div>`;
    host.appendChild(root);
    if (incoming && fromMath) {
      const what = incoming.kind === 'math-rotor' ? 'a 4D rotor'
        : incoming.kind === 'math-julia' ? 'a fractal view'
        : incoming.kind === 'math-vector-field' ? 'a vector field'
        : 'a symbolic function';
      root.prepend(handoffBanner(incoming, `Built a new Scene from ${what} — see the <b>From Math Observatory</b> tab and its generated source.`));
    }

    const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
    const canvas = $<HTMLCanvasElement>('canvas');
    const picker = $<HTMLDivElement>('.em-picker');
    const playBtn = $<HTMLButtonElement>('.em-play');
    const dlBtn = $<HTMLButtonElement>('.em-dl');
    const speedIn = $<HTMLInputElement>('.em-speed input');
    const speedChip = $<HTMLSpanElement>('.em-speed .chip');
    const loading = $<HTMLDivElement>('.em-loading');
    const stateChip = $<HTMLSpanElement>('.em-state');
    const timeEl = $<HTMLSpanElement>('.em-time');
    const framesEl = $<HTMLSpanElement>('.em-frames');
    const animEl = $<HTMLSpanElement>('.em-anim');
    const noteEl = $<HTMLParagraphElement>('.em-note');
    const codeEl = $<HTMLPreElement>('.em-code');
    const errEl = $<HTMLPreElement>('.em-err');
    const fileEl = $<HTMLSpanElement>('.em-file');

    let disposed = false;
    let lib: Lib | null = null;
    let mods: Mods | null = null;
    let current = initial;
    let speed = initialSpeed;
    let runId = 0; // bump to cancel whichever run is in flight
    let playing = false;
    let recording = false;
    const listeners: Array<() => void> = [];
    const on = (el: EventTarget, ev: string, fn: EventListener) => {
      el.addEventListener(ev, fn);
      listeners.push(() => el.removeEventListener(ev, fn));
    };

    const ctx0 = canvas.getContext('2d')!;
    ctx0.fillStyle = BG;
    ctx0.fillRect(0, 0, W, H);

    const showError = (e: unknown) => {
      errEl.hidden = false;
      errEl.textContent = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    };

    const setState = (s: string) => {
      stateChip.textContent = s;
      root.dataset.state = s;
    };

    // Picker
    for (const p of scenes) {
      const b = document.createElement('button');
      b.className = p === fromMath ? 'em-tab em-tab-math' : 'em-tab';
      b.textContent = p.name;
      b.dataset.id = p.id;
      on(b, 'click', () => select(p, true));
      picker.appendChild(b);
    }

    function select(p: Preset, autoplay: boolean) {
      current = p;
      picker.querySelectorAll<HTMLButtonElement>('.em-tab').forEach((b) =>
        b.classList.toggle('active', b.dataset.id === p.id));
      codeEl.innerHTML = highlight(p.source);
      noteEl.textContent = p.note;
      const cls = p.source.match(/class\s+(\w+)/)?.[1] ?? 'scene';
      fileEl.textContent = `${cls}.ts`;
      errEl.hidden = true;
      syncUrl();
      if (autoplay && lib) void run();
    }

    function syncUrl() {
      writeState({ scene: current.id, speed, gen: current === fromMath && generated ? JSON.stringify(generated) : '' }, DEFAULTS);
    }
    const linkBtn = $<HTMLButtonElement>('.em-link');
    on(linkBtn, 'click', async () => {
      syncUrl();
      await new Promise((r) => setTimeout(r, 200)); // writeState is debounced
      await copyLink();
      linkBtn.textContent = '✓ copied';
      setTimeout(() => { if (!disposed) linkBtn.textContent = '🔗 copy link'; }, 1400);
    });

    /** Mirror of ecmanim's browser play(), with cancellation + variable speed. */
    async function run() {
      if (!lib || !mods || disposed) return;
      const my = ++runId;
      errEl.hidden = true;
      let SceneClass: any;
      try {
        SceneClass = compile(mods, current.source);
      } catch (e) {
        showError(e);
        return;
      }
      const { Camera, CanvasRenderer, makeScene, runConstruct } = lib;
      const ctx = canvas.getContext('2d')!;
      const camera = new Camera({ pixelWidth: W, pixelHeight: H, background: BG });
      const renderer = new CanvasRenderer(ctx, camera);
      const scene: any = makeScene(SceneClass, { fps: FPS, camera });
      let frame = 0;
      let due = performance.now();
      const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      scene.frameHandler = async (mobjects: any[]) => {
        if (my !== runId || disposed) throw new Cancelled();
        renderer.renderScene(mobjects);
        frame++;
        if (frame % 3 === 0) {
          timeEl.textContent = `t = ${(scene.time ?? frame / FPS).toFixed(2)}s`;
          framesEl.textContent = `frame ${frame}`;
          animEl.textContent = `${mobjects.length} mobject${mobjects.length === 1 ? '' : 's'}`;
        }
        due += 1000 / (FPS * speed);
        while (performance.now() < due) {
          await nextFrame();
          if (my !== runId || disposed) throw new Cancelled();
        }
        // don't try to "catch up" after a stall (tab hidden etc.)
        if (performance.now() - due > 250) due = performance.now();
      };
      playing = true;
      setState('playing');
      playBtn.textContent = '■ Stop';
      try {
        await runConstruct(SceneClass, scene);
        if (my === runId && !disposed) {
          setState('done');
          timeEl.textContent = `t = ${(scene.time ?? frame / FPS).toFixed(2)}s`;
          framesEl.textContent = `frame ${frame}`;
        }
      } catch (e) {
        if (!(e instanceof Cancelled)) {
          showError(e);
          if (my === runId) setState('error');
        }
      } finally {
        if (my === runId && !disposed) {
          playing = false;
          playBtn.textContent = '↻ Replay';
        }
      }
    }

    function stop() {
      runId++;
      playing = false;
      setState('stopped');
      playBtn.textContent = '▶ Play';
    }

    on(playBtn, 'click', () => (playing ? stop() : void run()));
    on(speedIn, 'input', () => {
      speed = Number(speedIn.value);
      speedChip.textContent = `${speed}×`;
      syncUrl();
    });
    speedIn.value = String(speed);
    speedChip.textContent = `${speed}×`;

    on(dlBtn, 'click', async () => {
      if (!lib || !mods || recording) return;
      recording = true;
      dlBtn.disabled = true;
      const label = dlBtn.textContent;
      dlBtn.textContent = '● Recording…';
      try {
        const SceneClass = compile(mods, current.source);
        const blob = await lib.record(SceneClass, { quality: 'medium', background: BG, fps: FPS });
        if (disposed) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${current.id}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        if (!disposed) showError(e);
      } finally {
        recording = false;
        if (!disposed) {
          dlBtn.disabled = false;
          dlBtn.textContent = label;
        }
      }
    });

    select(initial, false);
    setState('loading');

    // Lazy-load the library (it is large) only once the planet is mounted. @johnhenry/math
    // comes along so scenes exported from the Math Observatory can import it.
    Promise.all([import('@johnhenry/ecmanim/browser'), import('@johnhenry/math')])
      .then(([mod, math]) => {
        if (disposed) return;
        lib = mod;
        mods = { [ECM]: mod as unknown as Record<string, unknown>, '@johnhenry/math': math as unknown as Record<string, unknown> };
        loading.remove();
        playBtn.disabled = false;
        const canRecord = typeof MediaRecorder !== 'undefined' &&
          typeof (canvas as any).captureStream === 'function';
        dlBtn.disabled = !canRecord;
        if (!canRecord) dlBtn.title = 'MediaRecorder / captureStream unavailable in this browser';
        void run();
      })
      .catch((e) => {
        if (disposed) return;
        loading.innerHTML = '<span>failed to load ecmanim</span>';
        setState('error');
        showError(e);
      });

    return () => {
      disposed = true;
      runId++;
      for (const off of listeners) off();
      root.remove();
    };
  },
};
export default playground;
