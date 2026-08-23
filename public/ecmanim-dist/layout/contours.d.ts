export type ContourRing = Array<[number, number]>;
/** One filled isoband: everything with value >= `value`. */
export interface ContourMultiPolygon {
    type: "MultiPolygon";
    value: number;
    /** polygons → [exterior, ...holes] → closed rings of [x, y]. */
    coordinates: ContourRing[][];
}
export interface ContoursOptions {
    /** Grid dimensions [width, height]; values.length must be >= width*height,
     *  indexed values[y * width + x]. */
    size: [number, number];
    /** Linear interpolation of crossing positions (default true). */
    smooth?: boolean;
}
export interface ContourGenerator {
    /** The isoband where values >= threshold, as a MultiPolygon of closed rings. */
    contour(values: ArrayLike<number>, threshold: number): ContourMultiPolygon;
    readonly size: [number, number];
    readonly smooth: boolean;
}
/**
 * Build a contour generator over a `size = [width, height]` grid. Feed it a
 * flat row-major `values` array (index `y * width + x`) and a threshold.
 */
export declare function contours(options: ContoursOptions): ContourGenerator;
/**
 * Threshold helper for `.contour()`: given a count, returns ~count nice tick
 * values over the finite extent of `values` (d3's `thresholds(count)`
 * behavior — the lowest tick may sit just below the minimum, forming the
 * base band; ticks at/above the maximum are dropped). Given an array, it
 * passes through as numbers.
 */
export declare function contourThresholds(values: ArrayLike<number>, count: number | ArrayLike<number>): number[];
//# sourceMappingURL=contours.d.ts.map