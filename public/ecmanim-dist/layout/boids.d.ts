import type { Vec3 } from "../core/types.ts";
export interface BoidsConfig {
    /** Number of boids. Default 30. */
    count?: number;
    /** PRNG seed for initial positions/velocities. Default 1. Same seed -> byte-identical simulation runs. */
    seed?: number;
    /** World bounds boids wrap around, centered at the origin. Default {width: 14, height: 8} (matches the default world frame). */
    bounds?: {
        width: number;
        height: number;
    };
    /** Radius within which alignment/cohesion neighbors are considered. Default 2. */
    perceptionRadius?: number;
    /** Radius within which separation pushes boids apart. Default 1. */
    separationRadius?: number;
    /** Maximum boid speed, world units/s. Default 4. */
    maxSpeed?: number;
    /** Maximum steering force per behavior, world units/s^2. Default 0.3. */
    maxForce?: number;
    /** Per-behavior weights. Defaults match the classic reference: separation 1.5, alignment 1.0, cohesion 1.0. */
    weights?: {
        separation?: number;
        alignment?: number;
        cohesion?: number;
    };
}
/** One boid's simulation state. */
export interface BoidState {
    position: Vec3;
    velocity: Vec3;
}
export declare class BoidsSimulation {
    private _boids;
    readonly count: number;
    readonly bounds: {
        width: number;
        height: number;
    };
    readonly perceptionRadius: number;
    readonly separationRadius: number;
    readonly maxSpeed: number;
    readonly maxForce: number;
    readonly weights: {
        separation: number;
        alignment: number;
        cohesion: number;
    };
    constructor(config?: BoidsConfig);
    /**
     * Advance the simulation exactly one fixed step. See the module-level
     * determinism contract: no randomness or wall-clock reads happen here, so
     * the same sequence of step(dt) calls from the same seed always reproduces
     * the same states.
     */
    step(dt: number): void;
    /** Current boid positions, one [x, y, z] per boid, in construction order. */
    positions(): Vec3[];
    /** Current boid velocities, one [x, y, z] per boid, in construction order. */
    velocities(): Vec3[];
    /** Current heading angle (radians, atan2(vy, vx)) per boid. */
    headings(): number[];
}
/** Create a deterministic boids simulation (functional-style convenience). */
export declare function boidsSimulation(config?: BoidsConfig): BoidsSimulation;
//# sourceMappingURL=boids.d.ts.map