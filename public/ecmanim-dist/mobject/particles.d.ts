import { Mobject } from "./Mobject.ts";
import type { MobjectConfig } from "./Mobject.ts";
import { Color } from "../core/color.ts";
import type { ColorLike } from "../core/types.ts";
export type Range = number | [number, number];
export interface ParticleSystemConfig extends MobjectConfig {
    /** Emitter center (default origin). */
    emitterPoint?: number[];
    /** Spawn within a disc of this radius around the emitter point. */
    emitterRadius?: number;
    /** Spawn along a line segment instead (overrides radius). */
    emitterLine?: [number[], number[]];
    /** Particles per second for the continuous stream (default 20; 0 = bursts only). */
    rate?: number;
    /** Per-particle lifetime seconds (default [1, 2]). */
    lifetime?: Range;
    /** Initial speed, world units/s (default [1, 2]). */
    speed?: Range;
    /** Base emission direction in radians (default PI/2 — up). */
    direction?: number;
    /** Angular spread around direction, radians (default PI/4). */
    spread?: number;
    /** Acceleration [ax, ay] or a scalar y acceleration (default 0). */
    gravity?: number | [number, number];
    /** Linear drag coefficient k >= 0 (default 0). */
    drag?: number;
    /** Particle diameter over life, world units: constant or [start, end] (default 0.08). */
    size?: Range;
    /** Per-particle opacity over life: constant or [start, end] (default
     *  [1, 0] — fade out). Distinct from MobjectConfig's whole-system
     *  `opacity`, which multiplies on top. */
    particleOpacity?: Range;
    /** Colors lerped across each particle's life fraction (default white). */
    colorRamp?: ColorLike[];
    seed?: number;
    /** Hard cap on continuous-stream particles (default 2000). */
    maxParticles?: number;
    shape?: "circle" | "square";
    /** Advance the clock with scene time via an updater (default true). */
    autoAdvance?: boolean;
}
export interface ParticleState {
    x: number;
    y: number;
    /** Diameter in world units. */
    size: number;
    opacity: number;
    color: Color;
    /** Life fraction in [0, 1). */
    life: number;
}
export declare class ParticleSystem extends Mobject {
    _isParticles: boolean;
    /** The explicit clock (seconds since the system started emitting). */
    time: number;
    shape: "circle" | "square";
    private readonly _cfg;
    private readonly _seed;
    private readonly _rate;
    private readonly _lifetime;
    private readonly _speed;
    private readonly _size;
    private readonly _opacity;
    private readonly _gravity;
    private readonly _drag;
    private readonly _ramp;
    private readonly _max;
    private readonly _bursts;
    constructor(config?: ParticleSystemConfig);
    /** Jump the particle clock (either direction — everything is closed-form). */
    setTime(t: number): this;
    /**
     * Register a deterministic burst cohort: `count` extra particles all born
     * at `atT`, with optional emission overrides. Bursts are part of the
     * system's definition, not events — registering the same bursts always
     * yields the same animation, whenever the registration happens.
     */
    burst(atT: number, count: number, opts?: {
        speed?: Range;
        direction?: number;
        spread?: number;
    }): this;
    private _buildBox;
    private _rng;
    private _emit;
    /**
     * All particles alive at time `t` (defaults to the system clock), computed
     * closed-form — calling this for any t in any order gives identical
     * results. This is exactly what the renderer draws.
     */
    sampleParticles(t?: number): ParticleState[];
    copy(): this;
}
//# sourceMappingURL=particles.d.ts.map