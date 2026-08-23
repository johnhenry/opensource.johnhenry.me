// Base class for every object in a scene. Holds a transform-able point cloud
// plus a tree of submobjects. VMobject extends this with bezier drawing.
import * as V from "../core/math/vector.js";
import { Color } from "../core/color.js";
import { makeAnimateBuilder } from "../animation/composition.js";
import { copyMemberwiseStyle } from "./copy_style.js";
import { lerpEffects } from "../core/effects.js";
let _idCounter = 0;
export class Mobject {
    id;
    points;
    submobjects;
    name;
    /**
     * Backing field for `.color`. Subclasses (e.g. VMobject.setColor) write
     * here directly to avoid re-entering the `color` setter below.
     */
    _color;
    opacity;
    zIndex;
    updaters;
    updatingSuspended;
    savedState;
    target;
    /** Opt-in marker read by CanvasRenderer's static-subtree render cache
     *  (set via cacheStatic()). Mainly helps static-camera scenes with many
     *  unchanging elements (dense axis labels, background grids). */
    _cacheStatic;
    /** Visual effects (blur/glow/shadow/colorAdjust/noise) applied by the
     *  renderer at draw time -- see the fluent helpers in the style section
     *  below and src/core/effects.ts for renderer support notes. */
    effects;
    /** Canvas blend mode for this mobject's own draw (Motion Canvas
     *  `compositeOperation`), e.g. "multiply", "screen", "destination-out".
     *  Applies against whatever is already on the canvas beneath it; scope it
     *  with a CompositeGroup to blend only against siblings. Canvas backends
     *  only. */
    compositeOperation;
    constructor(config = {}) {
        this.id = _idCounter++;
        this.points = []; // array of [x,y,z]
        this.submobjects = [];
        this.name = config.name || this.constructor.name;
        this._color = Color.parse(config.color ?? "#FFFFFF");
        this.opacity = config.opacity ?? 1;
        this.zIndex = config.zIndex ?? 0;
        this.updaters = [];
        this.updatingSuspended = false;
    }
    /**
     * Raw assignment (`mob.color = "#E8833A"`) forwards to `setColor()` so it
     * actually recolors the render (subclasses like VMobject read
     * strokeColor/fillColor, not this field, for drawing) instead of silently
     * updating a field nothing downstream looks at.
     */
    get color() {
        return this._color;
    }
    set color(value) {
        this.setColor(value);
    }
    // --- tree ---------------------------------------------------------------
    add(...mobs) {
        for (const m of mobs.flat()) {
            if (m && !this.submobjects.includes(m))
                this.submobjects.push(m);
        }
        return this;
    }
    remove(...mobs) {
        const set = new Set(mobs.flat());
        this.submobjects = this.submobjects.filter((m) => !set.has(m));
        return this;
    }
    // Iterate direct submobjects (matches Python manim's VGroup __iter__ —
    // shallow, not the recursive family). Lets `for (const m of group)` and
    // `[...group]` work directly, without needing `.submobjects`.
    [Symbol.iterator]() {
        return this.submobjects[Symbol.iterator]();
    }
    // All mobjects in this subtree that actually carry points (family members).
    getFamily() {
        const out = [this];
        for (const s of this.submobjects)
            out.push(...s.getFamily());
        return out;
    }
    // Every point across the whole family — the basis for transforms & bounds.
    *allPoints() {
        for (const m of this.getFamily()) {
            for (const p of m.points)
                yield p;
        }
    }
    // --- transforms ---------------------------------------------------------
    applyToPoints(fn) {
        for (const m of this.getFamily()) {
            for (let i = 0; i < m.points.length; i++)
                m.points[i] = fn(m.points[i]);
        }
        return this;
    }
    shift(...vectors) {
        const total = vectors
            .filter((v) => Array.isArray(v))
            .reduce((acc, v) => V.add(acc, v), [0, 0, 0]);
        return this.applyToPoints((p) => V.add(p, total));
    }
    moveTo(pointOrMobject, aboutEdge = V.ORIGIN) {
        const target = pointOrMobject instanceof Mobject
            ? pointOrMobject.getCenter()
            : pointOrMobject;
        const ref = this.getBoundaryPoint(aboutEdge);
        return this.shift(V.sub(target, ref));
    }
    scale(factor, { aboutPoint } = {}) {
        const center = aboutPoint ?? this.getCenter();
        // manim parity: a VECTOR factor scales each axis independently by its
        // literal component (`frame.animate.scale([0.5, 1.5, 0])` — a 0 flattens
        // that axis, exactly as manim does).
        if (Array.isArray(factor)) {
            const f = factor;
            return this.applyToPoints((p) => [
                center[0] + (p[0] - center[0]) * (f[0] ?? 1),
                center[1] + (p[1] - center[1]) * (f[1] ?? 1),
                center[2] + (p[2] - center[2]) * (f[2] ?? 1),
            ]);
        }
        return this.applyToPoints((p) => V.add(center, V.scale(V.sub(p, center), factor)));
    }
    stretch(factor, dim, { aboutPoint } = {}) {
        const center = aboutPoint ?? this.getCenter();
        return this.applyToPoints((p) => {
            const q = V.clone(p);
            q[dim] = center[dim] + (q[dim] - center[dim]) * factor;
            return q;
        });
    }
    /** Motion-Canvas parity (findAll): every descendant (including self)
     *  matching the predicate — e.g. `findAll(view, (m) => m instanceof Text)`. */
    findAll(predicate) {
        return this.getFamily().filter(predicate);
    }
    /** manim parity (replace): move onto `other` and match its size along
     *  `dimToMatch` (0=width, 1=height); `stretch` matches BOTH dimensions. */
    replace(other, { dimToMatch = 0, stretch = false } = {}) {
        if (stretch) {
            const w = other.getWidth() / Math.max(1e-12, this.getWidth());
            const h = other.getHeight() / Math.max(1e-12, this.getHeight());
            this.scale([w, h, 1]);
        }
        else {
            const ratio = dimToMatch === 1
                ? other.getHeight() / Math.max(1e-12, this.getHeight())
                : other.getWidth() / Math.max(1e-12, this.getWidth());
            this.scale(ratio);
        }
        return this.moveTo(other.getCenter());
    }
    /** manim parity: rotate about the world origin (not the mobject center). */
    rotateAboutOrigin(angle, axis = V.OUT) {
        return this.rotate(angle, { axis, aboutPoint: V.ORIGIN });
    }
    rotate(angle, { axis = V.OUT, aboutPoint } = {}) {
        const center = aboutPoint ?? this.getCenter();
        return this.applyToPoints((p) => V.add(center, V.rotateVector(V.sub(p, center), angle, axis)));
    }
    flip(axis = V.UP, opts = {}) {
        return this.rotate(Math.PI, { axis, ...opts });
    }
    // --- bounds -------------------------------------------------------------
    getBoundingBox() {
        let min = [Infinity, Infinity, Infinity];
        let max = [-Infinity, -Infinity, -Infinity];
        let any = false;
        for (const p of this.allPoints()) {
            any = true;
            for (let i = 0; i < 3; i++) {
                if (p[i] < min[i])
                    min[i] = p[i];
                if (p[i] > max[i])
                    max[i] = p[i];
            }
        }
        if (!any)
            return { min: [0, 0, 0], max: [0, 0, 0] };
        return { min, max };
    }
    getCenter() {
        const { min, max } = this.getBoundingBox();
        return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    }
    // A point on the bounding box in the given direction (e.g. UP-edge, corner).
    getBoundaryPoint(direction) {
        const { min, max } = this.getBoundingBox();
        const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
        return [
            direction[0] === 0 ? center[0] : direction[0] > 0 ? max[0] : min[0],
            direction[1] === 0 ? center[1] : direction[1] > 0 ? max[1] : min[1],
            direction[2] === 0 ? center[2] : direction[2] > 0 ? max[2] : min[2],
        ];
    }
    getWidth() {
        const { min, max } = this.getBoundingBox();
        return max[0] - min[0];
    }
    getHeight() {
        const { min, max } = this.getBoundingBox();
        return max[1] - min[1];
    }
    getDepth() {
        const { min, max } = this.getBoundingBox();
        return max[2] - min[2];
    }
    getTop() { return this.getBoundaryPoint(V.UP); }
    getBottom() { return this.getBoundaryPoint(V.DOWN); }
    getLeft() { return this.getBoundaryPoint(V.LEFT); }
    getRight() { return this.getBoundaryPoint(V.RIGHT); }
    getCorner(dir) { return this.getBoundaryPoint(dir); }
    setWidth(w, stretch = false) {
        return this.rescaleToFit(w, 0, stretch);
    }
    setHeight(h, stretch = false) {
        return this.rescaleToFit(h, 1, stretch);
    }
    // --- positioning helpers ------------------------------------------------
    toEdge(edge, buff = 0.5, frame = { width: 14.222, height: 8 }) {
        const target = [
            edge[0] * (frame.width / 2 - buff),
            edge[1] * (frame.height / 2 - buff),
            0,
        ];
        const ref = this.getBoundaryPoint(edge);
        // Only shift along the non-zero components of edge.
        const delta = V.sub(target, ref);
        for (let i = 0; i < 3; i++)
            if (edge[i] === 0)
                delta[i] = 0;
        return this.shift(delta);
    }
    toCorner(corner, buff = 0.5, frame) {
        return this.toEdge(corner, buff, frame);
    }
    center() {
        return this.shift(V.neg(this.getCenter()));
    }
    nextTo(mobjectOrPoint, direction = V.RIGHT, buff = 0.25, aligned = null) {
        const anchor = mobjectOrPoint instanceof Mobject
            ? mobjectOrPoint.getBoundaryPoint(direction)
            : mobjectOrPoint;
        const ref = this.getBoundaryPoint(V.neg(direction));
        const target = V.add(anchor, V.scale(direction, buff));
        let delta = V.sub(target, ref);
        // Keep the perpendicular components aligned to the anchor's center.
        return this.shift(delta);
    }
    // --- style --------------------------------------------------------------
    setColor(color) {
        this._color = Color.parse(color);
        for (const m of this.submobjects)
            m.setColor(color);
        return this;
    }
    setOpacity(o) {
        this.opacity = o;
        for (const m of this.submobjects)
            m.setOpacity(o);
        return this;
    }
    fade(darkness = 0.5) {
        return this.setOpacity(this.opacity * (1 - darkness));
    }
    // --- visual effects (src/core/effects.ts) --------------------------------
    // Renderer support varies: CanvasRenderer applies these per-mobject via an
    // offscreen composite (2D path; in 3D scenes only overlay text/images and
    // fixed-in-frame mobjects -- z-buffered solid geometry is skipped);
    // SVGRenderer emits native <filter> defs; ThreeRenderer ignores them (use
    // its post-processing pipeline instead). See docs/renderers.md.
    addEffect(...effects) {
        (this.effects ??= []).push(...effects);
        return this;
    }
    clearEffects() {
        this.effects = undefined;
        return this;
    }
    blur(radius) {
        return this.addEffect({ type: "blur", radius });
    }
    glow(radius, color, strength) {
        return this.addEffect({ type: "glow", radius, color, strength });
    }
    dropShadow(opts = {}) {
        return this.addEffect({
            type: "shadow", blur: opts.blur ?? 8, color: opts.color,
            offsetX: opts.offsetX, offsetY: opts.offsetY,
        });
    }
    colorAdjust(opts) {
        return this.addEffect({ type: "colorAdjust", ...opts });
    }
    noise(amount, opts = {}) {
        return this.addEffect({ type: "noise", amount, ...opts });
    }
    // Ergonomic animation builder: `scene.play(mob.animate.shift(RIGHT).scale(2))`.
    get animate() {
        return makeAnimateBuilder(this);
    }
    // --- updaters (for continuous animation) --------------------------------
    /**
     * `config.hashExtra` is an OPT-IN cache-safety escape hatch: the
     * partial-movie cache's `wait()` fingerprint (Scene.ts's
     * `_sceneContentFingerprint()` / `_mobjectFingerprint()`) can see this
     * mobject's geometry/paint at wait-time, but has no way to see state an
     * updater CLOSURE captures that only affects the simulation trajectory
     * DURING the hold (e.g. a flocking sim's `perceptionRadius`, a spring's
     * `springing`/`damping`) — tuning such a parameter without touching
     * anything the fingerprint DOES see let a stale cached segment replay
     * silently (found porting the p5.js campaign's boids/soft-body demos).
     * Supply `hashExtra: () => string` (mirroring Animation's own
     * `_hashExtra()` convention) to fold that state into the hash:
     *
     * ```ts
     * flock.addUpdater((_m, dt) => flock.step(dt), {
     *   hashExtra: () => `${flock.perceptionRadius}:${flock.maxForce}`,
     * });
     * ```
     *
     * Mechanism: attaches `hashExtra` as a property on `fn` itself (matching
     * how `_hashExtra` already lives directly on Animation instances) rather
     * than changing `Updater`'s type or how `this.updaters` is stored/walked
     * elsewhere. Opt-in — nothing forces a caller to supply it, so this
     * reduces the footgun rather than eliminating the class of mistake; the
     * only airtight fix would be always folding in the whole scene, which is
     * deliberately NOT done here for performance (see the play()-hash fix in
     * hashAnimations() for the same tradeoff reasoning).
     */
    addUpdater(fn, config) {
        if (config?.hashExtra)
            fn.hashExtra = config.hashExtra;
        this.updaters.push(fn);
        return this;
    }
    clearUpdaters() {
        this.updaters = [];
        for (const m of this.submobjects)
            m.clearUpdaters();
        return this;
    }
    update(dt) {
        if (this.updatingSuspended)
            return this;
        for (const fn of this.updaters)
            fn(this, dt);
        for (const m of this.submobjects)
            m.update(dt);
        return this;
    }
    /** Opt into CanvasRenderer's static-subtree render cache: on an
     *  unchanged frame (same geometry/style AND camera state), the renderer
     *  blits a cached bitmap instead of re-walking this mobject's bezier
     *  path. Best for elements that rarely change (dense axis labels,
     *  background grids) in a mostly-static-camera scene. */
    cacheStatic(enabled = true) {
        this._cacheStatic = enabled;
        return this;
    }
    hasUpdaters() {
        if (this.updaters.length)
            return true;
        return this.submobjects.some((m) => m.hasUpdaters());
    }
    // --- become / state -----------------------------------------------------
    // Make this mobject become a deep copy of another's geometry & style. This is
    // the primitive behind always_redraw and transform-less morphs.
    become(mobject, { matchHeight = false, matchWidth = false, matchDepth = false, matchCenter = false, stretch = false, } = {}) {
        const src = mobject.copy();
        if (stretch) {
            if (matchHeight)
                src.matchHeight(this);
            if (matchWidth)
                src.matchWidth(this);
            if (matchDepth)
                src.matchDepth(this);
        }
        else {
            const dims = [matchWidth, matchHeight, matchDepth];
            for (let dim = 0; dim < 3; dim++) {
                if (dims[dim])
                    src.rescaleToFit(this.lengthOverDim(dim), dim, false);
            }
        }
        if (matchCenter)
            src.moveTo(this.getCenter());
        // Copy geometry/style member-wise across the family, growing/shrinking the
        // submobject list to match.
        this.points = src.points.map((p) => [p[0], p[1], p[2]]);
        this._color = Color.parse(src.color);
        this.opacity = src.opacity;
        this.zIndex = src.zIndex;
        // Copy any extra style fields subclasses added (fill/stroke/etc.) --
        // the primitive behind always_redraw and transform-less morphs.
        copyMemberwiseStyle(this, src);
        this.submobjects = src.submobjects;
        return this;
    }
    // Store a deep copy of the current state; restore() reverts to it.
    saveState() {
        this.savedState = this.copy();
        return this;
    }
    restore() {
        if (!this.savedState)
            throw new Error("Trying to restore without having saved.");
        return this.become(this.savedState);
    }
    // Create and store a copy to be mutated as an animation target.
    generateTarget(useDeepcopy = true) {
        this.target = useDeepcopy ? this.copy() : this;
        return this.target;
    }
    // --- alignment ----------------------------------------------------------
    lengthOverDim(dim) {
        const { min, max } = this.getBoundingBox();
        return max[dim] - min[dim];
    }
    // Align this mobject's edge in `direction` to the other's same edge (or point).
    alignTo(mobjectOrPoint, direction = V.UP) {
        for (let dim = 0; dim < 3; dim++) {
            if (direction[dim] !== 0) {
                this.setCoord(this.getCoordFromRef(mobjectOrPoint, dim, direction), dim, direction);
            }
        }
        return this;
    }
    getCoordFromRef(mobjectOrPoint, dim, direction) {
        if (mobjectOrPoint instanceof Mobject)
            return mobjectOrPoint.getBoundaryPoint(direction)[dim];
        return mobjectOrPoint[dim];
    }
    // --- match family -------------------------------------------------------
    matchColor(mobject) {
        return this.setColor(mobject.color);
    }
    matchDimSize(mobject, dim) {
        return this.rescaleToFit(mobject.lengthOverDim(dim), dim, false);
    }
    matchWidth(mobject) {
        return this.matchDimSize(mobject, 0);
    }
    matchHeight(mobject) {
        return this.matchDimSize(mobject, 1);
    }
    matchDepth(mobject) {
        return this.matchDimSize(mobject, 2);
    }
    matchCoord(mobject, dim, direction = V.ORIGIN) {
        return this.setCoord(mobject.getCoord(dim, direction), dim, direction);
    }
    matchX(mobject, direction = V.ORIGIN) {
        return this.matchCoord(mobject, 0, direction);
    }
    matchY(mobject, direction = V.ORIGIN) {
        return this.matchCoord(mobject, 1, direction);
    }
    matchZ(mobject, direction = V.ORIGIN) {
        return this.matchCoord(mobject, 2, direction);
    }
    matchPoints(mobject) {
        this.points = mobject.points.map((p) => [p[0], p[1], p[2]]);
        return this;
    }
    // --- coordinates --------------------------------------------------------
    getCoord(dim, direction = V.ORIGIN) {
        return this.getBoundaryPoint(direction)[dim];
    }
    setCoord(value, dim, direction = V.ORIGIN) {
        const cur = this.getCoord(dim, direction);
        const shift = [0, 0, 0];
        shift[dim] = value - cur;
        return this.shift(shift);
    }
    getX(direction = V.ORIGIN) {
        return this.getCoord(0, direction);
    }
    getY(direction = V.ORIGIN) {
        return this.getCoord(1, direction);
    }
    getZ(direction = V.ORIGIN) {
        return this.getCoord(2, direction);
    }
    setX(x, direction = V.ORIGIN) {
        return this.setCoord(x, 0, direction);
    }
    setY(y, direction = V.ORIGIN) {
        return this.setCoord(y, 1, direction);
    }
    setZ(z, direction = V.ORIGIN) {
        return this.setCoord(z, 2, direction);
    }
    // --- scale/stretch to fit ----------------------------------------------
    rescaleToFit(length, dim, stretch) {
        const oldLength = this.lengthOverDim(dim);
        if (oldLength === 0)
            return this;
        if (stretch) {
            this.stretch(length / oldLength, dim);
        }
        else {
            this.scale(length / oldLength);
        }
        return this;
    }
    scaleToFitWidth(w) {
        return this.rescaleToFit(w, 0, false);
    }
    scaleToFitHeight(h) {
        return this.rescaleToFit(h, 1, false);
    }
    scaleToFitDepth(d) {
        return this.rescaleToFit(d, 2, false);
    }
    stretchToFitWidth(w) {
        return this.rescaleToFit(w, 0, true);
    }
    stretchToFitHeight(h) {
        return this.rescaleToFit(h, 1, true);
    }
    stretchToFitDepth(d) {
        return this.rescaleToFit(d, 2, true);
    }
    // --- point functions ----------------------------------------------------
    applyPointsFunctionAboutPoint(fn, aboutPoint) {
        const about = aboutPoint ?? this.getCenter();
        for (const m of this.getFamily()) {
            if (!m.points.length)
                continue;
            const shifted = m.points.map((p) => V.sub(p, about));
            const transformed = fn(shifted);
            for (let i = 0; i < m.points.length; i++)
                m.points[i] = V.add(transformed[i], about);
        }
        return this;
    }
    applyFunction(fn) {
        return this.applyToPoints((p) => {
            const r = fn(p);
            return [r[0], r[1] ?? 0, r[2] ?? 0];
        });
    }
    // Apply a 2x2 or 3x3 matrix (about a point, default center).
    applyMatrix(matrix, { aboutPoint } = {}) {
        // Normalize a 2x2 matrix into 3x3.
        let m3;
        if (matrix.length === 2) {
            m3 = [
                [matrix[0][0], matrix[0][1], 0],
                [matrix[1][0], matrix[1][1], 0],
                [0, 0, 1],
            ];
        }
        else {
            m3 = matrix;
        }
        return this.applyPointsFunctionAboutPoint((points) => points.map((p) => V.matrixVectorProduct(m3, p)), aboutPoint ?? this.getCenter());
    }
    // Treat (x, y) as a complex number and apply fn; z stays fixed.
    applyComplexFunction(fn, { aboutPoint } = {}) {
        return this.applyFunction((p) => {
            const z = V.R3ToComplex(p);
            const w = fn(z);
            const out = V.complexToR3(w);
            return [out[0], out[1], p[2]];
        });
    }
    // --- submobject ops -----------------------------------------------------
    addToBack(...mobs) {
        const flat = mobs.flat().filter((m) => m && !this.submobjects.includes(m));
        this.submobjects = [...flat, ...this.submobjects];
        return this;
    }
    insert(index, mob) {
        this.submobjects.splice(index, 0, mob);
        return this;
    }
    sort(fn) {
        const key = fn ?? ((m) => {
            const c = m.getCenter();
            return c[0] * 1e6 + c[1];
        });
        this.submobjects.sort((a, b) => key(a) - key(b));
        return this;
    }
    shuffle() {
        for (let i = this.submobjects.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.submobjects[i], this.submobjects[j]] = [this.submobjects[j], this.submobjects[i]];
        }
        return this;
    }
    invert() {
        this.submobjects.reverse();
        return this;
    }
    // Lay out submobjects in a line along `direction`, then (by default) recenter.
    arrange(direction = V.RIGHT, buff = 0.25, { center = true } = {}) {
        for (let i = 1; i < this.submobjects.length; i++) {
            this.submobjects[i].nextTo(this.submobjects[i - 1], direction, buff);
        }
        if (center)
            this.center();
        return this;
    }
    arrangeInGrid({ rows, cols, buff = 0.25, rowHeights, colWidths, flowOrder = "rd", } = {}) {
        const mobs = this.submobjects;
        const n = mobs.length;
        if (n === 0)
            return this;
        // Resolve rows/cols.
        let r = rows;
        let c = cols;
        if (r === undefined && c === undefined) {
            c = Math.ceil(Math.sqrt(n));
            r = Math.ceil(n / c);
        }
        else if (r === undefined) {
            r = Math.ceil(n / c);
        }
        else if (c === undefined) {
            c = Math.ceil(n / r);
        }
        const [bx, by] = Array.isArray(buff) ? buff : [buff, buff];
        // Cell sizes: use max width/height of submobjects (or provided arrays).
        let cellW = 0;
        let cellH = 0;
        for (const m of mobs) {
            cellW = Math.max(cellW, m.getWidth());
            cellH = Math.max(cellH, m.getHeight());
        }
        const stepX = (colWidths ? undefined : cellW + bx);
        const stepY = (rowHeights ? undefined : cellH + by);
        // Precompute column x-offsets and row y-offsets (top-to-bottom).
        const colX = [];
        let acc = 0;
        for (let j = 0; j < c; j++) {
            colX.push(acc);
            acc += colWidths ? (colWidths[j] ?? cellW) + bx : stepX;
        }
        const rowY = [];
        acc = 0;
        for (let i = 0; i < r; i++) {
            rowY.push(acc);
            acc += rowHeights ? (rowHeights[i] ?? cellH) + by : stepY;
        }
        for (let k = 0; k < n; k++) {
            let row;
            let col;
            if (flowOrder[0] === "d" || flowOrder[0] === "u") {
                // column-major
                col = Math.floor(k / r);
                row = k % r;
            }
            else {
                // row-major (default "rd")
                row = Math.floor(k / c);
                col = k % c;
            }
            mobs[k].moveTo([colX[col], -rowY[row], 0]);
        }
        this.center();
        return this;
    }
    // --- queries ------------------------------------------------------------
    getAllPoints() {
        const out = [];
        for (const p of this.allPoints())
            out.push(p);
        return out;
    }
    getStartAndEnd() {
        const pts = this.getAllPoints();
        if (!pts.length)
            return [[0, 0, 0], [0, 0, 0]];
        const s = pts[0];
        const e = pts[pts.length - 1];
        return [[s[0], s[1], s[2]], [e[0], e[1], e[2]]];
    }
    getMidpoint() {
        const p = this.pointFromProportion(0.5);
        return [p[0], p[1], p[2] ?? 0];
    }
    // Fallback proportion: linear interpolation over the ordered point list.
    pointFromProportion(alpha) {
        const pts = this.getAllPoints();
        if (!pts.length)
            return [0, 0, 0];
        if (pts.length === 1)
            return [pts[0][0], pts[0][1], pts[0][2]];
        const a = Math.max(0, Math.min(1, alpha));
        const scaled = a * (pts.length - 1);
        const i = Math.floor(scaled);
        if (i >= pts.length - 1) {
            const last = pts[pts.length - 1];
            return [last[0], last[1], last[2]];
        }
        return V.lerp(pts[i], pts[i + 1], scaled - i);
    }
    getCenterOfMass() {
        return V.centerOfMass(this.getAllPoints());
    }
    // --- updaters (extended) ------------------------------------------------
    removeUpdater(fn) {
        this.updaters = this.updaters.filter((u) => u !== fn);
        return this;
    }
    getUpdaters() {
        return this.updaters;
    }
    suspendUpdating() {
        this.updatingSuspended = true;
        for (const m of this.submobjects)
            m.suspendUpdating();
        return this;
    }
    resumeUpdating() {
        this.updatingSuspended = false;
        for (const m of this.submobjects)
            m.resumeUpdating();
        return this;
    }
    // --- z-index ------------------------------------------------------------
    setZIndex(value) {
        this.zIndex = value;
        for (const m of this.submobjects)
            m.setZIndex(value);
        return this;
    }
    // --- copy / interpolate -------------------------------------------------
    copy() {
        const c = Object.create(Object.getPrototypeOf(this));
        Object.assign(c, this);
        c.id = _idCounter++;
        c.points = this.points.map((p) => [p[0], p[1], p[2]]);
        c._color = Color.parse(this.color);
        c.updaters = [];
        c.submobjects = this.submobjects.map((m) => m.copy());
        // Object.assign copies the effects ARRAY by reference -- deep-clone so a
        // later mutation on the copy (e.g. animating a blur radius) can't
        // retroactively change the original.
        if (this.effects)
            c.effects = this.effects.map((e) => ({ ...e }));
        return c;
    }
    // Blend this mobject's state from `start` toward `target` by alpha in [0,1].
    // Base class handles points, color and opacity; VMobject extends for fill.
    interpolate(start, target, alpha) {
        const n = Math.min(this.points.length, start.points.length, target.points.length);
        for (let i = 0; i < n; i++) {
            this.points[i] = V.lerp(start.points[i], target.points[i], alpha);
        }
        this._color = Color.lerp(start.color, target.color, alpha);
        this.opacity = start.opacity + (target.opacity - start.opacity) * alpha;
        if (start.effects || target.effects) {
            this.effects = lerpEffects(start.effects, target.effects, alpha);
        }
        const sn = Math.min(this.submobjects.length, start.submobjects.length, target.submobjects.length);
        for (let i = 0; i < sn; i++) {
            this.submobjects[i].interpolate(start.submobjects[i], target.submobjects[i], alpha);
        }
        return this;
    }
}
// A plain (non-vector) container. Groups several mobjects so they can be
// transformed and arranged together, without any drawing of its own.
export class Group extends Mobject {
    constructor(...mobs) {
        super();
        this.add(...mobs);
    }
}
/**
 * A Group whose children render into their own offscreen layer, so their
 * `compositeOperation`s blend against SIBLINGS only (Motion Canvas's
 * layer-scoped compositing: a "destination-out" child cuts a hole in the
 * group, not in the whole scene). The finished layer is then drawn onto the
 * scene normally (honoring the group's own opacity/compositeOperation).
 * Canvas backends only; where no offscreen canvas exists the children draw
 * unscoped (documented degradation, same convention as effects).
 */
export class CompositeGroup extends Group {
    _isCompositeGroup = true;
}
//# sourceMappingURL=Mobject.js.map