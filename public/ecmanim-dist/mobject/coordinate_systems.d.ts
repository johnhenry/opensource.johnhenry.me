import { VMobject, VGroup } from "./VMobject.ts";
import { Line, Arrow, Polygon } from "./geometry.ts";
import type { _ScaleBase } from "./graphing_scale.ts";
import type { Vec3, ColorLike } from "../core/types.ts";
/** Config for NumberLine. */
export interface NumberLineConfig {
    xRange?: number[];
    range?: number[];
    length?: number;
    color?: ColorLike;
    tickSize?: number;
    includeNumbers?: boolean;
    /** Show numbers ONLY at these values (implies includeNumbers). */
    numbersToInclude?: number[];
    /** Draw these values' ticks twice as long (manim parity). */
    numbersWithElongatedTicks?: number[];
    includeTip?: boolean;
    fontSize?: number;
    scaling?: _ScaleBase;
    [key: string]: any;
}
/** Config for Axes. */
export interface AxesConfig {
    xRange?: number[];
    yRange?: number[];
    xLength?: number;
    yLength?: number;
    color?: ColorLike;
    axisConfig?: NumberLineConfig;
    xAxisConfig?: NumberLineConfig;
    yAxisConfig?: NumberLineConfig;
    [key: string]: any;
}
/** Config for plot / graph helpers. */
export interface PlotConfig {
    xRange?: number[];
    color?: ColorLike;
    [key: string]: any;
}
/** Config for NumberPlane. */
export interface NumberPlaneConfig extends AxesConfig {
    backgroundLineStyle?: {
        color?: ColorLike;
        /** manim spelling (stroke_color); same as `color`. */
        strokeColor?: ColorLike;
        strokeWidth?: number;
        strokeOpacity?: number;
        [key: string]: any;
    };
}
export declare class NumberLine extends VGroup {
    xMin: number;
    xMax: number;
    xStep: number;
    length: number;
    tickSize: number;
    includeNumbers: boolean;
    includeTip: boolean;
    fontSize: number;
    /** manim parity: show numbers ONLY at these values (implies numbers on). */
    numbersToInclude: number[] | null;
    /** manim parity: draw these values' ticks 2x long. */
    numbersWithElongatedTicks: number[] | null;
    unit: number;
    _leftX: number;
    scaling: _ScaleBase;
    /** Position-space (post-scaling) range endpoints used for the affine map. */
    _sMin: number;
    _sMax: number;
    axisLine: Line | Arrow;
    ticks: VGroup;
    numbers: VGroup;
    constructor(config?: NumberLineConfig);
    _build(): void;
    _addNumbers(): void;
    _formatNumber(x: number): string;
    getTickRange(): number[];
    numberToPoint(x: number): Vec3;
    n2p(x: number): Vec3;
    pointToNumber(p: number[]): number;
    p2n(p: number[]): number;
    getUnitSize(): number;
}
export declare class Axes extends VGroup {
    xRange: number[];
    yRange: number[];
    xLength: number;
    yLength: number;
    xAxis: NumberLine;
    yAxis: NumberLine;
    constructor(config?: AxesConfig);
    /** Build y-axis number labels in WORLD space via coordsToPoint (correct
     *  regardless of the y-axis's post-construction rotation) -- shared by the
     *  constructor (when yAxisConfig.includeNumbers is set) and
     *  addCoordinates(). */
    private _buildYNumbers;
    _xRef(): number;
    _yRef(): number;
    coordsToPoint(x: number, y: number): Vec3;
    c2p(x: number, y: number): Vec3;
    _xWorld(x: number): number;
    _yWorld(y: number): number;
    pointToCoords(p: number[]): number[];
    p2c(p: number[]): number[];
    plot(fn: (x: number) => number, config?: PlotConfig): VMobject;
    getGraph(fn: (x: number) => number, config?: PlotConfig): VMobject;
    plotLine([x1, y1]: number[], [x2, y2]: number[], config?: PlotConfig): Line;
    getVerticalLine(xOrPoint: number | number[], graphOrY?: number | ((x: number) => number) | any, config?: PlotConfig): Line;
    getAxes(): VGroup;
    getXAxis(): NumberLine;
    getYAxis(): NumberLine;
    getOrigin(): Vec3;
    getXUnitSize(): number;
    getYUnitSize(): number;
    polarToPoint(radius: number, azimuth: number): Vec3;
    pr2pt(radius: number, azimuth: number): Vec3;
    pointToPolar(point: number[]): [number, number];
    pt2pr(point: number[]): [number, number];
    /** Resolve the underlying y=f(x) for a graph mobject (or a bare function). */
    _funcOf(graph: any): (x: number) => number;
    inputToGraphCoords(x: number, graph: any): [number, number];
    i2gc(x: number, graph: any): [number, number];
    inputToGraphPoint(x: number, graph: any): Vec3;
    i2gp(x: number, graph: any): Vec3;
    slopeOfTangent(x: number, graph: any, dx?: number): number;
    angleOfTangent(x: number, graph: any, dx?: number): number;
    private _mkLabel;
    getGraphLabel(graph: any, label: any, opts?: {
        x?: number;
        xVal?: number;
        direction?: number[];
        buff?: number;
        color?: ColorLike;
        dotColor?: ColorLike;
    }): VMobject;
    getAxisLabels(xLabel?: any, yLabel?: any): VGroup;
    getXAxisLabel(label: any, opts?: {
        direction?: number[];
        buff?: number;
    }): VMobject;
    getYAxisLabel(label: any, opts?: {
        direction?: number[];
        buff?: number;
    }): VMobject;
    /** Attach number labels to the axes (via each NumberLine's numbers). */
    addCoordinates(...args: any[]): this;
    getArea(graph: any, opts?: {
        xRange?: number[];
        color?: ColorLike | ColorLike[];
        opacity?: number;
        boundedGraph?: any;
    }): Polygon;
    getRiemannRectangles(graph: any, opts?: {
        xRange?: number[];
        dx?: number;
        inputSampleType?: "left" | "right" | "center";
        stroke?: number;
        strokeWidth?: number;
        fillOpacity?: number;
        color?: ColorLike | ColorLike[];
        showSignedArea?: boolean;
    }): VGroup;
    getSecantSlopeGroup(x: number, graph: any, opts?: {
        dx?: number;
        secantLineLength?: number;
        secantLineColor?: ColorLike;
        dxLineColor?: ColorLike;
        dfLineColor?: ColorLike;
        dxLabel?: any;
        dfLabel?: any;
    }): VGroup;
    getVerticalLinesToGraph(graph: any, opts?: {
        xRange?: number[];
        numLines?: number;
        color?: ColorLike;
    }): VGroup;
    getHorizontalLine(point: number[], opts?: {
        color?: ColorLike;
    }): Line;
    getVerticalLineToPoint(point: number[], opts?: {
        color?: ColorLike;
    }): Line;
    getLinesToPoint(point: number[], opts?: {
        color?: ColorLike;
    }): VGroup;
    getTLabel(x: number, graph: any, label: any): VMobject;
    plotParametricCurve(fn: (t: number) => number[], opts?: {
        tRange?: number[];
        color?: ColorLike;
    }): VMobject;
    plotPolarGraph(rFn: (theta: number) => number, opts?: {
        thetaRange?: number[];
        color?: ColorLike;
    }): VMobject;
    plotImplicitCurve(fn: (x: number, y: number) => number, opts?: {
        color?: ColorLike;
        n?: number;
    }): VGroup;
    plotLineGraph(xValues: number[], yValues: number[], opts?: {
        addVertexDots?: boolean;
        vertexDotStyle?: {
            color?: ColorLike;
            radius?: number;
        };
        lineColor?: ColorLike;
        /** Catmull-Rom smoothing through the data points (ECharts `smooth:
         *  true`) instead of straight corner-to-corner segments. */
        smooth?: boolean;
    }): VGroup;
}
export declare class NumberPlane extends Axes {
    bgColor: ColorLike;
    bgStrokeWidth: number;
    bgStrokeOpacity: number;
    backgroundLines: VGroup;
    constructor(config?: NumberPlaneConfig);
    _buildGrid(): void;
    _faintLine(start: number[], end: number[]): Line;
}
/** Config for PolarPlane. */
export interface PolarPlaneConfig {
    size?: number;
    radiusMax?: number;
    radius_max?: number;
    radiusStep?: number;
    azimuthUnits?: "PI radians" | "TAU radians" | "degrees" | "gradians" | null;
    azimuth_units?: "PI radians" | "TAU radians" | "degrees" | "gradians" | null;
    azimuthStep?: number;
    azimuth_step?: number;
    color?: ColorLike;
    faintColor?: ColorLike;
    includeAzimuthLabels?: boolean;
    fontSize?: number;
    [key: string]: any;
}
/**
 * A polar coordinate grid: concentric circles at each radius step and radial
 * spokes at each azimuth step, plus optional azimuth labels. `c2p` interprets
 * (radius, azimuth) pairs.
 */
