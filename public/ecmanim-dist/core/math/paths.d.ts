import type { Vec3 } from "../types.ts";
/** A path function: (startPoints, endPoints, alpha) -> interpolatedPoints. */
export type PathFunc = (start: number[][], end: number[][], alpha: number) => Vec3[];
/** Linear interpolation of each corresponding start/end point. */
export declare function straightPath(): PathFunc;
/** Move each point along a circular arc of `arcAngle` radians about `axis`. */
export declare function pathAlongArc(arcAngle: number, axis?: number[]): PathFunc;
/** Half-circle clockwise path. */
export declare function clockwisePath(): PathFunc;
/** Half-circle counterclockwise path. */
export declare function counterclockwisePath(): PathFunc;
/** Each point orbits its given circle center while moving to its destination. */
export declare function pathAlongCircles(arcAngle: number, circlesCenters: number[][], axis?: number[]): PathFunc;
/** Spiral path combining linear interpolation with rotation. */
export declare function spiralPath(angle: number, axis?: number[]): PathFunc;
//# sourceMappingURL=paths.d.ts.map