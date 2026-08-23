// Mesh3D: the GPU tier for imported meshes (Tier B of the mesh-import plan,
// see ~/.claude/plans/let-s-create-a-plan-cozy-wind.md). Unlike Polyhedron
// (Tier A -- one VMobject per face, transforms mutate real per-point data,
// fine for hundreds of faces), Mesh3D stores raw {vertexCoords, facesList}
// once and accumulates shift()/scale()/rotate() into a single 4x4 transform
// matrix instead of touching a (potentially huge) vertex array every call --
// this.points holds only a cheap 8-corner bounding-box proxy (kept in sync
// with the transform) so getBoundingBox()/getCenter() stay correct without
// walking the full mesh. ThreeRenderer (src/renderer/ThreeRenderer.ts)
// builds one real indexed THREE.BufferGeometry+Mesh from the raw data once,
// applying `transform` as the THREE.Mesh's own matrix -- CanvasRenderer has
// no CPU path for this tier (see its renderScene3D()'s explicit skip).
import { Mobject } from "./Mobject.js";
import * as V from "../core/math/vector.js";
import { Color } from "../core/color.js";
// --- minimal 4x4 affine matrix math (flat, row-major, length 16) -----------
// Hand-rolled rather than depending on THREE.Matrix4 here: Mesh3D's transform
// methods are synchronous (matching every other Mobject), while `three` is
// only ever loaded lazily/async elsewhere in this codebase (loaders,
// ThreeRenderer) -- keeping this dependency-free avoids needing an awaited
// three import before any shift()/scale()/rotate() call could run.
const IDENTITY4 = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function multiply4(a, b) {
    const out = new Array(16).fill(0);
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            let sum = 0;
            for (let k = 0; k < 4; k++)
                sum += a[r * 4 + k] * b[k * 4 + c];
            out[r * 4 + c] = sum;
        }
    }
    return out;
}
function translation4(v) {
    return [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2], 0, 0, 0, 1];
}
function scale4(s) {
    return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
}
function rotation4From3x3(r) {
    return [
        r[0][0], r[0][1], r[0][2], 0,
        r[1][0], r[1][1], r[1][2], 0,
        r[2][0], r[2][1], r[2][2], 0,
        0, 0, 0, 1,
    ];
}
/** Apply an affine op about a pivot point: T(point) * op * T(-point). */
function aboutPoint4(op, point) {
    return multiply4(multiply4(translation4(point), op), translation4(V.neg(point)));
}
export function applyMat4(m, p) {
    const [x, y, z] = p;
    return [
        m[0] * x + m[1] * y + m[2] * z + m[3],
        m[4] * x + m[5] * y + m[6] * z + m[7],
        m[8] * x + m[9] * y + m[10] * z + m[11],
    ];
}
// ---------------------------------------------------------------------------
export class Mesh3D extends Mobject {
    _isMesh3D = true;
    vertexCoords;
    facesList;
    /** Flat 4x4, row-major, local-to-world -- ThreeRenderer applies this as
     *  the built THREE.Mesh's own transform matrix. */
    transform;
    /** Untransformed (LOCAL space) bounding corners, computed once at
     *  construction -- cheap to re-transform on every shift/scale/rotate,
     *  unlike walking the full (possibly huge) vertex array each time. */
    _localBoundsMin;
    _localBoundsMax;
    /** Lazily built by ThreeRenderer on first encounter and cached here
     *  (shared across copy() clones, same reasoning ImageMobject/VideoMobject
     *  share their decoded bitmap/provider -- immutable, read-only-safe). */
    _threeGeometryCache;
    constructor(vertexCoords, facesList, config = {}) {
        super(config);
        this.vertexCoords = vertexCoords;
        this.facesList = facesList;
        this.transform = [...IDENTITY4];
        const xs = vertexCoords.map((p) => p[0]);
        const ys = vertexCoords.map((p) => p[1]);
        const zs = vertexCoords.map((p) => p[2]);
        this._localBoundsMin = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
        this._localBoundsMax = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];
        this._syncBoundsPoints();
    }
    /** Re-derive the cheap 8-corner bounding proxy (this.points) from the
     *  local AABB + current transform -- called after every transform op. */
    _syncBoundsPoints() {
        const { _localBoundsMin: min, _localBoundsMax: max } = this;
        const corners = [
            [min[0], min[1], min[2]], [max[0], min[1], min[2]], [min[0], max[1], min[2]], [max[0], max[1], min[2]],
            [min[0], min[1], max[2]], [max[0], min[1], max[2]], [min[0], max[1], max[2]], [max[0], max[1], max[2]],
        ];
        this.points = corners.map((p) => applyMat4(this.transform, p));
    }
    shift(...vectors) {
        const total = vectors
            .filter((v) => Array.isArray(v))
            .reduce((acc, v) => V.add(acc, v), [0, 0, 0]);
        this.transform = multiply4(translation4(total), this.transform);
        this._syncBoundsPoints();
        return this;
    }
    scale(factor, { aboutPoint } = {}) {
        const center = aboutPoint ?? this.getCenter();
        this.transform = multiply4(aboutPoint4(scale4(factor), center), this.transform);
        this._syncBoundsPoints();
        return this;
    }
    rotate(angle, { axis = V.OUT, aboutPoint } = {}) {
        const center = aboutPoint ?? this.getCenter();
        const r = rotation4From3x3(V.rotationMatrix(angle, axis));
        this.transform = multiply4(aboutPoint4(r, center), this.transform);
        this._syncBoundsPoints();
        return this;
    }
    // copy() is intentionally NOT overridden: Mobject.copy()'s Object.assign-
    // based shallow copy already shares vertexCoords/facesList/transform (and
    // any _threeGeometryCache) by reference correctly -- every transform
    // method above always REASSIGNS this.transform to a fresh array rather
    // than mutating it in place, so a shared reference between a clone and
    // its original is safe (each independently reassigns its own field going
    // forward). Same read-only-safe-sharing reasoning as ImageMobject sharing
    // its decoded bitmap.
    /** Approximate: a naive per-element lerp of the composed 4x4 transform.
     *  Correct for translation/uniform-scale-only deltas and small rotation
     *  deltas; NOT a proper decomposed translate/rotate/scale slerp, so a
     *  large-angle rotation Transform between two Mesh3D states may look
     *  subtly "off" mid-transition. Cross-mesh interpolation (different
     *  underlying vertexCoords/facesList) is out of scope entirely -- same
     *  limitation every other Mobject's interpolate() has for mismatched
     *  topology, just more visible here since a mesh's geometry never
     *  actually blends, only its transform does. */
    interpolate(start, target, alpha) {
        this.transform = start.transform.map((v, i) => v + (target.transform[i] - v) * alpha);
        this._syncBoundsPoints();
        this._color = Color.lerp(start.color, target.color, alpha);
        this.opacity = start.opacity + (target.opacity - start.opacity) * alpha;
        return this;
    }
}
//# sourceMappingURL=mesh3d.js.map