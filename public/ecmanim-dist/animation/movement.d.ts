import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import type { Mobject } from "../mobject/Mobject.ts";
export type HomotopyFn = (x: number, y: number, z: number, t: number) => number[];
/** Config for Homotopy-style animations. */
export interface HomotopyConfig extends AnimationConfig {
    applyFunctionToPoints?: boolean;
}
/**
 * Homotopy: continuously deform a mobject by applying `homotopyFn` at time=alpha
 * to every point. The original points are snapshotted at begin() so the mapping
 * is always evaluated against the un-deformed geometry.
 */
export declare class Homotopy extends Animation {
    homotopyFn: HomotopyFn;
    startPoints: number[][][];
    constructor(homotopyFn: HomotopyFn, mobject: Mobject, config?: HomotopyConfig);
    setup(): void;
    protected applyToMember(_m: any, _index: number): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
/**
 * SmoothedVectorizedHomotopy: a Homotopy that re-smooths each curve after the
 * points have been moved, so the deformed outline stays smooth.
 */
export declare class SmoothedVectorizedHomotopy extends Homotopy {
    protected applyToMember(m: any): void;
}
export type ComplexHomotopyFn = (z: {
    re: number;
    im: number;
}, t: number) => {
    re: number;
    im: number;
} | number[];
/**
 * ComplexHomotopy: wraps a complex-plane homotopy into a real Homotopy via
 * complexToR3 / R3ToComplex. The z-coordinate is preserved.
 */
export declare class ComplexHomotopy extends Homotopy {
    constructor(complexHomotopyFn: ComplexHomotopyFn, mobject: Mobject, config?: HomotopyConfig);
}
export type VelocityFn = (point: number[]) => number[];
/** Config for PhaseFlow. */
export interface PhaseFlowConfig extends AnimationConfig {
    virtualTime?: number;
    suspendMobjectUpdating?: boolean;
}
/**
 * PhaseFlow: integrate each point of the mobject along a vector field
 * `velocityFn` over `virtualTime`. Points advance by velocity * dt each frame,
 * where dt is derived from the change in alpha between successive frames.
 */
export declare class PhaseFlow extends Animation {
    velocityFn: VelocityFn;
    virtualTime: number;
    lastAlpha: number | null;
    constructor(velocityFn: VelocityFn, mobject: Mobject, config?: PhaseFlowConfig);
    interpolateMobject(alpha: number): void;
}
//# sourceMappingURL=movement.d.ts.map