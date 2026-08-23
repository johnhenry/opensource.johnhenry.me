import { Color } from "../core/color.ts";
import type { Effect } from "../core/effects.ts";
import type { Vec3, ColorLike } from "../core/types.ts";
/** Base configuration accepted by every Mobject constructor. */
export interface MobjectConfig {
    name?: string;
    color?: ColorLike;
    opacity?: number;
    zIndex?: number;
    [key: string]: any;
}
/** An updater callback invoked each frame with the mobject and a time delta. */
export type Updater = (mob: Mobject, dt: number) => void;
/** An axis-aligned bounding box in world space. */
export interface BoundingBox {
    min: number[];
    max: number[];
}
export declare class Mobject {
    id: number;
    points: number[][];
    submobjects: Mobject[];
    name: string;
    /**
     * Backing field for `.color`. Subclasses (e.g. VMobject.setColor) write
     * here directly to avoid re-entering the `color` setter below.
     */
    protected _color: Color;
    opacity: number;
    zIndex: number;
    updaters: Updater[];
    updatingSuspended: boolean;
    savedState?: Mobject;
    target?: Mobject;
    /** Opt-in marker read by CanvasRenderer's static-subtree render cache
     *  (set via cacheStatic()). Mainly helps static-camera scenes with many
     *  unchanging elements (dense axis labels, background grids). */
    _cacheStatic?: boolean;
    /** Visual effects (blur/glow/shadow/colorAdjust/noise) applied by the
     *  renderer at draw time -- see the fluent helpers in the style section
     *  below and src/core/effects.ts for renderer support notes. */
    effects?: Effect[];
    /** Canvas blend mode for this mobject's own draw (Motion Canvas
     *  `compositeOperation`), e.g. "multiply", "screen", "destination-out".
     *  Applies against whatever is already on the canvas beneath it; scope it
     *  with a CompositeGroup to blend only against siblings. Canvas backends
     *  only. */
    compositeOperation?: GlobalCompositeOperation;
    constructor(config?: MobjectConfig);
    /**
     * Raw assignment (`mob.color = "#E8833A"`) forwards to `setColor()` so it
     * actually recolors the render (subclasses like VMobject read
     * strokeColor/fillColor, not this field, for drawing) instead of silently
     * updating a field nothing downstream looks at.
     */
    get color(): Color;
    set color(value: ColorLike);
    add(...mobs: (Mobject | Mobject[])[]): this;
    remove(...mobs: (Mobject | Mobject[])[]): this;
    [Symbol.iterator](): Iterator<Mobject>;
    getFamily(): Mobject[];
    allPoints(): Generator<number[]>;
    applyToPoints(fn: (p: number[]) => number[]): this;
    shift(...vectors: number[][]): this;
    moveTo(pointOrMobject: Mobject | number[], aboutEdge?: number[]): this;
    scale(factor: number | number[], { aboutPoint }?: {
        aboutPoint?: number[];
    }): this;
    stretch(factor: number, dim: number, { aboutPoint }?: {
        aboutPoint?: number[];
    }): this;
    /** Motion-Canvas parity (findAll): every descendant (including self)
     *  matching the predicate — e.g. `findAll(view, (m) => m instanceof Text)`. */
    findAll<T extends Mobject = Mobject>(predicate: (m: Mobject) => boolean): T[];
    /** manim parity (replace): move onto `other` and match its size along
     *  `dimToMatch` (0=width, 1=height); `stretch` matches BOTH dimensions. */
    replace(other: Mobject, { dimToMatch, stretch }?: {
        dimToMatch?: number;
        stretch?: boolean;
    }): this;
    /** manim parity: rotate about the world origin (not the mobject center). */
    rotateAboutOrigin(angle: number, axis?: number[]): this;
    rotate(angle: number, { axis, aboutPoint }?: {
        axis?: number[];
        aboutPoint?: number[];
    }): this;
    flip(axis?: number[], opts?: {
        aboutPoint?: number[];
    }): this;
    getBoundingBox(): BoundingBox;
    getCenter(): Vec3;
    getBoundaryPoint(direction: number[]): Vec3;
    getWidth(): number;
    getHeight(): number;
    getDepth(): number;
    getTop(): Vec3;
    getBottom(): Vec3;
    getLeft(): Vec3;
    getRight(): Vec3;
    getCorner(dir: number[]): Vec3;
    setWidth(w: number, stretch?: boolean): this;
    setHeight(h: number, stretch?: boolean): this;
    toEdge(edge: number[], buff?: number, frame?: {
        width: number;
        height: number;
    }): this;
    toCorner(corner: number[], buff?: number, frame?: {
        width: number;
        height: number;
    }): this;
    center(): this;
    nextTo(mobjectOrPoint: Mobject | number[], direction?: number[], buff?: number, aligned?: any): this;
    setColor(color: ColorLike): this;
    setOpacity(o: number): this;
    fade(darkness?: number): this;
    addEffect(...effects: Effect[]): this;
    clearEffects(): this;
    blur(radius: number): this;
    glow(radius: number, color?: ColorLike, strength?: number): this;
    dropShadow(opts?: {
        blur?: number;
        color?: ColorLike;
        offsetX?: number;
        offsetY?: number;
    }): this;
    colorAdjust(opts: {
        brightness?: number;
        contrast?: number;
        saturate?: number;
        hueRotate?: number;
        grayscale?: number;
    }): this;
    noise(amount: number, opts?: {
        monochrome?: boolean;
        seed?: number;
    }): this;
    get animate(): any;
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
    addUpdater(fn: Updater, config?: {
        hashExtra?: () => string;
    }): this;
    clearUpdaters(): this;
    update(dt: number): this;
    /** Opt into CanvasRenderer's static-subtree render cache: on an
     *  unchanged frame (same geometry/style AND camera state), the renderer
     *  blits a cached bitmap instead of re-walking this mobject's bezier
     *  path. Best for elements that rarely change (dense axis labels,
     *  background grids) in a mostly-static-camera scene. */
    cacheStatic(enabled?: boolean): this;
    hasUpdaters(): boolean;
    become(mobject: Mobject, { matchHeight, matchWidth, matchDepth, matchCenter, stretch, }?: {
        matchHeight?: boolean;
        matchWidth?: boolean;
        matchDepth?: boolean;
        matchCenter?: boolean;
        stretch?: boolean;
    }): this;
    saveState(): this;
    restore(): this;
    generateTarget(useDeepcopy?: boolean): Mobject;
    private lengthOverDim;
    alignTo(mobjectOrPoint: Mobject | number[], direction?: number[]): this;
    private getCoordFromRef;
    matchColor(mobject: Mobject): this;
    matchDimSize(mobject: Mobject, dim: number): this;
    matchWidth(mobject: Mobject): this;
    matchHeight(mobject: Mobject): this;
    matchDepth(mobject: Mobject): this;
    matchCoord(mobject: Mobject, dim: number, direction?: number[]): this;
    matchX(mobject: Mobject, direction?: number[]): this;
    matchY(mobject: Mobject, direction?: number[]): this;
    matchZ(mobject: Mobject, direction?: number[]): this;
    matchPoints(mobject: Mobject): this;
    getCoord(dim: number, direction?: number[]): number;
    setCoord(value: number, dim: number, direction?: number[]): this;
    getX(direction?: number[]): number;
    getY(direction?: number[]): number;
    getZ(direction?: number[]): number;
    setX(x: number, direction?: number[]): this;
    setY(y: number, direction?: number[]): this;
    setZ(z: number, direction?: number[]): this;
    rescaleToFit(length: number, dim: number, stretch: boolean): this;
    scaleToFitWidth(w: number): this;
    scaleToFitHeight(h: number): this;
    scaleToFitDepth(d: number): this;
    stretchToFitWidth(w: number): this;
    stretchToFitHeight(h: number): this;
    stretchToFitDepth(d: number): this;
    applyPointsFunctionAboutPoint(fn: (points: number[][]) => number[][], aboutPoint?: number[]): this;
    applyFunction(fn: (p: number[]) => number[]): this;
    applyMatrix(matrix: number[][], { aboutPoint }?: {
        aboutPoint?: number[];
    }): this;
    applyComplexFunction(fn: (z: {
        re: number;
        im: number;
    }) => {
        re: number;
        im: number;
    } | number[], { aboutPoint }?: {
        aboutPoint?: number[];
    }): this;
    addToBack(...mobs: (Mobject | Mobject[])[]): this;
    insert(index: number, mob: Mobject): this;
    sort(fn?: (mob: Mobject) => number): this;
    shuffle(): this;
    invert(): this;
    arrange(direction?: number[], buff?: number, { center }?: {
        center?: boolean;
    }): this;
    arrangeInGrid({ rows, cols, buff, rowHeights, colWidths, flowOrder, }?: {
        rows?: number;
        cols?: number;
        buff?: number | [number, number];
        rowHeights?: number[];
        colWidths?: number[];
        flowOrder?: string;
    }): this;
    getAllPoints(): number[][];
    getStartAndEnd(): [Vec3, Vec3];
    getMidpoint(): Vec3;
    pointFromProportion(alpha: number): number[];
    getCenterOfMass(): Vec3;
    removeUpdater(fn: Updater): this;
    getUpdaters(): Updater[];
    suspendUpdating(): this;
    resumeUpdating(): this;
    setZIndex(value: number): this;
    copy(): this;
    interpolate(start: Mobject, target: Mobject, alpha: number): this;
}
export declare class Group extends Mobject {
    constructor(...mobs: (Mobject | Mobject[])[]);
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
export declare class CompositeGroup extends Group {
    readonly _isCompositeGroup = true;
}
//# sourceMappingURL=Mobject.d.ts.map