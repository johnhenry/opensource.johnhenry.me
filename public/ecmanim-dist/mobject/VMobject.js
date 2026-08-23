// Vectorized Mobject: a shape defined by cubic bezier curves, the workhorse of
// manim. Points are a flat list where n_curves = (n_points - 1) / 3 within each
// subpath. Subpaths (for holes / disjoint strokes / glyphs) are tracked by the
// indices at which a new "moveTo" begins.
import { Mobject } from "./Mobject.js";
import { Color } from "../core/color.js";
import { lerpEffects } from "../core/effects.js";
import * as V from "../core/math/vector.js";
import { bezier, straightControlPoints, partialBezier, subdivideBezier, getSmoothCubicBezierHandlePoints, } from "../core/math/bezier.js";
import { shoelaceDirection } from "../core/math/vector.js";
export class VMobject extends Mobject {
    subpathStarts;
    strokeColor;
    strokeWidth;
    strokeOpacity;
    fillColor;
    fillOpacity;
    lineJoin;
    lineCap;
    strokeStart;
    strokeEnd;
    _straightPath;
    // Background stroke: a wider stroke drawn under the main stroke.
    backgroundStrokeColor;
    backgroundStrokeWidth;
    backgroundStrokeOpacity;
    // Sheen / gradient: a linear gradient across the mobject's bounding box.
    sheenFactor;
    sheenDirection;
    gradientColors;
    constructor(config = {}) {
        super(config);
        this.subpathStarts = []; // indices into this.points where a subpath begins
        const stroke = config.strokeColor ?? config.color ?? "#FFFFFF";
        const fill = config.fillColor ?? config.color ?? "#FFFFFF";
        this.strokeColor = Color.parse(stroke);
        this.strokeWidth = config.strokeWidth ?? 4;
        this.strokeOpacity = config.strokeOpacity ?? 1;
        this.fillColor = Color.parse(fill);
        this.fillOpacity = config.fillOpacity ?? 0;
        this.lineJoin = config.lineJoin ?? "round";
        this.lineCap = config.lineCap ?? "round";
        // Fraction of the path drawn — used by Create/Write/ShowPartial.
        this.strokeStart = 0;
        this.strokeEnd = 1;
        this.backgroundStrokeColor = Color.parse(config.backgroundStrokeColor ?? "#000000");
        this.backgroundStrokeWidth = config.backgroundStrokeWidth ?? 0;
        this.backgroundStrokeOpacity = config.backgroundStrokeOpacity ?? 1;
        this.sheenFactor = config.sheenFactor ?? 0;
        this.sheenDirection = config.sheenDirection ?? V.UL;
    }
    // --- path construction --------------------------------------------------
    startNewPath(point) {
        this.subpathStarts.push(this.points.length);
        this.points.push(V.clone(point));
        return this;
    }
    addCubicBezier(handle1, handle2, anchor) {
        this.points.push(V.clone(handle1), V.clone(handle2), V.clone(anchor));
        return this;
    }
    addLineTo(point) {
        const last = this.points[this.points.length - 1];
        const [c1, c2] = straightControlPoints(last, point);
        return this.addCubicBezier(c1, c2, point);
    }
    /** manim parity (add_points_as_corners): APPEND straight segments through
     *  `corners` to the existing path — the primitive behind incrementally
     *  growing traces (PointWithTrace). Starts a path if none exists. */
    addPointsAsCorners(corners) {
        if (corners.length === 0)
            return this;
        let i = 0;
        if (this.points.length === 0) {
            this.subpathStarts = [0];
            this.points.push(V.clone(corners[0]));
            this._straightPath = true;
            i = 1;
        }
        for (; i < corners.length; i++)
            this.addLineTo(corners[i]);
        return this;
    }
    // Build an open/closed path through a list of corner points using straight
    // bezier segments. This is how Line / Polygon / Rectangle are defined.
    setPointsAsCorners(corners) {
        this.points = [];
        this.subpathStarts = [0];
        this._straightPath = true; // segments are straight -> cheap to flatten (z-buffer)
        if (corners.length === 0)
            return this;
        this.points.push(V.clone(corners[0]));
        for (let i = 1; i < corners.length; i++)
            this.addLineTo(corners[i]);
        return this;
    }
    // Directly append a pre-computed bezier point list as one subpath. `pts` must
    // have length 1 + 3k (an anchor followed by control/control/anchor triples).
    appendBezierPoints(pts, newSubpath = true) {
        if (pts.length === 0)
            return this;
        if (newSubpath || this.points.length === 0)
            this.subpathStarts.push(this.points.length);
        for (const p of pts)
            this.points.push(V.clone(p));
        return this;
    }
    close() {
        // Close the current subpath back to its start anchor.
        const start = this.subpathStarts[this.subpathStarts.length - 1] ?? 0;
        const first = this.points[start];
        const last = this.points[this.points.length - 1];
        if (first && last && !V.equals(first, last))
            this.addLineTo(first);
        return this;
    }
    // --- smoothing ----------------------------------------------------------
    // Build a smooth cubic spline passing through the given anchor points.
    setPointsSmoothly(anchors) {
        this.points = [];
        this.subpathStarts = [0];
        this._straightPath = false;
        if (anchors.length === 0)
            return this;
        if (anchors.length === 1) {
            this.points.push(V.clone(anchors[0]));
            return this;
        }
        const [h1, h2] = getSmoothCubicBezierHandlePoints(anchors);
        this.points.push(V.clone(anchors[0]));
        for (let i = 0; i < anchors.length - 1; i++) {
            this.addCubicBezier(h1[i], h2[i], anchors[i + 1]);
        }
        return this;
    }
    // Re-derive smooth handles from the existing anchors (per subpath).
    makeSmooth() {
        return this.changeAnchorMode("smooth");
    }
    // Replace handles with straight (1/3, 2/3) control points (per subpath).
    makeJagged() {
        return this.changeAnchorMode("jagged");
    }
    // Recompute all handles in the given anchor mode, preserving anchors & subpaths.
    changeAnchorMode(mode) {
        if (mode !== "smooth" && mode !== "jagged") {
            throw new Error(`Unknown anchor mode: ${mode}`);
        }
        const newPoints = [];
        const newStarts = [];
        for (const sp of this.getSubpaths()) {
            const nc = Math.floor((sp.length - 1) / 3);
            newStarts.push(newPoints.length);
            if (nc < 1) {
                for (const p of sp)
                    newPoints.push(V.clone(p));
                continue;
            }
            const anchors = [sp[0]];
            for (let i = 0; i < nc; i++)
                anchors.push(sp[3 * i + 3]);
            newPoints.push(V.clone(anchors[0]));
            if (mode === "smooth") {
                const [h1, h2] = getSmoothCubicBezierHandlePoints(anchors);
                for (let i = 0; i < anchors.length - 1; i++) {
                    newPoints.push(V.clone(h1[i]), V.clone(h2[i]), V.clone(anchors[i + 1]));
                }
            }
            else {
                for (let i = 0; i < anchors.length - 1; i++) {
                    const [c1, c2] = straightControlPoints(anchors[i], anchors[i + 1]);
                    newPoints.push(c1, c2, V.clone(anchors[i + 1]));
                }
            }
        }
        this.points = newPoints;
        this.subpathStarts = newStarts;
        if (mode === "jagged")
            this._straightPath = true;
        else
            this._straightPath = false;
        return this;
    }
    // --- curve construction -------------------------------------------------
    // Extend the current path to `point` with a handle mirroring the previous
    // curve's outgoing tangent (manim's add_smooth_curve_to).
    addSmoothCurveTo(point) {
        const n = this.points.length;
        if (n === 0) {
            this.startNewPath(point);
            return this;
        }
        const last = this.points[n - 1];
        // The previous handle: second-to-last control point of the last curve.
        const prevHandle = n >= 2 ? this.points[n - 2] : last;
        const handle1 = V.add(last, V.sub(last, prevHandle)); // reflect prev handle
        const handle2 = V.midpoint(handle1, point);
        return this.addCubicBezier(handle1, handle2, point);
    }
    // Elevate a quadratic bezier (handle, anchor) to a cubic and append it.
    addQuadraticBezierCurveTo(handle, anchor) {
        const start = this.points[this.points.length - 1] ?? handle;
        // Degree elevation: cubic controls = start + 2/3(q-start), end + 2/3(q-end).
        const c1 = V.add(start, V.scale(V.sub(handle, start), 2 / 3));
        const c2 = V.add(anchor, V.scale(V.sub(handle, anchor), 2 / 3));
        return this.addCubicBezier(c1, c2, anchor);
    }
    // --- anchor / handle accessors ------------------------------------------
    // All anchors across subpaths: start anchor of each subpath, plus every curve end.
    getAnchors() {
        const out = [];
        for (const sp of this.getSubpaths()) {
            const nc = Math.floor((sp.length - 1) / 3);
            if (sp.length)
                out.push(sp[0]);
            for (let i = 0; i < nc; i++)
                out.push(sp[3 * i + 3]);
        }
        return out;
    }
    // Start anchor of every curve (indices 0, 3, 6, ... within each subpath).
    getStartAnchors() {
        const out = [];
        for (const sp of this.getSubpaths()) {
            const nc = Math.floor((sp.length - 1) / 3);
            for (let i = 0; i < nc; i++)
                out.push(sp[3 * i]);
        }
        return out;
    }
    // End anchor of every curve (indices 3, 6, 9, ...).
    getEndAnchors() {
        const out = [];
        for (const sp of this.getSubpaths()) {
            const nc = Math.floor((sp.length - 1) / 3);
            for (let i = 0; i < nc; i++)
                out.push(sp[3 * i + 3]);
        }
        return out;
    }
    // [startAnchors, handles1, handles2, endAnchors] — one entry per curve.
    getAnchorsAndHandles() {
        const a0s = [], h1s = [], h2s = [], a1s = [];
        for (const sp of this.getSubpaths()) {
            const nc = Math.floor((sp.length - 1) / 3);
            for (let i = 0; i < nc; i++) {
                a0s.push(sp[3 * i]);
                h1s.push(sp[3 * i + 1]);
                h2s.push(sp[3 * i + 2]);
                a1s.push(sp[3 * i + 3]);
            }
        }
        return [a0s, h1s, h2s, a1s];
    }
    // --- direction / winding ------------------------------------------------
    // "CW" or "CCW" for the (first) subpath, via the shoelace formula on anchors.
    getDirection() {
        const anchors = this.getAnchors();
        if (anchors.length < 3)
            return "CCW";
        return shoelaceDirection(anchors);
    }
    // Reverse the order of every point (and the anchor/handle sense) per subpath.
    reversePoints() {
        const newPoints = [];
        const newStarts = [];
        for (const sp of this.getSubpaths()) {
            newStarts.push(newPoints.length);
            for (let i = sp.length - 1; i >= 0; i--)
                newPoints.push(V.clone(sp[i]));
        }
        this.points = newPoints;
        this.subpathStarts = newStarts;
        return this;
    }
    // Alias mirroring manim's reverse_direction.
    reverseDirection() {
        return this.reversePoints();
    }
    // --- per-curve access ---------------------------------------------------
    // Flat list of every curve as [a0, h1, h2, a1].
    _allCurves() {
        const curves = [];
        for (const sp of this.getSubpaths()) {
            const nc = Math.floor((sp.length - 1) / 3);
            for (let i = 0; i < nc; i++) {
                curves.push([sp[3 * i], sp[3 * i + 1], sp[3 * i + 2], sp[3 * i + 3]]);
            }
        }
        return curves;
    }
    getNthCurvePoints(n) {
        return this._allCurves()[n];
    }
    getNthCurveFunction(n) {
        const [a, b, c, d] = this._allCurves()[n];
        return (t) => bezier(a, b, c, d, t);
    }
    getCurveFunctions() {
        return this._allCurves().map(([a, b, c, d]) => (t) => bezier(a, b, c, d, t));
    }
    // Numerically integrate the arc length of the nth curve.
    getNthCurveLength(n, samples = 10) {
        const f = this.getNthCurveFunction(n);
        let length = 0;
        let prev = f(0);
        for (let i = 1; i <= samples; i++) {
            const cur = f(i / samples);
            length += V.distance(prev, cur);
            prev = cur;
        }
        return length;
    }
    // Total arc length of the whole outline.
    getArcLength(samples = 10) {
        let total = 0;
        const nc = this._allCurves().length;
        for (let i = 0; i < nc; i++)
            total += this.getNthCurveLength(i, samples);
        return total;
    }
    // [[function, length], ...] for every curve.
    getCurveFunctionsWithLengths(samples = 10) {
        const curves = this._allCurves();
        return curves.map(([a, b, c, d], i) => {
            const f = (t) => bezier(a, b, c, d, t);
            return [f, this.getNthCurveLength(i, samples)];
        });
    }
    // Approximate proportion along the outline nearest to a given point.
    proportionFromPoint(point, samples = 100) {
        const nc = this._allCurves().length;
        if (nc === 0)
            return 0;
        let best = Infinity;
        let bestAlpha = 0;
        const steps = nc * samples;
        for (let i = 0; i <= steps; i++) {
            const alpha = i / steps;
            const p = this.pointFromProportion(alpha);
            const d = V.distance(p, point);
            if (d < best) {
                best = d;
                bestAlpha = alpha;
            }
        }
        return bestAlpha;
    }
    // --- partial outlines ---------------------------------------------------
    // Make this VMobject the [a, b] slice of `vmobject`'s outline (curve-wise).
    pointwiseBecomePartial(vmobject, a, b) {
        a = Math.max(0, Math.min(1, a));
        b = Math.max(0, Math.min(1, b));
        const curves = vmobject._allCurves();
        const nc = curves.length;
        if (nc === 0) {
            this.points = vmobject.points.map((p) => V.clone(p));
            this.subpathStarts = [...vmobject.subpathStarts];
            return this;
        }
        if (b <= a) {
            // Degenerate: collapse to the single point at proportion a.
            const p = vmobject.pointFromProportion(a);
            this.points = [V.clone(p)];
            this.subpathStarts = [0];
            return this;
        }
        const lowerIndex = Math.floor(a * nc);
        const upperIndex = Math.floor(b * nc);
        const lowerResidue = a * nc - lowerIndex;
        const upperResidue = b * nc - upperIndex;
        const newPoints = [];
        const li = Math.min(lowerIndex, nc - 1);
        const ui = Math.min(upperIndex, nc - 1);
        if (li === ui) {
            const [p0, p1, p2, p3] = curves[li];
            const seg = partialBezier(p0, p1, p2, p3, lowerResidue, upperResidue);
            newPoints.push(seg[0], seg[1], seg[2], seg[3]);
        }
        else {
            // First (partial) curve: [lowerResidue, 1].
            {
                const [p0, p1, p2, p3] = curves[li];
                const seg = partialBezier(p0, p1, p2, p3, lowerResidue, 1);
                newPoints.push(seg[0], seg[1], seg[2], seg[3]);
            }
            // Whole middle curves.
            for (let i = li + 1; i < ui; i++) {
                const [, p1, p2, p3] = curves[i];
                newPoints.push(V.clone(p1), V.clone(p2), V.clone(p3));
            }
            // Last (partial) curve: [0, upperResidue].
            if (ui < nc && upperResidue > 0) {
                const [p0, p1, p2, p3] = curves[ui];
                const seg = partialBezier(p0, p1, p2, p3, 0, upperResidue);
                newPoints.push(V.clone(seg[1]), V.clone(seg[2]), V.clone(seg[3]));
            }
        }
        this.points = newPoints;
        this.subpathStarts = [0];
        this._straightPath = false;
        return this;
    }
    // Return a NEW VMobject that is the [a, b] slice of this one's outline.
    getSubcurve(a, b) {
        const vm = new VMobject();
        vm.setStyle({
            fillColor: this.fillColor,
            fillOpacity: this.fillOpacity,
            strokeColor: this.strokeColor,
            strokeWidth: this.strokeWidth,
            strokeOpacity: this.strokeOpacity,
        });
        vm.pointwiseBecomePartial(this, a, b);
        return vm;
    }
    /**
     * manim parity (prepare_for_nonlinear_transform): subdivide every curve in
     * the family so applyFunction() can BEND paths instead of just moving
     * their endpoints -- a 2-anchor Line stays straight under a nonlinear map
     * until it has interior anchors to displace. Call before
     * `mob.animate.applyFunction(...)` on grids/lines (OpeningManim's warped
     * NumberPlane is the canonical use).
     */
    prepareForNonlinearTransform(nCurves = 50) {
        for (const mob of this.getFamily()) {
            const vm = mob;
            if (typeof vm.insertNCurves === "function" && vm.points?.length) {
                const current = vm.getNumCurves();
                if (current > 0 && current < nCurves)
                    vm.insertNCurves(nCurves - current);
                // Subdivided paths are no longer straight-segment-only.
                vm._straightPath = false;
            }
        }
        return this;
    }
    // --- curve insertion ----------------------------------------------------
    // Insert n additional curves by subdividing existing ones (manim's insert_n_curves).
    insertNCurves(n) {
        if (n <= 0)
            return this;
        const newPoints = [];
        const newStarts = [];
        const subpaths = this.getSubpaths();
        const totalCurves = this.getNumCurves();
        if (totalCurves === 0) {
            // No curves: repeat the single point so counts still grow.
            const only = this.points[0] ?? [0, 0, 0];
            newStarts.push(0);
            newPoints.push(V.clone(only));
            for (let i = 0; i < n; i++) {
                newPoints.push(V.clone(only), V.clone(only), V.clone(only));
            }
            this.points = newPoints;
            this.subpathStarts = newStarts;
            return this;
        }
        // Distribute the n new curves proportionally across subpaths by curve count.
        const perSubpath = [];
        let assigned = 0;
        for (let s = 0; s < subpaths.length; s++) {
            const nc = Math.floor((subpaths[s].length - 1) / 3);
            const share = s === subpaths.length - 1
                ? n - assigned
                : Math.round((nc / totalCurves) * n);
            perSubpath.push(Math.max(0, share));
            assigned += Math.max(0, share);
        }
        for (let s = 0; s < subpaths.length; s++) {
            const sp = subpaths[s];
            const nc = Math.floor((sp.length - 1) / 3);
            newStarts.push(newPoints.length);
            if (nc < 1) {
                for (const p of sp)
                    newPoints.push(V.clone(p));
                continue;
            }
            const add = perSubpath[s];
            const target = nc + add;
            // Split factor per existing curve, spreading `add` as evenly as possible.
            const factors = new Array(nc).fill(1);
            for (let i = 0; i < add; i++)
                factors[i % nc] += 1;
            newPoints.push(V.clone(sp[0]));
            for (let i = 0; i < nc; i++) {
                const curve = [sp[3 * i], sp[3 * i + 1], sp[3 * i + 2], sp[3 * i + 3]];
                const f = factors[i];
                if (f <= 1) {
                    newPoints.push(V.clone(curve[1]), V.clone(curve[2]), V.clone(curve[3]));
                }
                else {
                    const sub = subdivideBezier(curve, f);
                    for (let k = 0; k < f; k++) {
                        newPoints.push(sub[4 * k + 1], sub[4 * k + 2], sub[4 * k + 3]);
                    }
                }
            }
            void target;
        }
        this.points = newPoints;
        this.subpathStarts = newStarts;
        return this;
    }
    // --- queries ------------------------------------------------------------
    getSubpaths() {
        if (this.points.length === 0)
            return [];
        const starts = this.subpathStarts.length ? [...this.subpathStarts] : [0];
        const paths = [];
        for (let i = 0; i < starts.length; i++) {
            const s = starts[i];
            const e = i + 1 < starts.length ? starts[i + 1] : this.points.length;
            const seg = this.points.slice(s, e);
            if (seg.length >= 1)
                paths.push(seg);
        }
        return paths;
    }
    getNumCurves() {
        let n = 0;
        for (const sp of this.getSubpaths())
            n += Math.max(0, Math.floor((sp.length - 1) / 3));
        return n;
    }
    // Point at proportion alpha in [0,1] along the whole (multi-subpath) outline.
    pointFromProportion(alpha) {
        const curves = [];
        for (const sp of this.getSubpaths()) {
            const nc = Math.floor((sp.length - 1) / 3);
            for (let i = 0; i < nc; i++)
                curves.push([sp[3 * i], sp[3 * i + 1], sp[3 * i + 2], sp[3 * i + 3]]);
        }
        if (curves.length === 0)
            return this.points[0] ?? [0, 0, 0];
        const scaled = Math.max(0, Math.min(1, alpha)) * curves.length;
        const idx = Math.min(curves.length - 1, Math.floor(scaled));
        const t = scaled - idx;
        const [a, b, c, d] = curves[idx];
        return bezier(a, b, c, d, t);
    }
    /**
     * Unit tangent of the outline at proportion `alpha` (Motion Canvas's
     * `getPointAtPercentage().tangent`): the exact cubic-bezier derivative
     * B'(t) = 3(1-t)^2(b-a) + 6(1-t)t(c-b) + 3t^2(d-c), normalized.
     */
    tangentAtProportion(alpha) {
        const curves = [];
        for (const sp of this.getSubpaths()) {
            const nc = Math.floor((sp.length - 1) / 3);
            for (let i = 0; i < nc; i++)
                curves.push([sp[3 * i], sp[3 * i + 1], sp[3 * i + 2], sp[3 * i + 3]]);
        }
        if (curves.length === 0)
            return [1, 0, 0];
        const scaled = Math.max(0, Math.min(1, alpha)) * curves.length;
        const idx = Math.min(curves.length - 1, Math.floor(scaled));
        const t = Math.max(1e-6, Math.min(1 - 1e-6, scaled - idx));
        const [a, b, c, d] = curves[idx];
        const u = 1 - t;
        const deriv = [0, 1, 2].map((k) => 3 * u * u * ((b[k] ?? 0) - (a[k] ?? 0)) +
            6 * u * t * ((c[k] ?? 0) - (b[k] ?? 0)) +
            3 * t * t * ((d[k] ?? 0) - (c[k] ?? 0)));
        const len = Math.hypot(deriv[0], deriv[1], deriv[2]);
        return len < 1e-12 ? [1, 0, 0] : [deriv[0] / len, deriv[1] / len, deriv[2] / len];
    }
    // --- style --------------------------------------------------------------
    // `opacity`/`width` also accept a trailing options object (in addition to
    // the plain-positional form), matching the config-object convention the
    // rest of the API uses -- e.g. `setFill(RED, { opacity: 0.3 })`, not just
    // `setFill(RED, 0.3)`. Needed because py2ts folds ALL keyword args from
    // Python's `set_fill(color, opacity=0.3)` into one trailing object; a
    // plain-number-only signature silently assigns that object where a number
    // was expected (`this.fillOpacity` becomes `{opacity: 0.3}`, not `0.3`).
    setFill(color, opacity = 1) {
        if (color != null)
            this.fillColor = Color.parse(color);
        this.fillOpacity = typeof opacity === "object" ? (opacity.opacity ?? this.fillOpacity) : opacity;
        return this;
    }
    setStroke(color, width, opacity = 1) {
        if (color != null)
            this.strokeColor = Color.parse(color);
        if (width != null && typeof width === "object") {
            if (width.width != null)
                this.strokeWidth = width.width;
            if (width.opacity != null)
                this.strokeOpacity = width.opacity;
        }
        else {
            if (width != null)
                this.strokeWidth = width;
            this.strokeOpacity = opacity;
        }
        return this;
    }
    setColor(color) {
        this._color = Color.parse(color);
        this.strokeColor = Color.parse(color);
        this.fillColor = Color.parse(color);
        for (const m of this.submobjects)
            m.setColor(color);
        return this;
    }
    setStyle({ fillColor, fillOpacity, strokeColor, strokeWidth, strokeOpacity } = {}) {
        if (fillColor != null)
            this.fillColor = Color.parse(fillColor);
        if (fillOpacity != null)
            this.fillOpacity = fillOpacity;
        if (strokeColor != null)
            this.strokeColor = Color.parse(strokeColor);
        if (strokeWidth != null)
            this.strokeWidth = strokeWidth;
        if (strokeOpacity != null)
            this.strokeOpacity = strokeOpacity;
        return this;
    }
    setOpacity(o) {
        this.fillOpacity = o;
        this.strokeOpacity = o;
        this.opacity = o;
        for (const m of this.submobjects)
            m.setOpacity(o);
        return this;
    }
    // Background stroke drawn under the main stroke (manim's set_background_stroke).
    setBackgroundStroke({ color, width, opacity } = {}) {
        if (color != null)
            this.backgroundStrokeColor = Color.parse(color);
        if (width != null)
            this.backgroundStrokeWidth = width;
        if (opacity != null)
            this.backgroundStrokeOpacity = opacity;
        return this;
    }
    // Add a linear sheen (gradient) from the base color toward a lightened tint.
    setSheen(factor, direction) {
        this.sheenFactor = factor;
        if (direction != null)
            this.sheenDirection = direction;
        if (factor === 0) {
            this.gradientColors = undefined;
            return this;
        }
        // Two-stop gradient: base color -> color scaled by (1 + factor).
        const base = this.fillOpacity > 0 ? this.fillColor : this.strokeColor;
        const lighten = (c, f) => new Color(Math.max(0, Math.min(1, c.r * (1 + f))), Math.max(0, Math.min(1, c.g * (1 + f))), Math.max(0, Math.min(1, c.b * (1 + f))), c.a);
        this.gradientColors = [base, lighten(base, factor)];
        return this;
    }
    setSheenDirection(dir) {
        this.sheenDirection = dir;
        return this;
    }
    // Fill/stroke with a gradient across the mobject; stored for the renderer.
    setColorByGradient(...colors) {
        this.gradientColors = colors.map((c) => Color.parse(c));
        if (colors.length > 0) {
            this.fillColor = Color.parse(colors[0]);
            this.strokeColor = Color.parse(colors[0]);
        }
        return this;
    }
    // Scale, optionally scaling the stroke width alongside the geometry.
    scale(factor, opts = {}) {
        super.scale(factor, opts);
        if (opts.scaleStroke) {
            this.strokeWidth *= Math.abs(factor);
            this.backgroundStrokeWidth *= Math.abs(factor);
        }
        return this;
    }
    // --- transform support: make two vmobjects have matching point counts ---
    // Resample this subpath's bezier list to exactly `nCurves` curves.
    static _resampleSubpath(sp, nCurves) {
        const curves = [];
        const existing = Math.floor((sp.length - 1) / 3);
        if (existing === 0) {
            const only = sp[0] ?? [0, 0, 0];
            for (let i = 0; i < nCurves; i++)
                curves.push([only, only, only, only]);
        }
        else {
            // Distribute target curves across existing curves as evenly as possible.
            for (let i = 0; i < nCurves; i++) {
                const g = (i / nCurves) * existing;
                const gi = Math.min(existing - 1, Math.floor(g));
                const t0 = g - gi;
                const t1 = ((i + 1) / nCurves) * existing - gi;
                const seg = [sp[3 * gi], sp[3 * gi + 1], sp[3 * gi + 2], sp[3 * gi + 3]];
                curves.push(partialBezier(seg[0], seg[1], seg[2], seg[3], t0, Math.min(1, t1)));
            }
        }
        const out = [curves[0][0]];
        for (const c of curves)
            out.push(c[1], c[2], c[3]);
        return out;
    }
    // Rebuild this VMobject so its points align 1:1 with `other` for interpolation.
    // For each subpath the target curve count is max(thisCurves, otherCurves);
    // existing curves are subdivided (insertNCurves) rather than resampled so the
    // shape is preserved. Empty subpaths fall back to point-repetition.
    alignPointsWith(other) {
        const a = this.getSubpaths();
        const bRaw = other.getSubpaths();
        const nSub = Math.max(a.length, bRaw.length);
        const lastOf = (arr) => (arr.length ? arr[arr.length - 1] : [0, 0, 0]);
        const padTo = (subpaths, padSource) => {
            const out = subpaths.slice();
            while (out.length < nSub)
                out.push([lastOf(padSource[padSource.length - 1] ?? [])]);
            return out;
        };
        const aPadded = padTo(a, a);
        const bPadded = padTo(bRaw, bRaw);
        // Cyclic-rotation correspondence search: a shape whose subpaths were
        // authored/traversed starting from a different point in the cycle (e.g.
        // the same polygon's outline walked from a different vertex) still gets
        // matched subpath-for-subpath by position, not by original array order.
        // nSub<=1 (the dominant case -- simple shapes, single glyphs) is a
        // zero-cost no-op, skipped entirely.
        const b = nSub > 1 ? VMobject._bestSubpathRotation(aPadded, bPadded) : bPadded;
        const newPoints = [];
        const newStarts = [];
        for (let i = 0; i < nSub; i++) {
            const sa = aPadded[i];
            const sb = b[i];
            const ncA = Math.floor((sa.length - 1) / 3);
            const ncB = Math.floor((sb.length - 1) / 3);
            const nc = Math.max(1, ncA, ncB);
            newStarts.push(newPoints.length);
            const resampled = VMobject._growSubpath(sa, nc);
            for (const p of resampled)
                newPoints.push(p);
        }
        this.points = newPoints;
        this.subpathStarts = newStarts;
        return this;
    }
    // Try each of the nSub cyclic rotations of `b`'s subpath order, scoring by
    // total centroid-to-centroid travel distance against `a`'s order, and keep
    // the minimum -- O(n^2), capped at nSub<=32 (falls back to identity order
    // above that, avoiding a perf blowup on pathological many-subpath shapes).
    // Scope is deliberately narrow: subpath ORDER only, not a full permutation/
    // Hungarian assignment, and not the deeper within-subpath starting-vertex
    // twist (a separate, not-yet-scoped follow-up).
    static _bestSubpathRotation(a, b) {
        const nSub = a.length;
        if (nSub > 32)
            return b;
        const aCentroids = a.map((sp) => V.centerOfMass(sp));
        const bCentroids = b.map((sp) => V.centerOfMass(sp));
        const dist = (p, q) => {
            const dx = p[0] - q[0], dy = p[1] - q[1], dz = (p[2] ?? 0) - (q[2] ?? 0);
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        };
        let bestRotation = 0;
        let bestScore = Infinity;
        for (let r = 0; r < nSub; r++) {
            let score = 0;
            for (let i = 0; i < nSub; i++)
                score += dist(aCentroids[i], bCentroids[(i + r) % nSub]);
            if (score < bestScore) {
                bestScore = score;
                bestRotation = r;
            }
        }
        if (bestRotation === 0)
            return b;
        const rotated = [];
        for (let i = 0; i < nSub; i++)
            rotated.push(b[(i + bestRotation) % nSub]);
        return rotated;
    }
    // Grow a single subpath's bezier list to exactly `nCurves` curves by
    // subdividing existing curves (shape-preserving); pads empty subpaths.
    static _growSubpath(sp, nCurves) {
        const existing = Math.floor((sp.length - 1) / 3);
        if (existing === 0) {
            const only = sp[0] ?? [0, 0, 0];
            const out = [V.clone(only)];
            for (let i = 0; i < nCurves; i++)
                out.push(V.clone(only), V.clone(only), V.clone(only));
            return out;
        }
        if (existing >= nCurves) {
            return sp.map((p) => V.clone(p));
        }
        const add = nCurves - existing;
        const factors = new Array(existing).fill(1);
        for (let i = 0; i < add; i++)
            factors[i % existing] += 1;
        const out = [V.clone(sp[0])];
        for (let i = 0; i < existing; i++) {
            const curve = [sp[3 * i], sp[3 * i + 1], sp[3 * i + 2], sp[3 * i + 3]];
            const f = factors[i];
            if (f <= 1) {
                out.push(V.clone(curve[1]), V.clone(curve[2]), V.clone(curve[3]));
            }
            else {
                const sub = subdivideBezier(curve, f);
                for (let k = 0; k < f; k++)
                    out.push(sub[4 * k + 1], sub[4 * k + 2], sub[4 * k + 3]);
            }
        }
        return out;
    }
    interpolate(start, target, alpha) {
        const n = Math.min(this.points.length, start.points.length, target.points.length);
        for (let i = 0; i < n; i++)
            this.points[i] = V.lerp(start.points[i], target.points[i], alpha);
        this.fillColor = Color.lerp(start.fillColor, target.fillColor, alpha);
        this.strokeColor = Color.lerp(start.strokeColor, target.strokeColor, alpha);
        this.fillOpacity = start.fillOpacity + (target.fillOpacity - start.fillOpacity) * alpha;
        this.strokeOpacity = start.strokeOpacity + (target.strokeOpacity - start.strokeOpacity) * alpha;
        this.strokeWidth = start.strokeWidth + (target.strokeWidth - start.strokeWidth) * alpha;
        if (start.effects || target.effects) {
            this.effects = lerpEffects(start.effects, target.effects, alpha);
        }
        const sn = Math.min(this.submobjects.length, start.submobjects.length, target.submobjects.length);
        for (let i = 0; i < sn; i++)
            this.submobjects[i].interpolate(start.submobjects[i], target.submobjects[i], alpha);
        return this;
    }
    copy() {
        const c = super.copy();
        c.strokeColor = Color.parse(this.strokeColor);
        c.fillColor = Color.parse(this.fillColor);
        c.backgroundStrokeColor = Color.parse(this.backgroundStrokeColor);
        c.subpathStarts = [...this.subpathStarts];
        c.sheenDirection = [...this.sheenDirection];
        c.gradientColors = this.gradientColors
            ? this.gradientColors.map((g) => Color.parse(g))
            : undefined;
        return c;
    }
}
// A plain container of VMobjects (manim's VGroup).
export class VGroup extends VMobject {
    constructor(...mobs) {
        super();
        this.add(...mobs);
    }
    arrange(direction = V.RIGHT, buff = 0.25) {
        for (let i = 1; i < this.submobjects.length; i++) {
            this.submobjects[i].nextTo(this.submobjects[i - 1], direction, buff);
        }
        return this;
    }
    get(i) { return this.submobjects[i]; }
}
//# sourceMappingURL=VMobject.js.map