export declare class PolarPlane extends VGroup {
    size: number;
    radiusMax: number;
    radiusStep: number;
    azimuthUnits: string | null;
    azimuthStep: number;
    lineColor: ColorLike;
    faintColor: ColorLike;
    fontSize: number;
    circles: VGroup;
    radialLines: VGroup;
    azimuthLabels: VGroup;
    constructor(config?: PolarPlaneConfig);
    _unit: number;
    /** (radius, azimuth) -> world point. */
    polarToPoint(radius: number, azimuth: number): Vec3;
    pr2pt(radius: number, azimuth: number): Vec3;
    coordsToPoint(radius: number, azimuth: number): Vec3;
    c2p(radius: number, azimuth: number): Vec3;
    pointToPolar(point: number[]): [number, number];
    pt2pr(point: number[]): [number, number];
    _build(includeLabels: boolean): void;
    _azimuthLabel(theta: number, n: number, i: number): string;
}
/** Config for ComplexPlane (same shape as NumberPlane). */
export type ComplexNumber = {
    re: number;
    im: number;
} | [number, number];
/**
 * A NumberPlane whose points are complex numbers. `numberToPoint` maps a
 * complex value to a world point; `pointToNumber` recovers it.
 */
export declare class ComplexPlane extends NumberPlane {
    constructor(config?: NumberPlaneConfig);
    private _reIm;
    numberToPoint(z: ComplexNumber): Vec3;
    n2p(z: ComplexNumber): Vec3;
    pointToNumber(point: number[]): {
        re: number;
        im: number;
    };
    p2n(point: number[]): {
        re: number;
        im: number;
    };
    /** Add real-axis numbers and imaginary-axis (i-suffixed) labels. */
    addCoordinates(): this;
}
/** A NumberLine over [0, 1] with 0.1 ticks — manim's UnitInterval preset. */
export declare class UnitInterval extends NumberLine {
    constructor(config?: NumberLineConfig);
}
//# sourceMappingURL=coordinate_systems.d.ts.map