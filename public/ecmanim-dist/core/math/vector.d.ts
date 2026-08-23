import type { Vec3 } from "../types.ts";
export declare function _setWasmEarclip(fn: (points: number[][]) => number[], ready: () => boolean): void;
export declare const vec: (x?: number, y?: number, z?: number) => Vec3;
export declare const add: (a: number[], b: number[]) => Vec3;
export declare const sub: (a: number[], b: number[]) => Vec3;
export declare const scale: (a: number[], s: number) => Vec3;
export declare const mul: (a: number[], b: number[]) => Vec3;
export declare const neg: (a: number[]) => Vec3;
export declare const dot: (a: number[], b: number[]) => number;
export declare const cross: (a: number[], b: number[]) => Vec3;
export declare const length: (a: number[]) => number;
export declare const distance: (a: number[], b: number[]) => number;
export declare const normalize: (a: number[]) => Vec3;
export declare function lerp(a: number, b: number, t: number): number;
export declare function lerp(a: number[], b: number[], t: number): Vec3;
export declare const midpoint: (a: number[], b: number[]) => Vec3;
export declare const clone: (a: number[]) => Vec3;
export declare const equals: (a: number[], b: number[], eps?: number) => boolean;
export declare const angleOf: (a: number[]) => number;
export declare function rotateVector(a: number[], angle: number, axis?: number[]): Vec3;
export declare const ORIGIN: number[];
export declare const UP: number[];
export declare const DOWN: number[];
export declare const RIGHT: number[];
export declare const LEFT: number[];
export declare const OUT: number[];
export declare const IN: number[];
export declare const UL: number[];
export declare const UR: number[];
export declare const DL: number[];
export declare const DR: number[];
export declare const PI: number;
export declare const TAU: number;
export declare const DEGREES: number;
/** Multiply a 3x3 matrix by a 3-vector: M @ p. */
export declare function matrixVectorProduct(matrix: number[][], point: number[]): Vec3;
/** Alias of matrixVectorProduct. */
export declare const applyMatrix: typeof matrixVectorProduct;
/** Transpose a square matrix. */
export declare function transpose(m: number[][]): number[][];
/**
 * Rotation matrix in R^3 about a given axis (Rodrigues). Returns 3x3.
 * Matches manim's rotation_matrix(angle, axis).
 */
export declare function rotationMatrix(angle: number, axis?: number[]): number[][];
/** Rotation matrix about the z-axis. */
export declare function rotationAboutZ(angle: number): number[][];
/** Transpose of the rotation matrix (manim's rotation_matrix_transpose). */
export declare function rotationMatrixTranspose(angle: number, axis?: number[]): number[][];
/** Rotation matrix in SO(3) taking the z-axis to the given (normalized) vector. */
export declare function zToVector(vector: number[]): number[][];
/** Angle between two vectors, always in [0, PI]. */
export declare function angleBetweenVectors(v1: number[], v2: number[]): number;
/** Unit normal of two vectors (manim's get_unit_normal). */
export declare function getUnitNormal(v1: number[], v2: number[], tol?: number): Vec3;
/** 2D cross product (z-component): a.x*b.y - a.y*b.x. */
export declare function cross2d(a: number[], b: number[]): number;
/** Center of mass (average) of a list of points. */
export declare function centerOfMass(points: number[][]): Vec3;
/** Convert a complex number (as {re,im} or [re,im]) to an R^3 point. */
export declare function complexToR3(z: {
    re: number;
    im: number;
} | number[]): Vec3;
/** Convert an R^3 point to a complex number {re, im}. */
export declare function R3ToComplex(p: number[]): {
    re: number;
    im: number;
};
/**
 * Intersection of two lines, each defined by a pair of distinct 2D/3D points
 * (in the xy-plane). Throws if parallel. Uses homogeneous cross products.
 */
export declare function lineIntersection(line1: number[][], line2: number[][]): Vec3;
/**
 * Intersection of the line through p0 in direction v0 with the line through p1
 * in direction v1 (single-point form of manim's find_intersection).
 */
export declare function findIntersection(p0: number[], v0: number[], p1: number[], v1: number[], threshold?: number): Vec3;
/** Number of times a polygon winds around the origin. */
export declare function getWindingNumber(points: number[][]): number;
/** 2D shoelace formula (signed, via trapezoid integration of y over x). */
export declare function shoelace(points: number[][]): number;
/** "CW" if shoelace area > 0, otherwise "CCW". */
export declare function shoelaceDirection(points: number[][]): "CW" | "CCW";
/**
 * Ear-clipping triangulation of a simple polygon (optionally with holes given
 * by ringEnds). Returns a flat list of vertex-index triples.
 */
export declare function earclipTriangulation(points: number[][], ringEnds?: number[]): number[];
/** n directions equally spaced around the circle, starting from startVect. */
export declare function compassDirections(n?: number, startVect?: number[]): Vec3[];
/** Regularly spaced vertices around a circle at origin. Returns [vertices, startAngle]. */
export declare function regularVertices(n: number, radius?: number, startAngle?: number): [Vec3[], number];
/** Cartesian point to spherical [r, theta, phi] (manim convention). */
export declare function cartesianToSpherical(vec: number[]): Vec3;
/** Spherical [r, theta, phi] to Cartesian point. */
export declare function sphericalToCartesian(spherical: number[]): Vec3;
/** Hamilton product of one or more quaternions [w,x,y,z]. */
export declare function quaternionMult(...quats: number[][]): number[];
/** Quaternion [w,x,y,z] from an angle and axis. */
export declare function quaternionFromAngleAxis(angle: number, axis: number[], axisNormalized?: boolean): number[];
/** Recover [angle, axis] from a quaternion [w,x,y,z]. */
export declare function angleAxisFromQuaternion(q: number[]): [number, Vec3];
/** Conjugate of a quaternion [w,x,y,z]. */
export declare function quaternionConjugate(q: number[]): number[];
/** Rotate a vector by an angle-axis expressed via quaternions. */
export declare function rotateVectorQuaternion(vector: number[], angle: number, axis?: number[]): Vec3;
//# sourceMappingURL=vector.d.ts.map