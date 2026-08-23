import { Group } from "./Mobject.ts";
import type { Mobject } from "./Mobject.ts";
import type { VMobject } from "./VMobject.ts";
import { Circle, Line } from "./geometry.ts";
import type { ColorLike } from "../core/types.ts";
/** One epicycle: a vector of length `amp` rotating at `freq` revolutions per
 *  path-traversal, starting at angle `phase` (radians) at t = 0. */
export interface FourierCoefficient {
    freq: number;
    amp: number;
    phase: number;
}
/**
 * Plain O(N²) complex DFT of a sampled 2D path (points treated as x + iy).
 * Frequencies use the standard symmetric ordering k ∈ [-⌊N/2⌋, ⌊N/2⌋ + N - 1]
 * i.e. [-N/2, N/2), so low-|freq| terms dominate for smooth closed paths.
 *
 *   c_k = (1/N) Σ_n (x_n + i·y_n) · e^{-2πi·k·n/N}
 *
 * Returns coefficients sorted by DESCENDING amplitude (ties broken by
 * ascending |freq|, then ascending freq, for determinism), optionally
 * truncated to the `nVectors` largest.
 */
export declare function dftOfPath(points: Array<[number, number]>, nVectors?: number): FourierCoefficient[];
/**
 * Sample `n` [x, y] points along a VMobject's outline via
 * `pointFromProportion(i/n)` (handles multi-subpath VMobjects). The endpoint
 * proportion 1 is excluded so closed paths aren't double-sampled at the seam.
 */
export declare function samplePath(mob: VMobject, n: number): Array<[number, number]>;
/** Stroke styling shared by the epicycle vectors and guide circles. */
export interface EpicycleStyle {
    strokeColor?: ColorLike;
    strokeWidth?: number;
    strokeOpacity?: number;
}
export interface FourierPathConfig {
    /** Precomputed coefficients (wins over `path`). */
    coefficients?: FourierCoefficient[];
    /** Path to decompose when `coefficients` is not given. */
    path?: VMobject;
    /** Keep only the `nVectors` largest coefficients (with `path`). */
    nVectors?: number;
    /** Number of samples taken along `path` (default 256). */
    samples?: number;
    /** World-space anchor of the first vector's base (default origin). */
    center?: number[];
    /** Draw a faint guide circle of radius `amp` at each vector's base. */
    showCircles?: boolean;
    circleStyle?: EpicycleStyle;
    vectorStyle?: EpicycleStyle;
    /** Revolutions (full path traversals) per second for attachTo (default 0.1). */
    speed?: number;
}
/**
 * FourierPath: the epicycle chain. Each coefficient (in descending-amplitude
 * order) contributes one Line vector of length `amp` rotating at `freq`
 * revolutions per traversal, anchored at the previous vector's tip, plus an
 * optional faint circle of radius `amp` centered at the vector's base.
 *
 * `setTime(t)` is a deterministic pure function of t (scrub-safe); `tip`
 * returns the current chain-tip world point, so
 * `new TracedPath(() => fourierPath.tip)` traces the reconstructed drawing.
 */
export declare class FourierPath extends Group {
    coefficients: FourierCoefficient[];
    vectors: Line[];
    circles: Circle[];
    centerPoint: number[];
    showCircles: boolean;
    speed: number;
    private _clock;
    private _tip;
    constructor(config?: FourierPathConfig);
    /**
     * Pose the whole chain for time t in [0, 1) — one full traversal of the
     * path. Pure function of t: every vector is placed at absolute coordinates,
     * so calls in any order produce identical geometry (scrub-safe).
     */
    setTime(t: number): this;
    /** Current chain-tip world point (fresh array — safe to hand to TracedPath). */
    get tip(): number[];
    /**
     * Convenience: add this mobject to `scene` with an updater that advances an
     * internal clock by dt·speed (speed = traversals per second) and re-poses
     * the chain via setTime. Returns this for chaining, e.g.
     * `scene.add(new TracedPath(() => fp.tip)); fp.attachTo(scene);`
     */
    attachTo(scene: {
        add(...mobs: Mobject[]): unknown;
    }): this;
}
//# sourceMappingURL=fourier_path.d.ts.map