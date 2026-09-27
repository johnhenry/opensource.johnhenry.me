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
/** `/authoring`: formats, plan IR, quality gates — browser-safe (see below). */
type AuthoringLib = typeof import('@johnhenry/ecmanim/authoring');
/** `/studio`: dev-tooling helpers; we only use `schemaToControls`. */
type StudioLib = typeof import('@johnhenry/ecmanim/studio');
/** `/physics/rapier2d|3d`: real WASM rigid-body engines (optional deps). */
type Rapier2DLib = typeof import('@johnhenry/ecmanim/physics/rapier2d');
type Rapier3DLib = typeof import('@johnhenry/ecmanim/physics/rapier3d');
/** `/browser-three`: the GPU (WebGL) backend; lazy-loads `three` itself. */
type ThreeLib = typeof import('@johnhenry/ecmanim/browser-three');

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

/** What a lazily-mounted tab (Authoring/Physics/WebGL) returns: `pause()`
 *  cancels any in-flight render (cooperative — bumps the tab's own `gen`
 *  counter) without tearing the tab's DOM/state down, called whenever the
 *  user switches to a DIFFERENT top-level tab so background tabs don't keep
 *  competing for animation frames forever; `dispose()` is the full cleanup,
 *  called when the whole room unmounts. */
interface TabHandle { pause(): void; dispose(): void }

/**
 * Run a compiled SceneClass/construct on a 2D canvas with real-time pacing and
 * cooperative cancellation. ecmanim's own exported `play()` owns its
 * frameHandler outright and can't be interrupted mid-scene (see browser.js);
 * this reimplements the same loop (Camera → CanvasRenderer → makeScene →
 * runConstruct, exactly what the Stage tab's own run() does below) so
 * switching tabs/presets never leaves a stray render animating against a
 * detached canvas. Also used for ThreeDScene subclasses — that camera is
 * Canvas-2D pseudo-3D (renderer/CanvasRenderer + scene/three_d.ts), no WebGL.
 */
async function runOnCanvas2D(opts: {
  lib: Lib; sceneOrConstruct: any; canvas: HTMLCanvasElement;
  pixelWidth: number; pixelHeight: number; fps: number; background: string;
  isCancelled: () => boolean;
}): Promise<any> {
  const { lib, sceneOrConstruct, canvas, pixelWidth, pixelHeight, fps, background, isCancelled } = opts;
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const ctx = canvas.getContext('2d')!;
  const baseCamera = new lib.Camera({ pixelWidth, pixelHeight, background });
  const scene: any = lib.makeScene(sceneOrConstruct, { fps, camera: baseCamera });
  // ThreeDScene upgrades `camera` to a ThreeDCamera inside its own constructor
  // (scene/three_d.ts) — read it back so ambient rotation etc. mutates the
  // same object this renderer reads, instead of the plain Camera we passed in.
  const camera = scene.camera ?? baseCamera;
  const renderer = new lib.CanvasRenderer(ctx, camera);
  const start = performance.now();
  let frame = 0;
  scene.frameHandler = async (mobjects: any[]) => {
    if (isCancelled()) throw new Cancelled();
    renderer.renderScene(mobjects);
    frame++;
    const target = start + (frame * 1000) / fps;
    while (performance.now() < target) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (isCancelled()) throw new Cancelled();
    }
  };
  await lib.runConstruct(sceneOrConstruct, scene);
  return scene;
}

/** Same idea, GPU-backed via `/browser-three`'s ThreeRenderer (real WebGL). */
async function runOnCanvasGL(opts: {
  lib3: ThreeLib; THREE: any; sceneOrConstruct: any; canvas: HTMLCanvasElement;
  pixelWidth: number; pixelHeight: number; fps: number; background: string;
  isCancelled: () => boolean;
}): Promise<any> {
  const { lib3, THREE, sceneOrConstruct, canvas, pixelWidth, pixelHeight, fps, background, isCancelled } = opts;
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const baseCamera = new (lib3 as any).ThreeDCamera({ pixelWidth, pixelHeight, background });
  const scene: any = lib3.makeScene(sceneOrConstruct, { fps, camera: baseCamera });
  const camera = scene.camera ?? baseCamera;
  const renderer = new (lib3 as any).ThreeRenderer(THREE, { canvas, camera, background, antialias: true });
  const start = performance.now();
  let frame = 0;
  scene.frameHandler = async (mobjects: any[]) => {
    if (isCancelled()) throw new Cancelled();
    renderer.render(mobjects, 1 / fps);
    frame++;
    const target = start + (frame * 1000) / fps;
    while (performance.now() < target) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (isCancelled()) throw new Cancelled();
    }
  };
  await lib3.runConstruct(sceneOrConstruct, scene);
  renderer.dispose?.();
  return scene;
}

/* ================================================================== */
/* Authoring: schema-driven "formats" (explainer, chart-reveal,         */
/* quote-card, title-card), editable via schema-generated controls      */
/* (@johnhenry/ecmanim/studio's real schemaToControls), rendered        */
/* through a render provider we write ourselves — {kind:'render',       */
/* name:'browser', invoke({scene,options}) => ...} — plus a real        */
/* toPlanIR()/runQualityGates() readout beside the canvas.              */
/*                                                                        */
/* CONFIRMED UPSTREAM BUG — worth reading before assuming this should    */
/* just import @johnhenry/ecmanim/authoring directly (the obvious first  */
/* approach, and what this room did until the build below caught it):    */
/* the real `/authoring` subpath ships the real toPlanIR/                */
/* runQualityGates/explainerFormat/chartRevealFormat/quoteCardFormat,    */
/* but its barrel (dist/authoring.js) unconditionally re-exports         */
/* authoring/showrunner.js too (titleCardFormat + the Node-only          */
/* manimRenderProvider live there together). showrunner.js's             */
/* manimRenderProvider.invoke() dynamically imports "../node.js" —       */
/* fine at runtime (never called here), but Rollup must still fully      */
/* BUNDLE that lazy chunk at build time, and node.js statically re-      */
/* exports renderer/fonts-node.js (which calls execFileSync in a way     */
/* Vite's node:* browser stub can't satisfy) and transitively reaches    */
/* the @napi-rs/canvas native .node binary. Both are hard Rollup         */
/* failures. Verified empirically in this room (isolated single-import   */
/* probe builds, before wiring this file up for real):                   */
/*   import('@johnhenry/ecmanim/authoring')  → `vite build` FAILS        */
/*     (dev mode is fine — exactly the dev/prod split this brief         */
/*      warned about). @johnhenry/ecmanim/studio (schemaToControls)      */
/*   and both /physics/rapier2d|3d subpaths build CLEANLY and ARE used   */
/*   for real below and in the Physics tab.                              */
/*                                                                        */
/* Fix: @johnhenry/ecmanim/studio (real, used below) supplies            */
/* schemaToControls; the quality-gate math and the four formats'         */
/* plan()/compose() logic are ported VERBATIM from the installed         */
/* package's real authoring/quality.ts, authoring/plan.ts and            */
/* authoring/formats_builtin.ts / authoring/showrunner.ts sources (read  */
/* in full via the installed .js) — same algorithm, same output shape —  */
/* just reachable without the broken barrel. narration/diagram fields    */
/* are dropped (voiceover.ts pulls in Node TTS providers, and they were  */
/* never exposed as a control here anyway — TTS stays silent everywhere  */
/* in this room, per the brief).                                         */
/* ================================================================== */

/** Real STYLE_PRESETS / ASPECT_RATIO_PRESETS keys (core/presets.ts, confirmed
 *  by reading the installed package) so the pickers below don't need the
 *  module loaded just to enumerate options. */
const STYLE_NAMES = ['3b1b-dark', 'bold-neon', 'clean-corporate', 'light', 'midnight', 'chalkboard', 'print'];
const ASPECT_NAMES = ['16:9', '9:16', '1:1', '4:3', '21:9'];

interface FormatSpec {
  id: string;
  /** The real Format's `.name`, as registered by formats_builtin.ts / showrunner.ts. */
  formatName: string;
  label: string;
  note: string;
  schemaSpec: Record<string, { type: 'string' | 'number' | 'boolean' | 'color' | 'enum'; default?: any; values?: string[]; min?: number; max?: number; description?: string }>;
  jsonField: string | null;
  jsonHint: string;
  jsonDefault: unknown;
}

