import { Mobject } from "./Mobject.ts";
import type { MobjectConfig } from "./Mobject.ts";
export declare function applyMat4(m: readonly number[], p: number[]): number[];
export declare class Mesh3D extends Mobject {
    _isMesh3D: boolean;
    vertexCoords: number[][];
    facesList: number[][];
    /** Flat 4x4, row-major, local-to-world -- ThreeRenderer applies this as
     *  the built THREE.Mesh's own transform matrix. */
    transform: number[];
    /** Untransformed (LOCAL space) bounding corners, computed once at
     *  construction -- cheap to re-transform on every shift/scale/rotate,
     *  unlike walking the full (possibly huge) vertex array each time. */
    _localBoundsMin: number[];
    _localBoundsMax: number[];
    /** Lazily built by ThreeRenderer on first encounter and cached here
     *  (shared across copy() clones, same reasoning ImageMobject/VideoMobject
     *  share their decoded bitmap/provider -- immutable, read-only-safe). */
    _threeGeometryCache?: any;
    constructor(vertexCoords: number[][], facesList: number[][], config?: MobjectConfig);
    /** Re-derive the cheap 8-corner bounding proxy (this.points) from the
     *  local AABB + current transform -- called after every transform op. */
    _syncBoundsPoints(): void;
    shift(...vectors: number[][]): this;
    scale(factor: number, { aboutPoint }?: {
        aboutPoint?: number[];
    }): this;
    rotate(angle: number, { axis, aboutPoint }?: {
        axis?: number[];
        aboutPoint?: number[];
    }): this;
    /** Approximate: a naive per-element lerp of the composed 4x4 transform.
     *  Correct for translation/uniform-scale-only deltas and small rotation
     *  deltas; NOT a proper decomposed translate/rotate/scale slerp, so a
     *  large-angle rotation Transform between two Mesh3D states may look
     *  subtly "off" mid-transition. Cross-mesh interpolation (different
     *  underlying vertexCoords/facesList) is out of scope entirely -- same
     *  limitation every other Mobject's interpolate() has for mismatched
     *  topology, just more visible here since a mesh's geometry never
     *  actually blends, only its transform does. */
    interpolate(start: Mesh3D, target: Mesh3D, alpha: number): this;
}
//# sourceMappingURL=mesh3d.d.ts.map