import { VMobject } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
import { Polygon } from "./geometry.ts";
/**
 * A generalized polygon: one or more closed loops of vertices, each a subpath.
 * `Polygram([...loop1], [...loop2], ...)`.
 */
export declare class Polygram extends VMobject {
    vertexGroups: number[][][];
    constructor(vertexGroups?: number[][][], config?: VMobjectConfig, ...rest: any[]);
    protected _buildFromGroups(groups: number[][][]): this;
    /** The list of closed loops (each without the duplicated closing anchor). */
    getVertexGroups(): number[][][];
    /** All vertices flattened across every loop. */
    getVertices(): number[][];
    /**
     * Round the corners of every loop with the given radius, replacing sharp
     * corners with short arcs (approximated by straight bevels — sufficient for
     * bounds/geometry parity without a true arc join).
     */
    roundCorners(radius?: number): this;
}
export interface RegularPolygramConfig extends VMobjectConfig {
    density?: number;
    radius?: number;
    startAngle?: number;
}
/**
 * A regular star polygram {n/density}: connect every `density`-th of `n`
 * regularly-spaced vertices. density=1 gives a convex polygon; density>=2 a star.
 */
export declare class RegularPolygram extends Polygram {
    numVertices: number;
    density: number;
    radius: number;
    constructor(numVertices?: number, config?: RegularPolygramConfig);
    static _gcd(a: number, b: number): number;
}
export interface StarConfig extends RegularPolygramConfig {
    outerRadius?: number;
    innerRadius?: number;
}
/**
 * An n-pointed star: alternating outer and inner vertices. When `innerRadius`
 * is not given it is derived from `density` (as in manim).
 */
export declare class Star extends Polygram {
    constructor(n?: number, config?: StarConfig);
}
export interface RoundedRectangleConfig extends VMobjectConfig {
    width?: number;
    height?: number;
    cornerRadius?: number;
}
/** A rectangle with rounded corners (approximated with beveled corners). */
export declare class RoundedRectangle extends Polygram {
    width: number;
    height: number;
    cornerRadius: number;
    constructor(config?: RoundedRectangleConfig);
}
/**
 * A VMobject whose fill is `mainShape` with `subtractedShapes` punched out as
 * holes. Uses reversed-winding subpaths + even-odd fill (no true boolean op).
 */
export declare class Cutout extends VMobject {
    constructor(mainShape: VMobject, ...subtractedShapes: VMobject[]);
}
export interface ConvexHullConfig extends VMobjectConfig {
    tolerance?: number;
}
/** The 2D convex hull of the given points, as a closed Polygon. */
export declare class ConvexHull extends Polygon {
    constructor(points: number[][], config?: ConvexHullConfig, ...rest: any[]);
    /** Andrew's monotone chain: returns the CCW hull vertices (no repeat). */
    static _monotoneChain(pts: number[][], tol?: number): number[][];
}
//# sourceMappingURL=polygram.d.ts.map