const FORMAT_SPECS: FormatSpec[] = [
  {
    id: 'explainer', formatName: 'explainer', label: 'Explainer',
    note: "explainerFormat.plan() turns a topic + sections into a title card, per-section beats and an outro; compose() drives a real Scene through the render provider on the right (authoring/formats_builtin.ts).",
    schemaSpec: {
      topic: { type: 'string', default: 'How photosynthesis works', description: 'title/section fallback' },
      title: { type: 'string', default: '' },
      subtitle: { type: 'string', default: 'a two-section explainer' },
      outro: { type: 'string', default: 'Thanks for watching' },
      style: { type: 'enum', values: STYLE_NAMES, default: '3b1b-dark' },
    },
    jsonField: 'sections',
    jsonHint: '[{ "heading": string, "bullets": [string, …], "narration"?: string }]',
    jsonDefault: [
      { heading: 'What is it?', bullets: ['A process plants use', 'Turns light into chemical energy'] },
      { heading: 'Why it matters', bullets: ['Produces the oxygen we breathe', 'The base of almost every food chain'] },
    ],
  },
  {
    id: 'chart-reveal', formatName: 'chart-reveal', label: 'Chart Reveal',
    note: "chartRevealFormat grows bars from a baseline, staggered, with value labels — the data below flows straight into plan() and back out through the same compose()/render-provider path.",
    schemaSpec: {
      title: { type: 'string', default: 'Weekly signups' },
      unit: { type: 'string', default: '' },
      color: { type: 'color', default: '#58c4dd' },
      style: { type: 'enum', values: STYLE_NAMES, default: '3b1b-dark' },
      holdSeconds: { type: 'number', default: 2, min: 0, max: 6 },
    },
    jsonField: 'data',
    jsonHint: '[{ "label": string, "value": number }]',
    jsonDefault: [
      { label: 'Mon', value: 12 }, { label: 'Tue', value: 19 }, { label: 'Wed', value: 7 },
      { label: 'Thu', value: 24 }, { label: 'Fri', value: 31 },
    ],
  },
  {
    id: 'quote-card', formatName: 'quote-card', label: 'Quote Card',
    note: "quoteCardFormat renders any aspect preset; the render provider below resolves aspectRatio → real pixel dimensions with resolveAspectRatio() (core/presets.ts) before playing.",
    schemaSpec: {
      quote: { type: 'string', default: 'Programs must be written for people to read, and only incidentally for machines to execute.' },
      attribution: { type: 'string', default: 'Harold Abelson' },
      aspectRatio: { type: 'enum', values: ASPECT_NAMES, default: '1:1' },
      style: { type: 'enum', values: STYLE_NAMES, default: '3b1b-dark' },
      holdSeconds: { type: 'number', default: 2.5, min: 0, max: 6 },
    },
    jsonField: null, jsonHint: '', jsonDefault: null,
  },
  {
    id: 'title-card', formatName: 'title-card', label: 'Title Card',
    note: "titleCardFormat lives in authoring/showrunner.ts — the same module that defines the Node-only manimRenderProvider — as a minimal plan → compose → revise example format.",
    schemaSpec: {
      topic: { type: 'string', default: 'Ecmanim Studio' },
      title: { type: 'string', default: '' },
      style: { type: 'enum', values: STYLE_NAMES, default: '3b1b-dark' },
    },
    jsonField: 'bullets',
    jsonHint: '[string, string, …]',
    jsonDefault: ['Real Scene code', 'Runs in Node and the browser', 'Physics, WebGL, and schema-driven authoring'],
  },
];

/* ---- local port of authoring/quality.ts (verbatim logic) ---- */
interface QualityContext { fps: number; width: number; height: number; durationSeconds: number; segments: Array<{ kind: string; startFrame: number; endFrame: number }>; motionFraction?: number; promise?: string }
interface QualityGateResult { gate: string; ok: boolean; message: string; severity: string }
interface QualityReport { ok: boolean; slideshowRisk: number; results: QualityGateResult[] }

function slideshowRiskOf(ctx: QualityContext): number {
  const total = ctx.segments.reduce((s, seg) => s + (seg.endFrame - seg.startFrame), 0) || 1;
  const waitFrames = ctx.segments.filter((s) => s.kind === 'wait').reduce((s, seg) => s + (seg.endFrame - seg.startFrame), 0);
  const waitRatio = waitFrames / total;
  if (ctx.motionFraction != null) return Math.max(0, Math.min(1, 0.6 * (1 - ctx.motionFraction) + 0.4 * waitRatio));
  return Math.max(0, Math.min(1, waitRatio));
}
function checkDeliveryPromiseOf(ctx: QualityContext): { ok: boolean; message: string } {
  const risk = slideshowRiskOf(ctx);
  if (ctx.promise === 'motion-led' || ctx.promise === 'animated') {
    if (risk > 0.6) return { ok: false, message: `promised "${ctx.promise}" but slideshow-risk is ${risk.toFixed(2)} (mostly static)` };
  }
  if (ctx.promise === 'static' && risk < 0.2) return { ok: false, message: `promised "static" but the output is quite animated (risk ${risk.toFixed(2)})` };
  return { ok: true, message: `delivery-promise "${ctx.promise ?? 'none'}" satisfied (risk ${risk.toFixed(2)})` };
}
const QUALITY_GATES: Array<{ name: string; check: (c: QualityContext) => { ok: boolean; message: string; severity: 'warn' | 'error' } }> = [
  { name: 'min_fps', check: (c) => ({ ok: c.fps >= 12, message: `fps ${c.fps} (>= 12)`, severity: 'warn' }) },
  { name: 'even_dimensions', check: (c) => ({ ok: c.width % 2 === 0 && c.height % 2 === 0, message: `dims ${c.width}x${c.height} even`, severity: 'error' }) },
  { name: 'nonempty', check: (c) => ({ ok: c.durationSeconds > 0 && c.segments.length > 0, message: `has ${c.segments.length} segments`, severity: 'error' }) },
  { name: 'slideshow_risk', check: (c) => { const r = slideshowRiskOf(c); return { ok: r <= 0.8, message: `slideshow-risk ${r.toFixed(2)} (<= 0.8)`, severity: 'warn' }; } },
  { name: 'delivery_promise', check: (c) => { const d = checkDeliveryPromiseOf(c); return { ok: d.ok, message: d.message, severity: 'warn' }; } },
];
function runQualityGatesLocal(ctx: QualityContext): QualityReport {
  const results = QUALITY_GATES.map((g) => { const r = g.check(ctx); return { gate: g.name, ok: r.ok, message: r.message, severity: r.severity }; });
  const ok = results.every((r) => r.ok || r.severity !== 'error');
  return { ok, slideshowRisk: slideshowRiskOf(ctx), results };
}

/** Local port of authoring/plan.ts's toPlanIR(): dry-run sceneOrConstruct with
 *  a no-op frameHandler (no pixels rendered) and harvest its real segment/
 *  section bookkeeping, exactly like the original — just built on the
 *  already-loaded `@johnhenry/ecmanim/browser` Scene instead of a second
 *  dynamic import of scene/Scene.js. */
async function toPlanIRLocal(lib: Lib, sceneOrConstruct: any, options: { fps?: number; width?: number; height?: number; style?: string; aspectRatio?: string } = {}) {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const SceneCtor: any = (lib as any).Scene;
  const isSceneClass = sceneOrConstruct?.prototype instanceof SceneCtor;
  const scene: any = isSceneClass ? new sceneOrConstruct({ fps }) : new SceneCtor({ fps });
  scene.fps = fps;
  scene.frameHandler = async () => {};
  scene.onSegment = () => ({ skip: true });
  if (isSceneClass) await scene.render();
  else if (typeof sceneOrConstruct === 'function') { await sceneOrConstruct(scene); scene.finalizeSections(); }
  else await scene.render();
  const segments = (scene.playRecords ?? []).map((r: any) => ({ index: r.index, kind: r.kind, startFrame: r.startFrame, endFrame: r.endFrame, hash: r.hash }));
  const estimatedFrames = scene.frameCount ?? (segments.length ? segments[segments.length - 1].endFrame : 0);
  const durationSeconds = estimatedFrames / fps;
  const chapters = (scene.sections ?? []).map((s: any) => ({ name: s.name, startFrame: s.startFrame, endFrame: s.endFrame }));
  const quality = runQualityGatesLocal({
    fps, width, height, durationSeconds,
    segments: segments.map((s: any) => ({ kind: s.kind, startFrame: s.startFrame, endFrame: s.endFrame })),
  });
  return {
    version: '1', scene: { name: sceneOrConstruct?.name },
    config: { fps, width, height, style: options.style, aspectRatio: options.aspectRatio },
    segments, chapters, estimatedFrames, durationSeconds, quality,
  };
}

/** Word-wrap (identical to formats_builtin.ts's private `wrap()`). */
function wrapText(text: string, width = 38): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > width) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

/** Local Format shape, matching authoring/formats.ts's real `Format` interface
 *  minus `generateAssets`/`revise` (unused by any of the four ports below). */
interface LocalFormat {
  name: string;
  plan(ctx: { topic?: string; params?: Record<string, any> }): any;
  compose(plan: any, lib: Lib, provider: { invoke(input: { scene: any; options?: Record<string, any> }): Promise<any> }): Promise<any>;
}

/** Ported from authoring/formats_builtin.ts's `explainerFormat` (LLM expansion
 *  and narration/diagram branches dropped — not exposed as controls here). */
