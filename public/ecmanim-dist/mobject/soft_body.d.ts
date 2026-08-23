import { VGroup } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
export interface SoftBodyConfig {
    /** Number of nodes evenly spaced around the initial circle (default 5, matching the p5 ref). */
    nodeCount?: number;
    /** Radius of the initial node circle, world units (default 1.5). */
    radius?: number;
    /** Center of the initial node circle (default origin). */
    center?: [number, number];
    /** Hooke's-law spring constant: accel = (target - nodePos) * springing.
     *  Default 0.12 -- retuned from the p5 ref's pixel/frame-implicit 0.0009
     *  for this module's explicit-dt integration (see the file-level tuning
     *  note above). */
    springing?: number;
    /** Velocity damping applied every step (default 0.98, matching the ref). */
    damping?: number;
    /** PRNG seed for initial-position jitter (default 1). */
    seed?: number;
    /** Random offset applied to each node's initial position, world units
     *  (default 0 = no jitter, nodes start exactly on the circle). */
    initialJitter?: number;
}
/**
 * A deterministic mass-spring softbody simulation: `nodeCount` nodes start
 * evenly spaced around a circle (optionally seed-jittered) and each
 * independently chases a caller-supplied target point via Hooke's law.
 *
 * DETERMINISM CONTRACT: given the same seed, the same initial
 * SoftBodyConfig, and the SAME sequence of step(dt, target) calls, two
 * independently constructed SoftBodySimulations always produce
 * byte-identical node positions at every step. step() is a pure function of
 * (current internal state, dt, target) -- no Math.random(), no wall-clock
 * reads, no hidden state beyond what's set at construction time (the only
 * randomness, initialJitter, is drawn once in the constructor via a seeded
 * mulberry32 stream and never touched again).
 */
export declare class SoftBodySimulation {
    readonly nodeCount: number;
    readonly radius: number;
    readonly springing: number;
    readonly damping: number;
    readonly seed: number;
    readonly initialJitter: number;
    private _pos;
    private _vel;
    constructor(config?: SoftBodyConfig);
    /**
     * Advance ONE fixed step for every node: Hooke's-law spring acceleration
     * toward `target`, velocity integration + damping, then position
     * integration by vel * dt. See the file-level tuning note for why accel
     * is NOT scaled by dt (matching the p5 ref) while the position update IS.
     */
    step(dt: number, target: [number, number]): void;
    /** Current node positions, [x, y] per node (a defensive copy). */
    positions(): number[][];
    /** Current node velocities, [x, y] per node (a defensive copy). */
    velocities(): number[][];
    /** Node positions as a closed smooth curve's control points -- feed
     *  straight to `new Spline({ points: outline(), closed: true })`. */
    outline(): number[][];
}
export interface SoftBodyMobjectConfig extends SoftBodyConfig, VMobjectConfig {
    /** Catmull-Rom smoothness passed through to the underlying closed Spline
     *  (default 1, matching Spline's own default). */
    smoothness?: number;
}
/**
 * Rendering wrapper: a SoftBodySimulation plus a closed Spline visual that
 * tracks its node positions. Addressable/updater-friendly like other
 * simulation mobjects (ParticleSystem, WaveCurve): construct once, then call
 * `.step(dt, target)` each frame (e.g. from an updater or a manual render
 * loop) to advance the physics and refresh the curve in place.
 */
export declare class SoftBody extends VGroup {
    readonly sim: SoftBodySimulation;
    private readonly _curve;
    private readonly _smoothness;
    constructor(config?: SoftBodyMobjectConfig);
    private _anchors;
    /** Advance the simulation one step and refresh the closed-curve visual
     *  from the updated node positions. */
    step(dt: number, target: [number, number]): void;
    /** Current node positions, [x, y] per node. */
    positions(): number[][];
}
//# sourceMappingURL=soft_body.d.ts.map