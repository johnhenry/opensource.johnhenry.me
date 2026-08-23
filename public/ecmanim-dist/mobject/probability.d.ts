import { VGroup } from "./VMobject.ts";
import { Rectangle } from "./geometry.ts";
import { Axes } from "./coordinate_systems.ts";
import type { AxesConfig } from "./coordinate_systems.ts";
import { Text } from "./text/Text.ts";
import type { ColorLike } from "../core/types.ts";
export interface BarChartConfig extends AxesConfig {
    barNames?: string[];
    yRange?: number[];
    xLength?: number;
    yLength?: number;
    barColors?: ColorLike[];
    barWidthRatio?: number;
    barFillOpacity?: number;
    barStrokeWidth?: number;
    [key: string]: any;
}
export declare class BarChart extends Axes {
    values: number[];
    barNames: string[];
    barColors: ColorLike[];
    barWidthRatio: number;
    barFillOpacity: number;
    barStrokeWidth: number;
    bars: VGroup;
    constructor(values: number[], config?: BarChartConfig);
    private _unitWidth;
    private _colorFor;
    private _addBars;
    getBars(): VGroup;
    getBarLabels(config?: {
        fontSize?: number;
        color?: ColorLike;
        buff?: number;
    }): VGroup;
    changeBarValues(values: number[]): this;
}
export interface SampleSpaceConfig {
    height?: number;
    width?: number;
    fillColor?: ColorLike;
    fillOpacity?: number;
    strokeWidth?: number;
    strokeColor?: ColorLike;
    [key: string]: any;
}
export interface SampleSpaceDivideConfig {
    colors?: ColorLike[];
    vect?: number[];
    strokeWidth?: number;
    [key: string]: any;
}
export declare class SampleSpace extends Rectangle {
    horizontalParts?: VGroup;
    verticalParts?: VGroup;
    title?: Text;
    labels?: VGroup;
    constructor(config?: SampleSpaceConfig);
    private _defaultColors;
    private _getSubdivision;
    divideHorizontally(pList: number[], config?: SampleSpaceDivideConfig): VGroup;
    divideVertically(pList: number[], config?: SampleSpaceDivideConfig): VGroup;
    getSubdivisionBraces(parts: VGroup, direction?: number[], config?: {
        buff?: number;
    }): VGroup;
    addTitle(title: string, scaleFactor?: number): Text;
    addLabel(label: Text | string, position?: number[], buff?: number): Text;
}
//# sourceMappingURL=probability.d.ts.map