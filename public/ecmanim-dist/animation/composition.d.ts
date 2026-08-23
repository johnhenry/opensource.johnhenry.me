import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import type { Mobject } from "../mobject/Mobject.ts";
interface Timing {
    anim: any;
    start: number;
    end: number;
}
export declare class AnimationGroup extends Animation {
    animations: any[];
    groupRunTime: number | null;
    timings: Timing[];
    maxEnd: number;
    scaledTimings: Timing[];
    constructor(animations: any[], config?: AnimationConfig);
    _buildTimings(): void;
    begin(): this;
    interpolate(alpha: number): void;
    finish(): this;
    getMobjectsToIntroduce(): Mobject[];
    getMobjectsToRemove(): Mobject[];
    /** Partial-movie-cache content fingerprint: recurse into children so two
     *  same-shaped groups with different tween targets/closures hash apart
     *  (found by the D3 ports: grouped transitions silently replayed each
     *  other's cached clips). */
    _hashExtra(): string;
}
export declare class LaggedStart extends AnimationGroup {
    constructor(animations: any[], config?: AnimationConfig);
}
export declare class Succession extends AnimationGroup {
    constructor(animations: any[], config?: AnimationConfig);
}
export declare class LaggedStartMap extends LaggedStart {
    constructor(animFactory: (m: any, index: number, total: number) => any, mobjects: any[], config?: AnimationConfig);
}
export declare function makeAnimateBuilder(mob: any, config?: AnimationConfig): any;
export {};
//# sourceMappingURL=composition.d.ts.map