// 3D surfaces for the projection-camera renderer. A Surface is a grid of quad
// faces (each a filled VMobject), Lambertian-shaded by face normal and painter-
// depth-sorted by the renderer when a 3D camera is active — the same CPU
// approach manim's Cairo renderer uses. No GPU/WebGL.
import { VMobject, VGroup } from "./VMobject.js";
import { Color } from "../core/color.js";
import * as V from "../core/math/vector.js";
const DEFAULT_LIGHT = V.normalize([-1, -1, 1]); // upper-left, toward viewer
const AMBIENT = 0.35;
const DIFFUSE = 0.65;
// Marker base for VMobjects that should be Lambertian-shaded and depth-sorted by
// the 3D renderer (manim's ThreeDVMobject sets shade_in_3d = True).
export class ThreeDVMobject extends VMobject {
    shadeIn3d = true;
    constructor(config = {}) {
        super(config);
        this.shadeIn3d = true;
    }
}
// A single quad face carrying its unshaded base color.
class Face extends ThreeDVMobject {
    baseColor;
    _uv;
    _vertexColors;
    constructor(corners, baseColor, config) {
        super(config);
        this.baseColor = Color.parse(baseColor);
        this.setPointsAsCorners([...corners, corners[0]]);
        this.fillColor = Color.parse(baseColor);
        this.fillOpacity = config.fillOpacity ?? 1;
        this.strokeColor = Color.parse(config.strokeColor ?? baseColor);
        this.strokeWidth = config.strokeWidth ?? 0.5;
        this.strokeOpacity = config.strokeOpacity ?? (this.strokeWidth > 0 ? 1 : 0);
    }
}
export class Surface extends VGroup {
    func;
    uRange;
    vRange;
    resolution;
    checkerboard;
    baseFill;
    colorFunc;
    lightDirection;
    shade;
    smooth;
    _faceConfig;
    // func: (u, v) -> [x, y, z]
    constructor(func, config = {}) {
        super();
        this.func = func;
        this.uRange = config.uRange ?? [0, 1];
        this.vRange = config.vRange ?? [0, 1];
        const res = config.resolution ?? 24;
        this.resolution = Array.isArray(res) ? res : [res, res];
        this.fillOpacity = config.fillOpacity ?? 1;
        // manim's Surface is checkerboarded by default; keep solids solid when an
        // explicit fill/colorFunc is given.
        this.checkerboard = config.checkerboardColors ?? config.checkerboard ??
            ((config.fillColor == null && config.color == null && config.colorFunc == null)
                ? ["#29ABCA", "#1C758A"] : null);
        this.baseFill = config.fillColor ?? config.color ?? "#29ABCA";
        this.colorFunc = config.colorFunc ?? null; // (u,v,point) -> color
        this.lightDirection = config.lightDirection ? V.normalize(config.lightDirection) : DEFAULT_LIGHT;
        this.shade = config.shade ?? true;
        // Smooth (Gouraud) shading interpolates per-vertex lighting across each face,
        // removing the faceted look. On by default; set smooth:false for flat faces.
        this.smooth = config.smooth ?? true;
        this._faceConfig = {
            fillOpacity: this.fillOpacity,
            strokeColor: config.strokeColor ?? "#00000055",
            strokeWidth: config.strokeWidth ?? 0.5,
            strokeOpacity: config.strokeOpacity,
        };
        this._build();
        if (this.shade) {
            this.applyShading(this.lightDirection);
            if (this.smooth)
                this.applySmoothShading(this.lightDirection);
        }
        if (config.point)
            this.moveTo(config.point);
    }
    // Analytic-ish surface normal at (u, v) via numerical partial derivatives.
    _normalAt(u, v) {
        const e = 1e-4;
        const du = V.sub(this.func(u + e, v), this.func(u - e, v));
        const dv = V.sub(this.func(u, v + e), this.func(u, v - e));
        const n = V.cross(du, dv);
        const len = V.length(n);
        return len < 1e-9 ? [0, 0, 1] : V.scale(n, 1 / len);
    }
    /**
     * Re-parameterize IN PLACE (3b1b sphere-unwrap style morphs): swap the
     * surface function (and optionally u/v ranges) and rebuild the face mesh,
     * preserving mobject identity so updaters can call this per frame:
     *
     * ```ts
     * surf.addUpdater(() => surf.setFunc((u, v) => unroll(u, v, tracker.value)));
     * ```
     * Faces are rebuilt from scratch each call (constructor-equivalent), so
     * shading/checkerboard reapply exactly as at construction.
     */
    setFunc(func, ranges = {}) {
        this.func = func;
        if (ranges.uRange)
            this.uRange = ranges.uRange;
        if (ranges.vRange)
            this.vRange = ranges.vRange;
        this.submobjects.length = 0;
        this._build();
        if (this.shade) {
            this.applyShading(this.lightDirection);
            if (this.smooth)
                this.applySmoothShading(this.lightDirection);
        }
        return this;
    }
    _build() {
        const [nu, nv] = this.resolution;
        const [u0, u1] = this.uRange;
        const [v0, v1] = this.vRange;
        const uAt = (i) => u0 + (u1 - u0) * (i / nu);
        const vAt = (j) => v0 + (v1 - v0) * (j / nv);
        const defaultChecker = this.checkerboard ?? ["#29ABCA", "#1C758A"];
        for (let i = 0; i < nu; i++) {
            for (let j = 0; j < nv; j++) {
                const ua = uAt(i), ub = uAt(i + 1);
                const va = vAt(j), vb = vAt(j + 1);
                const corners = [
                    this.func(ua, va),
                    this.func(ub, va),
                    this.func(ub, vb),
                    this.func(ua, vb),
                ];
                let color;
                if (this.colorFunc)
                    color = this.colorFunc(ua, va, corners[0]);
                else if (this.checkerboard)
                    color = defaultChecker[(i + j) % 2];
                else
                    color = this.baseFill;
                const face = new Face(corners, color, this._faceConfig);
                face._uv = [[ua, va], [ub, va], [ub, vb], [ua, vb]]; // corner params
                this.add(face);
            }
        }
    }
    // Per-vertex (Gouraud) shading: light each corner by its smooth surface normal
    // and hand the renderer per-vertex colors so lighting interpolates across the
    // face. Shared grid vertices get the same normal -> seamless smooth surface.
    applySmoothShading(lightDir = this.lightDirection) {
        const light = V.normalize(lightDir);
        const center = this.getCenter();
        for (const face of this.submobjects) {
            if (!face._uv)
                continue;
            const base = face.baseColor;
            const colors = face._uv.map(([u, v], k) => {
                let n = this._normalAt(u, v);
                // Orient outward from the surface center for consistent lit/unlit sides.
                const corner = this.func(u, v);
                if (V.dot(n, V.sub(corner, center)) < 0)
                    n = V.neg(n);
                const b = Math.min(1, AMBIENT + DIFFUSE * Math.max(0, V.dot(n, light)));
                return [base.r * b * 255, base.g * b * 255, base.b * b * 255];
            });
            // The flattened face loop is [P0,P1,P2,P3,P0]; match with a closing color.
            face._vertexColors = [colors[0], colors[1], colors[2], colors[3], colors[0]];
        }
        return this;
    }
    // Re-shade every face using its outward normal vs the light direction. Called
    // at build; call again after deforming the surface to keep lighting correct.
    applyShading(lightDir = this.lightDirection) {
        const light = V.normalize(lightDir);
        const center = this.getCenter();
        for (const face of this.submobjects) {
            const p = face.points;
            if (p.length < 7)
                continue;
            const a = p[0], b = p[3], c = p[6]; // three anchors of the quad
            let n = V.normalize(V.cross(V.sub(b, a), V.sub(c, a)));
            // Orient outward from the surface center so lit/unlit sides are consistent.
            const faceCenter = face.getCenter();
            if (V.dot(n, V.sub(faceCenter, center)) < 0)
                n = V.neg(n);
            const brightness = Math.min(1, AMBIENT + DIFFUSE * Math.max(0, V.dot(n, light)));
            const base = face.baseColor;
            face.fillColor = new Color(base.r * brightness, base.g * brightness, base.b * brightness, base.a);
        }
        return this;
    }
    setFillOpacity(o) {
        for (const f of this.submobjects)
            f.fillOpacity = o;
        this.fillOpacity = o;
        return this;
    }
    /** manim parity (set_style): restyle every face post-construction. */
    setStyle(style = {}) {
        for (const f of this.submobjects) {
            if (style.fillOpacity != null)
                f.fillOpacity = style.fillOpacity;
            if (style.fillColor != null)
                f.setFill(style.fillColor);
            if (style.strokeColor != null)
                f.setStroke(style.strokeColor);
            if (style.strokeWidth != null)
                f.strokeWidth = style.strokeWidth;
            if (style.strokeOpacity != null)
                f.strokeOpacity = style.strokeOpacity;
        }
        if (style.fillOpacity != null)
            this.fillOpacity = style.fillOpacity;
        return this;
    }
    /** manim parity (set_fill_by_checkerboard): recolor faces in a 2-color
     *  checker pattern AFTER construction, then re-shade. */
    setFillByCheckerboard(colorA, colorB, opts = {}) {
        this.checkerboard = [colorA, colorB];
        // Faces were built i-major over a [nu, nv] grid (see _build) -- recover
        // (i, j) from the index and repaint each face's shading BASE color.
        const [, nv] = this.resolution;
        this.submobjects.forEach((f, idx) => {
            const i = Math.floor(idx / nv);
            const j = idx % nv;
            const color = (i + j) % 2 === 0 ? colorA : colorB;
            f.baseColor = Color.parse(color);
            f.fillColor = Color.parse(color);
            if (opts.opacity != null)
                f.fillOpacity = opts.opacity;
        });
        if (opts.opacity != null)
            this.fillOpacity = opts.opacity;
        if (this.shade) {
            this.applyShading(this.lightDirection);
            if (this.smooth)
                this.applySmoothShading(this.lightDirection);
        }
        return this;
    }
    // Recolor each face by the value of a chosen coordinate (manim's
    // Surface.set_fill_by_value). `colorscale` is a list of colors, or a list of
    // [color, pivotValue] pairs. When pivots are omitted they are spread evenly
    // across the surface's extent along `axis`. `axes` (optional, ThreeDAxes-like)
    // maps a point to data coordinates via point_to_coords/pointToCoords; when
    // absent the raw coordinate is used. Re-runs shading afterward.
    setFillByValue(opts = {}) {
        const axis = opts.axis ?? 2;
        const scale = opts.colorscale;
        if (!scale || scale.length === 0)
            return this;
        const toCoord = (p) => {
            const axes = opts.axes;
            if (axes && typeof axes.pointToCoords === "function")
                return axes.pointToCoords(p)[axis];
            if (axes && typeof axes.point_to_coords === "function")
                return axes.point_to_coords(p)[axis];
            return p[axis];
        };
        // Split into [colors, pivots]. Fill missing pivots evenly across the range.
        const hasPivots = Array.isArray(scale[0]) && scale[0].length === 2 &&
            typeof scale[0][1] === "number";
        const colors = [];
        let pivots = [];
        if (hasPivots) {
            for (const entry of scale) {
                colors.push(Color.parse(entry[0]));
                pivots.push(entry[1]);
            }
        }
        else {
            for (const c of scale)
                colors.push(Color.parse(c));
            // Even pivots across the min/max of the chosen coordinate.
            let lo = Infinity, hi = -Infinity;
            for (const f of this.submobjects) {
                const val = toCoord(f.getMidpoint());
                if (val < lo)
                    lo = val;
                if (val > hi)
                    hi = val;
            }
            if (!Number.isFinite(lo)) {
                lo = 0;
                hi = 1;
            }
            const n = colors.length;
            pivots = colors.map((_, i) => (n === 1 ? lo : lo + (hi - lo) * (i / (n - 1))));
        }
        const interp = (value) => {
            if (value <= pivots[0])
                return colors[0];
            if (value >= pivots[pivots.length - 1])
                return colors[colors.length - 1];
            for (let i = 0; i < pivots.length - 1; i++) {
                if (value >= pivots[i] && value <= pivots[i + 1]) {
                    const span = pivots[i + 1] - pivots[i];
                    const t = span === 0 ? 0 : (value - pivots[i]) / span;
                    return Color.lerp(colors[i], colors[i + 1], t);
                }
            }
            return colors[colors.length - 1];
        };
        for (const f of this.submobjects) {
            const val = toCoord(f.getMidpoint());
            const c = interp(val);
            f.baseColor = c;
            f.fillColor = c;
        }
        // Re-apply lighting on the new base colors.
        if (this.shade) {
            this.applyShading(this.lightDirection);
            if (this.smooth)
                this.applySmoothShading(this.lightDirection);
        }
        return this;
    }
}
export const ParametricSurface = Surface;
export class Sphere extends Surface {
    radius;
    constructor(config = {}) {
        const r = config.radius ?? 1;
        const func = (u, v) => [
            r * Math.sin(u) * Math.cos(v),
            r * Math.sin(u) * Math.sin(v),
            r * Math.cos(u),
        ];
        super(func, {
            uRange: [0, Math.PI],
            vRange: [0, 2 * Math.PI],
            resolution: config.resolution ?? [18, 36],
            fillColor: config.fillColor ?? config.color ?? "#58C4DD",
            ...config,
        });
        this.radius = r;
    }
}
export class Torus extends Surface {
    constructor(config = {}) {
        const R = config.majorRadius ?? 3; // manim default major/minor = 3/1
        const r = config.minorRadius ?? 1;
        const func = (u, v) => [
            (R + r * Math.cos(v)) * Math.cos(u),
            (R + r * Math.cos(v)) * Math.sin(u),
            r * Math.sin(v),
        ];
        super(func, {
            uRange: [0, 2 * Math.PI],
            vRange: [0, 2 * Math.PI],
            resolution: config.resolution ?? [36, 18],
            fillColor: config.fillColor ?? config.color ?? "#9A72AC",
            ...config,
        });
    }
}
// Build a filled disc (a polygon cap) at height z, radius r, in the xy-plane.
// Used for Cylinder/Cone caps. Returned as a single ThreeDVMobject face.
function discFace(r, z, color, segments, faceCfg) {
    const corners = [];
    for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        corners.push([r * Math.cos(a), r * Math.sin(a), z]);
    }
    return new Face(corners, color, faceCfg);
}
export class Cylinder extends Surface {
    radius;
    cylHeight;
    showEnds;
    axisDirection;
    constructor(config = {}) {
        const r = config.radius ?? 1;
        const h = config.height ?? 2;
        const func = (u, v) => [r * Math.cos(u), r * Math.sin(u), v];
        super(func, {
            uRange: [0, 2 * Math.PI],
            vRange: [-h / 2, h / 2],
            resolution: config.resolution ?? [36, 8],
            fillColor: config.fillColor ?? config.color ?? "#83C167",
            ...config,
        });
        this.radius = r;
        this.cylHeight = h;
        this.showEnds = config.showEnds ?? true;
        this.axisDirection = V.OUT;
        if (this.showEnds)
            this.addBases();
        const dir = config.direction ?? V.OUT;
        if (!V.equals(V.normalize(dir), V.OUT))
            this.setDirection(dir);
        else if (config.point)
            this.moveTo(config.point);
    }
    // Two disc caps at the top (+h/2) and bottom (-h/2) of the lateral surface.
    addBases() {
        const capColor = this.baseFill;
        const segments = this.resolution[0];
        const faceCfg = { ...this._faceConfig };
        const top = discFace(this.radius, this.cylHeight / 2, capColor, segments, faceCfg);
        const bottom = discFace(this.radius, -this.cylHeight / 2, capColor, segments, faceCfg);
        this.add(top, bottom);
        if (this.shade) {
            this.applyShading(this.lightDirection);
            if (this.smooth)
                this.applySmoothShading(this.lightDirection);
        }
        return this;
    }
    // Orient the cylinder's axis along `direction` (rotating from +Z).
    setDirection(direction) {
        const center = this.getCenter();
        this.axisDirection = V.normalize(direction);
        this.applyToPoints((p) => V.add(center, V.matrixVectorProduct(V.zToVector(direction), V.sub(p, center))));
        return this;
    }
    getCylinderDirection() { return this.axisDirection; }
    get3dDirection() { return this.axisDirection; }
    getDirection3d() { return this.axisDirection; }
    // Centers of the two ends, along the axis.
    getStart() {
        return V.add(this.getCenter(), V.scale(this.axisDirection, this.cylHeight / 2));
    }
    getEnd() {
        return V.add(this.getCenter(), V.scale(this.axisDirection, -this.cylHeight / 2));
    }
}
export class Cone extends Surface {
    baseR;
    coneHeight;
    showBase;
    axisDirection;
    constructor(config = {}) {
        const r = config.baseRadius ?? 1;
        const h = config.height ?? 1; // manim Cone default height = 1
        // v in [0,1] from apex (z=h) to base (z=0), so the apex is along +Z.
        const func = (u, v) => [r * v * Math.cos(u), r * v * Math.sin(u), h * (1 - v)];
        super(func, {
            uRange: [0, 2 * Math.PI],
            vRange: [0, 1],
            resolution: config.resolution ?? [36, 8],
            fillColor: config.fillColor ?? config.color ?? "#FF862F",
            ...config,
        });
        this.baseR = r;
        this.coneHeight = h;
        this.showBase = config.showBase ?? false;
        this.axisDirection = V.OUT;
        if (this.showBase)
            this.addBase();
        // manim: apex points along `direction`, default -Z.
        const dir = config.direction ?? V.IN;
        if (!V.equals(V.normalize(dir), V.OUT))
            this.setDirection(dir);
        else if (config.point)
            this.moveTo(config.point);
    }
    // A disc cap at the base (z=0, before orientation).
    addBase() {
        const faceCfg = { ...this._faceConfig };
        const base = discFace(this.baseR, 0, this.baseFill, this.resolution[0], faceCfg);
        this.add(base);
        if (this.shade) {
            this.applyShading(this.lightDirection);
            if (this.smooth)
                this.applySmoothShading(this.lightDirection);
        }
        return this;
    }
    // Orient the cone so its apex points along `direction` (rotating from +Z).
    setDirection(direction) {
        const center = this.getCenter();
        this.axisDirection = V.normalize(direction);
        this.applyToPoints((p) => V.add(center, V.matrixVectorProduct(V.zToVector(direction), V.sub(p, center))));
        return this;
    }
    get3dDirection() { return this.axisDirection; }
    getConeDirection() { return this.axisDirection; }
    getDirection3d() { return this.axisDirection; }
    // Apex (tip) and base center. The local apex is at z=h, base at z=0; after
    // orientation the apex lies along axisDirection from the geometric center.
    getStart() {
        return V.add(this.getCenter(), V.scale(this.axisDirection, this.coneHeight / 2));
    }
    getEnd() {
        return V.add(this.getCenter(), V.scale(this.axisDirection, -this.coneHeight / 2));
    }
}
export class Dot3D extends Sphere {
    constructor(config = {}) {
        const point = config.point ?? V.ORIGIN;
        super({
            radius: config.radius ?? 0.08,
            resolution: config.resolution ?? [8, 8],
            fillColor: config.fillColor ?? config.color ?? "#FFFFFF",
            color: config.color ?? "#FFFFFF",
            ...config,
        });
        this.moveTo(point);
    }
}
export class Line3D extends Cylinder {
    lineStart;
    lineEnd;
    constructor(start = V.LEFT, end = V.RIGHT, config = {}) {
        const thickness = config.thickness ?? 0.02;
        const length = V.distance(start, end);
        const res = config.resolution ?? 24;
        super({
            radius: thickness / 2,
            height: length,
            resolution: Array.isArray(res) ? res : [res, res],
            fillColor: config.fillColor ?? config.color ?? "#FFFFFF",
            color: config.color ?? "#FFFFFF",
            showEnds: config.showEnds ?? false,
            ...config,
            // Orientation handled below, not via Cylinder's direction path.
            direction: V.OUT,
        });
        this.lineStart = V.clone(start);
        this.lineEnd = V.clone(end);
        // Orient the +Z cylinder along (end - start), then move to the midpoint.
        const axis = length < 1e-9 ? V.OUT : V.normalize(V.sub(end, start));
        if (!V.equals(axis, V.OUT))
            this.setDirection(axis);
        else
            this.axisDirection = V.OUT;
        this.moveTo(V.midpoint(start, end));
    }
    getStart() { return V.clone(this.lineStart); }
    getEnd() { return V.clone(this.lineEnd); }
    // A line parallel to `line`, centered at `point`, of the given length.
    static parallelTo(line, point = V.ORIGIN, length = 5, config = {}) {
        const dir = V.normalize(V.sub(line.getEnd(), line.getStart()));
        const half = V.scale(dir, length / 2);
        return new Line3D(V.sub(point, half), V.add(point, half), config);
    }
    // A line perpendicular to `line`, centered at `point`, of the given length.
    static perpendicularTo(line, point = V.ORIGIN, length = 5, config = {}) {
        const dir = V.normalize(V.sub(line.getEnd(), line.getStart()));
        // Any vector perpendicular to `dir`: cross with a non-parallel reference.
        let perp = V.cross(dir, V.OUT);
        if (V.length(perp) < 1e-9)
            perp = V.cross(dir, V.RIGHT);
        perp = V.normalize(perp);
        const half = V.scale(perp, length / 2);
        return new Line3D(V.sub(point, half), V.add(point, half), config);
    }
}
export class Arrow3D extends VGroup {
    arrowStart;
    arrowEnd;
    shaft;
    tip;
    constructor(start = V.LEFT, end = V.RIGHT, config = {}) {
        super();
        const thickness = config.thickness ?? 0.02;
        const tipHeight = config.height ?? 0.3;
        const baseRadius = config.baseRadius ?? 0.08;
        const color = config.fillColor ?? config.color ?? "#FFFFFF";
        this.arrowStart = V.clone(start);
        this.arrowEnd = V.clone(end);
        const axis = V.distance(start, end) < 1e-9 ? V.RIGHT : V.normalize(V.sub(end, start));
        // Shorten the shaft so the cone tip ends exactly at `end`.
        const shaftEnd = V.sub(end, V.scale(axis, tipHeight));
        this.shaft = new Line3D(start, shaftEnd, { thickness, color, fillColor: color });
        // Cone apex points along the arrow direction; place base center at shaftEnd.
        this.tip = new Cone({
            baseRadius,
            height: tipHeight,
            direction: axis,
            showBase: true,
            color,
            fillColor: color,
        });
        // Cone's center sits between apex and base; move so apex reaches `end`.
        this.tip.moveTo(V.midpoint(shaftEnd, end));
        this.add(this.shaft, this.tip);
    }
    getStart() { return V.clone(this.arrowStart); }
    getEnd() { return V.clone(this.arrowEnd); }
}
// Axis-aligned box built from 6 flat quad faces (each shaded by its normal).
export class Box extends VGroup {
    constructor(config = {}) {
        super();
        const dims = config.dimensions;
        const w = (dims ? dims[0] : config.width ?? 2) / 2;
        const h = (dims ? dims[1] : config.height ?? 2) / 2;
        const d = (dims ? dims[2] : config.depth ?? 2) / 2;
        const color = config.fillColor ?? config.color ?? "#58C4DD";
        const light = config.lightDirection ? V.normalize(config.lightDirection) : DEFAULT_LIGHT;
        const faceCfg = {
            // manim Cube/Prism defaults: fill_opacity 0.75, stroke_width 0.
            fillOpacity: config.fillOpacity ?? 0.75,
            strokeColor: config.strokeColor ?? "#00000066",
            strokeWidth: config.strokeWidth ?? 0,
        };
        // Corner helper.
        const c = (sx, sy, sz) => [sx * w, sy * h, sz * d];
        // Each face: 4 corners in CCW order (outward normal) + outward normal.
        const faces = [
            { pts: [c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), c(1, -1, 1)], n: [1, 0, 0] },
            { pts: [c(-1, 1, -1), c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1)], n: [-1, 0, 0] },
            { pts: [c(-1, 1, -1), c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1)], n: [0, 1, 0] },
            { pts: [c(-1, -1, 1), c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1)], n: [0, -1, 0] },
            { pts: [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)], n: [0, 0, 1] },
            { pts: [c(-1, 1, -1), c(1, 1, -1), c(1, -1, -1), c(-1, -1, -1)], n: [0, 0, -1] },
        ];
        for (const f of faces) {
            const brightness = Math.min(1, AMBIENT + DIFFUSE * Math.max(0, V.dot(f.n, light)));
            const base = Color.parse(color);
            const shaded = new Color(base.r * brightness, base.g * brightness, base.b * brightness, base.a);
            const face = new Face(f.pts, shaded, faceCfg);
            face.fillColor = shaded;
            this.add(face);
        }
        if (config.point)
            this.moveTo(config.point);
    }
}
export class Prism extends Box {
    dimensions;
    constructor(config = {}) {
        const dims = (config.dimensions ?? [3, 2, 1]);
        super({ ...config, dimensions: dims });
        this.dimensions = dims;
    }
}
export class Cube extends Box {
    constructor(config = {}) {
        const s = config.sideLength ?? 2;
        super({ ...config, dimensions: [s, s, s] });
    }
}
//# sourceMappingURL=surface.js.map