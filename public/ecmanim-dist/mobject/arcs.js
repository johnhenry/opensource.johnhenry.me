// Arc-derived geometry: ArcBetweenPoints, CurvedArrow, CurvedDoubleArrow,
// Sector, AnnularSector, Angle, RightAngle, TangentLine, Elbow, AnnotationDot,
// LabeledDot. Mirrors parts of ManimCommunity manim/mobject/geometry/{arc,line}.py.
import { VMobject } from "./VMobject.js";
import { Arc, Line, Dot } from "./geometry.js";
import { ArrowTriangleFilledTip } from "./tips.js";
import { Text } from "./text/Text.js";
import * as V from "../core/math/vector.js";
import { arcBezierPoints } from "../core/math/bezier.js";
import { WHITE, BLUE, BLACK } from "../core/color.js";
const TAU = 2 * Math.PI;
const SMALL_BUFF = 0.1;
const DEFAULT_DOT_RADIUS = 0.08;
// An arc that passes through `start` and `end`. `angle` is the arc's central
// angle (default PI/2). If `radius` is given, `angle` is derived from it.
export class ArcBetweenPoints extends Arc {
    constructor(start = V.LEFT, end = V.RIGHT, angle = Math.PI / 2, radius, config = {}) {
        // Allow the config to override angle/radius.
        angle = config.angle ?? angle;
        radius = config.radius ?? radius;
        if (radius != null) {
            const halfdist = V.distance(start, end) / 2;
            if (radius < halfdist) {
                throw new Error("ArcBetweenPoints called with a radius that is smaller than half the distance between the points.");
            }
            const arcHeight = radius - Math.sqrt(radius * radius - halfdist * halfdist);
            const sign = angle < 0 ? -1 : 1;
            angle = Math.acos(Math.max(-1, Math.min(1, (radius - arcHeight) / radius))) * 2 * sign;
        }
        // Build a canonical arc, then map its endpoints onto start/end.
        super({ ...config, radius: 1, startAngle: 0, angle: angle || 1e-6, arcCenter: V.ORIGIN });
        if (angle === 0) {
            this.setPointsAsCorners([V.clone(start), V.clone(end)]);
        }
        else {
            this.putStartAndEndOnArc(start, end);
        }
        // If radius was not provided, record the effective radius from geometry.
        this.radius = radius ?? V.distance(this.getArcCenter(), this.getStart());
    }
    getStart() {
        return this.points[0] ?? [0, 0, 0];
    }
    getEnd() {
        return this.points[this.points.length - 1] ?? [0, 0, 0];
    }
    getArcCenter() {
        // For an arc built from startAngle/angle, center = midpoint of chord offset
        // toward the arc center. Approximate via the current start/end + points.
        const s = this.getStart();
        const e = this.getEnd();
        const mid = V.midpoint(s, e);
        // Sagitta direction: perpendicular to chord toward a sampled interior point.
        const interior = this.pointFromProportion(0.5);
        const dir = V.sub(interior, mid);
        // center is on the opposite side of the chord from the arc bulge.
        const halfChord = V.distance(s, e) / 2;
        const r = this.radius || halfChord || 1;
        const sag = V.length(dir);
        if (sag < 1e-9)
            return mid;
        const toCenter = V.scale(V.normalize(dir), -(r - sag));
        return V.add(interior, toCenter);
    }
    // Rotate/scale/translate the canonical arc so its endpoints land on s/e.
    putStartAndEndOnArc(target0, target1) {
        const curr0 = this.points[0];
        const curr1 = this.points[this.points.length - 1];
        const currVec = V.sub(curr1, curr0);
        const targetVec = V.sub(target1, target0);
        const currLen = V.length(currVec);
        const targetLen = V.length(targetVec);
        if (currLen < 1e-9) {
            this.shift(V.sub(target0, curr0));
            return;
        }
        // Scale about curr0, rotate about curr0, then shift curr0 -> target0.
        const scaleFactor = targetLen / currLen;
        this.scale(scaleFactor, { aboutPoint: curr0 });
        const angle = V.angleOf(targetVec) - V.angleOf(currVec);
        this.rotate(angle, { aboutPoint: curr0 });
        this.shift(V.sub(target0, this.points[0]));
    }
}
// An ArcBetweenPoints with an arrow tip at the end.
export class CurvedArrow extends ArcBetweenPoints {
    tip;
    constructor(start, end, config = {}) {
        super(start, end, config.angle ?? Math.PI / 2, config.radius, config);
        const TipClass = config.tipShape ?? ArrowTriangleFilledTip;
        this.tip = addTipToPath(this, TipClass, { tipLength: config.tipLength }, false);
        this.add(this.tip);
    }
}
// Like CurvedArrow but with tips at both ends.
export class CurvedDoubleArrow extends ArcBetweenPoints {
    tip;
    startTip;
    constructor(start, end, config = {}) {
        super(start, end, config.angle ?? Math.PI / 2, config.radius, config);
        const TipClass = config.tipShape ?? ArrowTriangleFilledTip;
        this.tip = addTipToPath(this, TipClass, { tipLength: config.tipLength }, false);
        this.startTip = addTipToPath(this, TipClass, { tipLength: config.tipLength }, true);
        this.add(this.tip, this.startTip);
    }
}
// Build a tip of `TipClass`, orient it along the path's tangent at the
// (start or end), and position it at that endpoint. Returns the tip.
function addTipToPath(path, TipClass, config, atStart) {
    const tip = new TipClass(config);
    tip.setColor(path.strokeColor ?? WHITE);
    const anchor = atStart ? path.pointFromProportion(0) : path.pointFromProportion(1);
    const near = atStart ? path.pointFromProportion(0.001) : path.pointFromProportion(0.999);
    // Direction the tip should point: from just inside the path outward to the endpoint.
    const dir = V.sub(anchor, near);
    const angle = V.angleOf(dir);
    tip.rotate(angle - tip.getTipAngle(), { aboutPoint: tip.getTipPoint() });
    tip.shift(V.sub(anchor, tip.getTipPoint()));
    return tip;
}
// A ring slice: bounded by an inner arc, an outer arc, and two radial edges.
export class AnnularSector extends VMobject {
    innerRadius;
    outerRadius;
    angle;
    startAngle;
    arcCenter;
    constructor(config = {}) {
        super({ fillOpacity: 1, strokeWidth: 0, ...config, color: config.color ?? WHITE });
        this.innerRadius = config.innerRadius ?? 1;
        this.outerRadius = config.outerRadius ?? 2;
        this.angle = config.angle ?? TAU / 4;
        this.startAngle = config.startAngle ?? 0;
        this.arcCenter = config.arcCenter ?? V.ORIGIN;
        this.fillOpacity = config.fillOpacity ?? 1;
        const inner = arcBezierPoints(this.innerRadius, this.startAngle, this.angle, this.arcCenter);
        // Outer arc reversed (traversed from end angle back to start angle).
        const outer = arcBezierPoints(this.outerRadius, this.startAngle + this.angle, -this.angle, this.arcCenter);
        // Assemble: inner arc -> line to outer start -> outer arc -> close.
        this.points = [];
        this.subpathStarts = [0];
        this.points.push(V.clone(inner[0]));
        for (let i = 1; i < inner.length; i++)
            this.points.push(V.clone(inner[i]));
        this.addLineTo(outer[0]);
        for (let i = 1; i < outer.length; i++)
            this.points.push(V.clone(outer[i]));
        this.addLineTo(inner[0]); // close back to inner start
        this._straightPath = false;
    }
}
// A pie slice: an AnnularSector with innerRadius 0.
export class Sector extends AnnularSector {
    constructor(config = {}) {
        const outer = config.outerRadius ?? config.radius ?? 1;
        super({ ...config, innerRadius: config.innerRadius ?? 0, outerRadius: outer });
    }
}
// An L-shaped right-angle corner marker.
export class Elbow extends VMobject {
    width;
    angle;
    constructor(config = {}) {
        super({ ...config });
        this.width = config.width ?? 0.2;
        this.angle = config.angle ?? 0;
        this.fillOpacity = 0;
        // Corners at UP, UP+RIGHT, RIGHT (unit L), then scale to width & rotate.
        this.setPointsAsCorners([V.UP, V.add(V.UP, V.RIGHT), V.RIGHT]);
        this.setWidth(this.width, true);
        if (this.angle !== 0)
            this.rotate(this.angle, { aboutPoint: V.ORIGIN });
    }
}
// The angle between two Lines, drawn as an arc (or a right-angle elbow).
export class Angle extends VMobject {
    radius;
    dot;
    constructor(line1, line2, config = {}) {
        super({ ...config });
        this.fillOpacity = 0;
        const quadrant = config.quadrant ?? [1, 1];
        const elbow = config.elbow ?? false;
        const otherAngle = config.otherAngle ?? false;
        // Intersection point of the two (infinite) lines.
        const inter = V.lineIntersection([line1.getStart(), line1.getEnd()], [line2.getStart(), line2.getEnd()]);
        // Unit directions along each line (sign chosen by quadrant).
        const dir1 = V.normalize(V.sub(line1.getEnd(), line1.getStart()));
        const dir2 = V.normalize(V.sub(line2.getEnd(), line2.getStart()));
        const anchorDir1 = V.scale(dir1, quadrant[0]);
        const anchorDir2 = V.scale(dir2, quadrant[1]);
        // Radius: default from distances to intersection.
        let radius = config.radius;
        if (radius == null) {
            const d1 = V.distance(line1.getStart(), inter);
            const d2 = V.distance(line2.getStart(), inter);
            const minDist = Math.min(d1, d2);
            radius = minDist > 0.6 ? (2 / 3) * minDist : 0.4;
        }
        this.radius = radius;
        let a1 = V.angleOf(anchorDir1);
        let a2 = V.angleOf(anchorDir2);
        let sweep = a2 - a1;
        // Normalize sweep to (-PI, PI], then optionally take the reflex angle.
        while (sweep <= -Math.PI)
            sweep += TAU;
        while (sweep > Math.PI)
            sweep -= TAU;
        if (otherAngle)
            sweep = sweep > 0 ? sweep - TAU : sweep + TAU;
        if (elbow) {
            const el = new Elbow({ width: radius, angle: a1 });
            // Position the elbow at the intersection, along the first direction.
            el.shift(inter);
            this.points = el.points.map((p) => V.clone(p));
            this.subpathStarts = [...el.subpathStarts];
            this._straightPath = true;
        }
        else {
            const pts = arcBezierPoints(radius, a1, sweep, inter);
            this.appendBezierPoints(pts);
        }
        if (config.dot) {
            const dotDistance = config.dotDistance ?? 0.55;
            const midAngle = a1 + sweep / 2;
            const dotPoint = V.add(inter, [
                radius * dotDistance * Math.cos(midAngle),
                radius * dotDistance * Math.sin(midAngle),
                0,
            ]);
            this.dot = new Dot({ point: dotPoint, radius: config.dotRadius ?? DEFAULT_DOT_RADIUS });
            this.add(this.dot);
        }
    }
    getLines() {
        // Not stored; provided for API parity (returns empty lines is not useful).
        throw new Error("getLines is not supported in this port");
    }
}
// A right-angle (square corner) indicator between two perpendicular lines.
export class RightAngle extends Angle {
    constructor(line1, line2, config = {}) {
        super(line1, line2, { ...config, radius: config.length ?? 0.4, elbow: true });
    }
}
// A line tangent to `vmob` at proportion `alpha`, of the given `length`.
export class TangentLine extends Line {
    constructor(vmob, alpha, config = {}) {
        const length = config.length ?? 1;
        const dAlpha = config.dAlpha ?? 1e-6;
        const a0 = Math.max(0, alpha - dAlpha);
        const a1 = Math.min(1, alpha + dAlpha);
        const p0 = vmob.pointFromProportion(a0);
        const p1 = vmob.pointFromProportion(a1);
        super(p0, p1, config);
        // Scale about the center to the requested length.
        const cur = V.distance(this.getStart(), this.getEnd());
        if (cur > 0)
            this.scale(length / cur);
    }
}
// A bold dot for annotations: larger radius, thick white stroke, blue fill.
export class AnnotationDot extends Dot {
    constructor(config = {}) {
        super({
            radius: config.radius ?? DEFAULT_DOT_RADIUS * 1.3,
            ...config,
        });
        this.setStroke(WHITE, 5, 1);
        this.setFill(config.fillColor ?? BLUE, 1);
    }
}
// A Dot sized to contain a text/math label, with the label centered on it.
export class LabeledDot extends Dot {
    label;
    constructor(label, config = {}) {
        const lab = typeof label === "string"
            ? new Text(label, { color: BLACK })
            : label;
        const buff = config.buff ?? SMALL_BUFF;
        const radius = config.radius ??
            buff + V.length([lab.getWidth(), lab.getHeight(), 0]) / 2;
        super({ radius, ...config });
        this.label = lab;
        lab.moveTo(this.getCenter());
        this.add(lab);
    }
}
//# sourceMappingURL=arcs.js.map