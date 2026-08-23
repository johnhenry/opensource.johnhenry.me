import { VGroup } from "./VMobject.ts";
import { BoidsSimulation } from "../layout/boids.ts";
import type { BoidsConfig } from "../layout/boids.ts";
export interface BoidsFlockConfig extends BoidsConfig {
    /** Triangle circumradius per boid (visual size, independent of simulation radii). Default 0.15. */
    boidSize?: number;
    /** Fill color for each boid triangle. Default "#FFFFFF". */
    color?: string;
}
export declare class BoidsFlock extends VGroup {
    /** The underlying deterministic simulation -- see its determinism contract in src/layout/boids.ts. */
    readonly simulation: BoidsSimulation;
    private _prevHeadings;
    constructor(config?: BoidsFlockConfig);
    private _syncOrientations;
    /** Advance the simulation one fixed step and re-pose the visuals to match. */
    step(dt: number): void;
}
//# sourceMappingURL=boids.d.ts.map