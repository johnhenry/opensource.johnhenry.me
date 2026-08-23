import { ValueTracker } from "./value_tracker.ts";
/** A complex number as an object; also accepted as a [re, im] tuple. */
export interface Complex {
    re: number;
    im: number;
}
export type ComplexLike = Complex | number[] | number;
/**
 * ComplexValueTracker: like ValueTracker but the stored point holds a complex
 * value (real in x, imaginary in y). getValue() returns { re, im }; setValue
 * accepts an object, a [re, im] tuple, or a real number.
 */
export declare class ComplexValueTracker extends ValueTracker {
    constructor(value?: ComplexLike);
    getValue(): any;
    setValue(z: ComplexLike): this;
    getCenterOfMass(): any;
    interpolate(start: any, target: any, alpha: number): this;
}
//# sourceMappingURL=complex_value_tracker.d.ts.map