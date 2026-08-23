import { Mobject } from "./Mobject.ts";
import { RasterText } from "./text/Text.ts";
/** Config accepted by DecimalNumber/Integer (extends Text's config loosely). */
export interface DecimalNumberConfig {
    numDecimalPlaces?: number;
    unit?: string;
    includeSign?: boolean;
    groupWithCommas?: boolean;
    showEllipsis?: boolean;
    edgeToFix?: number[];
    point?: number[];
    at?: number[];
    [key: string]: any;
}
export declare class ValueTracker extends Mobject {
    constructor(value?: number);
    getValue(): number;
    setValue(v: number): this;
    increment(dv: number): this;
    /** manim parity alias (increment_value). */
    incrementValue(dv: number): this;
    interpolate(start: ValueTracker, target: ValueTracker, alpha: number): this;
}
export declare class DecimalNumber extends RasterText {
    numDecimalPlaces: number;
    unit: string;
    includeSign: boolean;
    groupWithCommas: boolean;
    showEllipsis: boolean;
    edgeToFix: number[];
    value: number;
    constructor(value?: number, config?: DecimalNumberConfig);
    _format(value: number): string;
    getValue(): number;
    incrementValue(delta?: number): this;
    setValue(value: number): this;
}
export declare class Integer extends DecimalNumber {
    constructor(value?: number, config?: DecimalNumberConfig);
    setValue(value: number): this;
}
export declare function alwaysRedraw(fn: () => Mobject): Mobject;
//# sourceMappingURL=value_tracker.d.ts.map