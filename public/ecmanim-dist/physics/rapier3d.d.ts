import type { PhysicsEngineLike } from "./rigid.ts";
import { type RapierBodyOptions } from "./rapier-common.ts";
export interface Rapier3DEngineOptions {
    gravity?: number[];
    floor?: number;
    restitution?: number;
    friction?: number;
    /** Inject an already-imported RAPIER module (tests / custom builds). */
    rapier?: any;
}
export interface Rapier3DBody {
    mob: any;
    /** The Rapier RigidBody. */
    rb: any;
    static: boolean;
    lastPos: number[];
    /** Last orientation in ecmanim quaternion order [w, x, y, z]. */
    lastQuat: number[];
}
export declare class Rapier3DEngine implements PhysicsEngineLike {
    readonly world: any;
    private RAPIER;
    bodies: Rapier3DBody[];
    restitution: number;
    friction: number;
    private constructor();
    /** Async factory: initializes Rapier's WASM, builds the world (+ optional floor). */
    static create(opts?: Rapier3DEngineOptions): Promise<Rapier3DEngine>;
    addBody(mob: any, opts?: RapierBodyOptions): Rapier3DBody;
    step(dt: number): void;
    /** Attach to a scene: an invisible carrier steps the engine each frame. */
    attach(scene: any): this;
}
/** Create a Rapier3D engine, attach it to the scene, and return it (async). */
export declare function rapier3d(scene: any, opts?: Rapier3DEngineOptions): Promise<Rapier3DEngine>;
//# sourceMappingURL=rapier3d.d.ts.map