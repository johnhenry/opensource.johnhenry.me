// Scale bases for NumberLine / Axes. A scale base maps between the "data" value
// a user thinks in (e.g. 100 on a log axis) and the "position" value used for
// the affine layout (e.g. 2, since log10(100) = 2). Mirrors ManimCommunity's
// manim/mobject/graphing/scale.py (_ScaleBase, LinearBase, LogBase).
/** Identity scale — the default for every axis. */
export class LinearBase {
    scaleFactor;
    constructor(scaleFactor = 1.0) {
        this.scaleFactor = scaleFactor;
    }
    functionOf(value) {
        return this.scaleFactor * value;
    }
    inverseFunctionOf(value) {
        return value / this.scaleFactor;
    }
    getCustomLabels() {
        return null;
    }
}
/** Logarithmic scale. `functionOf(x) = log_base(x)`, inverse `base**x`. */
export class LogBase {
    base;
    customLabels;
    constructor(base = 10, customLabels = true) {
        this.base = base;
        this.customLabels = customLabels;
    }
    functionOf(value) {
        return Math.log(value) / Math.log(this.base);
    }
    inverseFunctionOf(value) {
        return Math.pow(this.base, value);
    }
    /**
     * Produce labels of the form `base^exponent` at each integer position across
     * the (already log-space) value range. `valueRange` here is expressed in data
     * units (e.g. [1, 1000, ...]); we walk the exponents between them.
     */
    getCustomLabels(valueRange, opts = {}) {
        if (!this.customLabels)
            return [];
        const out = [];
        for (const value of valueRange) {
            const exponent = Math.round(this.functionOf(value));
            out.push({ value, label: `${this.base}^{${exponent}}` });
        }
        return out;
    }
}
//# sourceMappingURL=graphing_scale.js.map