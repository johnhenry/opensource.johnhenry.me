import { ArrowVectorField } from "../mobject/vector_field.ts";
import type { ArrowVectorFieldConfig } from "../mobject/vector_field.ts";
export interface PointCharge {
    position: number[];
    magnitude: number;
}
export interface PointCurrent {
    position: number[];
    magnitude: number;
}
/** The electric field function E(p) for a set of point charges (Coulomb, summed). */
export declare function electricFieldFunc(charges: PointCharge[]): (p: number[]) => number[];
/** The magnetic field B(p) for a set of out-of-plane line currents (B = I·(ẑ×r)/|r|²). */
export declare function magneticFieldFunc(currents: PointCurrent[]): (p: number[]) => number[];
/** An arrow vector field for the electric field of the given charges. */
export declare class ElectricField extends ArrowVectorField {
    charges: PointCharge[];
    constructor(charges: PointCharge[], config?: ArrowVectorFieldConfig);
}
/** An arrow vector field for the magnetic field of the given out-of-plane currents. */
export declare class MagneticField extends ArrowVectorField {
    currents: PointCurrent[];
    constructor(currents: PointCurrent[], config?: ArrowVectorFieldConfig);
}
/**
 * Thin-lens refraction of a ray hitting a lens plane at x = `lensX` with focal
 * length `focal`. Given an incoming point + direction, returns the outgoing
 * direction after the lens (paraxial approximation): a ray at height y bends
 * toward the focal point. Converging lens: focal > 0.
 */
export declare function thinLensRefract(hitY: number, incomingDir: number[], focal: number): number[];
//# sourceMappingURL=fields.d.ts.map