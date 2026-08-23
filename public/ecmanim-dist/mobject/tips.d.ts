import { VMobject } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
export declare const DEFAULT_ARROW_TIP_LENGTH = 0.35;
/** Config accepted by every ArrowTip. */
export interface ArrowTipConfig extends VMobjectConfig {
    tipLength?: number;
    tipWidth?: number;
    length?: number;
    width?: number;
}
export declare class ArrowTip extends VMobject {
    constructor(config?: VMobjectConfig);
    getTipPoint(): number[];
    getBase(): number[];
    getVector(): number[];
    getTipAngle(): number;
    get length(): number;
}
export declare class StealthTip extends ArrowTip {
    constructor(config?: ArrowTipConfig);
}
export declare class ArrowTriangleTip extends ArrowTip {
    constructor(config?: ArrowTipConfig);
}
export declare class ArrowTriangleFilledTip extends ArrowTriangleTip {
    constructor(config?: ArrowTipConfig);
}
export declare class ArrowCircleTip extends ArrowTip {
    constructor(config?: ArrowTipConfig);
}
export declare class ArrowCircleFilledTip extends ArrowCircleTip {
    constructor(config?: ArrowTipConfig);
}
export declare class ArrowSquareTip extends ArrowTip {
    constructor(config?: ArrowTipConfig);
    getTipPoint(): number[];
    getBase(): number[];
}
export declare class ArrowSquareFilledTip extends ArrowSquareTip {
    constructor(config?: ArrowTipConfig);
}
//# sourceMappingURL=tips.d.ts.map