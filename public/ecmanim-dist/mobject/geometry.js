// Geometric VMobjects: Arc, Circle, Dot, Ellipse, Annulus, Line, Arrow,
// Polygon, Rectangle, Square, RegularPolygon, Triangle.
import { VMobject } from "./VMobject.js";
import * as V from "../core/math/vector.js";
import { arcBezierPoints } from "../core/math/bezier.js";
import { RED, WHITE } from "../core/color.js";
import { ArrowTriangleFilledTip } from "./tips.js";
export class Arc extends VMobject {
    radius;
    startAngle;
    angle;
    arcCenter;
    constructor(config = {}) {
        super(config);
        this.radius = config.radius ?? 1;
        this.startAngle = config.startAngle ?? 0;
        this.angle = config.angle ?? Math.PI / 2;
        this.arcCenter = config.arcCenter ?? config.point ?? V.ORIGIN;
        const pts = arcBezierPoints(this.radius, this.startAngle, this.angle, this.arcCenter);
        this.appendBezierPoints(pts);
    }
}
export class Circle extends Arc {
    constructor(config = {}) {
        // manim's Circle defaults to a RED stroke with no fill.
        super({ angle: 2 * Math.PI, fillOpacity: 0, ...config, color: config.color ?? RED });
        if (config.fillColor != null && config.fillOpacity == null)
            this.fillOpacity = 1;
    }
}
export class Dot extends Circle {
    constructor(config = {}) {
        const point = config.point ?? V.ORIGIN;
        // manim's Dot defaults to a filled WHITE dot (radius 0.08, no stroke).
        super({ radius: config.radius ?? 0.08, fillOpacity: 1, strokeWidth: 0, ...config, color: config.color ?? WHITE });
        this.moveTo(point);
    }
}
export class Ellipse extends VMobject {
    constructor(config = {}) {
        super({ ...config, color: config.color ?? RED }); // manim: Ellipse(Circle) -> RED
        const w = config.width ?? 2;
        const h = config.height ?? 1;
        const pts = arcBezierPoints(1, 0, 2 * Math.PI);
        this.appendBezierPoints(pts);
        this.stretch(w / 2, 0);
        this.stretch(h / 2, 1);
        this.fillOpacity = config.fillOpacity ?? 0;
    }
}
export class Annulus extends VMobject {
    constructor(config = {}) {
        super({ fillOpacity: 1, strokeWidth: 0, ...config });
        // manim defaults: inner_radius=1, outer_radius=2.
        const outer = config.outerRadius ?? 2;
        const inner = config.innerRadius ?? 1;
        const center = config.arcCenter ?? V.ORIGIN;
        // Outer ring CCW, inner ring CW — even-odd fill leaves the hole.
        this.appendBezierPoints(arcBezierPoints(outer, 0, 2 * Math.PI, center), true);
        this.appendBezierPoints(arcBezierPoints(inner, 0, -2 * Math.PI, center), true);
    }
}
export class Line extends VMobject {
    start;
    end;
    constructor(start = V.LEFT, end = V.RIGHT, config = {}) {
        // Allow Line({start, end, ...}) style too.
        if (start && typeof start === "object" && !Array.isArray(start) && start.start) {
            config = start;
            start = config.start;
            end = config.end;
        }
        super(config);
        this.start = start ?? V.LEFT;
        this.end = end ?? V.RIGHT;
        this.fillOpacity = 0;
        this.setPointsAsCorners([this.start, this.end]);
    }
    getStart() { return this.points[0]; }
    getEnd() { return this.points[this.points.length - 1]; }
    getLength() { return V.distance(this.getStart(), this.getEnd()); }
    getAngle() { return V.angleOf(V.sub(this.getEnd(), this.getStart())); }
    /** manim parity (get_unit_vector): normalized direction start -> end. */
    getUnitVector() {
        return V.normalize(V.sub(this.getEnd(), this.getStart()));
    }
    putStartAndEndOn(start, end) {
        this.setPointsAsCorners([start, end]);
        return this;
    }
}
export class DashedLine extends Line {
    numDashes;
    dashedRatio;
    _dashed;
    constructor(start, end, config = {}) {
        super(start, end, config);
        this.numDashes = config.numDashes ?? 15;
        this.dashedRatio = config.dashedRatio ?? config.dashRatio ?? 0.5;
        this._dashed = true;
        this._dashify(this.numDashes, this.dashedRatio);
    }
    // Rebuild the path as `n` short straight dash subpaths so it actually renders
    // dashed. Each dash covers `ratio/n` of the line; the gaps make up the rest.
    _dashify(n, ratio) {
        const start = this.start, end = this.end;
        this.points = [];
        this.subpathStarts = [];
        if (n <= 0)
            return this.setPointsAsCorners([start, end]);
        const period = 1 / n;
        const dash = ratio * period;
        for (let i = 0; i < n; i++) {
            const a0 = i * period;
            const a1 = Math.min(1, a0 + dash);
            const p0 = V.lerp(start, end, a0);
            const p1 = V.lerp(start, end, a1);
            this.subpathStarts.push(this.points.length);
            this.points.push([...p0], V.lerp(p0, p1, 1 / 3), V.lerp(p0, p1, 2 / 3), [...p1]);
        }
        return this;
    }
    getStart() { return this.start; }
    getEnd() { return this.end; }
}
export class Arrow extends Line {
    tipLength;
    buff;
    tipShape;
    maxTipLengthToLengthRatio;
    maxStrokeWidthToLengthRatio;
    _hasTip;
    tip; // built in _addTip() during construction
    _origStart;
    _origEnd;
    constructor(start = V.LEFT, end = V.RIGHT, config = {}) {
        super(start, end, config);
        this.tipLength = config.tipLength ?? 0.25;
        // manim MED_SMALL_BUFF default; shortens the visible shaft at both ends.
        this.buff = config.buff ?? 0.25;
        this.tipShape = config.tipShape ?? ArrowTriangleFilledTip;
        this.maxTipLengthToLengthRatio = config.maxTipLengthToLengthRatio ?? 0.25;
        this.maxStrokeWidthToLengthRatio = config.maxStrokeWidthToLengthRatio ?? 5;
        this._hasTip = true;
        this._origStart = V.clone(this.getStart());
        this._origEnd = V.clone(this.getEnd());
        this._applyBuff();
        this._scaleForShortArrows();
        this.buildTip();
    }
    // Trim the shaft by `buff` at each end so the tip does not overshoot.
    _applyBuff() {
        if (this.buff <= 0)
            return;
        const s = this._origStart;
        const e = this._origEnd;
        const total = V.distance(s, e);
        if (total <= 2 * this.buff)
            return;
        const dir = V.normalize(V.sub(e, s));
        const ns = V.add(s, V.scale(dir, this.buff));
        const ne = V.sub(e, V.scale(dir, this.buff));
        this.setPointsAsCorners([ns, ne]);
    }
    // Shrink tip length / stroke width for very short arrows (manim behavior).
    _scaleForShortArrows() {
        const length = V.distance(this.getStart(), this.getEnd()) + 2 * this.buff;
        if (length <= 0)
            return;
        const maxTip = length * this.maxTipLengthToLengthRatio;
        if (this.tipLength > maxTip)
            this.tipLength = maxTip;
        const maxStroke = length * this.maxStrokeWidthToLengthRatio;
        if (this.strokeWidth > maxStroke)
            this.strokeWidth = maxStroke;
    }
    buildTip() {
        const TipClass = this.tipShape ?? ArrowTriangleFilledTip;
        const tip = new TipClass({ tipLength: this.tipLength });
        tip.setColor(this.strokeColor);
        tip.fillOpacity = 1;
        const s = this.getStart();
        const e = this.getEnd();
        const dir = V.normalize(V.sub(e, s));
        const angle = V.angleOf(dir);
        tip.rotate(angle - tip.getTipAngle(), { aboutPoint: tip.getTipPoint() });
        tip.shift(V.sub(e, tip.getTipPoint()));
        this.tip = tip;
        this.add(this.tip);
        return this;
    }
}
export class Polygon extends VMobject {
    vertices;
    constructor(vertices = [], config = {}) {
        super(config);
        this.vertices = vertices;
        this.fillOpacity = config.fillOpacity ?? 0;
        const closed = [...vertices, vertices[0]];
        this.setPointsAsCorners(closed);
    }
    getVertices() { return this.vertices; }
}
export class RegularPolygon extends Polygon {
    constructor(n = 6, config = {}) {
        const radius = config.radius ?? 1;
        const start = config.startAngle ?? (n % 2 === 0 ? Math.PI / n : Math.PI / 2);
        const verts = [];
        for (let i = 0; i < n; i++) {
            const a = start + (2 * Math.PI * i) / n;
            verts.push([radius * Math.cos(a), radius * Math.sin(a), 0]);
        }
        super(verts, config);
    }
}
export class Triangle extends RegularPolygon {
    constructor(config = {}) {
        super(3, config);
    }
}
export class Rectangle extends Polygon {
    width;
    height;
    constructor(config = {}) {
        const w = config.width ?? 4;
        const h = config.height ?? 2;
        const verts = [
            [w / 2, h / 2, 0],
            [-w / 2, h / 2, 0],
            [-w / 2, -h / 2, 0],
            [w / 2, -h / 2, 0],
        ];
        super(verts, config);
        this.width = w;
        this.height = h;
        // Parity with Circle/Text: `point` places the shape's center.
        if (config.point)
            this.moveTo(config.point);
    }
}
export class Square extends Rectangle {
    sideLength;
    constructor(config = {}) {
        const side = config.sideLength ?? config.side ?? 2;
        super({ ...config, width: side, height: side });
        this.sideLength = side;
    }
}
//# sourceMappingURL=geometry.js.map