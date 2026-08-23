// Polygram family: shapes built from one or more closed loops of vertices, plus
// star polygrams, rounded rectangles, cutouts, and convex hulls. Mirrors
// ManimCommunity's manim/mobject/geometry/polygram.py.
import { VMobject } from "./VMobject.js";
import { Polygon } from "./geometry.js";
import * as V from "../core/math/vector.js";
import { regularVertices, rotateVector, normalize } from "../core/math/vector.js";
/**
 * A generalized polygon: one or more closed loops of vertices, each a subpath.
 * `Polygram([...loop1], [...loop2], ...)`.
 */
export class Polygram extends VMobject {
    vertexGroups;
    // Accepts `new Polygram([loop1, loop2], config)` or the variadic
    // `new Polygram(loop1, loop2, ...)` form (a trailing plain object is config).
    constructor(vertexGroups = [], config = {}, ...rest) {
        let groups;
        let cfg;
        if (rest.length > 0 || (Array.isArray(config))) {
            // Variadic: Polygram(loop1, loop2, ..., config?)
            const all = [vertexGroups, config, ...rest];
            cfg = (all.length && !Array.isArray(all[all.length - 1])) ? all.pop() : {};
            groups = all;
        }
        else {
            groups = vertexGroups;
            cfg = config;
        }
        super(cfg);
        this.fillOpacity = cfg.fillOpacity ?? 0;
        this.vertexGroups = groups.map((g) => g.map((v) => V.clone(v)));
        this._buildFromGroups(this.vertexGroups);
    }
    _buildFromGroups(groups) {
        this.points = [];
        this.subpathStarts = [];
        this._straightPath = true;
        for (const group of groups) {
            if (group.length === 0)
                continue;
            // Close the loop.
            const closed = V.equals(group[0], group[group.length - 1])
                ? group
                : [...group, group[0]];
            this.subpathStarts.push(this.points.length);
            this.points.push(V.clone(closed[0]));
            for (let i = 1; i < closed.length; i++)
                this.addLineTo(closed[i]);
        }
        return this;
    }
    /** The list of closed loops (each without the duplicated closing anchor). */
    getVertexGroups() {
        const groups = [];
        for (const sp of this.getSubpaths()) {
            const anchors = [];
            const nc = Math.floor((sp.length - 1) / 3);
            if (sp.length)
                anchors.push(V.clone(sp[0]));
            for (let i = 0; i < nc; i++)
                anchors.push(V.clone(sp[3 * i + 3]));
            // Drop the trailing anchor if it duplicates the first (closing point).
            if (anchors.length > 1 && V.equals(anchors[0], anchors[anchors.length - 1])) {
                anchors.pop();
            }
            groups.push(anchors);
        }
        return groups;
    }
    /** All vertices flattened across every loop. */
    getVertices() {
        return this.getVertexGroups().flat();
    }
    /**
     * Round the corners of every loop with the given radius, replacing sharp
     * corners with short arcs (approximated by straight bevels — sufficient for
     * bounds/geometry parity without a true arc join).
     */
    roundCorners(radius = 0.5) {
        const groups = this.getVertexGroups();
        const newGroups = [];
        for (const verts of groups) {
            const n = verts.length;
            if (n < 3) {
                newGroups.push(verts);
                continue;
            }
            const out = [];
            for (let i = 0; i < n; i++) {
                const prev = verts[(i - 1 + n) % n];
                const cur = verts[i];
                const next = verts[(i + 1) % n];
                const toPrev = V.sub(prev, cur);
                const toNext = V.sub(next, cur);
                const lPrev = V.length(toPrev);
                const lNext = V.length(toNext);
                const r = Math.min(radius, lPrev / 2, lNext / 2);
                const a = V.add(cur, V.scale(normalize(toPrev), r));
                const b = V.add(cur, V.scale(normalize(toNext), r));
                // Bevel: enter and leave the corner with a short intermediate segment.
                out.push(a, V.midpoint(V.midpoint(a, cur), V.midpoint(cur, b)), b);
            }
            newGroups.push(out);
        }
        this.vertexGroups = newGroups;
        this._buildFromGroups(newGroups);
        return this;
    }
}
/**
 * A regular star polygram {n/density}: connect every `density`-th of `n`
 * regularly-spaced vertices. density=1 gives a convex polygon; density>=2 a star.
 */
export class RegularPolygram extends Polygram {
    numVertices;
    density;
    radius;
    constructor(numVertices = 5, config = {}) {
        const density = config.density ?? 2;
        const radius = config.radius ?? 1;
        const [verts, startAngle] = regularVertices(numVertices, radius, config.startAngle);
        void startAngle;
        // Split the vertices into gcd(n, density) interleaved loops.
        const gcd = RegularPolygram._gcd(numVertices, density);
        const groups = [];
        for (let start = 0; start < gcd; start++) {
            const loop = [];
            let idx = start;
            do {
                loop.push(V.clone(verts[idx]));
                idx = (idx + density) % numVertices;
            } while (idx !== start);
            groups.push(loop);
        }
        super(groups, config);
        this.numVertices = numVertices;
        this.density = density;
        this.radius = radius;
    }
    static _gcd(a, b) {
        a = Math.abs(a);
        b = Math.abs(b);
        while (b) {
            [a, b] = [b, a % b];
        }
        return a || 1;
    }
}
/**
 * An n-pointed star: alternating outer and inner vertices. When `innerRadius`
 * is not given it is derived from `density` (as in manim).
 */
