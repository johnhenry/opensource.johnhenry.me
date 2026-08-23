import type { RateFunc } from "../core/types.ts";
export interface SpringConfig {
    mass?: number;
    damping?: number;
    stiffness?: number;
    overshootClamping?: boolean;
}
export interface SpringParams {
    frame: number;
    fps: number;
    from?: number;
    to?: number;
    config?: SpringConfig;
    durationInFrames?: number;
    /** Initial velocity (position units per second) at t=0. Default 0, which
     *  makes every formula below collapse exactly to the pre-existing v0=0
     *  case -- see `analytic()`. Used for "fling and decelerate" momentum
     *  (spring toward the CURRENT value with a nonzero release velocity)
     *  rather than the usual "seek toward a fixed target from rest". */
    velocity0?: number;
}
/**
 * Evaluate the analytic spring at `frame`.
 *
 * durationInFrames: if provided, the natural settle time is rescaled so the
 * spring settles at exactly `durationInFrames`. This warps the time axis:
 * effectiveT = t * (naturalSettleFrames / durationInFrames).
 */
export declare function spring(params: SpringParams): number;
/**
 * Number of frames until the spring settles (rest) for a given config + fps.
 * Steps frames until |value - to| < threshold AND velocity is small, capped at
 * fps*10 frames. This is a measurement helper only — the spring itself remains
 * analytic (each sampled frame is an independent closed-form evaluation).
 */
export declare function measureSpring(params: {
    fps: number;
    config?: SpringConfig;
    threshold?: number;
}): number;
/**
 * Adapt the spring to a manim RateFunc: t in [0,1] -> eased value in [0,1].
 *
 * Samples the analytic spring over its natural settle duration (or
 * durationInFrames if provided) and normalizes so rate(0) == from == 0 and the
 * final settled value == 1.
 */
export declare function springRate(config?: SpringConfig, fps?: number, durationInFrames?: number): RateFunc;
//# sourceMappingURL=spring.d.ts.map