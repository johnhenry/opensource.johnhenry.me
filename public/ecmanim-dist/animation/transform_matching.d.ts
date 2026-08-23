import type { AnimationConfig } from "./Animation.ts";
import { AnimationGroup } from "./composition.ts";
import type { Mobject } from "../mobject/Mobject.ts";
interface MatchingConfig extends AnimationConfig {
    transformMismatches?: boolean;
    fadeTransformMismatches?: boolean;
    keyMap?: Record<string, string>;
}
export declare function piecesOf(mobject: any): any[];
export declare function matchingParts(mobject: any): Map<string, any>;
export declare function buildMatchingFromKeyed(sourceKeyed: Array<[string, any]>, targetKeyed: Array<[string, any]>, config: MatchingConfig): any[];
export declare class TransformMatchingShapes extends AnimationGroup {
    constructor(mobject: Mobject, target: Mobject, config?: MatchingConfig);
}
export declare class TransformMatchingTex extends AnimationGroup {
    constructor(mobject: Mobject, target: Mobject, config?: MatchingConfig);
}
export {};
//# sourceMappingURL=transform_matching.d.ts.map