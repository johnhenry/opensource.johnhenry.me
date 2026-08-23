import { Scene } from "./Scene.ts";
import type { SceneConfig } from "./Scene.ts";
import { NumberPlane, Axes } from "../mobject/coordinate_systems.ts";
import { Vector } from "../mobject/vectors.ts";
import { Arrow } from "../mobject/geometry.ts";
import { VGroup } from "../mobject/VMobject.ts";
import type { Mobject } from "../mobject/Mobject.ts";
import { MathTex } from "../mobject/mathtex.ts";
/** A vector as [x, y] or [x, y, z] world point. */
type VecArg = number[];
export declare class VectorScene extends Scene {
    plane?: NumberPlane;
    axes?: Axes;
    constructor(config?: SceneConfig);
    /** Add and return a faint NumberPlane covering the frame. */
    addPlane(config?: {
        [key: string]: any;
    }): NumberPlane;
    /** Add and return a pair of Axes. */
    addAxes(config?: {
        [key: string]: any;
    }): Axes;
    /**
     * Add an Arrow (Vector) from the origin to `vector`. Accepts a coordinate
     * array or an existing Arrow (returned as-is after being added).
     */
    addVector(vector: VecArg | Arrow, config?: {
        color?: any;
        [key: string]: any;
    }): Arrow;
    /** Construct (without adding) a Vector arrow from the origin. */
    getVector(coords: VecArg, config?: {
        [key: string]: any;
    }): Vector;
    /** The [x, y] end coordinates of a vector arrow. */
    vectorToCoords(vector: Arrow): number[];
    /** A MathTex column-vector label for the given components. */
    getVectorLabel(coords: VecArg, config?: {
        [key: string]: any;
    }): MathTex;
    /** Add a vector plus a component label next to its tip. */
    writeVector(coords: VecArg, config?: {
        color?: any;
        [key: string]: any;
    }): Arrow;
}
export interface LinearTransformationSceneConfig extends SceneConfig {
    includeBackgroundPlane?: boolean;
    includeForegroundPlane?: boolean;
    showBasisVectors?: boolean;
    iHatColor?: any;
    jHatColor?: any;
    backgroundPlaneConfig?: {
        [key: string]: any;
    };
    foregroundPlaneConfig?: {
        [key: string]: any;
    };
    [key: string]: any;
}
export declare class LinearTransformationScene extends VectorScene {
    showBasisVectors: boolean;
    iHatColor: any;
    jHatColor: any;
    backgroundPlane: NumberPlane;
    basisVectors: VGroup;
    iHat: Vector;
    jHat: Vector;
    transformableMobjects: Mobject[];
    constructor(config?: LinearTransformationSceneConfig);
    setupScene(config: LinearTransformationSceneConfig): void;
    /** Register a mobject so it follows subsequent matrix transformations. */
    addTransformableMobject(...mobs: Mobject[]): this;
    addVector(vector: number[] | Arrow, config?: {
        color?: any;
        [key: string]: any;
    }): Arrow;
    /** A point-wise function that applies the 2x2 (or 3x3) matrix about origin. */
    getMatrixTransformation(matrix: number[][]): (p: number[]) => number[];
    private buildMatrixAnimations;
    /**
     * Animate applying a 2x2 (or larger) matrix to the tracked plane, basis
     * vectors, and vectors. Returns the array of animations it played, so callers
     * can inspect/await. `addedAnims` are played alongside.
     */
    applyMatrix(matrix: number[][], { addedAnims, ...config }?: {
        addedAnims?: any[];
        [key: string]: any;
    }): Promise<any[]>;
    /**
     * Like applyMatrix but interprets the matrix rows as where the basis vectors
     * land (i.e. applies the transpose), matching manim's applyTransposedMatrix.
     */
    applyTransposedMatrix(transposedMatrix: number[][], options?: {
        addedAnims?: any[];
        [key: string]: any;
    }): Promise<any[]>;
}
export {};
//# sourceMappingURL=vector_space_scene.d.ts.map