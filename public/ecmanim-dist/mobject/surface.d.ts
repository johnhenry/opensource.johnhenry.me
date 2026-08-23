import { VMobject, VGroup } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
import type { ColorLike, SurfaceFunc } from "../core/types.ts";
export declare class ThreeDVMobject extends VMobject {
    shadeIn3d: boolean;
    constructor(config?: VMobjectConfig);
}
export interface SurfaceConfig extends VMobjectConfig {
    uRange?: [number, number];
    vRange?: [number, number];
    resolution?: number | [number, number];
    checkerboardColors?: string[] | null;
    checkerboard?: string[] | null;
    colorFunc?: ((u: number, v: number, point: number[]) => ColorLike) | null;
    lightDirection?: number[];
    shade?: boolean;
    smooth?: boolean;
    point?: number[];
    radius?: number;
    majorRadius?: number;
    minorRadius?: number;
    baseRadius?: number;
    width?: number;
    height?: number;
    depth?: number;
    sideLength?: number;
}
export declare class Surface extends VGroup {
    func: SurfaceFunc;
    uRange: [number, number];
    vRange: [number, number];
    resolution: [number, number];
    checkerboard: string[] | null;
    baseFill: ColorLike;
    colorFunc: ((u: number, v: number, point: number[]) => ColorLike) | null;
    lightDirection: number[];
    shade: boolean;
    smooth: boolean;
    _faceConfig: VMobjectConfig;
    constructor(func: SurfaceFunc, config?: SurfaceConfig);
    _normalAt(u: number, v: number): number[];
    /**
     * Re-parameterize IN PLACE (3b1b sphere-unwrap style morphs): swap the
     * surface function (and optionally u/v ranges) and rebuild the face mesh,
     * preserving mobject identity so updaters can call this per frame:
     *
     * ```ts
     * surf.addUpdater(() => surf.setFunc((u, v) => unroll(u, v, tracker.value)));
     * ```
     * Faces are rebuilt from scratch each call (constructor-equivalent), so
     * shading/checkerboard reapply exactly as at construction.
     */
    setFunc(func: (u: number, v: number) => number[], ranges?: {
        uRange?: [number, number];
        vRange?: [number, number];
    }): this;
    _build(): void;
    applySmoothShading(lightDir?: number[]): this;
    applyShading(lightDir?: number[]): this;
    setFillOpacity(o: number): this;
    /** manim parity (set_style): restyle every face post-construction. */
    setStyle(style?: {
        fillOpacity?: number;
        fillColor?: any;
        strokeColor?: any;
        strokeWidth?: number;
        strokeOpacity?: number;
    }): this;
    /** manim parity (set_fill_by_checkerboard): recolor faces in a 2-color
     *  checker pattern AFTER construction, then re-shade. */
    setFillByCheckerboard(colorA: any, colorB: any, opts?: {
        opacity?: number;
    }): this;
    setFillByValue(opts?: {
        axes?: any;
        colorscale?: Array<ColorLike | [ColorLike, number]> | null;
        axis?: number;
    }): this;
}
export declare const ParametricSurface: typeof Surface;
export declare class Sphere extends Surface {
    radius: number;
    constructor(config?: SurfaceConfig);
}
export declare class Torus extends Surface {
    constructor(config?: SurfaceConfig);
}
export interface CylinderConfig extends SurfaceConfig {
    showEnds?: boolean;
    direction?: number[];
}
export declare class Cylinder extends Surface {
    radius: number;
    cylHeight: number;
    showEnds: boolean;
    axisDirection: number[];
    constructor(config?: CylinderConfig);
    addBases(): this;
    setDirection(direction: number[]): this;
    getCylinderDirection(): number[];
    get3dDirection(): number[];
    getDirection3d(): number[];
    getStart(): number[];
    getEnd(): number[];
}
export interface ConeConfig extends SurfaceConfig {
    showBase?: boolean;
    direction?: number[];
}
export declare class Cone extends Surface {
    baseR: number;
    coneHeight: number;
    showBase: boolean;
    axisDirection: number[];
    constructor(config?: ConeConfig);
    addBase(): this;
    setDirection(direction: number[]): this;
    get3dDirection(): number[];
    getConeDirection(): number[];
    getDirection3d(): number[];
    getStart(): number[];
    getEnd(): number[];
}
export interface Dot3DConfig extends SurfaceConfig {
    point?: number[];
    radius?: number;
    resolution?: number | [number, number];
}
export declare class Dot3D extends Sphere {
    constructor(config?: Dot3DConfig);
}
export interface Line3DConfig extends SurfaceConfig {
    thickness?: number;
    resolution?: number | [number, number];
}
export declare class Line3D extends Cylinder {
    lineStart: number[];
    lineEnd: number[];
    constructor(start?: number[], end?: number[], config?: Line3DConfig);
    getStart(): number[];
    getEnd(): number[];
    static parallelTo(line: Line3D, point?: number[], length?: number, config?: Line3DConfig): Line3D;
    static perpendicularTo(line: Line3D, point?: number[], length?: number, config?: Line3DConfig): Line3D;
}
export interface Arrow3DConfig extends SurfaceConfig {
    thickness?: number;
    height?: number;
    baseRadius?: number;
}
export declare class Arrow3D extends VGroup {
    arrowStart: number[];
    arrowEnd: number[];
    shaft: Line3D;
    tip: Cone;
    constructor(start?: number[], end?: number[], config?: Arrow3DConfig);
    getStart(): number[];
    getEnd(): number[];
}
export interface BoxConfig extends SurfaceConfig {
    dimensions?: [number, number, number];
}
export declare class Box extends VGroup {
    constructor(config?: BoxConfig);
}
export interface PrismConfig extends SurfaceConfig {
    dimensions?: [number, number, number];
}
export declare class Prism extends Box {
    dimensions: [number, number, number];
    constructor(config?: PrismConfig);
}
export declare class Cube extends Box {
    constructor(config?: SurfaceConfig);
}
//# sourceMappingURL=surface.d.ts.map