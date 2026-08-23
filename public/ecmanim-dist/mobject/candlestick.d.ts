import { VMobject, VGroup } from "./VMobject.ts";
import { Line } from "./geometry.ts";
import { Axes } from "./coordinate_systems.ts";
import type { AxesConfig } from "./coordinate_systems.ts";
import type { ColorLike } from "../core/types.ts";
export interface CandlestickPoint {
    /** X-axis category label (e.g. a date string), or a numeric index. */
    label: string | number;
    open: number;
    close: number;
    low: number;
    high: number;
}
export interface CandlestickConfig extends AxesConfig {
    /** Body/wick color for close >= open. Default '#ec0000' (ref file). */
    upColor?: ColorLike;
    /** Body/wick color for close < open. Default '#00da3c' (ref file). */
    downColor?: ColorLike;
    /** Wick color override. Default: matches each candle's body color. */
    wickColor?: ColorLike;
    /** Fraction of the per-category band width the body occupies. Default 0.6. */
    bodyWidth?: number;
    /** Body outline stroke width. Default 1. */
    strokeWidth?: number;
    /** Wick line stroke width. Default 2. */
    wickStrokeWidth?: number;
    yRange?: number[];
    xLength?: number;
    yLength?: number;
    [key: string]: any;
}
export declare class Candlestick extends Axes {
    data: CandlestickPoint[];
    upColor: ColorLike;
    downColor: ColorLike;
    wickColor?: ColorLike;
    bodyWidth: number;
    strokeWidth: number;
    wickStrokeWidth: number;
    readonly candles: VMobject[];
    readonly wicks: Line[];
    private readonly _candlesGroup;
    private readonly _wicksGroup;
    constructor(points: CandlestickPoint[], config?: CandlestickConfig);
    private _unitWidth;
    private _colorFor;
    private _build;
    setPoints(points: CandlestickPoint[]): this;
    addMovingAverageLine(values: number[], config?: {
        color?: ColorLike;
        smooth?: boolean;
    }): VGroup;
}
//# sourceMappingURL=candlestick.d.ts.map