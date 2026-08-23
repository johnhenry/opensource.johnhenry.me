import type { Vec3 } from "../types.ts";
export declare function bezier(p0: number[], p1: number[], p2: number[], p3: number[], t: number): Vec3;
export declare function arcBezierPoints(radius: number, startAngle: number, angle: number, center?: number[]): Vec3[];
export declare function straightControlPoints(a: number[], b: number[]): [Vec3, Vec3];
export declare function partialBezier(p0: number[], p1: number[], p2: number[], p3: number[], t0: number, t1: number): Vec3[];
/** Linear interpolation: (1-alpha)*a + alpha*b, for scalars or points. */
export declare function interpolate(a: number, b: number, alpha: number): number;
export declare function interpolate(a: number[], b: number[], alpha: number): Vec3;
/** Midpoint of two values or points. */
export declare function mid(a: number, b: number): number;
export declare function mid(a: number[], b: number[]): Vec3;
/** Inverse interpolation: alpha such that interpolate(start,end,alpha)=value. */
export declare function inverseInterpolate(start: number, end: number, value: number): number;
/** Remap oldValue from [oldStart,oldEnd] to [newStart,newEnd]. */
export declare function matchInterpolate(newStart: number, newEnd: number, oldStart: number, oldEnd: number, oldValue: number): number;
/**
 * Variant of interpolate returning an integer and the residual.
 * Returns [floored value between start and end, residue in [0,1)].
 */
export declare function integerInterpolate(start: number, end: number, alpha: number): [number, number];
/**
 * Split a cubic Bezier at parameter t into two cubic curves (de Casteljau).
 * Input is 4 control points; output is 8 points (first curve then second).
 */
export declare function splitBezier(points: number[][], t: number): Vec3[];
/**
 * Subdivide a cubic Bezier into n sub-curves of the same overall shape.
 * Returns 4*n points (n consecutive cubic curves).
 */
export declare function subdivideBezier(points: number[][], n: number): Vec3[];
/**
 * Resample a list of cubic Bezier curves (each 4 points) to newNumber curves,
 * subdividing as needed. Mirrors manim's bezier_remap.
 */
export declare function bezierRemap(curves: number[][][], newNumber: number): Vec3[][];
/** Returns true if the first and last points of the spline are close. */
export declare function isClosed(points: number[][]): boolean;
/**
 * Given anchor points of a cubic spline, compute the two handle arrays
 * [h1, h2] making the spline smooth. Dispatches to open/closed solvers.
 * (manim's get_smooth_cubic_bezier_handle_points / get_smooth_handle_points.)
 */
export declare function getSmoothCubicBezierHandlePoints(anchors: number[][]): [Vec3[], Vec3[]];
/** Alias for getSmoothCubicBezierHandlePoints (manim's get_smooth_handle_points). */
export declare const getSmoothHandlePoints: typeof getSmoothCubicBezierHandlePoints;
/**
 * Whether a point lies on the cubic bezier defined by `points` (samples the
 * curve; a lightweight numeric check rather than manim's polynomial-root form).
 */
export declare function pointLiesOnBezier(point: number[], points: number[][], tol?: number): boolean;
//# sourceMappingURL=bezier.d.ts.map