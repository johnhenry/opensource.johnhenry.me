import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import { LaggedStart } from "./composition.ts";
import type { Mobject } from "../mobject/Mobject.ts";
import type { RateFunc, Vec3 } from "../core/types.ts";
/** Config for Broadcast. */
export interface BroadcastConfig extends AnimationConfig {
    focalPoint?: Vec3 | number[];
    nMobjects?: number;
    initialOpacity?: number;
    finalOpacity?: number;
    initialWidth?: number;
    finalWidth?: number;
}
/**
 * Broadcast: concentric copies of `mobject` expand outward from `focalPoint`
 * while fading out, like a ripple. Built as a LaggedStart of Transforms, each
 * growing a small copy into a large faded one. Remover: all temporary copies
 * are removed when the animation finishes.
 */
export declare class Broadcast extends LaggedStart {
    broadcastCopies: any[];
    constructor(mobject: Mobject, config?: BroadcastConfig);
    getMobjectsToIntroduce(): Mobject[];
    getMobjectsToRemove(): Mobject[];
}
/** A piecewise speed specification: { time: speed }. */
export type SpeedInfo = Record<number, number>;
/** Config for ChangeSpeed. */
export interface ChangeSpeedConfig extends AnimationConfig {
    rateFunc?: RateFunc;
}
/**
 * ChangeSpeed: wrap one or more animations and remap time by a piecewise-linear
 * speed function given as { t: speed } pairs (t normalized in [0, 1]). The
 * effective runTime is scaled by the average inverse speed, and playback alpha
 * is remapped so the wrapped animation runs faster/slower over its duration.
 */
export declare class ChangeSpeed extends Animation {
    wrapped: any;
    speedTimes: number[];
    speedValues: number[];
    private _cumDist;
    private _totalDist;
    constructor(animation: any | any[], speedinfoDict: SpeedInfo, config?: ChangeSpeedConfig);
    begin(): this;
    private mapAlpha;
    interpolate(alpha: number): void;
    finish(): this;
    getMobjectsToIntroduce(): Mobject[];
    getMobjectsToRemove(): Mobject[];
}
/**
 * Calls `updateFunction(mobject)` every frame of the animation — manim's
 * escape hatch for driving one mobject from another mid-play (e.g.
 * MovingZoomedSceneAround keeps a backdrop glued to the zoomed display while
 * it scales). The function receives NO alpha; use UpdateFromAlphaFunc for
 * alpha-driven variants.
 */
export declare class UpdateFromFunc extends Animation {
    updateFunction: (mob: any) => void;
    constructor(mobject: any, updateFunction: (mob: any) => void, config?: any);
    interpolateMobject(_alpha: number): void;
}
/** Like UpdateFromFunc, but the callback also receives the eased alpha. */
export declare class UpdateFromAlphaFunc extends Animation {
    updateFunction: (mob: any, alpha: number) => void;
    constructor(mobject: any, updateFunction: (mob: any, alpha: number) => void, config?: any);
    interpolateMobject(alpha: number): void;
}
//# sourceMappingURL=specialized.d.ts.map