// Curve NODE classes (Motion Canvas parity campaign, cluster MC6): the
// ergonomic wrappers Motion Canvas ships as <CubicBezier>/<QuadBezier>/
// <Spline>/<Path>/<Line points> over primitives ecmanim already has at the
// VMobject level. Everything here is thin construction sugar — geometry
// comes from addCubicBezier / addQuadraticBezierCurveTo / svg_path /
// catmullRomHandles.
import { VMobject } from "./VMobject.js";
import { parsePathToSubpaths, subpathsToVMobject } from "./svg_path.js";
import * as V from "../core/math/vector.js";
/** A single cubic bezier segment (MC's `<CubicBezier p0..p3/>`). */
export class CubicBezier extends VMobject {
    constructor(config) {
        const { p0, p1, p2, p3, ...style } = config;
        super({ fillOpacity: 0, ...style });
        this.startNewPath([...p0]);
        this.addCubicBezier([...p1], [...p2], [...p3]);
    }
}
/** A single quadratic bezier segment (MC's `<QuadBezier p0..p2/>`). */
export class QuadBezier extends VMobject {
    constructor(config) {
        const { p0, p1, p2, ...style } = config;
        super({ fillOpacity: 0, ...style });
        this.startNewPath([...p0]);
        this.addQuadraticBezierCurveTo([...p1], [...p2]);
    }
}
// Catmull-Rom handle derivation with a smoothness parameter: handles point
// along the chord between each anchor's neighbors, scaled by smoothness.
function catmullRomHandles(anchors, smoothness, closed) {
    const n = anchors.length;
    const s = smoothness / 3;
    const at = (i) => anchors[((i % n) + n) % n];
    const out = [];
    for (let i = 0; i < n; i++) {
        const prev = closed ? at(i - 1) : anchors[Math.max(0, i - 1)];
        const next = closed ? at(i + 1) : anchors[Math.min(n - 1, i + 1)];
        const tangent = V.scale(V.sub(next, prev), s);
        out.push([V.sub(at(i), tangent), V.add(at(i), tangent)]); // [in, out]
    }
    return out;
}
/** A smooth spline through points (MC's `<Spline points smoothness/>`),
 *  with optional per-point explicit handles (Knots). */
export class Spline extends VMobject {
    smoothness;
    constructor(config) {
        const { points, smoothness = 1, closed = false, ...style } = config;
        super({ fillOpacity: 0, ...style });
        this.smoothness = smoothness;
        if (points.length < 2)
            return;
        const anchors = points.map((p) => (Array.isArray(p) ? [...p] : [...p.position]));
        const auto = catmullRomHandles(anchors, smoothness, closed);
        // Explicit knot handles (relative) override the derived ones.
        const handles = points.map((p, i) => {
            if (Array.isArray(p))
                return auto[i];
            const inH = p.startHandle ? V.add(anchors[i], p.startHandle) : auto[i][0];
            const outH = p.endHandle ? V.add(anchors[i], p.endHandle) : auto[i][1];
            return [inH, outH];
        });
        this.startNewPath(anchors[0]);
        const segs = closed ? anchors.length : anchors.length - 1;
        for (let i = 0; i < segs; i++) {
            const j = (i + 1) % anchors.length;
            this.addCubicBezier(handles[i][1], handles[j][0], anchors[j]);
        }
    }
}
/** An SVG-path-data node (MC's `<Path data="M..."/>`). */
export class Path extends VMobject {
    data;
    constructor(config) {
        const { data, scale = 1, flipY = true, ...style } = config;
        super({ fillOpacity: 0, ...style });
        this.data = data;
        const subpaths = parsePathToSubpaths(data);
        subpathsToVMobject(this, subpaths, { scale, flipY });
    }
}
/** A multi-point polyline (MC's `<Line points/>` — theirs is a polyline,
 *  unlike ecmanim's two-point Line), with optional rounded corners
 *  (quadratic fillets at interior vertices, like MC Line's `radius`). */
export class PolyLine extends VMobject {
    constructor(config) {
        const { points, radius = 0, closed = false, ...style } = config;
        super({ fillOpacity: 0, ...style });
        const pts = points.map((p) => [...p, 0].slice(0, 3));
        const ring = closed && pts.length > 2 ? [...pts, pts[0]] : pts;
        if (radius <= 0 || ring.length < 3) {
            this.setPointsAsCorners(ring);
            return;
        }
        // Rounded corners: shorten each edge by `radius` (clamped to half the
        // edge) around every interior vertex and bridge with a quadratic
        // bezier through the vertex.
        this.startNewPath(ring[0]);
        for (let i = 1; i < ring.length - 1; i++) {
            const prev = ring[i - 1];
            const v = ring[i];
            const next = ring[i + 1];
            const inLen = V.distance(prev, v);
            const outLen = V.distance(v, next);
            const rIn = Math.min(radius, inLen / 2);
            const rOut = Math.min(radius, outLen / 2);
            const enter = V.add(v, V.scale(V.normalize(V.sub(prev, v)), rIn));
            const exit = V.add(v, V.scale(V.normalize(V.sub(next, v)), rOut));
            this.addLineTo(enter);
            this.addQuadraticBezierCurveTo([...v], exit);
        }
        this.addLineTo(ring[ring.length - 1]);
    }
}
//# sourceMappingURL=curves.js.map