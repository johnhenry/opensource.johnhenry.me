import { Transform, FadeToColor } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import { AnimationGroup } from "./composition.ts";
import type { Mobject } from "../mobject/Mobject.ts";
export { FadeToColor };
export declare class TransformFromCopy extends Transform {
    constructor(mobject: Mobject, target: Mobject, config?: AnimationConfig);
}
export declare class ClockwiseTransform extends Transform {
    constructor(mobject: Mobject, target: Mobject, config?: AnimationConfig);
}
export declare class CounterclockwiseTransform extends Transform {
    constructor(mobject: Mobject, target: Mobject, config?: AnimationConfig);
}
export declare class MoveToTarget extends Transform {
    constructor(mobject: Mobject, config?: AnimationConfig);
}
export declare class Restore extends Transform {
    constructor(mobject: Mobject, config?: AnimationConfig);
}
export declare class ApplyFunction extends Transform {
    constructor(fn: (p: number[]) => number[], mobject: Mobject, config?: AnimationConfig);
}
export declare class ApplyPointwiseFunction extends Transform {
    constructor(fn: (p: number[]) => number[], mobject: Mobject, config?: AnimationConfig);
}
export declare class ApplyPointwiseFunctionToCenter extends Transform {
    constructor(fn: (p: number[]) => number[], mobject: Mobject, config?: AnimationConfig);
}
export declare class ApplyMatrix extends Transform {
    constructor(matrix: number[][], mobject: Mobject, config?: AnimationConfig & {
        aboutPoint?: number[];
    });
}
export declare class ApplyComplexFunction extends Transform {
    constructor(fn: (z: {
        re: number;
        im: number;
    }) => {
        re: number;
        im: number;
    } | number[], mobject: Mobject, config?: AnimationConfig);
}
export declare class ScaleInPlace extends Transform {
    constructor(mobject: Mobject, scaleFactor: number, config?: AnimationConfig);
}
export declare class FadeTransform extends Transform {
    toFadeOut: any;
    toFadeIn: any;
    stretch: boolean;
    dimToMatch: number;
    group: any;
    startFillOut: number;
    startStrokeOut: number;
    startFillIn: number;
    startStrokeIn: number;
    constructor(mobject: Mobject, target: Mobject, config?: AnimationConfig & {
        stretch?: boolean;
        dimToMatch?: number;
    });
    begin(): this;
    setup(): void;
    private setOpacity;
    interpolate(alpha: number): void;
    finish(): this;
    getMobjectsToIntroduce(): Mobject[];
    getMobjectsToRemove(): Mobject[];
}
export declare class FadeTransformPieces extends AnimationGroup {
    constructor(mobject: Mobject, target: Mobject, config?: AnimationConfig & {
        stretch?: boolean;
        dimToMatch?: number;
    });
}
export declare class CyclicReplace extends AnimationGroup {
    constructor(...args: any[]);
}
export declare class Swap extends CyclicReplace {
    constructor(a: Mobject, b: Mobject, config?: AnimationConfig & {
        pathArc?: number;
    });
}
//# sourceMappingURL=transform_extra.d.ts.map