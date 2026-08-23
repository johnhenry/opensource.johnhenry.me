import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import type { Mobject } from "../mobject/Mobject.ts";
export interface RepeatConfig extends AnimationConfig {
    /** Number of times the wrapped animation plays. Must be a finite integer >= 1. */
    count: number;
    /** Odd-indexed cycles (1st, 3rd, ...) play in reverse, so motion "bounces". */
    yoyo?: boolean;
    /** Seconds to hold the wrapped animation's end value between cycles. */
    repeatDelay?: number;
}
export declare class Repeat extends Animation {
    animation: any;
    count: number;
    yoyo: boolean;
    repeatDelay: number;
    private cycles;
    constructor(animation: any, config: RepeatConfig);
    begin(): this;
    private windowAt;
    interpolate(alpha: number): void;
    finish(): this;
    getMobjectsToIntroduce(): Mobject[];
    getMobjectsToRemove(): Mobject[];
}
//# sourceMappingURL=repeat.d.ts.map