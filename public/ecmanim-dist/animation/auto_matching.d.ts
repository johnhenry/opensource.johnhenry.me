import { AnimationGroup } from "./composition.ts";
import type { AnimationConfig } from "./Animation.ts";
export interface AutoMatchingConfig extends AnimationConfig {
    transformMismatches?: boolean;
    fadeTransformMismatches?: boolean;
    keyMap?: Record<string, string>;
}
export declare class TransformMatchingAuto extends AnimationGroup {
    constructor(mobject: any, target: any, config?: AutoMatchingConfig);
}
/** The pairing an auto-match would produce (source key → matched? ), for tests/introspection. */
export declare function autoMatchKeys(mobject: any): string[];
//# sourceMappingURL=auto_matching.d.ts.map