const explainerFormatLocal: LocalFormat = {
  name: 'explainer',
  plan(ctx) {
    const p = ctx.params ?? {};
    const sections = p.sections?.length ? p.sections : [{ heading: ctx.topic ?? 'Overview', bullets: ['(no sections given)'] }];
    return { title: p.title || ctx.topic || 'Untitled', subtitle: p.subtitle, sections, outro: p.outro, style: p.style ?? '3b1b-dark' };
  },
  async compose(plan, lib, provider) {
    const build = async (scene: any) => {
      const idx: any = lib;
      const title = new idx.Text(wrapText(plan.title, 26), { fontSize: 0.85, point: [0, 0.6, 0], color: '#FFD700' });
      const sub = plan.subtitle ? new idx.Text(wrapText(plan.subtitle, 40), { fontSize: 0.42, point: [0, -0.5, 0], color: '#DDDDDD' }) : null;
      scene.nextSection('title');
      await scene.play(new idx.Write(title), { runTime: 1 });
      if (sub) await scene.play(new idx.FadeIn(sub, { shift: [0, 0.3, 0] }), { runTime: 0.5 });
      await scene.wait(0.8);
      await scene.play(new idx.FadeOut(new idx.VGroup(...[title, sub].filter((m: any) => m != null))), { runTime: 0.5 });
      for (const [i, sec] of plan.sections.entries() as any) {
        scene.nextSection(sec.heading || `section-${i + 1}`);
        const heading = new idx.Text(wrapText(sec.heading, 30), { fontSize: 0.6, point: [0, 2.6, 0], color: '#58C4DD' });
        const items = (sec.bullets ?? []).map((b: string, j: number) => {
          const t = new idx.Text('• ' + wrapText(b, 44), { fontSize: 0.4, point: [0, 1.4 - j * 0.75, 0], align: 'left' });
          t.shift([-5.6 - t.getBoundaryPoint([-1, 0, 0])[0], 0, 0]);
          return t;
        });
        await scene.play(new idx.Write(heading), { runTime: 0.6 });
        for (const item of items) await scene.play(new idx.FadeIn(item, { shift: [0.4, 0, 0] }), { runTime: 0.35 });
        await scene.wait(sec.holdSeconds ?? 2.5);
        await scene.play(new idx.FadeOut(new idx.VGroup(heading, ...items)), { runTime: 0.4 });
      }
      if (plan.outro) {
        scene.nextSection('outro');
        const out = new idx.Text(wrapText(plan.outro, 34), { fontSize: 0.55, color: '#FFD700' });
        await scene.play(new idx.FadeIn(out, { scale: 1.15 }), { runTime: 0.7 });
        await scene.wait(1.2);
        await scene.play(new idx.FadeOut(out), { runTime: 0.4 });
      }
    };
    return provider.invoke({ scene: build, options: { style: plan.style } });
  },
};

/** Ported from authoring/formats_builtin.ts's `chartRevealFormat`. */
const chartRevealFormatLocal: LocalFormat = {
  name: 'chart-reveal',
  plan(ctx) {
    const p = ctx.params ?? {};
    const data = p.data ?? [];
    if (!data.length) throw new Error('chart-reveal: params.data ([{label, value}, ...]) is required');
    for (const d of data) if (typeof d.value !== 'number' || !Number.isFinite(d.value) || d.value < 0) throw new Error(`chart-reveal: bad value for "${d.label}" (need a finite number >= 0)`);
    return { title: p.title ?? ctx.topic ?? '', data, unit: p.unit, color: p.color || '#58C4DD', style: p.style ?? '3b1b-dark', holdSeconds: p.holdSeconds ?? 2 };
  },
  async compose(plan, lib, provider) {
    const build = async (scene: any) => {
      const idx: any = lib;
      const n = plan.data.length;
      const maxV = Math.max(...plan.data.map((d: any) => d.value), 1e-9);
      const chartW = Math.min(10, n * 1.7);
      const barW = (chartW / n) * 0.62;
      const maxH = 4, baseY = -2.2;
      const x = (i: number) => -chartW / 2 + (i + 0.5) * (chartW / n);
      scene.nextSection('chart');
      if (plan.title) {
        const t = new idx.Text(wrapText(plan.title, 34), { fontSize: 0.55, point: [0, 3.1, 0], color: '#FFD700' });
        await scene.play(new idx.Write(t), { runTime: 0.6 });
      }
      const baseline = new idx.Line([-chartW / 2 - 0.4, baseY, 0], [chartW / 2 + 0.4, baseY, 0], { color: '#888888' });
      await scene.play(new idx.Create(baseline), { runTime: 0.4 });
      for (const [i, d] of plan.data.entries() as any) {
        const h = (d.value / maxV) * maxH;
        const bar = new idx.Rectangle({ width: barW, height: Math.max(h, 1e-3), color: plan.color, fillColor: plan.color, fillOpacity: 0.75, strokeWidth: 2 });
        bar.moveTo([x(i), baseY + h / 2, 0]);
        const label = new idx.Text(wrapText(d.label, 12), { fontSize: 0.32, point: [x(i), baseY - 0.45, 0] });
        const value = new idx.Text(`${d.value}${plan.unit ?? ''}`, { fontSize: 0.34, point: [x(i), baseY + h + 0.35, 0], color: plan.color });
        scene.add(label);
        await scene.play(new idx.GrowFromEdge(bar, [0, -1, 0]), { runTime: 0.45 });
        await scene.play(new idx.FadeIn(value, { shift: [0, 0.15, 0] }), { runTime: 0.25 });
      }
      await scene.wait(plan.holdSeconds);
    };
    return provider.invoke({ scene: build, options: { style: plan.style } });
  },
};

/** Ported from authoring/formats_builtin.ts's `quoteCardFormat`. */
const quoteCardFormatLocal: LocalFormat = {
  name: 'quote-card',
  plan(ctx) {
    const p = ctx.params ?? {};
    const quote = p.quote || ctx.topic;
    if (!quote) throw new Error('quote-card: params.quote (or a topic) is required');
    return { quote, attribution: p.attribution, aspectRatio: p.aspectRatio ?? '1:1', style: p.style ?? '3b1b-dark', holdSeconds: p.holdSeconds ?? 2.5 };
  },
  async compose(plan, lib, provider) {
    const narrow = plan.aspectRatio === '9:16';
    const build = async (scene: any) => {
      const idx: any = lib;
      scene.nextSection('quote');
      const q = new idx.Text(`“${wrapText(plan.quote, narrow ? 20 : 30)}”`, { fontSize: narrow ? 0.5 : 0.6, point: [0, 0.4, 0], color: '#FFFFFF' });
      await scene.play(new idx.Write(q), { runTime: Math.min(2.4, 0.05 * plan.quote.length + 0.8) });
      if (plan.attribution) {
        const a = new idx.Text('— ' + plan.attribution, { fontSize: narrow ? 0.36 : 0.4, point: [0, -(q.getHeight?.() ?? 1.5) / 2 - 0.9, 0], color: '#58C4DD' });
        await scene.play(new idx.FadeIn(a, { shift: [0, 0.25, 0] }), { runTime: 0.5 });
      }
      await scene.wait(plan.holdSeconds);
    };
    return provider.invoke({ scene: build, options: { aspectRatio: plan.aspectRatio, style: plan.style } });
  },
};

/** Ported from authoring/showrunner.ts's `titleCardFormat`. */
const titleCardFormatLocal: LocalFormat = {
  name: 'title-card',
  plan(ctx) {
    const title = ctx.params?.title || ctx.topic || 'Untitled';
    const bullets = ctx.params?.bullets?.length ? ctx.params.bullets : ['Point one', 'Point two', 'Point three'];
    return { title, bullets, style: ctx.params?.style ?? '3b1b-dark' };
  },
  async compose(plan, lib, provider) {
    const build = async (scene: any) => {
      const idx: any = lib;
      const title = new idx.Text(plan.title, { fontSize: 0.9, point: [0, 2.4, 0], color: '#FFD700' });
      scene.add(title);
      await scene.play(new idx.Write(title), { runTime: 0.6 });
      plan.bullets.forEach((b: string, i: number) => {
        const t = new idx.Text('• ' + b, { fontSize: 0.5, point: [-3, 0.8 - i * 0.9, 0], align: 'left' });
        scene.add(t);
      });
      await scene.wait(0.6);
    };
    return provider.invoke({ scene: build, options: { style: plan.style } });
  },
};

const LOCAL_FORMATS: Record<string, LocalFormat> = {
  explainer: explainerFormatLocal, 'chart-reveal': chartRevealFormatLocal,
  'quote-card': quoteCardFormatLocal, 'title-card': titleCardFormatLocal,
};

/** Mirrors the real authoring/formats.ts's `runFormat()`: plan() → compose(). */
async function runFormatLocal(
  format: LocalFormat, ctx: { topic?: string; params?: Record<string, any> }, lib: Lib,
  provider: { invoke(input: { scene: any; options?: Record<string, any> }): Promise<any> },
) {
  const plan = await format.plan(ctx);
  const output = await format.compose(plan, lib, provider);
  return { plan, output };
}

