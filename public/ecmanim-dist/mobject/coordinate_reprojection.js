// Rebuild a curve, sampled in domain (coordinate) space, against a different
// coordinate system -- e.g. take a curve plotted on an `Axes` and reproject
// it onto a `PolarPlane`. `VMobject.points` only stores already-projected
// world points with no back-reference to the domain samples that produced
// them, so reprojection needs the original domain data, either passed
// explicitly or read from a curve's `_domainSamples` tag (stamped by
// `Axes.plot()`).
//
// `targetSystem` is typed structurally (it only needs `coordsToPoint`), so
// `Axes`, `PolarPlane`, and `ComplexPlane` all work as a reprojection target
// with no special-casing.
import { VMobject } from "./VMobject.js";
export function reprojectCurve(domainSamplesOrCurve, targetSystem, options = {}) {
    let domainSamples;
    if (Array.isArray(domainSamplesOrCurve)) {
        domainSamples = domainSamplesOrCurve;
    }
    else {
        const tagged = domainSamplesOrCurve._domainSamples;
        if (!tagged) {
            throw new Error("reprojectCurve(curve, targetSystem) requires a curve built by a plotting method that " +
                "stamps _domainSamples (currently only Axes.plot()); pass the domain samples array " +
                "directly instead: reprojectCurve(samples, targetSystem).");
        }
        domainSamples = tagged;
    }
    const corners = domainSamples.map(([a, b]) => targetSystem.coordsToPoint(a, b));
    const curve = new VMobject({
        strokeColor: options.strokeColor ?? options.color,
        color: options.color,
    });
    curve.setPointsAsCorners(corners);
    curve.fillOpacity = 0;
    return curve;
}
//# sourceMappingURL=coordinate_reprojection.js.map