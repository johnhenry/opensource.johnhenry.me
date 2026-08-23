// d3-shape equivalents (D3-parity campaign, cluster D2): stack, line/area,
// arc, pie, link/radial generators. Layout math is PURE (point arrays /
// descriptors); the only mobject construction is the thin VMobject builders
// at the bottom. d3 angle convention throughout: RADIANS, CLOCKWISE from
// 12 o'clock — `radialPoint()` converts to ecmanim's y-up world.
import { VMobject } from "./VMobject.js";
/**
 * d3.stack(): rows of data -> one series per key, each entry [y0, y1].
 * Orders and offsets match d3's semantics (wiggle = streamgraph).
 */
export function stack(config) {
    const { keys, value = (d, key) => +d[key] } = config;
    const orderKind = config.order ?? "none";
    const offsetKind = config.offset ?? "none";
    return (data) => {
        const n = keys.length;
        const m = data.length;
        // Raw values per series.
        const values = keys.map((key) => data.map((d) => value(d, key) || 0));
        // Order: an array of series indices, bottom first.
        let order;
        if (typeof orderKind === "function") {
            order = orderKind(values.map((vs) => vs.reduce((a, b) => a + b, 0)));
        }
        else if (orderKind === "ascending" || orderKind === "descending") {
            const sums = values.map((vs, i) => [vs.reduce((a, b) => a + b, 0), i]);
            sums.sort((a, b) => (orderKind === "ascending" ? a[0] - b[0] : b[0] - a[0]));
            order = sums.map(([, i]) => i);
        }
        else if (orderKind === "insideOut") {
            // d3: descending by max, alternately appended to top/bottom.
            const stats = values.map((vs, i) => ({
                i,
                max: Math.max(...vs),
                sum: vs.reduce((a, b) => a + b, 0),
            }));
            stats.sort((a, b) => b.max - a.max);
            const tops = [], bottoms = [];
            let topSum = 0, bottomSum = 0;
            for (const s of stats) {
                if (topSum < bottomSum) {
                    tops.push(s.i);
                    topSum += s.sum;
                }
                else {
                    bottoms.push(s.i);
                    bottomSum += s.sum;
                }
            }
            order = [...bottoms.reverse(), ...tops];
        }
        else {
            order = keys.map((_k, i) => i);
        }
        // Base stacking (offsetNone) in order.
        const series = keys.map(() => []);
        const y0 = new Array(m).fill(0);
        for (const si of order) {
            for (let j = 0; j < m; j++) {
                const v = values[si][j];
                series[si][j] = [y0[j], y0[j] + v];
                y0[j] += v;
            }
        }
        // Offsets.
        if (offsetKind === "expand") {
            for (let j = 0; j < m; j++) {
                const total = y0[j] || 1;
                for (const s of series) {
                    s[j][0] /= total;
                    s[j][1] /= total;
                }
            }
        }
        else if (offsetKind === "silhouette") {
            for (let j = 0; j < m; j++) {
                const shift = y0[j] / 2;
                for (const s of series) {
                    s[j][0] -= shift;
                    s[j][1] -= shift;
                }
            }
        }
        else if (offsetKind === "diverging") {
            // Positive values stack up from 0, negatives down.
            for (let j = 0; j < m; j++) {
                let up = 0, down = 0;
                for (const si of order) {
                    const v = values[si][j];
                    if (v >= 0) {
                        series[si][j] = [up, up + v];
                        up += v;
                    }
                    else {
                        series[si][j] = [down + v, down];
                        down += v;
                    }
                }
            }
        }
        else if (offsetKind === "wiggle") {
            // d3's streamgraph offset: minimize weighted wiggle; then anchor so the
            // first column's baseline matches silhouette-ish start (d3 anchors via
            // running y). Implementation follows d3-shape offsetWiggle.
            let y = 0;
            const orderedSeries = order.map((si) => series[si]);
            const orderedValues = order.map((si) => values[si]);
            for (let j = 1; j < m; j++) {
                let s1 = 0, s2 = 0;
                for (let k = 0; k < orderedSeries.length; k++) {
                    const sij = orderedValues[k][j];
                    const sij0 = orderedValues[k][j - 1];
                    let s3 = (sij - sij0) / 2;
                    for (let l = 0; l < k; l++) {
                        s3 += orderedValues[l][j] - orderedValues[l][j - 1];
                    }
                    s1 += sij;
                    s2 += s3 * sij;
                }
                // Shift PREVIOUS column by accumulated baseline, then advance.
                for (const s of orderedSeries) {
                    s[j - 1][0] += y;
                    s[j - 1][1] += y;
                }
                if (s1)
                    y -= s2 / s1;
            }
            for (const s of orderedSeries) {
                s[m - 1][0] += y;
                s[m - 1][1] += y;
            }
        }
        return series.map((s, i) => {
            const out = s;
            out.key = keys[i];
            out.index = i;
            return out;
        });
    };
}
/** d3.line(): data -> polyline SEGMENTS (split where `defined` is false),
 *  each an array of [x, y] world points. Feed to PolyLine/Spline/VMobject. */
