// Scenes for reasoning about vectors and linear transformations. Mirrors
// ManimCommunity's manim/scene/vector_space_scene.py — VectorScene (a plane +
// helpers for adding/labeling vectors) and LinearTransformationScene (animates
// applying a matrix to a background NumberPlane, the basis vectors, and any
// tracked "transformable" mobjects).
import { Scene } from "./Scene.js";
import { NumberPlane, Axes } from "../mobject/coordinate_systems.js";
import { Vector } from "../mobject/vectors.js";
import { Arrow } from "../mobject/geometry.js";
import { VGroup } from "../mobject/VMobject.js";
import { ApplyMatrix } from "../animation/transform_extra.js";
import { MathTex } from "../mobject/mathtex.js";
import * as V from "../core/math/vector.js";
import { YELLOW, GREEN, RED } from "../core/color.js";
function toPoint(v) {
    return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
}
export class VectorScene extends Scene {
    plane;
    axes;
    constructor(config = {}) {
        super(config);
    }
    /** Add and return a faint NumberPlane covering the frame. */
    addPlane(config = {}) {
        const plane = new NumberPlane(config);
        this.plane = plane;
        this.add(plane);
        return plane;
    }
    /** Add and return a pair of Axes. */
    addAxes(config = {}) {
        const axes = new Axes(config);
        this.axes = axes;
        this.add(axes);
        return axes;
    }
    /**
     * Add an Arrow (Vector) from the origin to `vector`. Accepts a coordinate
     * array or an existing Arrow (returned as-is after being added).
     */
    addVector(vector, config = {}) {
        let arrow;
        if (vector instanceof Arrow) {
            arrow = vector;
        }
        else {
            arrow = new Vector(toPoint(vector), config);
            if (config.color)
                arrow.setColor(config.color);
        }
        this.add(arrow);
        return arrow;
    }
    /** Construct (without adding) a Vector arrow from the origin. */
    getVector(coords, config = {}) {
        return new Vector(toPoint(coords), config);
    }
    /** The [x, y] end coordinates of a vector arrow. */
    vectorToCoords(vector) {
        const end = vector.getEnd();
        return [end[0], end[1]];
    }
    /** A MathTex column-vector label for the given components. */
    getVectorLabel(coords, config = {}) {
        const x = Math.round((coords[0] ?? 0) * 100) / 100;
        const y = Math.round((coords[1] ?? 0) * 100) / 100;
        return new MathTex(`\\begin{bmatrix} ${x} \\\\ ${y} \\end{bmatrix}`, config);
    }
    /** Add a vector plus a component label next to its tip. */
    writeVector(coords, config = {}) {
        const arrow = this.addVector(coords, config);
        const label = this.getVectorLabel(coords, config);
        label.nextTo(arrow, V.RIGHT, 0.2);
        this.add(label);
        return arrow;
    }
}
export class LinearTransformationScene extends VectorScene {
    showBasisVectors;
    iHatColor;
    jHatColor;
    backgroundPlane;
    // The transformable foreground plane (matched to `plane` on VectorScene).
    basisVectors;
    iHat;
    jHat;
    // Every mobject that should follow the matrix transformation.
    transformableMobjects;
    constructor(config = {}) {
        super(config);
        this.showBasisVectors = config.showBasisVectors ?? true;
        this.iHatColor = config.iHatColor ?? GREEN;
        this.jHatColor = config.jHatColor ?? RED;
        this.transformableMobjects = [];
        this.basisVectors = new VGroup();
        this.setupScene(config);
    }
    setupScene(config) {
        const bgPlane = new NumberPlane(config.backgroundPlaneConfig ?? {});
        this.backgroundPlane = bgPlane;
        this.add(bgPlane);
        const plane = new NumberPlane(config.foregroundPlaneConfig ?? { color: YELLOW });
        this.plane = plane;
        this.addTransformableMobject(plane);
        this.add(plane);
        if (this.showBasisVectors) {
            this.iHat = new Vector([1, 0, 0], { color: this.iHatColor });
            this.jHat = new Vector([0, 1, 0], { color: this.jHatColor });
            this.basisVectors.add(this.iHat, this.jHat);
            this.addTransformableMobject(this.iHat);
            this.addTransformableMobject(this.jHat);
            this.add(this.iHat, this.jHat);
        }
    }
    /** Register a mobject so it follows subsequent matrix transformations. */
    addTransformableMobject(...mobs) {
        for (const m of mobs) {
            if (!this.transformableMobjects.includes(m))
                this.transformableMobjects.push(m);
        }
        return this;
    }
    // Register a vector both in the scene and as a tracked/transformable mobject.
    addVector(vector, config = {}) {
        const arrow = super.addVector(vector, config);
        this.addTransformableMobject(arrow);
        return arrow;
    }
    /** A point-wise function that applies the 2x2 (or 3x3) matrix about origin. */
    getMatrixTransformation(matrix) {
        return (p) => applyMatrixToPoint(matrix, p);
    }
    // Build an AnimationGroup that transforms every tracked mobject by `matrix`.
    buildMatrixAnimations(matrix, config) {
        return this.transformableMobjects.map((m) => new ApplyMatrix(matrix, m, config));
    }
    /**
     * Animate applying a 2x2 (or larger) matrix to the tracked plane, basis
     * vectors, and vectors. Returns the array of animations it played, so callers
     * can inspect/await. `addedAnims` are played alongside.
     */
    async applyMatrix(matrix, { addedAnims = [], ...config } = {}) {
        const anims = [...this.buildMatrixAnimations(matrix, config), ...addedAnims];
        await this.play(...anims);
        return anims;
    }
    /**
     * Like applyMatrix but interprets the matrix rows as where the basis vectors
     * land (i.e. applies the transpose), matching manim's applyTransposedMatrix.
     */
    async applyTransposedMatrix(transposedMatrix, options = {}) {
        return this.applyMatrix(transpose(transposedMatrix), options);
    }
}
// --- helpers ---------------------------------------------------------------
function applyMatrixToPoint(matrix, p) {
    const n = matrix.length;
    const out = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        let s = 0;
        const row = matrix[i];
        for (let j = 0; j < row.length; j++)
            s += row[j] * (p[j] ?? 0);
        out[i] = s;
    }
    return out;
}
function transpose(m) {
    const rows = m.length;
    const cols = m[0]?.length ?? 0;
    const out = [];
    for (let j = 0; j < cols; j++) {
        out[j] = [];
        for (let i = 0; i < rows; i++)
            out[j][i] = m[i][j];
    }
    return out;
}
//# sourceMappingURL=vector_space_scene.js.map