/** Build a browser-only `render` Provider ({kind:'render', name, invoke}) that
 *  drives the cancel-aware canvas loop above, and captures a `toPlanIRLocal()`
 *  dry-run — which bundles `runQualityGatesLocal()` / `slideshowRiskOf()` into
 *  its `.quality` field — before actually rendering. Matches the real Provider
 *  shape from authoring/formats.ts: `{ kind: "render", name, available?(),
 *  invoke(input, opts?) }`. */
function makeBrowserRenderProvider(opts: {
  lib: Lib; canvas: HTMLCanvasElement; isCancelled: () => boolean; onPlan: (ir: any) => void;
}) {
  const { lib, canvas, isCancelled, onPlan } = opts;
  return {
    kind: 'render' as const,
    name: 'browser',
    available: () => true,
    async invoke(input: { scene: any; options?: Record<string, any> }) {
      const o: Record<string, any> = { ...(input.options ?? {}) };
      let pixelWidth: number | undefined = o.pixelWidth;
      let pixelHeight: number | undefined = o.pixelHeight;
      if (o.aspectRatio) {
        const ar = (lib as any).resolveAspectRatio(o.aspectRatio, pixelHeight);
        if (ar) { pixelWidth = ar.pixelWidth; pixelHeight = ar.pixelHeight; }
      }
      pixelWidth = pixelWidth || 1280;
      pixelHeight = pixelHeight || 720;
      // Cap render resolution so a live in-page demo stays real-time (formats
      // default to up to 1920x1080+); keep dimensions even (a quality gate).
      const scale = Math.min(1, 900 / Math.max(pixelWidth, pixelHeight));
      pixelWidth = Math.max(2, Math.round((pixelWidth * scale) / 2) * 2);
      pixelHeight = Math.max(2, Math.round((pixelHeight * scale) / 2) * 2);
      const fps = o.fps ?? 30;

      const planIR = await toPlanIRLocal(lib, input.scene, {
        fps, width: pixelWidth, height: pixelHeight, style: o.style, aspectRatio: o.aspectRatio,
      });
      onPlan(planIR);
      if (isCancelled()) throw new Cancelled();

      await runOnCanvas2D({
        lib, sceneOrConstruct: input.scene, canvas, pixelWidth, pixelHeight, fps,
        background: o.background ?? BG, isCancelled,
      });
      return { canvas };
    },
  };
}

/** Render PropControl[] (from studio's schemaToControls) as real inputs. */
function renderControls(el: HTMLElement, controls: any[], values: Record<string, any>, onChange: () => void) {
  el.innerHTML = '';
  for (const c of controls) {
    if (!(c.name in values) || values[c.name] === undefined) values[c.name] = c.default;
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const span = document.createElement('span');
    span.textContent = c.label ?? c.name;
    wrap.appendChild(span);
    let input: HTMLInputElement | HTMLSelectElement;
    if (c.control === 'select') {
      const sel = document.createElement('select');
      for (const opt of c.options ?? []) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        sel.appendChild(o);
      }
      sel.value = String(values[c.name] ?? '');
      input = sel;
    } else if (c.control === 'checkbox') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!values[c.name];
      input = cb;
    } else {
      const inp = document.createElement('input');
      inp.type = c.control === 'number' ? 'number' : c.control === 'color' ? 'color' : 'text';
      if (c.min != null) inp.min = String(c.min);
      if (c.max != null) inp.max = String(c.max);
      inp.value = String(values[c.name] ?? '');
      input = inp;
    }
    input.addEventListener('input', () => {
      values[c.name] = c.control === 'checkbox' ? (input as HTMLInputElement).checked
        : c.control === 'number' ? Number((input as HTMLInputElement).value)
        : input.value;
      onChange();
    });
    wrap.appendChild(input);
    if (c.description) {
      const hint = document.createElement('small');
      hint.className = 'em-field-hint';
      hint.textContent = c.description;
      wrap.appendChild(hint);
    }
    el.appendChild(wrap);
  }
}

/** Render a PlanIR (toPlanIR's output; `.quality` is a real runQualityGates() report). */
function renderPlanPanel(el: HTMLElement, ir: any | null) {
  if (!ir) {
    el.innerHTML = `<p class="em-note">Render once to see the real plan IR and quality gates.</p>`;
    return;
  }
  const q = ir.quality ?? { ok: false, slideshowRisk: 0, results: [] };
  const riskPct = Math.round((q.slideshowRisk ?? 0) * 100);
  el.innerHTML = `
    <div class="em-plan-stats">
      <span class="stat"><b>${ir.segments.length}</b> segments</span>
      <span class="stat"><b>${ir.chapters.length}</b> chapters</span>
      <span class="stat"><b>${ir.estimatedFrames}</b> frames</span>
      <span class="stat"><b>${ir.durationSeconds.toFixed(2)}</b>s @ ${ir.config.fps}fps</span>
      <span class="stat"><b>${ir.config.width}×${ir.config.height}</b></span>
      <span class="chip ${q.ok ? 'em-ok' : 'em-fail'}">${q.ok ? 'quality gates pass' : 'quality gates fail'}</span>
      <span class="chip">slideshow-risk ${riskPct}%</span>
    </div>
    <ul class="em-gate-list">
      ${q.results.map((r: any) => `<li class="em-gate ${r.ok ? 'ok' : 'fail'}"><b>${escapeHtml(r.gate)}</b><span>${escapeHtml(r.message)}</span></li>`).join('')}
    </ul>`;
}

