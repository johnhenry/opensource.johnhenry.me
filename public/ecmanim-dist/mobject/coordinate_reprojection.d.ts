import { VMobject } from "./VMobject.ts";
import type { Vec3, ColorLike } from "../core/types.ts";
export interface CoordSystemLike {
    coordsToPoint(a: number, b: number): Vec3;
}
export interface ReprojectOptions {
    color?: ColorLike;
    strokeColor?: ColorLike;
}
/**
 * Reuses exactly the construction `Axes.plot()` uses (`setPointsAsCorners`
 * over samples mapped through `targetSystem.coordsToPoint`), so a reprojected
 * curve has the same fidelity as one originally plotted directly against the
 * target system -- not a parallel curve-fitting reimplementation.
 */
export declare function reprojectCurve(domainSamples: Array<[number, number]>, targetSystem: CoordSystemLike, options?: ReprojectOptions): VMobject;
/** Overload: read the domain samples from a curve built by a plotting method
 *  that stamps `_domainSamples` (currently only `Axes.plot()`). */
export declare function reprojectCurve(curve: VMobject, targetSystem: CoordSystemLike, options?: ReprojectOptions): VMobject;
//# sourceMappingURL=coordinate_reprojection.d.ts.map