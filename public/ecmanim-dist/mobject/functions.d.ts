import { VMobject } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
/** A scaling applied to sampled t values / output points (manim's _ScaleBase). */
export interface ScalingFunction {
    function: (value: number) => number;
}
/** t -> [x, y] or [x, y, z]. */
export type ParametricFn = (t: number) => number[];
/** (x, y) -> number; the zero set is plotted by ImplicitFunction. */
export type ImplicitFn = (x: number, y: number) => number;
export interface ParametricFunctionConfig extends VMobjectConfig {
    /** [tMin, tMax, tStep]; tStep defaults to 0.01 when omitted. */
    tRange?: number[];
    /** Optional scaling applied to the t values before evaluation. */
    scaling?: ScalingFunction;
    /** Build a smooth spline (true) or straight corners (false). */
    useSmoothing?: boolean;
    /** t values at which the curve is broken into separate subpaths. */
    discontinuities?: number[];
    /** Step used to detect discontinuities around the given t values. */
    dtForDerivative?: number;
}
/**
 * ParametricFunction — samples fn(t) across tRange and builds a VMobject curve.
 * Handles discontinuities by splitting the sampled range into separate
 * subpaths around each discontinuity.
 */
export declare class ParametricFunction extends VMobject {
    function: ParametricFn;
    tRange: number[];
    scaling?: ScalingFunction;
    useSmoothing: boolean;
    discontinuities: number[];
    dtForDerivative: number;
    constructor(fn: ParametricFn, config?: ParametricFunctionConfig);
    /** Evaluate the underlying function at t, applying scaling if present. */
    getPoint(t: number): number[];
    getFunction(): ParametricFn;
    /** Build the list of t values for one contiguous [start, end] subrange. */
    private tValues;
    /** Sample the function and populate this VMobject's points / subpaths. */
    protected generatePoints(): this;
}
export interface FunctionGraphConfig extends ParametricFunctionConfig {
    /** [xMin, xMax] (optional xStep as third element). */
    xRange?: number[];
}
/**
 * FunctionGraph — a ParametricFunction specialization for y = f(x), i.e.
 * t -> [t, f(t)]. Stores the underlying scalar function for Axes-style helpers.
 */
export declare class FunctionGraph extends ParametricFunction {
    underlyingFunction: (x: number) => number;
    xRange: number[];
    constructor(fn: (x: number) => number, config?: FunctionGraphConfig);
    /** The [x, f(x), 0] point at a given x. */
    getPointFromFunction(x: number): number[];
}
export interface ImplicitFunctionConfig extends VMobjectConfig {
    /** [xMin, xMax] sampling bounds. */
    xRange?: number[];
    /** [yMin, yMax] sampling bounds. */
    yRange?: number[];
    /** Minimum grid subdivision depth. */
    minDepth?: number;
    /** Maximum number of quads along each axis. */
    maxQuads?: number;
    /** Whether to smooth the resulting contour. */
    useSmoothing?: boolean;
}
/**
 * ImplicitFunction — plots fn(x, y) = 0 via marching squares over a grid,
 * building the zero-contour as one or more subpaths.
 */
export declare class ImplicitFunction extends VMobject {
    function: ImplicitFn;
    xRange: number[];
    yRange: number[];
    minDepth: number;
    maxQuads: number;
    useSmoothing: boolean;
    constructor(fn: ImplicitFn, config?: ImplicitFunctionConfig);
    /** Linear interpolation of the zero-crossing between two grid values. */
    private zeroCrossing;
    /** Marching squares over the grid; emit line segments per cell. */
    protected generatePoints(): this;
    /** Greedily chain segments whose endpoints coincide into polylines. */
    private stitch;
}
//# sourceMappingURL=functions.d.ts.map