/** Mount the Authoring tab into `container`; returns a cleanup fn. */
function mountAuthoringTab(container: HTMLElement, initialId: string, onFormatChange: (id: string) => void): TabHandle {
  container.innerHTML = `
    <div class="em-auth">
      <div class="em-picker em-auth-picker" role="tablist"></div>
      <div class="em-auth-body">
        <div class="em-auth-form panel">
          <p class="em-note em-auth-note"></p>
          <div class="em-auth-controls"></div>
          <label class="field em-auth-json" hidden>
            <span class="em-auth-json-label"></span>
            <textarea class="code em-auth-json-input" rows="6" spellcheck="false"></textarea>
          </label>
          <div class="em-auth-actions">
            <button class="btn primary em-auth-render" disabled>▶ Render</button>
            <span class="chip em-auth-state">idle</span>
          </div>
          <pre class="code em-err em-auth-err" hidden></pre>
        </div>
        <div class="em-stage">
          <div class="em-canvas-wrap em-auth-canvas-wrap">
            <canvas width="900" height="900"></canvas>
            <div class="em-loading"><div class="em-spinner"></div><span>loading @johnhenry/ecmanim/authoring…</span></div>
          </div>
          <div class="panel em-auth-plan">
            <p class="em-note">Render once to see the real plan IR and quality gates.</p>
          </div>
        </div>
      </div>
    </div>`;

  const $ = <T extends Element>(s: string) => container.querySelector(s) as T;
  const picker = $<HTMLDivElement>('.em-auth-picker');
  const noteEl = $<HTMLParagraphElement>('.em-auth-note');
  const controlsEl = $<HTMLDivElement>('.em-auth-controls');
  const jsonWrap = $<HTMLLabelElement>('.em-auth-json');
  const jsonLabel = $<HTMLSpanElement>('.em-auth-json-label');
  const jsonInput = $<HTMLTextAreaElement>('.em-auth-json-input');
  const renderBtn = $<HTMLButtonElement>('.em-auth-render');
  const stateChip = $<HTMLSpanElement>('.em-auth-state');
  const errEl = $<HTMLPreElement>('.em-auth-err');
  const loading = $<HTMLDivElement>('.em-loading');
  const canvas = $<HTMLCanvasElement>('canvas');
  const planEl = $<HTMLDivElement>('.em-auth-plan');

  let disposed = false;
  let lib: Lib | null = null;
  let studioLib: StudioLib | null = null;
  let current = FORMAT_SPECS.find((f) => f.id === initialId) ?? FORMAT_SPECS[0];
  let gen = 0; // bump to cancel an in-flight render
  const values = new Map<string, Record<string, any>>();
  const jsonValues = new Map<string, string>();
  const listeners: Array<() => void> = [];
  const on = (el: EventTarget, ev: string, fn: EventListener) => { el.addEventListener(ev, fn); listeners.push(() => el.removeEventListener(ev, fn)); };

  const ctx0 = canvas.getContext('2d')!;
  ctx0.fillStyle = BG; ctx0.fillRect(0, 0, canvas.width, canvas.height);

  function showErr(e: unknown) {
    errEl.hidden = false;
    errEl.textContent = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  for (const f of FORMAT_SPECS) {
    const b = document.createElement('button');
    b.className = 'em-tab';
    b.textContent = f.label;
    b.dataset.id = f.id;
    on(b, 'click', () => select(f));
    picker.appendChild(b);
  }

  function select(f: FormatSpec) {
    current = f;
    onFormatChange(f.id);
    picker.querySelectorAll<HTMLButtonElement>('.em-tab').forEach((b) => b.classList.toggle('active', b.dataset.id === f.id));
    noteEl.textContent = f.note;
    errEl.hidden = true;
    if (!values.has(f.id)) {
      const v: Record<string, any> = {};
      for (const [k, spec] of Object.entries(f.schemaSpec)) v[k] = spec.default;
      values.set(f.id, v);
    }
    if (f.jsonField) {
      if (!jsonValues.has(f.id)) jsonValues.set(f.id, JSON.stringify(f.jsonDefault, null, 2));
      jsonWrap.hidden = false;
      jsonLabel.textContent = `${f.jsonField}  ${f.jsonHint}`;
      jsonInput.value = jsonValues.get(f.id) ?? '';
    } else {
      jsonWrap.hidden = true;
    }
    renderFormControls();
  }

  function renderFormControls() {
    if (!studioLib || !lib) return;
    const schema = (lib as any).defineSchema(current.schemaSpec);
    const controls = studioLib.schemaToControls(schema);
    renderControls(controlsEl, controls, values.get(current.id)!, () => {});
  }

  select(current);
  on(jsonInput, 'input', () => jsonValues.set(current.id, jsonInput.value));

  async function runCurrent() {
    if (!lib || disposed) return;
    gen++;
    const myGen = gen;
    errEl.hidden = true;
    renderBtn.disabled = true;
    stateChip.textContent = 'rendering…';
    try {
      const v = values.get(current.id) ?? {};
      const params: Record<string, any> = { ...v };
      const topic = v.topic ?? '';
      if (current.jsonField) {
        try {
          params[current.jsonField] = JSON.parse(jsonInput.value);
        } catch (e) {
          throw new Error(`${current.jsonField}: invalid JSON — ${e instanceof Error ? e.message : e}`);
        }
      }
      const format = LOCAL_FORMATS[current.formatName];
      if (!format) throw new Error(`Format "${current.formatName}" is not registered`);
      // TTS must always stay silent in the browser (no browser voiceover
      // provider exists upstream yet) — force it regardless of any control.
      const provider = makeBrowserRenderProvider({
        lib, canvas,
        isCancelled: () => disposed || gen !== myGen,
        onPlan: (ir) => { if (!disposed && gen === myGen) renderPlanPanel(planEl, ir); },
      });
      await runFormatLocal(format, { topic, params: { ...params, tts: 'silent' } }, lib, provider);
      if (gen === myGen && !disposed) stateChip.textContent = 'done';
    } catch (e) {
      if (!(e instanceof Cancelled) && gen === myGen && !disposed) {
        showErr(e);
        stateChip.textContent = 'error';
      }
    } finally {
      if (!disposed && gen === myGen) renderBtn.disabled = false;
    }
  }
  on(renderBtn, 'click', () => void runCurrent());

  Promise.all([
    import('@johnhenry/ecmanim/browser'),
    import('@johnhenry/ecmanim/studio'),
  ]).then(([m, s]) => {
    if (disposed) return;
    lib = m; studioLib = s;
    loading.remove();
    renderBtn.disabled = false;
    renderFormControls();
    void runCurrent();
  }).catch((e) => {
    if (disposed) return;
    loading.innerHTML = '<span>failed to load @johnhenry/ecmanim/browser or /studio</span>';
    showErr(e);
  });

  return {
    pause() { gen++; },
    dispose() {
      disposed = true;
      gen++;
      for (const off of listeners) off();
    },
  };
}

/* ================================================================== */
/* Physics: real WASM rigid bodies via /physics/rapier2d|3d (optional   */
/* deps of ecmanim, lazily loaded only when this tab needs them) plus   */
/* the built-in, dependency-free Pendulum / ElectricField / StandingWave*/
/* mobjects. Presets are source strings compiled by the same compile()  */
/* used for the Stage tab's PRESETS — what you read is what runs.       */
/* ================================================================== */

interface PhysicsPreset { id: string; name: string; note: string; source: string; mod: 'rapier2d' | 'rapier3d' | null }

const PHYSICS_PRESETS: PhysicsPreset[] = [
  {
    id: 'rapier2d', name: 'Rapier 2D — bouncing balls', mod: 'rapier2d',
    note: "rapier2d(scene, opts) awaits RAPIER.init() (WASM) then builds a World and attaches an invisible carrier mobject that calls engine.step(dt) every frame; addBody() reads each mobject's live position/shape.",
    source: `import { Scene, Dot, Line, Text, Create, Write, FadeOut, Group,
  TEAL, PINK, GOLD, RED, BLUE_E } from "@johnhenry/ecmanim/browser";
import { rapier2d } from "@johnhenry/ecmanim/physics/rapier2d";

class Rapier2DBalls extends Scene {
  async construct() {
    const title = new Text("Rapier2D — real WASM rigid bodies", { fontSize: 0.5, color: GOLD });
    title.moveTo([0, 3.35, 0]);
    const ground = new Line([-6.4, -3, 0], [6.4, -3, 0], { color: "#666666", strokeWidth: 4 });
    await this.play(new Write(title), new Create(ground), { runTime: 0.8 });

    // await-ed: RAPIER.init() (real WASM) runs inside rapier2d() before this resolves.
    const engine = await rapier2d(this, { gravity: [0, -9.8, 0], floor: -3, restitution: 0.5 });

    const colors = [TEAL, PINK, GOLD, RED, BLUE_E];
    const balls = colors.map((color, i) =>
      new Dot({ point: [-4.8 + i * 2.4, 2.2 + (i % 3) * 1.1, 0], radius: 0.34, color }));
    this.add(...balls);
    balls.forEach((b, i) => engine.addBody(b, { restitution: 0.4 + i * 0.12, angularVelocity: i - 2 }));

    await this.wait(6); // every frame: engine.step(dt) reads Rapier's World and shifts each Dot
    await this.play(new FadeOut(new Group(title, ground, ...balls)));
  }
}`,
  },
  {
    id: 'rapier3d', name: 'Rapier 3D — falling boxes', mod: 'rapier3d',
    note: "Rapier3DEngine mirrors the 2D adapter exactly (World.createRigidBody/createCollider) but syncs a quaternion; rendered through ThreeDScene's Canvas-2D pseudo-3D camera — no WebGL/three here, that's the WebGL tab.",
    source: `import { ThreeDScene, Box, Text, DEGREES, Write, FadeOut, Group,
  GOLD, TEAL, PINK, RED, BLUE_E } from "@johnhenry/ecmanim/browser";
import { rapier3d } from "@johnhenry/ecmanim/physics/rapier3d";

class Rapier3DBoxes extends ThreeDScene {
  async construct() {
    this.setCameraOrientation({ phi: 65 * DEGREES, theta: -50 * DEGREES, focalDistance: 12 });
    const title = new Text("Rapier3D — real WASM, quaternion sync", { fontSize: 0.45, color: GOLD });
    this.addFixedInFrameMobjects(title);
    title.moveTo([0, 3.3, 0]);
    this.add(title);

    const floor = new Box({ dimensions: [7, 0.2, 7], color: "#444444", fillOpacity: 0.5 });
    floor.moveTo([0, -2.6, 0]);
    this.add(floor);

    const engine = await rapier3d(this, { gravity: [0, -9.8, 0], floor: -2.5, restitution: 0.35 });
    const colors = [TEAL, PINK, GOLD, RED, BLUE_E];
    const boxes = colors.map((color) => new Box({ dimensions: [0.7, 0.7, 0.7], color, fillOpacity: 0.85 }));
    boxes.forEach((b, i) => b.moveTo([(i - 2) * 1.1, 1.5 + i * 1.1, (i % 2) * 0.6 - 0.3]));
    this.add(...boxes);
    boxes.forEach((b, i) => engine.addBody(b, { restitution: 0.3, angularVelocity: [i - 2, 1, i - 2] }));

    this.beginAmbientCameraRotation({ rate: 0.12 });
    await this.wait(6);
    this.stopAmbientCameraRotation();
    await this.play(new FadeOut(new Group(title, floor, ...boxes)));
  }
}`,
  },
  {
    id: 'pendulum', name: 'Pendulum', mod: null,
    note: "Pendulum integrates θ'' = -(g/L)·sinθ inside its own addUpdater — no engine object at all, just a mobject that steps itself every frame (physics/rigid.ts).",
    source: `import { Scene, Pendulum, Line, Text, alwaysRedraw, Write, Create,
  FadeOut, Group, GOLD, TEAL, PINK } from "@johnhenry/ecmanim/browser";

class PendulumDemo extends Scene {
  async construct() {
    const title = new Text("Pendulum — real-time integration", { fontSize: 0.46, color: GOLD });
    title.moveTo([0, 3.3, 0]);
    const ceiling = new Line([-4, 2, 0], [4, 2, 0], { color: "#666666", strokeWidth: 4 });
    await this.play(new Write(title), new Create(ceiling), { runTime: 0.8 });

    const pendulums = [
      new Pendulum({ length: 2.2, initialAngle: 0.9, pivot: [-2.2, 2, 0], color: TEAL }),
      new Pendulum({ length: 1.4, initialAngle: -1.2, pivot: [2.2, 2, 0], color: PINK }),
    ];
    this.add(...pendulums);

    const readout = alwaysRedraw(() => {
      const e = pendulums.map((p) => p.energy().toFixed(2)).join("  /  ");
      const t = new Text("energy: " + e, { fontSize: 0.34, color: "#dddddd" });
      t.moveTo([0, -3.3, 0]);
      return t;
    });
    this.add(readout);

    await this.wait(8);
    readout.clearUpdaters();
    for (const p of pendulums) p.clearUpdaters();
    await this.play(new FadeOut(new Group(title, ceiling, readout, ...pendulums)));
  }
}`,
  },
  {
    id: 'electric-field', name: 'Electric field', mod: null,
    note: "ElectricField extends ArrowVectorField over electricFieldFunc(charges) — a real Coulomb summation, sampled on a grid (physics/fields.ts). No time integration here; the interest is the field shape itself.",
    source: `import { Scene, ElectricField, electricFieldFunc, Dot, Text, Create,
  Write, FadeIn, FadeOut, Group, GOLD, RED, BLUE_E, TEAL } from "@johnhenry/ecmanim/browser";

class ElectricFieldDemo extends Scene {
  async construct() {
    const title = new Text("Electric field — a dipole (+ / -)", { fontSize: 0.45, color: GOLD });
    title.moveTo([0, 3.4, 0]);
    await this.play(new Write(title), { runTime: 0.8 });

    const charges = [
      { position: [-2, 0, 0], magnitude: 1 },
      { position: [2, 0, 0], magnitude: -1 },
    ];
    const field = new ElectricField(charges, {
      xRange: [-4.5, 4.5, 0.6], yRange: [-3, 3, 0.6],
      minColor: BLUE_E, maxColor: RED, strokeWidth: 2.5,
    });
    await this.play(new Create(field), { runTime: 1.6 });

    const markers = charges.map((c) => new Dot({ point: c.position, radius: 0.18, color: c.magnitude > 0 ? RED : BLUE_E }));
    await this.play(new FadeIn(new Group(...markers)), { runTime: 0.4 });

    const probe = [0.8, 1.3];
    const E = electricFieldFunc(charges)([probe[0], probe[1], 0]);
    const mag = Math.hypot(E[0], E[1]);
    const readout = new Text("|E| at (" + probe[0] + ", " + probe[1] + ") = " + mag.toFixed(3), { fontSize: 0.34, color: TEAL });
    readout.moveTo([0, -3.4, 0]);
    const probeDot = new Dot({ point: [probe[0], probe[1], 0], radius: 0.1, color: "#ffffff" });
    await this.play(new FadeIn(probeDot), new Write(readout), { runTime: 0.6 });

    await this.wait(2);
    await this.play(new FadeOut(new Group(title, field, ...markers, probeDot, readout)));
  }
}`,
  },
  {
    id: 'standing-wave', name: 'Standing wave', mod: null,
    note: "StandingWave is y = A·sin(kx)·cos(ωt); an addUpdater calls setTime() every frame (physics/waves.ts) — the same live-updater pattern as the Stage tab's \"Ripple of dots\" preset.",
    source: `import { Scene, StandingWave, Text, Dot, Write, FadeIn, FadeOut,
  Group, GOLD, TEAL } from "@johnhenry/ecmanim/browser";

class StandingWaveDemo extends Scene {
  async construct() {
    const title = new Text("Standing wave — y = A·sin(kx)·cos(ωt)", { fontSize: 0.45, color: GOLD });
    title.moveTo([0, 3.4, 0]);
    await this.play(new Write(title), { runTime: 0.8 });

    const wave = new StandingWave({ xRange: [-6, 6, 0.08], amplitude: 1.4, wavelength: 4, frequency: 0.4, color: TEAL });
    const nodes = [-4, 0, 4].map((x) => new Dot({ point: [x, 0, 0], radius: 0.08, color: "#ffffff" }));
    let t = 0;
    wave.addUpdater((m, dt) => { t += dt; m.setTime(t); });
    this.add(wave, ...nodes);
    await this.play(new FadeIn(wave), { runTime: 0.4 });

    await this.wait(7);
    wave.clearUpdaters();
    await this.play(new FadeOut(new Group(title, wave, ...nodes)));
  }
}`,
  },
];

/** Mount the Physics tab into `container`; returns a cleanup fn. */
function mountPhysicsTab(container: HTMLElement, initialId: string, onPresetChange: (id: string) => void): TabHandle {
  container.innerHTML = `
    <div class="em-bar panel">
      <div class="em-picker em-phys-picker" role="tablist"></div>
      <div class="em-controls">
        <button class="btn primary em-phys-play" disabled>▶ Run</button>
        <span class="chip em-phys-state">idle</span>
      </div>
    </div>
    <div class="em-main">
      <div class="em-stage">
        <div class="em-canvas-wrap">
          <canvas width="${W}" height="${H}"></canvas>
          <div class="em-loading"><div class="em-spinner"></div><span>ready</span></div>
        </div>
        <p class="em-note em-phys-note"></p>
      </div>
      <div class="em-code-col">
        <div class="em-code-head"><span class="chip em-phys-file"></span><span class="em-code-hint">compiled live from this text</span></div>
        <pre class="code em-code em-phys-code"></pre>
        <pre class="code em-err em-phys-err" hidden></pre>
      </div>
    </div>`;

  const $ = <T extends Element>(s: string) => container.querySelector(s) as T;
  const picker = $<HTMLDivElement>('.em-phys-picker');
  const playBtn = $<HTMLButtonElement>('.em-phys-play');
  const stateChip = $<HTMLSpanElement>('.em-phys-state');
  const noteEl = $<HTMLParagraphElement>('.em-phys-note');
  const codeEl = $<HTMLPreElement>('.em-phys-code');
  const errEl = $<HTMLPreElement>('.em-phys-err');
  const fileEl = $<HTMLSpanElement>('.em-phys-file');
  const loading = $<HTMLDivElement>('.em-loading');
  const canvas = $<HTMLCanvasElement>('canvas');

  let disposed = false;
  let lib: Lib | null = null;
  let mods: Mods | null = null;
  let current = PHYSICS_PRESETS.find((p) => p.id === initialId) ?? PHYSICS_PRESETS[0];
  let gen = 0;
  const listeners: Array<() => void> = [];
  const on = (el: EventTarget, ev: string, fn: EventListener) => { el.addEventListener(ev, fn); listeners.push(() => el.removeEventListener(ev, fn)); };

  const ctx0 = canvas.getContext('2d')!;
  ctx0.fillStyle = BG; ctx0.fillRect(0, 0, W, H);

  function showErr(e: unknown) {
    errEl.hidden = false;
    errEl.textContent = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  for (const p of PHYSICS_PRESETS) {
    const b = document.createElement('button');
    b.className = p.mod ? 'em-tab em-tab-math' : 'em-tab';
    b.textContent = p.name;
    b.dataset.id = p.id;
    on(b, 'click', () => select(p, true));
    picker.appendChild(b);
  }

  function select(p: PhysicsPreset, autorun: boolean) {
    current = p;
    onPresetChange(p.id);
    picker.querySelectorAll<HTMLButtonElement>('.em-tab').forEach((b) => b.classList.toggle('active', b.dataset.id === p.id));
    codeEl.innerHTML = highlight(p.source);
    noteEl.textContent = p.note;
    const cls = p.source.match(/class\s+(\w+)/)?.[1] ?? 'scene';
    fileEl.textContent = `${cls}.ts`;
    errEl.hidden = true;
    if (autorun && lib) void run();
  }
  select(current, false);

  /** Static per-branch dynamic imports (literal specifiers) so Vite can code-split
   *  each optional physics subpath into its own chunk — a variable specifier
   *  (`import(preset.mod)`) can't be analyzed by Rollup at build time. */
  async function loadPhysicsMod(id: 'rapier2d' | 'rapier3d'): Promise<{ key: string; mod: Record<string, unknown> }> {
    if (id === 'rapier2d') {
      const mod = await import('@johnhenry/ecmanim/physics/rapier2d');
      return { key: '@johnhenry/ecmanim/physics/rapier2d', mod: mod as unknown as Record<string, unknown> };
    }
    const mod = await import('@johnhenry/ecmanim/physics/rapier3d');
    return { key: '@johnhenry/ecmanim/physics/rapier3d', mod: mod as unknown as Record<string, unknown> };
  }

  async function run() {
    if (!lib || !mods || disposed) return;
    gen++;
    const myGen = gen;
    errEl.hidden = true;
    playBtn.disabled = true;
    stateChip.textContent = 'loading…';
    try {
      if (current.mod && !mods[`@johnhenry/ecmanim/physics/${current.mod}`]) {
        const { key, mod } = await loadPhysicsMod(current.mod);
        if (gen !== myGen || disposed) return;
        mods[key] = mod;
      }
      const SceneClass = compile(mods, current.source);
      stateChip.textContent = 'running';
      await runOnCanvas2D({
        lib, sceneOrConstruct: SceneClass, canvas, pixelWidth: W, pixelHeight: H, fps: FPS,
        background: BG, isCancelled: () => disposed || gen !== myGen,
      });
      if (gen === myGen && !disposed) stateChip.textContent = 'done';
    } catch (e) {
      if (!(e instanceof Cancelled) && gen === myGen && !disposed) {
        showErr(e);
        stateChip.textContent = 'error';
      }
    } finally {
      if (!disposed && gen === myGen) playBtn.disabled = false;
    }
  }
  on(playBtn, 'click', () => void run());

  import('@johnhenry/ecmanim/browser').then((m) => {
    if (disposed) return;
    lib = m;
    mods = { [ECM]: m as unknown as Record<string, unknown> };
    loading.remove();
    playBtn.disabled = false;
    void run();
  }).catch((e) => {
    if (disposed) return;
    loading.innerHTML = '<span>failed to load ecmanim</span>';
    showErr(e);
  });

  return {
    pause() { gen++; },
    dispose() {
      disposed = true;
      gen++;
      for (const off of listeners) off();
    },
  };
}

/* ================================================================== */
/* WebGL: /browser-three, a real GPU backend (Three.js WebGLRenderer)   */
/* for the exact same Scene/mobject/animation classes — only the draw   */
/* step differs (renderer/ThreeRenderer.ts). `three` (peer, optional    */
/* dep of ecmanim) is lazy-loaded only when this tab opens.             */
/* ================================================================== */

interface WebglPreset { id: string; name: string; note: string; source: string }
const BROWSER_THREE = '@johnhenry/ecmanim/browser-three';

const WEBGL_PRESETS: WebglPreset[] = [
  {
    id: 'torus', name: 'Spinning torus', note: "Torus (mobject/surface.ts) is a real quad-mesh VGroup — ThreeRenderer uploads its vertex-colored faces as a BufferGeometry each frame and Three.js's WebGLRenderer draws it on the GPU.",
    source: `import { ThreeDScene, Torus, Text, VGroup, DEGREES, Write, FadeOut,
  GOLD } from "${BROWSER_THREE}";

class SpinningTorus extends ThreeDScene {
  async construct() {
    this.setCameraOrientation({ phi: 65 * DEGREES, theta: -50 * DEGREES, focalDistance: 11 });
    const title = new Text("Torus — real WebGL triangle mesh", { fontSize: 0.45, color: GOLD });
    this.addFixedInFrameMobjects(title);
    title.moveTo([0, 3.3, 0]);
    this.add(title);
    await this.play(new Write(title), { runTime: 0.6 });

    const torus = new Torus({ majorRadius: 2, minorRadius: 0.75, color: "#9A72AC", resolution: [48, 24] });
    this.add(torus);

    this.beginAmbientCameraRotation({ rate: 0.25 });
    torus.addUpdater((m, dt) => m.rotate(dt * 0.6, { axis: [1, 0.4, 0] }));
    await this.wait(6);
    this.stopAmbientCameraRotation();
    torus.clearUpdaters();
    await this.play(new FadeOut(new VGroup(title, torus)));
  }
}`,
  },
  {
    id: 'surface', name: 'Parametric surface', note: 'Surface builds a quad-mesh from func(u,v) → [x,y,z] with per-vertex shading (mobject/surface.ts); ThreeRenderer uploads it as a real BufferGeometry with computed normals.',
    source: `import { ThreeDScene, Surface, Text, DEGREES, Write, FadeOut, VGroup,
  interpolateColor, GOLD, TEAL, PINK } from "${BROWSER_THREE}";

class ParametricSurfaceDemo extends ThreeDScene {
  async construct() {
    this.setCameraOrientation({ phi: 62 * DEGREES, theta: -55 * DEGREES, focalDistance: 13 });
    const title = new Text("Surface — a saddle, z = (x² − y²) / 4", { fontSize: 0.4, color: GOLD });
    this.addFixedInFrameMobjects(title);
    title.moveTo([0, 3.3, 0]);
    this.add(title);
    await this.play(new Write(title), { runTime: 0.6 });

    const saddle = new Surface((u, v) => [u, v, (u * u - v * v) / 4], {
      uRange: [-3, 3], vRange: [-3, 3], resolution: [28, 28],
      colorFunc: (u) => interpolateColor(TEAL, PINK, (u + 3) / 6),
      shade: true, smooth: true,
    });
    this.add(saddle);

    this.beginAmbientCameraRotation({ rate: 0.2 });
    await this.wait(7);
    this.stopAmbientCameraRotation();
    await this.play(new FadeOut(new VGroup(title, saddle)));
  }
}`,
  },
];

/** Mount the WebGL tab into `container`; returns a cleanup fn. */
function mountWebglTab(container: HTMLElement, initialId: string, onPresetChange: (id: string) => void): TabHandle {
  container.innerHTML = `
    <div class="em-bar panel">
      <div class="em-picker em-gl-picker" role="tablist"></div>
      <div class="em-controls">
        <button class="btn primary em-gl-play" disabled>▶ Run</button>
        <span class="chip em-gl-state">idle</span>
      </div>
    </div>
    <div class="em-main">
      <div class="em-stage">
        <div class="em-canvas-wrap">
          <canvas width="${W}" height="${H}"></canvas>
          <div class="em-loading"><div class="em-spinner"></div><span>loading three + @johnhenry/ecmanim/browser-three…</span></div>
        </div>
        <p class="em-note em-gl-note"></p>
      </div>
      <div class="em-code-col">
        <div class="em-code-head"><span class="chip em-gl-file"></span><span class="em-code-hint">compiled live from this text</span></div>
        <pre class="code em-code em-gl-code"></pre>
        <pre class="code em-err em-gl-err" hidden></pre>
      </div>
    </div>`;

  const $ = <T extends Element>(s: string) => container.querySelector(s) as T;
  const picker = $<HTMLDivElement>('.em-gl-picker');
  const playBtn = $<HTMLButtonElement>('.em-gl-play');
  const stateChip = $<HTMLSpanElement>('.em-gl-state');
  const noteEl = $<HTMLParagraphElement>('.em-gl-note');
  const codeEl = $<HTMLPreElement>('.em-gl-code');
  const errEl = $<HTMLPreElement>('.em-gl-err');
  const fileEl = $<HTMLSpanElement>('.em-gl-file');
  const loading = $<HTMLDivElement>('.em-loading');
  const canvas = $<HTMLCanvasElement>('canvas');

  let disposed = false;
  let lib3: ThreeLib | null = null;
  let THREE: any = null;
  let mods: Mods | null = null;
  let current = WEBGL_PRESETS.find((p) => p.id === initialId) ?? WEBGL_PRESETS[0];
  let gen = 0;
  const listeners: Array<() => void> = [];
  const on = (el: EventTarget, ev: string, fn: EventListener) => { el.addEventListener(ev, fn); listeners.push(() => el.removeEventListener(ev, fn)); };

  // No getContext('2d') priming here (unlike the Stage/Physics canvases): a
  // canvas may only ever bind ONE context type for its lifetime, and
  // ThreeRenderer needs a real 'webgl'/'webgl2' context on this exact
  // element — grabbing '2d' first to paint a placeholder would permanently
  // block WebGL from ever attaching. The wrapper's CSS background (#0b0f1c)
  // already shows through the untouched, transparent canvas.

  function showErr(e: unknown) {
    errEl.hidden = false;
    errEl.textContent = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  for (const p of WEBGL_PRESETS) {
    const b = document.createElement('button');
    b.className = 'em-tab';
    b.textContent = p.name;
    b.dataset.id = p.id;
    on(b, 'click', () => select(p, true));
    picker.appendChild(b);
  }

  function select(p: WebglPreset, autorun: boolean) {
    current = p;
    onPresetChange(p.id);
    picker.querySelectorAll<HTMLButtonElement>('.em-tab').forEach((b) => b.classList.toggle('active', b.dataset.id === p.id));
    codeEl.innerHTML = highlight(p.source);
    noteEl.textContent = p.note;
    const cls = p.source.match(/class\s+(\w+)/)?.[1] ?? 'scene';
    fileEl.textContent = `${cls}.ts`;
    errEl.hidden = true;
    if (autorun && lib3) void run();
  }
  select(current, false);

  async function run() {
    if (!lib3 || !mods || disposed) return;
    gen++;
    const myGen = gen;
    errEl.hidden = true;
    playBtn.disabled = true;
    stateChip.textContent = 'running';
    try {
      const SceneClass = compile(mods, current.source);
      await runOnCanvasGL({
        lib3, THREE, sceneOrConstruct: SceneClass, canvas, pixelWidth: W, pixelHeight: H, fps: FPS,
        background: BG, isCancelled: () => disposed || gen !== myGen,
      });
      if (gen === myGen && !disposed) stateChip.textContent = 'done';
    } catch (e) {
      if (!(e instanceof Cancelled) && gen === myGen && !disposed) {
        showErr(e);
        stateChip.textContent = 'error';
      }
    } finally {
      if (!disposed && gen === myGen) playBtn.disabled = false;
    }
  }
  on(playBtn, 'click', () => void run());

  Promise.all([import('@johnhenry/ecmanim/browser-three'), import('three')]).then(([m3, threeMod]) => {
    if (disposed) return;
    lib3 = m3;
    THREE = threeMod;
    mods = { [BROWSER_THREE]: m3 as unknown as Record<string, unknown> };
    loading.remove();
    playBtn.disabled = false;
    void run();
  }).catch((e) => {
    if (disposed) return;
    loading.innerHTML = '<span>failed to load three / browser-three</span>';
    showErr(e);
  });

  return {
    pause() { gen++; },
    dispose() {
      disposed = true;
      gen++;
      for (const off of listeners) off();
    },
  };
}

const playground: Playground = {
  id: 'ecmanim',
  title: 'Ecmanim Stage',
  pkg: '@johnhenry/ecmanim',
  hue: 285,
  blurb: 'A TypeScript manim. Same Scene code renders in Node and, right here, in canvas.',
  docs: 'https://opensource.johnhenry.me/ecmanim/',
  mount(host) {
    // Pick up a scene exported from another planet (Math Observatory) before anything else.
    const incoming: Handoff | null = receive('ecmanim');
    const DEFAULTS = {
      scene: PRESETS[0].id, speed: 1, gen: '', tab: 'stage',
      format: FORMAT_SPECS[0].id, physics: PHYSICS_PRESETS[0].id, webgl: WEBGL_PRESETS[0].id,
    };
    const st = readState(DEFAULTS);
    // Top-level tab state, read up front so syncUrl() (called from Stage's own
    // select()) can include it regardless of source order below.
    let activeTab = (['stage', 'authoring', 'physics', 'webgl'].includes(String(st.tab)) ? String(st.tab) : 'stage');
    let authoringFormatId = FORMAT_SPECS.some((f) => f.id === st.format) ? String(st.format) : FORMAT_SPECS[0].id;
    let physicsPresetId = PHYSICS_PRESETS.some((p) => p.id === st.physics) ? String(st.physics) : PHYSICS_PRESETS[0].id;
    let webglPresetId = WEBGL_PRESETS.some((p) => p.id === st.webgl) ? String(st.webgl) : WEBGL_PRESETS[0].id;
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
      <div class="em-tabbar" role="tablist">
        <button class="em-toptab" data-tab="stage">Stage</button>
        <button class="em-toptab" data-tab="authoring">Authoring</button>
        <button class="em-toptab" data-tab="physics">Physics</button>
        <button class="em-toptab" data-tab="webgl">WebGL</button>
      </div>
      <div class="em-panel" data-panel="stage">
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
            <div class="em-code-head">
              <span class="chip em-file"></span>
              <span class="em-code-hint">compiled live from this text</span>
              <button class="btn em-edit-toggle">✎ Edit source</button>
            </div>
            <pre class="code em-code"></pre>
            <textarea class="code em-code-edit" hidden spellcheck="false"></textarea>
            <div class="em-edit-actions" hidden>
              <button class="btn primary em-edit-run">▶ Run edited (⌘⏎)</button>
              <button class="btn em-edit-reset">↺ Reset to preset</button>
            </div>
            <pre class="code em-err" hidden></pre>
          </div>
        </div>
      </div>
      <div class="em-panel" data-panel="authoring" hidden></div>
      <div class="em-panel" data-panel="physics" hidden></div>
      <div class="em-panel" data-panel="webgl" hidden></div>`;
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
    const editToggle = $<HTMLButtonElement>('.em-edit-toggle');
    const codeTextarea = $<HTMLTextAreaElement>('.em-code-edit');
    const editActions = $<HTMLDivElement>('.em-edit-actions');
    const editRunBtn = $<HTMLButtonElement>('.em-edit-run');
    const editResetBtn = $<HTMLButtonElement>('.em-edit-reset');

    let disposed = false;
    let lib: Lib | null = null;
    let mods: Mods | null = null;
    let current = initial;
    let speed = initialSpeed;
    let runId = 0; // bump to cancel whichever run is in flight
    let playing = false;
    let recording = false;
    let editing = false;
    // Per-preset edited source (in-memory only — not deep-linked). Stage's
    // docstring promise ("what you read is exactly what runs") extends here:
    // compile()/record() always read this, never the preset's original text.
    const edits = new Map<string, string>();
    const effectiveSource = (): string => edits.get(current.id) ?? current.source;
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
      if (editing) codeTextarea.value = effectiveSource();
      syncUrl();
      if (autoplay && lib) void run();
    }

    function setEditing(on: boolean) {
      editing = on;
      codeEl.hidden = on;
      codeTextarea.hidden = !on;
      editActions.hidden = !on;
      editToggle.textContent = on ? '👁 View highlighted' : '✎ Edit source';
      if (on) codeTextarea.value = effectiveSource();
    }
    on(editToggle, 'click', () => setEditing(!editing));
    on(codeTextarea, 'input', () => edits.set(current.id, codeTextarea.value));
    on(codeTextarea, 'keydown', (ev) => {
      const e = ev as KeyboardEvent;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (lib) void run(); }
    });
    on(editRunBtn, 'click', () => { if (lib) void run(); });
    on(editResetBtn, 'click', () => {
      edits.delete(current.id);
      codeTextarea.value = current.source;
      errEl.hidden = true;
    });

    function syncUrl() {
      writeState({
        scene: current.id, speed,
        gen: current === fromMath && generated ? JSON.stringify(generated) : '',
        tab: activeTab, format: authoringFormatId, physics: physicsPresetId, webgl: webglPresetId,
      }, DEFAULTS);
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
        SceneClass = compile(mods, effectiveSource());
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
        const SceneClass = compile(mods, effectiveSource());
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

    /* ---------------- Top-level tabs: Authoring / Physics / WebGL (lazy) --------------- */
    const tabbar = $<HTMLDivElement>('.em-tabbar');
    const panels: Record<string, HTMLDivElement> = {
      stage: $('.em-panel[data-panel="stage"]'),
      authoring: $('.em-panel[data-panel="authoring"]'),
      physics: $('.em-panel[data-panel="physics"]'),
      webgl: $('.em-panel[data-panel="webgl"]'),
    };
    const tabHandles: Record<string, TabHandle | null> = { authoring: null, physics: null, webgl: null };

    /**
     * Stop whatever tab is currently active before switching away from it.
     * None of the mount*Tab render loops know about each other, so without
     * this, leaving a tab mid-scene (e.g. Physics still stepping a 6s
     * Rapier3D fall) leaves its requestAnimationFrame loop running forever
     * in the background — competing for frames with whichever tab is opened
     * next indefinitely (confirmed live: it visibly stalled the next tab's
     * WASM/WebGL warm-up during verification). Stage has its own
     * play/pause via stop(); the other three each expose pause() for this.
     */
    function pauseTab(tab: string) {
      if (tab === 'stage' && playing) stop();
      else if (tab !== 'stage') tabHandles[tab]?.pause();
    }

    function showTab(tab: string) {
      if (tab === activeTab) return;
      pauseTab(activeTab);
      activeTab = tab;
      for (const key of Object.keys(panels)) panels[key].hidden = key !== tab;
      tabbar.querySelectorAll<HTMLButtonElement>('.em-toptab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
      if (tab === 'authoring' && !tabHandles.authoring) {
        tabHandles.authoring = mountAuthoringTab(panels.authoring, authoringFormatId, (id) => { authoringFormatId = id; syncUrl(); });
      } else if (tab === 'physics' && !tabHandles.physics) {
        tabHandles.physics = mountPhysicsTab(panels.physics, physicsPresetId, (id) => { physicsPresetId = id; syncUrl(); });
      } else if (tab === 'webgl' && !tabHandles.webgl) {
        tabHandles.webgl = mountWebglTab(panels.webgl, webglPresetId, (id) => { webglPresetId = id; syncUrl(); });
      }
      syncUrl();
    }
    for (const b of tabbar.querySelectorAll<HTMLButtonElement>('.em-toptab')) {
      on(b, 'click', () => showTab(b.dataset.tab!));
    }
    // First activation: run the body of showTab() without the "already
    // active, no-op" early return (activeTab already equals this value).
    { const t = activeTab; activeTab = ''; showTab(t); }

    return () => {
      disposed = true;
      runId++;
      for (const off of listeners) off();
      tabHandles.authoring?.dispose();
      tabHandles.physics?.dispose();
      tabHandles.webgl?.dispose();
      root.remove();
    };
  },
};
export default playground;
