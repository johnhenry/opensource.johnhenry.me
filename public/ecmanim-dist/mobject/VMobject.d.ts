import { Mobject } from "./Mobject.ts";
import type { MobjectConfig } from "./Mobject.ts";
import { Color } from "../core/color.ts";
import type { Vec3, ColorLike } from "../core/types.ts";
/** Anchor-handling mode used by changeAnchorMode. */
export type AnchorMode = "jagged" | "smooth";
/** Configuration accepted by VMobject (extends the base Mobject config). */
export interface VMobjectConfig extends MobjectConfig {
    strokeColor?: ColorLike;
    strokeWidth?: number;
    strokeOpacity?: number;
    fillColor?: ColorLike;
    fillOpacity?: number;
    lineJoin?: CanvasLineJoin;
    lineCap?: CanvasLineCap;
    backgroundStrokeColor?: ColorLike;
    backgroundStrokeWidth?: number;
    backgroundStrokeOpacity?: number;
    sheenFactor?: number;
    sheenDirection?: number[];
}
export declare class VMobject extends Mobject {
    subpathStarts: number[];
    strokeColor: Color;
    strokeWidth: number;
    strokeOpacity: number;
    fillColor: Color;
    fillOpacity: number;
    lineJoin: CanvasLineJoin;
    lineCap: CanvasLineCap;
    strokeStart: number;
    strokeEnd: number;
    _straightPath?: boolean;
    backgroundStrokeColor: Color;
    backgroundStrokeWidth: number;
    backgroundStrokeOpacity: number;
    sheenFactor: number;
    sheenDirection: number[];
    gradientColors?: Color[];
    constructor(config?: VMobjectConfig);
    startNewPath(point: number[]): this;
    addCubicBezier(handle1: number[], handle2: number[], anchor: number[]): this;
    addLineTo(point: number[]): this;
    /** manim parity (add_points_as_corners): APPEND straight segments through
     *  `corners` to the existing path — the primitive behind incrementally
     *  growing traces (PointWithTrace). Starts a path if none exists. */
    addPointsAsCorners(corners: number[][]): this;
    setPointsAsCorners(corners: number[][]): this;
    appendBezierPoints(pts: number[][], newSubpath?: boolean): this;
    close(): this;
    setPointsSmoothly(anchors: number[][]): this;
    makeSmooth(): this;
    makeJagged(): this;
    changeAnchorMode(mode: AnchorMode): this;
    addSmoothCurveTo(point: number[]): this;
    addQuadraticBezierCurveTo(handle: number[], anchor: number[]): this;
    getAnchors(): number[][];
    getStartAnchors(): number[][];
    getEndAnchors(): number[][];
    getAnchorsAndHandles(): [number[][], number[][], number[][], number[][]];
    getDirection(): "CW" | "CCW";
    reversePoints(): this;
    reverseDirection(): this;
    private _allCurves;
    getNthCurvePoints(n: number): number[][];
    getNthCurveFunction(n: number): (t: number) => Vec3;
    getCurveFunctions(): Array<(t: number) => Vec3>;
    getNthCurveLength(n: number, samples?: number): number;
    getArcLength(samples?: number): number;
    getCurveFunctionsWithLengths(samples?: number): Array<[(t: number) => Vec3, number]>;
    proportionFromPoint(point: number[], samples?: number): number;
    pointwiseBecomePartial(vmobject: VMobject, a: number, b: number): this;
    getSubcurve(a: number, b: number): VMobject;
    /**
     * manim parity (prepare_for_nonlinear_transform): subdivide every curve in
     * the family so applyFunction() can BEND paths instead of just moving
     * their endpoints -- a 2-anchor Line stays straight under a nonlinear map
     * until it has interior anchors to displace. Call before
     * `mob.animate.applyFunction(...)` on grids/lines (OpeningManim's warped
     * NumberPlane is the canonical use).
     */
    prepareForNonlinearTransform(nCurves?: number): this;
    insertNCurves(n: number): this;
    getSubpaths(): number[][][];
    getNumCurves(): number;
    pointFromProportion(alpha: number): number[];
    /**
     * Unit tangent of the outline at proportion `alpha` (Motion Canvas's
     * `getPointAtPercentage().tangent`): the exact cubic-bezier derivative
     * B'(t) = 3(1-t)^2(b-a) + 6(1-t)t(c-b) + 3t^2(d-c), normalized.
     */
    tangentAtProportion(alpha: number): number[];
    setFill(color: ColorLike | null, opacity?: number | {
        opacity?: number;
    }): this;
    setStroke(color: ColorLike | null, width?: number | {
        width?: number;
        opacity?: number;
    } | null, opacity?: number): this;
    setColor(color: ColorLike): this;
    setStyle({ fillColor, fillOpacity, strokeColor, strokeWidth, strokeOpacity }?: {
        fillColor?: ColorLike;
        fillOpacity?: number;
        strokeColor?: ColorLike;
        strokeWidth?: number;
        strokeOpacity?: number;
    }): this;
    setOpacity(o: number): this;
    setBackgroundStroke({ color, width, opacity }?: {
        color?: ColorLike;
        width?: number;
        opacity?: number;
    }): this;
    setSheen(factor: number, direction?: number[]): this;
    setSheenDirection(dir: number[]): this;
    setColorByGradient(...colors: ColorLike[]): this;
    scale(factor: number, opts?: {
        aboutPoint?: number[];
        scaleStroke?: boolean;
    }): this;
    static _resampleSubpath(sp: number[][], nCurves: number): number[][];
    alignPointsWith(other: VMobject): this;
    static _bestSubpathRotation(a: number[][][], b: number[][][]): number[][][];
    static _growSubpath(sp: number[][], nCurves: number): number[][];
    interpolate(start: any, target: any, alpha: number): this;
    copy(): this;
}
export declare class VGroup extends VMobject {
    constructor(...mobs: (Mobject | Mobject[])[]);
    arrange(direction?: number[], buff?: number): this;
    get(i: number): Mobject;
}
//# sourceMappingURL=VMobject.d.ts.map