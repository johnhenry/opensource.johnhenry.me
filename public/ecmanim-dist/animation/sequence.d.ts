import { AnimationGroup } from "./composition.ts";
export interface SequenceConfig {
    from?: number;
    durationInFrames?: number;
    fps?: number;
    runTime?: number;
}
/**
 * Wrap `animation` so it is only "active" during its frame window
 * `[from, from + durationInFrames)`. Returns an Animation (an AnimationGroup
 * subclass) whose `interpolate(alpha)` drives the child through its shifted
 * window: frozen at start before, progressing inside, frozen at end after.
 */
export declare function Sequence(animation: any, config?: SequenceConfig): any;
export declare class SequenceAnimation extends AnimationGroup {
    from: number;
    durationInFrames: number;
    fps: number;
    windowStart: number;
    windowEnd: number;
    constructor(animation: any, config?: SequenceConfig);
    interpolate(alpha: number): void;
}
//# sourceMappingURL=sequence.d.ts.map