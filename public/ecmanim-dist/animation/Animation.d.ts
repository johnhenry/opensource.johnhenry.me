import { type PathFunc } from "../core/math/paths.ts";
import type { Mobject } from "../mobject/Mobject.ts";
import type { RateFunc } from "../core/types.ts";
/** Configuration accepted by Animation constructors. */
export interface AnimationConfig {
    runTime?: number;
    rateFunc?: RateFunc;
    remover?: boolean;
    introducer?: boolean;
    lagRatio?: number;
    /** When true, wrap the rate function as t => rate(1 - t) (manim's reverse_rate_function). */
    reverseRateFunc?: boolean;
    /** Arc angle (radians) along which Transform-style animations move points. Default 0 (straight). */
    pathArc?: number;
    /** Explicit path function; overrides pathArc when given. */
    pathFunc?: PathFunc;
    /** When true (default), Scene.play suspends the mobject's updaters while the anim runs. */
    suspendMobjectUpdating?: boolean;
    [key: string]: any;
}
export declare class Animation {
    mobject: any;
    runTime: number;
    rateFunc: RateFunc;
    remover: boolean;
    introducer: boolean;
    lagRatio: number;
    suspendMobjectUpdating: boolean;
    started: boolean;
    finished: boolean;
    startState: any;
    constructor(mobject: Mobject | null, config?: AnimationConfig);
    getSubAlpha(alpha: number, index: number, numSubmobjects: number): number;
    begin(): this;
    setup(): void;
    finish(): this;
    interpolate(alpha: number): void;
    usesSubmobjectStagger(): boolean;
    interpolateSubmobject(_submob: any, _subAlpha: number, _index: number): void;
    interpolateMobject(_alpha: number): void;
    getMobjectsToIntroduce(): Mobject[];
    getMobjectsToRemove(): Mobject[];
}
export declare class Transform extends Animation {
    target: any;
    replace: boolean;
    targetCopy: any;
    startCopy: any;
    pathArc: number;
    pathFunc: PathFunc | null;
    constructor(mobject: Mobject, target: Mobject, config?: AnimationConfig & {
        replace?: boolean;
    });
    setup(): void;
    interpolateMobject(alpha: number): void;
}
export declare class ReplacementTransform extends Transform {
    introduced: any;
    constructor(mobject: Mobject, target: Mobject, config?: AnimationConfig);
    finish(): this;
}
export declare class Create extends Animation {
    origFill: number[];
    constructor(mobject: Mobject, config?: AnimationConfig);
    setup(): void;
    protected drawMember(m: any, index: number, a: number): void;
    usesSubmobjectStagger(): boolean;
    interpolateSubmobject(submob: any, subAlpha: number, index: number): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class Write extends Create {
    constructor(mobject: Mobject, config?: AnimationConfig);
}
export declare class Uncreate extends Create {
    constructor(mobject: Mobject, config?: AnimationConfig);
    finish(): this;
}
export declare class FadeIn extends Animation {
    shiftVec: number[];
    scaleFactor: number;
    targetOpacities: Array<{
        fill: number;
        stroke: number;
        op: number;
    }>;
    finalPoints: number[][][];
    startPoints: number[][][];
    constructor(mobject: Mobject, config?: AnimationConfig & {
        shift?: number[];
        scale?: number;
    });
    setup(): void;
    protected fadeMember(m: any, i: number, a: number): void;
    usesSubmobjectStagger(): boolean;
    interpolateSubmobject(submob: any, subAlpha: number, index: number): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class FadeOut extends Animation {
    shiftVec: number[];
    scaleFactor: number;
    startOpacities: Array<{
        fill: number;
        stroke: number;
    }>;
    startPoints: number[][][];
    endPoints: number[][][];
    constructor(mobject: Mobject, config?: AnimationConfig & {
        shift?: number[];
        scale?: number;
    });
    setup(): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class ApplyMethod extends Animation {
    method: string | ((...args: any[]) => any);
    args: any[];
    targetCopy: any;
    constructor(mobject: Mobject, method: string | ((...args: any[]) => any), ...args: any[]);
    setup(): void;
    interpolateMobject(alpha: number): void;
}
export declare const Shift: (mob: Mobject, vec: number[], config?: AnimationConfig) => ApplyMethod;
export declare const MoveTo: (mob: Mobject, pt: number[], config?: AnimationConfig) => ApplyMethod;
export declare const ScaleAnim: (mob: Mobject, f: number, config?: AnimationConfig) => ApplyMethod;
export declare class FadeToColor extends ApplyMethod {
    constructor(mobject: Mobject, color: any, config?: AnimationConfig);
}
//# sourceMappingURL=Animation.d.ts.map