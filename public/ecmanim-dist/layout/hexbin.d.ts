export interface HexbinOptions<T> {
    /** Point accessors (defaults treat T as [x, y]). */
    x?: (d: T, i: number) => number;
    y?: (d: T, i: number) => number;
    /** Hexagon radius: center to corner. */
    radius: number;
    /** [[x0, y0], [x1, y1]] — only used by centers() (default [[0,0],[1,1]]). */
    extent?: [[number, number], [number, number]];
}
export interface HexBin<T> {
    /** Hexagon center. */
    x: number;
    y: number;
    /** The binned input points. */
    points: T[];
    /** Number of points in the bin (=== points.length). */
    length: number;
}
export interface Hexbin<T> {
    /** Bin points into hexagons; empty bins are not returned. Points whose
     *  accessors yield NaN are skipped. */
    bin(points: Iterable<T>): Array<HexBin<T>>;
    /** All lattice centers covering the configured extent. */
    centers(): Array<[number, number]>;
    readonly radius: number;
    /** Horizontal center pitch: 2·radius·sin(π/3). */
    readonly dx: number;
    /** Vertical center pitch: 1.5·radius. */
    readonly dy: number;
}
/** Six corners of a pointy-top hexagon of the given radius, centered on the
 *  origin, starting at the top corner (0, -radius) — d3-hexbin's corner
 *  order (see module header re: absolute vs relative). */
export declare function hexagonPoints(radius: number): Array<[number, number]>;
/** Create a hexagonal binner (see module header for conventions). */
export declare function hexbin<T = [number, number]>(options: HexbinOptions<T>): Hexbin<T>;
//# sourceMappingURL=hexbin.d.ts.map