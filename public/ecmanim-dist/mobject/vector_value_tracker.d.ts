import { VGroup } from "./VMobject.ts";
import type { ColorLike } from "../core/types.ts";
export interface VectorDecimalNumberConfig {
    numDecimalPlaces?: number;
    unit?: string;
    includeSign?: boolean;
    groupWithCommas?: boolean;
    showEllipsis?: boolean;
    fontSize?: number;
    font?: any;
    color?: ColorLike;
    fillColor?: ColorLike;
    strokeColor?: ColorLike;
    fillOpacity?: number;
    strokeWidth?: number;
    strokeOpacity?: number;
    point?: number[];
    /** Which edge stays pinned as the number's width changes (default LEFT). */
    edgeToFix?: number[];
}
export declare class VectorDecimalNumber extends VGroup {
    value: number;
    numDecimalPlaces: number;
    unit: string;
    includeSign: boolean;
    groupWithCommas: boolean;
    showEllipsis: boolean;
    fontSize: number;
    edgeToFix: number[];
    private _font;
    private _cfg;
    constructor(value?: number, config?: VectorDecimalNumberConfig);
    /** Mirror DecimalNumber._format. */
    _format(value: number): string;
    private _layout;
    getValue(): number;
    incrementValue(delta?: number): this;
    /** Update the displayed number, keeping `edgeToFix` pinned across width changes. */
    setValue(value: number): this;
}
export declare function vectorDecimalNumber(value?: number, config?: VectorDecimalNumberConfig): VectorDecimalNumber;
//# sourceMappingURL=vector_value_tracker.d.ts.map