import { VMobject } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
export interface CubicBezierConfig extends VMobjectConfig {
    p0: number[];
    p1: number[];
    p2: number[];
    p3: number[];
}
/** A single cubic bezier segment (MC's `<CubicBezier p0..p3/>`). */
export declare class CubicBezier extends VMobject {
    constructor(config: CubicBezierConfig);
}
export interface QuadBezierConfig extends VMobjectConfig {
    p0: number[];
    p1: number[];
    p2: number[];
}
/** A single quadratic bezier segment (MC's `<QuadBezier p0..p2/>`). */
export declare class QuadBezier extends VMobject {
    constructor(config: QuadBezierConfig);
}
/** A spline point: bare position, or a knot with explicit handles
 *  (MC's `<Knot position startHandle endHandle/>`; handles are RELATIVE
 *  to the position, matching MC). */
export type SplinePoint = number[] | {
    position: number[];
    startHandle?: number[];
    endHandle?: number[];
};
export interface SplineConfig extends VMobjectConfig {
    points: SplinePoint[];
    /** Catmull-Rom tension-ish smoothing in [0, 1]; 0 = straight segments.
     *  Matches MC's `smoothness` (default 1 ≈ their 0.4-scaled look). */
    smoothness?: number;
    closed?: boolean;
}
/** A smooth spline through points (MC's `<Spline points smoothness/>`),
 *  with optional per-point explicit handles (Knots). */
export declare class Spline extends VMobject {
    readonly smoothness: number;
    constructor(config: SplineConfig);
}
export interface PathConfig extends VMobjectConfig {
    /** SVG path data (`d` attribute). */
    data: string;
    /** Uniform scale applied to the path coordinates (default 1). */
    scale?: number;
    /** SVG paths are y-down; flip into world y-up (default true). */
    flipY?: boolean;
}
/** An SVG-path-data node (MC's `<Path data="M..."/>`). */
export declare class Path extends VMobject {
    readonly data: string;
    constructor(config: PathConfig);
}
export interface PolyLineConfig extends VMobjectConfig {
    points: number[][];
    /** Corner rounding radius (MC Line's `radius`). */
    radius?: number;
    closed?: boolean;
}
/** A multi-point polyline (MC's `<Line points/>` — theirs is a polyline,
 *  unlike ecmanim's two-point Line), with optional rounded corners
 *  (quadratic fillets at interior vertices, like MC Line's `radius`). */
export declare class PolyLine extends VMobject {
    constructor(config: PolyLineConfig);
}
//# sourceMappingURL=curves.d.ts.map