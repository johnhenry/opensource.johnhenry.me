import { ticks, tickIncrement, niceExtent, tickStep } from "./array_utils.ts";
import type { ColorLike } from "./types.ts";
type Numeric = number | Date | {
    valueOf(): number;
};
export interface ScaleLinear {
    (value: Numeric): number;
    invert(pixel: number): number;
    domain(): number[];
    domain(d: Numeric[]): ScaleLinear;
    range(): number[];
    range(r: number[]): ScaleLinear;
    clamp(): boolean;
    clamp(c: boolean): ScaleLinear;
    ticks(count?: number): number[];
    tickFormat(count?: number, specifier?: string): (v: number) => string;
    nice(count?: number): ScaleLinear;
    copy(): ScaleLinear;
}
export declare function scaleLinear(domain?: Numeric[], range?: number[]): ScaleLinear;
export declare function scaleLog(domain?: Numeric[], range?: number[]): ScaleLinear;
export declare function scalePow(exponent?: number, domain?: Numeric[], range?: number[]): ScaleLinear;
export declare function scaleSqrt(domain?: Numeric[], range?: number[]): ScaleLinear;
/** d3.scaleRadial: linear in AREA (radius ∝ sqrt) — bar length on a radial
 *  chart reads truthfully. */
export declare function scaleRadial(domain?: Numeric[], range?: number[]): ScaleLinear;
/** scaleUtc/scaleTime: linear over epoch ms; ticks snap to natural time
 *  boundaries (s/min/h/day/week/month/year) like d3's tickInterval table. */
export interface ScaleTime extends Omit<ScaleLinear, "ticks" | "invert" | "domain" | "copy"> {
    (value: Date | number): number;
    invert(pixel: number): Date;
    domain(): Date[];
    domain(d: Array<Date | number>): ScaleTime;
    ticks(count?: number): Date[];
    copy(): ScaleTime;
}
export declare function scaleUtc(domain?: Array<Date | number>, range?: number[]): ScaleTime;
export declare const scaleTime: typeof scaleUtc;
export interface ScaleBand {
    (value: any): number;
    domain(): any[];
    domain(d: Iterable<any>): ScaleBand;
    range(): [number, number];
    range(r: [number, number]): ScaleBand;
    bandwidth(): number;
    step(): number;
    padding(): number;
    padding(p: number): ScaleBand;
    paddingInner(): number;
    paddingInner(p: number): ScaleBand;
    paddingOuter(): number;
    paddingOuter(p: number): ScaleBand;
    align(): number;
    align(a: number): ScaleBand;
    round(): boolean;
    round(r: boolean): ScaleBand;
    copy(): ScaleBand;
}
export declare function scaleBand(domain?: Iterable<any>, range?: [number, number]): ScaleBand;
/** scalePoint = scaleBand with zero bandwidth (points at band centers). */
export declare function scalePoint(domain?: Iterable<any>, range?: [number, number]): ScaleBand;
export interface ScaleOrdinal<R = any> {
    (value: any): R;
    domain(): any[];
    domain(d: Iterable<any>): ScaleOrdinal<R>;
    range(): R[];
    range(r: Iterable<R>): ScaleOrdinal<R>;
}
export declare function scaleOrdinal<R = any>(domain?: Iterable<any>, range?: Iterable<R>): ScaleOrdinal<R>;
export interface ScaleSequential<R = any> {
    (value: number): R;
    domain(): [number, number];
    domain(d: [number, number]): ScaleSequential<R>;
    interpolator(): (t: number) => R;
    interpolator(fn: (t: number) => R): ScaleSequential<R>;
    ticks(count?: number): number[];
}
export declare function scaleSequential<R = any>(domainOrInterp?: [number, number] | ((t: number) => R), maybeInterp?: (t: number) => R): ScaleSequential<R>;
/** scaleDiverging: piecewise around a center pivot. */
export declare function scaleDiverging<R = any>(domain: [number, number, number], interpolator: (t: number) => R): ScaleSequential<R>;
export interface ScaleQuantize<R = any> {
    (value: number): R;
    domain(): [number, number];
    domain(d: [number, number]): ScaleQuantize<R>;
    range(): R[];
    range(r: Iterable<R>): ScaleQuantize<R>;
    invertExtent(v: R): [number, number];
    ticks(count?: number): number[];
}
export declare function scaleQuantize<R = any>(domain?: [number, number], range?: Iterable<R>): ScaleQuantize<R>;
export interface ScaleThreshold<R = any> {
    (value: number): R;
    domain(): number[];
    domain(d: number[]): ScaleThreshold<R>;
    range(): R[];
    range(r: Iterable<R>): ScaleThreshold<R>;
    invertExtent(v: R): [number | undefined, number | undefined];
}
/** d3.scaleThreshold: arbitrary (non-equal-width) cut points. `domain` is n-1
 *  ascending cutpoints; `range` is n values. value < domain[0] -> range[0],
 *  domain[i-1] <= value < domain[i] -> range[i], value >= domain[n-2] -> range[n-1]. */
export declare function scaleThreshold<R = any>(domain?: number[], range?: Iterable<R>): ScaleThreshold<R>;
export interface VisualMapContinuousConfig {
    /** Data domain, e.g. [min, max] of the mapped dimension. */
    domain: [number, number];
    inRange?: {
        /** Output range for a size encoding (e.g. bubble radius), linear. */
        symbolSize?: [number, number];
        /** Output color range: either a fixed [color0, color1] pair (RGB lerp)
         *  or a direct interpolator(t) function (e.g. an interpolate* from
         *  color_schemes.ts). */
        color?: [ColorLike, ColorLike] | ((t: number) => ColorLike);
        /** Output lightness range applied to a single base color (ECharts'
         *  colorLightness) — [l0, l1], each in [0,1]. Approximated via HSV's
         *  value channel (Color has no HSL support) — visually close for the
         *  "lighten toward white as value drops" look ECharts examples use. */
        colorLightness?: {
            base: ColorLike;
            range: [number, number];
        };
    };
    /** Fallback size/color for values outside `domain` (ECharts' outOfRange).
     *  When omitted, values clamp to the nearest in-range output instead. */
    outOfRange?: {
        symbolSize?: number;
        color?: ColorLike;
    };
    /** Clamp values into [domain[0], domain[1]] before mapping (default true). */
    clamp?: boolean;
}
export interface VisualMapContinuous {
    size(value: number): number | undefined;
    color(value: number): ColorLike | undefined;
    /** A ColorBar-ready domain + interpolator pair for a matching legend swatch. */
    domain: [number, number];
    interpolator: (t: number) => ColorLike;
}
/** Bundles a value's domain + size/color output ranges into one mapper,
 *  mirroring ECharts' `visualMap: {type: 'continuous', ...}`. The returned
 *  `size`/`color` functions are pure and honor `outOfRange`. */
export declare function visualMapContinuous(config: VisualMapContinuousConfig): VisualMapContinuous;
export { ticks, tickStep, tickIncrement, niceExtent };
//# sourceMappingURL=scales.d.ts.map