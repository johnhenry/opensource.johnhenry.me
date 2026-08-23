import { VGroup } from "../mobject/VMobject.ts";
export interface PhysicsBody {
    mob: any;
    velocity: number[];
    mass: number;
    static?: boolean;
    restitution?: number;
    /** Spin (rad/s) about the body's center. Torque-free: constant unless you change it. */
    angularVelocity?: number;
}
export interface PhysicsEngineOptions {
    gravity?: number[];
    floor?: number;
    restitution?: number;
}
export interface PhysicsEngineLike {
    step(dt: number): void;
}
/** Dependency-free semi-implicit Euler engine. */
export declare class SimpleEngine implements PhysicsEngineLike {
    bodies: PhysicsBody[];
    gravity: number[];
    floor?: number;
    restitution: number;
    constructor(opts?: PhysicsEngineOptions);
    addBody(mob: any, opts?: Partial<PhysicsBody>): PhysicsBody;
    step(dt: number): void;
    /** Attach this engine to a scene: adds an invisible carrier that steps it each frame. */
    attach(scene: any): this;
}
/** Create a SimpleEngine, attach it to the scene, and return it. */
export declare function physics(scene: any, opts?: PhysicsEngineOptions): SimpleEngine;
export interface PendulumConfig {
    length?: number;
    initialAngle?: number;
    gravity?: number;
    pivot?: number[];
    color?: string;
    bobRadius?: number;
}
/** A simple pendulum whose angle is integrated (θ'' = −(g/L)·sinθ) each frame. */
export declare class Pendulum extends VGroup {
    theta: number;
    omega: number;
    length: number;
    g: number;
    pivot: number[];
    private rod;
    private bob;
    constructor(config?: PendulumConfig);
    private _bobPos;
    private _place;
    private _step;
    /** Total mechanical energy (for conservation checks). */
    energy(): number;
}
//# sourceMappingURL=rigid.d.ts.map