export function lineGen(config) {
    const { x, y, defined = () => true } = config;
    return (data) => {
        const segments = [];
        let current = null;
        data.forEach((d, i) => {
            if (defined(d, i)) {
                if (!current) {
                    current = [];
                    segments.push(current);
                }
                current.push([x(d, i), y(d, i), 0]);
            }
            else {
                current = null;
            }
        });
        return segments.filter((s) => s.length > 1);
    };
}
/** d3.area(): data -> closed ring(s) [x, y1] forward then [x, y0] back. */
export function areaGen(config) {
    const { x, y0, y1, defined = () => true } = config;
    return (data) => {
        const rings = [];
        let top = [], bottom = [];
        const flush = () => {
            if (top.length > 1)
                rings.push([...top, ...bottom.reverse()]);
            top = [];
            bottom = [];
        };
        data.forEach((d, i) => {
            if (defined(d, i)) {
                top.push([x(d, i), y1(d, i), 0]);
                bottom.push([x(d, i), y0(d, i), 0]);
            }
            else {
                flush();
            }
        });
        flush();
        return rings;
    };
}
/** d3.pie(): data -> slice angle descriptors (clockwise from 12, radians). */
export function pieGen(config = {}) {
    const { value = (d) => +d, sortValues = (a, b) => b - a, startAngle = 0, endAngle = Math.PI * 2, padAngle = 0, } = config;
    return (data) => {
        const n = data.length;
        const values = data.map((d, i) => value(d, i));
        const indices = values.map((_v, i) => i);
        if (sortValues)
            indices.sort((a, b) => sortValues(values[a], values[b]) || a - b);
        const total = values.reduce((a, b) => a + Math.max(0, b), 0);
        const span = endAngle - startAngle - n * padAngle;
        const slices = new Array(n);
        let angle = startAngle;
        for (const i of indices) {
            const v = Math.max(0, values[i]);
            const sweep = total ? (v / total) * span : 0;
            slices[i] = {
                data: data[i], value: values[i], index: i,
                startAngle: angle, endAngle: angle + sweep + padAngle, padAngle,
            };
            angle += sweep + padAngle;
        }
        return slices;
    };
}
/** d3 angle (clockwise from 12) + radius -> ecmanim world [x, y, 0]. */
export function radialPoint(angle, radius) {
    return [radius * Math.sin(angle), radius * Math.cos(angle), 0];
}
// Append a circular arc in d3 angle space to a VMobject path.
function appendArc(mob, r, a0, a1, move) {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 4)));
    let prev = radialPoint(a0, r);
    if (move)
        mob.startNewPath(prev);
    else
        mob.addLineTo(prev);
    for (let i = 1; i <= n; i++) {
        const b0 = a0 + ((i - 1) / n) * (a1 - a0);
        const b1 = a0 + (i / n) * (a1 - a0);
        const mid = (b0 + b1) / 2;
        const sweep = b1 - b0;
        // Circular arc as cubic bezier (standard k factor), in d3 angle space
        // (clockwise-from-12 maps to world via radialPoint).
        const k = (4 / 3) * Math.tan(Math.abs(sweep) / 4) * r;
        const p1 = radialPoint(b0, r);
        const p2 = radialPoint(b1, r);
        // Tangents perpendicular to the radius; direction follows sweep sign.
        const t0 = [Math.cos(b0), -Math.sin(b0), 0];
        const t1 = [Math.cos(b1), -Math.sin(b1), 0];
        const s = Math.sign(sweep);
        mob.addCubicBezier([p1[0] + s * k * t0[0], p1[1] + s * k * t0[1], 0], [p2[0] - s * k * t1[0], p2[1] - s * k * t1[1], 0], p2);
        void mid;
        prev = p2;
    }
}
/** d3.arc() -> a filled VMobject annular sector (donut slice). */
export function arcShape(config) {
    const { innerRadius, outerRadius, startAngle, endAngle, padAngle = 0, ...style } = config;
    const pad = padAngle / 2;
    const a0 = startAngle + pad;
    const a1 = endAngle - pad;
    const mob = new VMobject({ fillOpacity: 1, strokeWidth: 0, ...style });
    if (a1 <= a0)
        return mob;
    appendArc(mob, outerRadius, a0, a1, true);
    if (innerRadius > 1e-9) {
        appendArc(mob, innerRadius, a1, a0, false);
    }
    else {
        mob.addLineTo([0, 0, 0]);
    }
    mob.addLineTo(radialPoint(a0, outerRadius));
    return mob;
}
// --- links (bump curves) --------------------------------------------------------
/** d3.linkHorizontal(): cubic control points with horizontal tangents.
 *  Also exactly sankeyLinkHorizontal's curve. */
