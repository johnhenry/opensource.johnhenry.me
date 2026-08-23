/** Options for `addBody(mob, opts)` on either Rapier engine. */
export interface RapierBodyOptions {
    /** Collider shape. Default inferred from the mobject (round types → ball, else cuboid). */
    shape?: "ball" | "cuboid" | "capsule";
    /** Ball/capsule radius (default: mean bbox half-extent). */
    radius?: number;
    /** Cuboid half-extents [hx, hy(, hz)] (default: from bbox). */
    halfExtents?: number[];
    /** Capsule half-height along Y (default: derived from bbox and radius). */
    halfHeight?: number;
    /** Initial linear velocity. */
    velocity?: number[];
    /** Initial angular velocity: a 3-vector in 3D, a scalar (about Z) in 2D. */
    angularVelocity?: number | number[];
    /** Explicit collider mass (overrides density). */
    mass?: number;
    /** Collider density (used if `mass` is not given). */
    density?: number;
    /** Fixed (immovable) body. */
    static?: boolean;
    /** Bounciness [0..1] (default: engine restitution). */
    restitution?: number;
    /** Friction coefficient (default: engine friction). */
    friction?: number;
}
export interface InferredShape {
    kind: "ball" | "cuboid" | "capsule";
    radius: number;
    /** Always length 3 ([hx, hy, hz]); 2D adapters use the first two. */
    halfExtents: number[];
    halfHeight: number;
}
/** Infer a collider shape from a mobject's bounding box, honoring explicit opts. */
export declare function inferShape(mob: any, opts: RapierBodyOptions, dims: 2 | 3): InferredShape;
/** Add an invisible carrier mobject that steps `engine` once per frame. Mirrors
 *  `SimpleEngine.attach` in rigid.ts. */
export declare function attachStepper(engine: {
    step(dt: number): void;
}, scene: any): void;
//# sourceMappingURL=rapier-common.d.ts.map