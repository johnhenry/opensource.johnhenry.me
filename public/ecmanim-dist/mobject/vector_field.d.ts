import { VMobject, VGroup } from "./VMobject.ts";
import { Vector } from "./vectors.ts";
import { Color } from "../core/color.ts";
import type { ColorLike } from "../core/types.ts";
type FieldFunc = (point: any) => number[];
export interface VectorFieldConfig {
    colorScheme?: (point: number[]) => number;
    minColorScheme?: number;
    maxColorScheme?: number;
    colors?: ColorLike[];
    [key: string]: any;
}
export declare class VectorField extends VGroup {
    func: FieldFunc;
    colors: ColorLike[];
    minColorScheme: number;
    maxColorScheme: number;
    colorScheme: (point: number[]) => number;
    constructor(funcXY: FieldFunc, config?: VectorFieldConfig);
    protected normalizeScalar(value: number): number;
    colorForPoint(point: number[]): Color;
    getVector(point: number[]): Vector;
}
export interface ArrowVectorFieldConfig extends VectorFieldConfig {
    xRange?: number[];
    yRange?: number[];
    step?: number;
    lengthFunc?: (norm: number) => number;
    minColor?: ColorLike;
    maxColor?: ColorLike;
    strokeWidth?: number;
    vectorConfig?: Record<string, any>;
    [key: string]: any;
}
export declare class ArrowVectorField extends VectorField {
    xRange: number[];
    yRange: number[];
    step: number;
    lengthFunc: (norm: number) => number;
    constructor(func: FieldFunc, config?: ArrowVectorFieldConfig);
    private _buildArrows;
}
export interface StreamLinesConfig extends VectorFieldConfig {
    xRange?: number[];
    yRange?: number[];
    step?: number;
    strokeWidth?: number;
    maxAnchorsPerLine?: number;
    dt?: number;
    virtualTime?: number;
    nRepeats?: number;
    noisePad?: number;
    [key: string]: any;
}
export declare class StreamLines extends VectorField {
    xRange: number[];
    yRange: number[];
    step: number;
    strokeWidth: number;
    maxAnchorsPerLine: number;
    dt: number;
    virtualTime: number;
    nRepeats: number;
    streamLines: VMobject[];
    constructor(func: FieldFunc, config?: StreamLinesConfig);
    private _rk4Step;
    private _buildLines;
    private _colorLineByLength;
    getLines(): VMobject[];
    create(): this;
    startAnimation(): this;
    endAnimation(): this;
}
export {};
//# sourceMappingURL=vector_field.d.ts.map