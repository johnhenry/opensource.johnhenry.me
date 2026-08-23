// ComplexValueTracker mirrors ManimCommunity manim/mobject/value_tracker.py.
// It stores a complex value as a single point [re, im, 0], so the standard
// interpolate machinery tweens both the real and imaginary components.
import { ValueTracker } from "./value_tracker.js";
function toReIm(value) {
    if (typeof value === "number")
        return [value, 0];
    if (Array.isArray(value))
        return [value[0] ?? 0, value[1] ?? 0];
    return [value.re ?? 0, value.im ?? 0];
}
/**
 * ComplexValueTracker: like ValueTracker but the stored point holds a complex
 * value (real in x, imaginary in y). getValue() returns { re, im }; setValue
 * accepts an object, a [re, im] tuple, or a real number.
 */
export class ComplexValueTracker extends ValueTracker {
    constructor(value = { re: 0, im: 0 }) {
        super(0);
        const [re, im] = toReIm(value);
        this.points = [[re, im, 0]];
    }
    getValue() {
        return { re: this.points[0][0], im: this.points[0][1] };
    }
    setValue(z) {
        const [re, im] = toReIm(z);
        this.points[0][0] = re;
        this.points[0][1] = im;
        return this;
    }
    getCenterOfMass() {
        return { re: this.points[0][0], im: this.points[0][1] };
    }
    interpolate(start, target, alpha) {
        const ar = start.points[0][0];
        const ai = start.points[0][1];
        const br = target.points[0][0];
        const bi = target.points[0][1];
        this.points[0][0] = ar + (br - ar) * alpha;
        this.points[0][1] = ai + (bi - ai) * alpha;
        return this;
    }
}
//# sourceMappingURL=complex_value_tracker.js.map