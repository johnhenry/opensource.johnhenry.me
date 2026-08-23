import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import type { Mobject } from "../mobject/Mobject.ts";
export type NumberUpdateFunc = (alpha: number) => number;
export declare class ChangingDecimal extends Animation {
    decimalMob: any;
    numberUpdateFunc: NumberUpdateFunc;
    constructor(decimalMob: Mobject, numberUpdateFunc: NumberUpdateFunc, config?: AnimationConfig);
    interpolateMobject(alpha: number): void;
}
export declare class ChangeDecimalToValue extends ChangingDecimal {
    startValue: number;
    targetValue: number;
    constructor(decimalMob: any, targetValue: number, config?: AnimationConfig);
}
//# sourceMappingURL=numbers.d.ts.map