import { AnimationGroup } from "./composition.ts";
import type { SpringConfig } from "./spring.ts";
import type { RateFunc } from "../core/types.ts";
export interface TimingPresetResult {
    rateFunc: RateFunc;
    runTime?: number;
}
export type TimingPreset = (opts: {
    fps: number;
}) => TimingPresetResult;
export declare function linearTiming(rateFunc?: RateFunc): TimingPreset;
/** A spring-eased timing preset; measures its own natural settle time (in
 *  seconds, at `opts.fps`) unless `durationInFrames` is given explicitly. */
export declare function springTiming(config?: SpringConfig, durationInFrames?: number): TimingPreset;
export interface TransitionConfig {
    runTime?: number;
    rateFunc?: (t: number) => number;
    direction?: [number, number, number];
    overlap?: number;
    /** A timing preset (linearTiming/springTiming) supplying rateFunc and,
     *  optionally, a suggested runTime -- explicit `runTime` above still wins. */
    timing?: TimingPreset;
    /** fps used to resolve a timing preset's frame-accurate duration. Default 60;
     *  pass scene.fps for a frame-accurate springTiming(). */
    fps?: number;
}
export declare function crossFade(a: any, b: any, config?: TransitionConfig): any;
export declare function slide(a: any, b: any, config?: TransitionConfig): any;
export declare function wipe(a: any, b: any, config?: TransitionConfig): any;
export declare class Slide extends AnimationGroup {
    constructor(a: any, b: any, config?: TransitionConfig);
}
export declare class Wipe extends AnimationGroup {
    constructor(a: any, b: any, config?: TransitionConfig);
}
//# sourceMappingURL=transitions.d.ts.map