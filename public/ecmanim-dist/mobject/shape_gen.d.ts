import { VMobject } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
export interface StackSeries extends Array<[number, number]> {
    key: string;
    index: number;
}
export interface StackConfig<T = any> {
    keys: string[];
    value?: (d: T, key: string) => number;
    order?: "none" | "ascending" | "descending" | "insideOut" | ((sums: number[]) => number[]);
    offset?: "none" | "expand" | "silhouette" | "wiggle" | "diverging";
}
/**
 * d3.stack(): rows of data -> one series per key, each entry [y0, y1].
 * Orders and offsets match d3's semantics (wiggle = streamgraph).
 */
export declare function stack<T = any>(config: StackConfig<T>): (data: T[]) => StackSeries[];
export type CurveKind = "linear" | "catmullRom" | "basis" | "step" | "stepAfter";
export interface LineGenConfig<T = any> {
    x: (d: T, i: number) => number;
    y: (d: T, i: number) => number;
    defined?: (d: T, i: number) => boolean;
}
/** d3.line(): data -> polyline SEGMENTS (split where `defined` is false),
 *  each an array of [x, y] world points. Feed to PolyLine/Spline/VMobject. */
export declare function lineGen<T = any>(config: LineGenConfig<T>): (data: T[]) => number[][][];
export interface AreaGenConfig<T = any> extends LineGenConfig<T> {
    y0: (d: T, i: number) => number;
    y1: (d: T, i: number) => number;
}
/** d3.area(): data -> closed ring(s) [x, y1] forward then [x, y0] back. */
export declare function areaGen<T = any>(config: Omit<AreaGenConfig<T>, "y">): (data: T[]) => number[][][];
export interface PieSlice<T = any> {
    data: T;
    value: number;
    index: number;
    startAngle: number;
    endAngle: number;
    padAngle: number;
}
export interface PieGenConfig<T = any> {
    value?: (d: T, i: number) => number;
    /** Sort by VALUE; d3's default is descending. Pass null for input order. */
    sortValues?: ((a: number, b: number) => number) | null;
    startAngle?: number;
    endAngle?: number;
    padAngle?: number;
}
/** d3.pie(): data -> slice angle descriptors (clockwise from 12, radians). */
export declare function pieGen<T = any>(config?: PieGenConfig<T>): (data: T[]) => Array<PieSlice<T>>;
/** d3 angle (clockwise from 12) + radius -> ecmanim world [x, y, 0]. */
export declare function radialPoint(angle: number, radius: number): number[];
export interface ArcGenConfig extends VMobjectConfig {
    innerRadius: number;
    outerRadius: number;
    startAngle: number;
    endAngle: number;
    /** Total angular padding (radians) split across both ends, applied at
     *  both radii (constant-angle approximation of d3's padRadius scaling —
     *  documented divergence; visually equivalent at gallery proportions). */
    padAngle?: number;
}
/** d3.arc() -> a filled VMobject annular sector (donut slice). */
export declare function arcShape(config: ArcGenConfig): VMobject;
/** d3.linkHorizontal(): cubic control points with horizontal tangents.
 *  Also exactly sankeyLinkHorizontal's curve. */
export declare function linkHorizontalPoints(source: number[], target: number[]): number[][];
export declare function linkVerticalPoints(source: number[], target: number[]): number[][];
/** d3.linkRadial(): bump in polar space — source/target as
 *  {angle (d3 convention), radius}; returns a POLYLINE of sampled world
 *  points along the radial bump (feed to Spline or setPointsSmoothly). */
export declare function linkRadialPoints(source: {
    angle: number;
    radius: number;
}, target: {
    angle: number;
    radius: number;
}, samples?: number): number[][];
/**
 * Uniform cubic B-spline through control points -> cubic bezier chain
 * (d3.curveBasis). Returns {start, beziers: [c1, c2, end][]} ready for
 * startNewPath + addCubicBezier. The curve APPROXIMATES the control points
 * (starts/ends exactly at the first/last, like d3, via endpoint tripling).
 */
export declare function basisBeziers(points: number[][]): {
    start: number[];
    beziers: number[][][];
};
/** d3.curveBundle.beta(beta): basis spline over control points LERPED
 *  toward the straight source->target chord. beta=1 keeps the full bundle
 *  path; beta=0 is a straight line. */
export declare function bundleBeziers(points: number[][], beta?: number): {
    start: number[];
    beziers: number[][][];
};
/** Build a stroked VMobject from a {start, beziers} chain. */
export declare function bezierChainMobject(chain: {
    start: number[];
    beziers: number[][][];
}, style?: VMobjectConfig): VMobject;
//# sourceMappingURL=shape_gen.d.ts.map