export function linkHorizontalPoints(source, target) {
    const midX = (source[0] + target[0]) / 2;
    return [
        [...source],
        [midX, source[1], 0],
        [midX, target[1], 0],
        [...target],
    ];
}
export function linkVerticalPoints(source, target) {
    const midY = (source[1] + target[1]) / 2;
    return [
        [...source],
        [source[0], midY, 0],
        [target[0], midY, 0],
        [...target],
    ];
}
/** d3.linkRadial(): bump in polar space — source/target as
 *  {angle (d3 convention), radius}; returns a POLYLINE of sampled world
 *  points along the radial bump (feed to Spline or setPointsSmoothly). */
export function linkRadialPoints(source, target, samples = 16) {
    const out = [];
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        // Bump: cubic ease on the angle, linear-in-bezier on radius (matches
        // the visual of d3's bumpRadial closely).
        const te = t * t * (3 - 2 * t);
        const angle = source.angle + (target.angle - source.angle) * te;
        const radius = source.radius + (target.radius - source.radius) * t;
        out.push(radialPoint(angle, radius));
    }
    return out;
}
// --- basis B-spline (curveBasis / curveBundle) -------------------------------------
/**
 * Uniform cubic B-spline through control points -> cubic bezier chain
 * (d3.curveBasis). Returns {start, beziers: [c1, c2, end][]} ready for
 * startNewPath + addCubicBezier. The curve APPROXIMATES the control points
 * (starts/ends exactly at the first/last, like d3, via endpoint tripling).
 */
export function basisBeziers(points) {
    if (points.length < 2)
        return { start: points[0] ?? [0, 0, 0], beziers: [] };
    // Triple the endpoints so the spline interpolates them (d3 behavior).
    const p = [points[0], points[0], ...points, points[points.length - 1], points[points.length - 1]];
    const beziers = [];
    const lerp = (a, b, t) => [
        a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t,
    ];
    let start = null;
    for (let i = 0; i + 3 < p.length; i++) {
        const [p0, p1, p2, p3] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
        const b0 = lerp(lerp(p0, p1, 2 / 3), lerp(p1, p2, 1 / 3), 0.5);
        const b1 = lerp(p1, p2, 1 / 3);
        const b2 = lerp(p1, p2, 2 / 3);
        const b3 = lerp(lerp(p1, p2, 2 / 3), lerp(p2, p3, 1 / 3), 0.5);
        if (!start)
            start = b0;
        beziers.push([b1, b2, b3]);
    }
    return { start: start, beziers };
}
/** d3.curveBundle.beta(beta): basis spline over control points LERPED
 *  toward the straight source->target chord. beta=1 keeps the full bundle
 *  path; beta=0 is a straight line. */
export function bundleBeziers(points, beta = 0.85) {
    const n = points.length - 1;
    if (n < 1)
        return basisBeziers(points);
    const p0 = points[0], pn = points[n];
    const blended = points.map((p, i) => {
        const t = i / n;
        const chord = [p0[0] + (pn[0] - p0[0]) * t, p0[1] + (pn[1] - p0[1]) * t, 0];
        return [
            chord[0] + beta * (p[0] - chord[0]),
            chord[1] + beta * (p[1] - chord[1]),
            0,
        ];
    });
    return basisBeziers(blended);
}
/** Build a stroked VMobject from a {start, beziers} chain. */
export function bezierChainMobject(chain, style = {}) {
    const mob = new VMobject({ fillOpacity: 0, ...style });
    if (!chain.beziers.length)
        return mob;
    mob.startNewPath([...chain.start]);
    for (const [c1, c2, end] of chain.beziers) {
        mob.addCubicBezier([...c1], [...c2], [...end]);
    }
    return mob;
}
//# sourceMappingURL=shape_gen.js.map