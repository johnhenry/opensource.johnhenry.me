import { VMobject } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
export interface ArcConfig extends VMobjectConfig {
    radius?: number;
    startAngle?: number;
    angle?: number;
    arcCenter?: number[];
    /** Alias for `arcCenter` (issue #37): every other point-like mobject
     *  (Dot, Text, ...) positions via a `point` config key, so Arc/Circle
     *  accepting-but-silently-discarding it was a recurring trap --
     *  MobjectConfig's index signature means TypeScript can't catch the
     *  mismatch either. `arcCenter` wins when both are given. */
    point?: number[];
}
export declare class Arc extends VMobject {
    radius: number;
    startAngle: number;
    angle: number;
    arcCenter: number[];
    constructor(config?: ArcConfig);
}
export declare class Circle extends Arc {
    constructor(config?: ArcConfig);
}
export interface DotConfig extends ArcConfig {
    point?: number[];
}
export declare class Dot extends Circle {
    constructor(config?: DotConfig);
}
export interface EllipseConfig extends VMobjectConfig {
    width?: number;
    height?: number;
}
export declare class Ellipse extends VMobject {
    constructor(config?: EllipseConfig);
}
export interface AnnulusConfig extends VMobjectConfig {
    outerRadius?: number;
    innerRadius?: number;
    arcCenter?: number[];
}
export declare class Annulus extends VMobject {
    constructor(config?: AnnulusConfig);
}
export interface LineConfig extends VMobjectConfig {
    start?: number[];
    end?: number[];
}
export declare class Line extends VMobject {
    start: number[];
    end: number[];
    constructor(start?: number[] | LineConfig, end?: number[], config?: LineConfig);
    getStart(): number[];
    getEnd(): number[];
    getLength(): number;
    getAngle(): number;
    /** manim parity (get_unit_vector): normalized direction start -> end. */
    getUnitVector(): number[];
    putStartAndEndOn(start: number[], end: number[]): this;
}
export interface DashedLineConfig extends LineConfig {
    numDashes?: number;
    dashedRatio?: number;
    dashRatio?: number;
}
export declare class DashedLine extends Line {
    numDashes: number;
    dashedRatio: number;
    _dashed: boolean;
    constructor(start: number[] | LineConfig, end: number[], config?: DashedLineConfig);
    _dashify(n: number, ratio: number): this;
    getStart(): number[];
    getEnd(): number[];
}
export interface ArrowConfig extends LineConfig {
    tipLength?: number;
    buff?: number;
    tipShape?: any;
    maxTipLengthToLengthRatio?: number;
    maxStrokeWidthToLengthRatio?: number;
}
export declare class Arrow extends Line {
    tipLength: number;
    buff: number;
    tipShape: any;
    maxTipLengthToLengthRatio: number;
    maxStrokeWidthToLengthRatio: number;
    _hasTip: boolean;
    tip: VMobject;
    _origStart: number[];
    _origEnd: number[];
    constructor(start?: number[] | LineConfig, end?: number[], config?: ArrowConfig);
    private _applyBuff;
    private _scaleForShortArrows;
    buildTip(): this;
}
export declare class Polygon extends VMobject {
    vertices: number[][];
    constructor(vertices?: number[][], config?: VMobjectConfig);
    getVertices(): number[][];
}
export interface RegularPolygonConfig extends VMobjectConfig {
    radius?: number;
    startAngle?: number;
}
export declare class RegularPolygon extends Polygon {
    constructor(n?: number, config?: RegularPolygonConfig);
}
export declare class Triangle extends RegularPolygon {
    constructor(config?: RegularPolygonConfig);
}
export interface RectangleConfig extends VMobjectConfig {
    width?: number;
    height?: number;
}
export declare class Rectangle extends Polygon {
    width: number;
    height: number;
    constructor(config?: RectangleConfig);
}
export interface SquareConfig extends RectangleConfig {
    sideLength?: number;
    side?: number;
}
export declare class Square extends Rectangle {
    sideLength: number;
    constructor(config?: SquareConfig);
}
//# sourceMappingURL=geometry.d.ts.map