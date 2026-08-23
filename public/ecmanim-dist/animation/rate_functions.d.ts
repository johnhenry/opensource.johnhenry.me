import type { RateFunc } from "../core/types.ts";
export declare const linear: (t: number) => number;
export declare function smooth(t: number, inflection?: number): number;
export declare const rushInto: (t: number) => number;
export declare const rushFrom: (t: number) => number;
export declare const slowInto: (t: number) => number;
export declare const doubleSmooth: (t: number) => number;
export declare const thereAndBack: (t: number, inflection?: number) => number;
export declare const thereAndBackWithPause: (t: number, pauseRatio?: number) => number;
export declare const easeInSine: (t: number) => number;
export declare const easeOutSine: (t: number) => number;
export declare const easeInOutSine: (t: number) => number;
export declare const easeInQuad: (t: number) => number;
export declare const easeOutQuad: (t: number) => number;
export declare const easeInOutQuad: (t: number) => number;
export declare const easeInCubic: (t: number) => number;
export declare const easeOutCubic: (t: number) => number;
export declare const easeInOutCubic: (t: number) => number;
export declare const thereAndBackClamp: (t: number, inflection?: number) => number;
/** Wrap a rate func so its output is clamped to the unit interval [0, 1]. */
export declare const unitInterval: (func: RateFunc) => RateFunc;
/** Wrap a rate func so its output is clamped to be non-negative (>= 0). */
export declare const zero: (func: RateFunc) => RateFunc;
/** Classic Hermite smoothstep: 3t^2 - 2t^3, clamped to [0, 1]. */
export declare function smoothstep(t: number): number;
/** Ken Perlin's smootherstep: 6t^5 - 15t^4 + 10t^3, clamped to [0, 1]. */
export declare function smootherstep(t: number): number;
/** Higher-order smoothstep (7th order): -20t^7 + 70t^6 - 84t^5 + 35t^4. */
export declare function smoothererstep(t: number): number;
/** Overshoots forward before settling. pullFactor < 0 dips below zero first. */
export declare function runningStart(t: number, pullFactor?: number): number;
/** Applies `func` but never quite reaches 1 (scaled to `proportion` of the way). */
export declare function notQuiteThere(func?: RateFunc, proportion?: number): RateFunc;
/** Oscillates `wiggles` times, returning to 0 at t=0 and t=1. */
export declare function wiggle(t: number, wiggles?: number): number;
/** Rushes to 1 and lingers there (never fully reaching 1 until the end). */
export declare function lingering(t: number): number;
/** Exponential decay from 1 towards 0, normalized so f(0)=0, growing to ~1. */
export declare function exponentialDecay(t: number, halfLife?: number): number;
/**
 * Returns a rate func that runs `func` compressed into [a, b]: it holds
 * func(0) before a, func(1) after b, and maps [a, b] onto func's [0, 1].
 */
export declare function squishRateFunc(func: RateFunc, a?: number, b?: number): RateFunc;
export declare const easeInQuart: (t: number) => number;
export declare const easeOutQuart: (t: number) => number;
export declare const easeInOutQuart: (t: number) => number;
export declare const easeInQuint: (t: number) => number;
export declare const easeOutQuint: (t: number) => number;
export declare const easeInOutQuint: (t: number) => number;
export declare const easeInExpo: (t: number) => number;
export declare const easeOutExpo: (t: number) => number;
export declare const easeInOutExpo: (t: number) => number;
export declare const easeInCirc: (t: number) => number;
export declare const easeOutCirc: (t: number) => number;
export declare const easeInOutCirc: (t: number) => number;
export declare function easeInBackFactory(overshoot?: number): RateFunc;
export declare function easeOutBackFactory(overshoot?: number): RateFunc;
export declare function easeInOutBackFactory(overshoot?: number): RateFunc;
export declare const easeInBack: RateFunc;
export declare const easeOutBack: RateFunc;
export declare const easeInOutBack: RateFunc;
export declare function easeInElasticFactory(amplitude?: number, period?: number): RateFunc;
export declare function easeOutElasticFactory(amplitude?: number, period?: number): RateFunc;
export declare function easeInOutElasticFactory(amplitude?: number, period?: number): RateFunc;
export declare const easeInElastic: RateFunc;
export declare const easeOutElastic: RateFunc;
export declare const easeInOutElastic: RateFunc;
export declare const easeOutBounce: (t: number) => number;
export declare const easeInBounce: (t: number) => number;
export declare const easeInOutBounce: (t: number) => number;
export declare function running(name: RateFunc | string): RateFunc;
export declare const RATE_FUNCTIONS: Record<string, RateFunc>;
//# sourceMappingURL=rate_functions.d.ts.map