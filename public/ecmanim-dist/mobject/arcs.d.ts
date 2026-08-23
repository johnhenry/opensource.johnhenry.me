import { VMobject } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
import { Arc, Line, Dot } from "./geometry.ts";
import type { LineConfig } from "./geometry.ts";
import { ArrowTip } from "./tips.ts";
import { Text } from "./text/Text.ts";
export interface ArcBetweenPointsConfig extends VMobjectConfig {
    angle?: number;
    radius?: number;
}
export declare class ArcBetweenPoints extends Arc {
    constructor(start?: number[], end?: number[], angle?: number, radius?: number, config?: ArcBetweenPointsConfig);
    getStart(): number[];
    getEnd(): number[];
    getArcCenter(): number[];
    private putStartAndEndOnArc;
}
export interface CurvedArrowConfig extends ArcBetweenPointsConfig {
    tipShape?: typeof ArrowTip;
    tipLength?: number;
}
export declare class CurvedArrow extends ArcBetweenPoints {
    tip: ArrowTip;
    constructor(start: number[], end: number[], config?: CurvedArrowConfig);
}
export declare class CurvedDoubleArrow extends ArcBetweenPoints {
    tip: ArrowTip;
    startTip: ArrowTip;
    constructor(start: number[], end: number[], config?: CurvedArrowConfig);
}
export interface AnnularSectorConfig extends VMobjectConfig {
    innerRadius?: number;
    outerRadius?: number;
    angle?: number;
    startAngle?: number;
    arcCenter?: number[];
}
export declare class AnnularSector extends VMobject {
    innerRadius: number;
    outerRadius: number;
    angle: number;
    startAngle: number;
    arcCenter: number[];
    constructor(config?: AnnularSectorConfig);
}
export interface SectorConfig extends AnnularSectorConfig {
    radius?: number;
}
export declare class Sector extends AnnularSector {
    constructor(config?: SectorConfig);
}
export interface ElbowConfig extends VMobjectConfig {
    width?: number;
    angle?: number;
}
export declare class Elbow extends VMobject {
    width: number;
    angle: number;
    constructor(config?: ElbowConfig);
}
export interface AngleConfig extends VMobjectConfig {
    radius?: number;
    quadrant?: [number, number];
    otherAngle?: boolean;
    dot?: boolean;
    dotRadius?: number;
    dotDistance?: number;
    elbow?: boolean;
}
export declare class Angle extends VMobject {
    radius: number;
    dot?: Dot;
    constructor(line1: Line, line2: Line, config?: AngleConfig);
    getLines(): [Line, Line];
}
export interface RightAngleConfig extends VMobjectConfig {
    length?: number;
}
export declare class RightAngle extends Angle {
    constructor(line1: Line, line2: Line, config?: RightAngleConfig);
}
export interface TangentLineConfig extends LineConfig {
    length?: number;
    dAlpha?: number;
}
export declare class TangentLine extends Line {
    constructor(vmob: VMobject, alpha: number, config?: TangentLineConfig);
}
export interface AnnotationDotConfig extends VMobjectConfig {
    radius?: number;
    point?: number[];
}
export declare class AnnotationDot extends Dot {
    constructor(config?: AnnotationDotConfig);
}
export interface LabeledDotConfig extends VMobjectConfig {
    radius?: number;
    buff?: number;
    point?: number[];
}
export declare class LabeledDot extends Dot {
    label: Text;
    constructor(label: string | Text, config?: LabeledDotConfig);
}
//# sourceMappingURL=arcs.d.ts.map