import { mulberry32 } from "../core/noise.ts";
export { mulberry32 };
/** A driver maps a scalar (time) to a value. */
export type Driver = (t: number) => number;
/**
 * Value-noise wiggle (smooth wander), like AE's `wiggle(freq, amp)`. Deterministic
 * for a given `seed` and PURE of `t` (order-independent — safe under scrubbing).
 * Returns values centered on 0 within roughly [-amplitude, amplitude].
 */
export declare function wiggle(amplitude?: number, frequency?: number, seed?: number): Driver;
/**
 * Remap a value from [inMin, inMax] to [outMin, outMax], clamping to the output
 * range, with optional easing applied to the normalized position.
 */
export declare function remap(inMin: number, inMax: number, outMin: number, outMax: number, ease?: (t: number) => number): (value: number) => number;
/** A linear driver from `a` to `b` over t in [0, 1] (clamped), with optional easing. */
export declare function ramp(a: number, b: number, ease?: (t: number) => number): Driver;
/** Sample a driver at a specific time. */
export declare function valueAtTime(driver: Driver, t: number): number;
/** Compose unary functions left→right: compose(f, g)(x) === g(f(x)). */
export declare function compose(...fns: Array<(x: number) => number>): (x: number) => number;
//# sourceMappingURL=expressions.d.ts.map