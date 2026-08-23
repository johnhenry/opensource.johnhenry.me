import { Animation, Create } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import type { Mobject } from "../mobject/Mobject.ts";
import type { ColorLike } from "../core/types.ts";
export interface DrawBorderThenFillConfig extends AnimationConfig {
    strokeWidth?: number;
    strokeColor?: ColorLike;
}
export interface ShowSubsetsConfig extends AnimationConfig {
    intFunc?: (x: number) => number;
}
export interface AddTextConfig extends AnimationConfig {
    timePerChar?: number;
}
export interface TypeWithCursorConfig extends AddTextConfig {
    insertTextAnimation?: typeof AddTextLetterByLetter;
}
export interface SpiralInConfig extends AnimationConfig {
    scaleFactor?: number;
    fadeInFraction?: number;
}
export declare class DrawBorderThenFill extends Animation {
    origFill: number[];
    strokeWidth?: number;
    strokeColor?: ColorLike;
    constructor(vmobject: Mobject, config?: DrawBorderThenFillConfig);
    setup(): void;
    protected drawMember(m: any, index: number, a: number): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class Unwrite extends Create {
    constructor(mobject: Mobject, config?: AnimationConfig);
    finish(): this;
}
export declare class ShowIncreasingSubsets extends Animation {
    group: any;
    allSubmobs: any[];
    intFunc: (x: number) => number;
    startOpacities: number[];
    constructor(group: Mobject, config?: ShowSubsetsConfig);
    setup(): void;
    protected updateSubmobjectList(index: number): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class ShowSubmobjectsOneByOne extends ShowIncreasingSubsets {
    constructor(group: Mobject, config?: ShowSubsetsConfig);
    protected updateSubmobjectList(index: number): void;
}
export declare class AddTextLetterByLetter extends ShowIncreasingSubsets {
    text: any;
    isRaster: boolean;
    constructor(text: Mobject, config?: AddTextConfig);
    interpolateMobject(alpha: number): void;
    private rateFuncAlpha;
    finish(): this;
}
export declare class RemoveTextLetterByLetter extends AddTextLetterByLetter {
    constructor(text: Mobject, config?: AddTextConfig);
    finish(): this;
}
export declare class AddTextWordByWord extends Animation {
    text: any;
    words: any[][];
    isRaster: boolean;
    startOpacities: number[][];
    constructor(text: Mobject, config?: AddTextConfig);
    setup(): void;
    private show;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class TypeWithCursor extends AddTextLetterByLetter {
    cursor: any;
    private _cursorIntroduced;
    constructor(text: Mobject, cursor?: Mobject, config?: TypeWithCursorConfig);
    private placeCursor;
    interpolateMobject(alpha: number): void;
    finish(): this;
    getMobjectsToIntroduce(): Mobject[];
}
export declare class Untype extends RemoveTextLetterByLetter {
    constructor(text: Mobject, config?: AddTextConfig);
}
export declare class UntypeWithCursor extends TypeWithCursor {
    constructor(text: Mobject, cursor?: Mobject, config?: TypeWithCursorConfig);
    finish(): this;
    getMobjectsToRemove(): Mobject[];
}
export declare class SpiralIn extends Animation {
    spiralScale: number;
    fadeInFraction: number;
    finalPoints: number[][][];
    targetOpacities: Array<{
        fill: number;
        stroke: number;
        op: number;
    }>;
    center: number[];
    constructor(group: Mobject, config?: SpiralInConfig);
    setup(): void;
    protected spiralMember(m: any, i: number, count: number, alpha: number): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
//# sourceMappingURL=creation_extra.d.ts.map