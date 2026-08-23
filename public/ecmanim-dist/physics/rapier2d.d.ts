import type { PhysicsEngineLike } from "./rigid.ts";
import { type RapierBodyOptions } from "./rapier-common.ts";
export interface Rapier2DEngineOptions {
    gravity?: number[];
    floor?: number;
    restitution?: number;
    friction?: number;
    /** Inject an already-imported RAPIER module (tests / custom builds). */
    rapier?: any;
}
export interface Rapier2DBody {
    mob: any;
    /** The Rapier RigidBody. */
    rb: any;
    static: boolean;
    lastPos: number[];
    /** Last orientation angle (radians about Z). */
    lastAngle: number;
}
export declare class Rapier2DEngine implements PhysicsEngineLike {
    readonly world: any;
    private RAPIER;
    bodies: Rapier2DBody[];
    restitution: number;
    friction: number;
    private constructor();
    /** Async factory: initializes Rapier's WASM, builds the world (+ optional floor). */
    static create(opts?: Rapier2DEngineOptions): Promise<Rapier2DEngine>;
    addBody(mob: any, opts?: RapierBodyOptions): Rapier2DBody;
    step(dt: number): void;
    /** Attach to a scene: an invisible carrier steps the engine each frame. */
    attach(scene: any): this;
}
/** Create a Rapier2D engine, attach it to the scene, and return it (async). */
export declare function rapier2d(scene: any, opts?: Rapier2DEngineOptions): Promise<Rapier2DEngine>;
//# sourceMappingURL=rapier2d.d.ts.map