export class Star extends Polygram {
    constructor(n = 5, config = {}) {
        const outerRadius = config.outerRadius ?? config.radius ?? 1;
        const startAngle = config.startAngle ?? Math.PI / 2;
        const density = config.density ?? 2;
        let innerRadius = config.innerRadius;
        if (innerRadius == null) {
            // manim derives the inner radius from where {n/density} chords cross.
            const d = Math.min(Math.max(density, 1), Math.floor((n - 1) / 2) || 1);
            const innerAngle = (Math.PI * (n - 2 * d)) / n;
            innerRadius = outerRadius * Math.cos(Math.PI / n) /
                Math.max(1e-9, Math.cos(Math.PI / n - innerAngle / 2));
            // Fallback to a sensible ratio if the geometry degenerates.
            if (!isFinite(innerRadius) || innerRadius <= 0 || innerRadius >= outerRadius) {
                innerRadius = outerRadius * 0.5;
            }
        }
        const verts = [];
        for (let i = 0; i < n; i++) {
            const outerA = startAngle + (2 * Math.PI * i) / n;
            const innerA = outerA + Math.PI / n;
            verts.push(rotateVector([outerRadius, 0, 0], outerA));
            verts.push(rotateVector([innerRadius, 0, 0], innerA));
        }
        super([verts], config);
    }
}
/** A rectangle with rounded corners (approximated with beveled corners). */
export class RoundedRectangle extends Polygram {
    width;
    height;
    cornerRadius;
    constructor(config = {}) {
        const w = config.width ?? 4;
        const h = config.height ?? 2;
        const verts = [
            [w / 2, h / 2, 0],
            [-w / 2, h / 2, 0],
            [-w / 2, -h / 2, 0],
            [w / 2, -h / 2, 0],
        ];
        super([verts], config);
        this.width = w;
        this.height = h;
        this.cornerRadius = config.cornerRadius ?? 0.5;
        if (this.cornerRadius > 0)
            this.roundCorners(this.cornerRadius);
        // Parity with Circle/Text: `point` places the shape's center.
        if (config.point)
            this.moveTo(config.point);
    }
}
/**
 * A VMobject whose fill is `mainShape` with `subtractedShapes` punched out as
 * holes. Uses reversed-winding subpaths + even-odd fill (no true boolean op).
 */
export class Cutout extends VMobject {
    constructor(mainShape, ...subtractedShapes) {
        super({ fillOpacity: 1 });
        this.points = [];
        this.subpathStarts = [];
        // Main outline, forward winding.
        for (const sp of mainShape.getSubpaths()) {
            this.subpathStarts.push(this.points.length);
            for (const p of sp)
                this.points.push(V.clone(p));
        }
        // Holes: reversed winding so even-odd fill leaves them empty.
        for (const shape of subtractedShapes) {
            for (const sp of shape.getSubpaths()) {
                this.subpathStarts.push(this.points.length);
                for (let i = sp.length - 1; i >= 0; i--)
                    this.points.push(V.clone(sp[i]));
            }
        }
        this.setFill(mainShape.fillColor, mainShape.fillOpacity > 0 ? mainShape.fillOpacity : 1);
        this.setStroke(mainShape.strokeColor, mainShape.strokeWidth);
    }
}
/** The 2D convex hull of the given points, as a closed Polygon. */
export class ConvexHull extends Polygon {
    // Accepts `new ConvexHull([...points], config)` or the variadic
    // `new ConvexHull(p1, p2, p3, ..., config?)` form.
    constructor(points, config = {}, ...rest) {
        let pts;
        let cfg;
        if (rest.length > 0 || (points.length > 0 && typeof points[0] === "number")) {
            const all = [points, config, ...rest];
            cfg = (all.length && !Array.isArray(all[all.length - 1])) ? all.pop() : {};
            pts = all;
        }
        else {
            pts = points;
            cfg = config;
        }
        const hull = ConvexHull._monotoneChain(pts, cfg.tolerance ?? 1e-5);
        super(hull, cfg);
    }
    /** Andrew's monotone chain: returns the CCW hull vertices (no repeat). */
    static _monotoneChain(pts, tol = 1e-5) {
        const uniq = pts.map((p) => [p[0], p[1], 0]);
        // Sort by x, then y.
        const sorted = uniq.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if (sorted.length <= 2)
            return sorted.map((p) => V.clone(p));
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lower = [];
        for (const p of sorted) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= tol) {
                lower.pop();
            }
            lower.push(p);
        }
        const upper = [];
        for (let i = sorted.length - 1; i >= 0; i--) {
            const p = sorted[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= tol) {
                upper.pop();
            }
            upper.push(p);
        }
        lower.pop();
        upper.pop();
        return lower.concat(upper).map((p) => V.clone(p));
    }
}
//# sourceMappingURL=polygram.js.map