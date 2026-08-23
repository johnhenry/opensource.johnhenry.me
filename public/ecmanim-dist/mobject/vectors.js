// Vector-style arrows. Mirrors ManimCommunity's manim/mobject/geometry/line.py
// Vector and DoubleArrow classes (the arrowhead-bearing lines).
import { VMobject } from "./VMobject.js";
import { Arrow, Line } from "./geometry.js";
import { Text } from "./text/Text.js";
import * as V from "../core/math/vector.js";
/** An Arrow from the origin to `direction`. */
export class Vector extends Arrow {
    direction;
    constructor(direction = V.RIGHT, config = {}) {
        // manim's Vector defaults buff to 0 so getEnd() lands exactly on `direction`.
        super(V.ORIGIN, direction, { ...config, buff: config.buff ?? 0 });
        this.direction = V.clone(direction);
    }
    /**
     * A label showing the vector's components. Returns a Text (a full Matrix is
     * out of scope here); positioned to the right of the arrow's tip.
     */
    coordinateLabel(config = {}) {
        const end = this.getEnd();
        const x = Math.round(end[0] * 100) / 100;
        const y = Math.round(end[1] * 100) / 100;
        const label = new Text(`[${x}, ${y}]`, { fontSize: config.fontSize ?? 0.4 });
        label.nextTo(this, V.RIGHT, 0.1);
        return label;
    }
}
/** A line with an arrowhead at BOTH ends. */
export class DoubleArrow extends Line {
    tipLength;
    tipStart;
    tipEnd;
    constructor(start = V.LEFT, end = V.RIGHT, config = {}) {
        super(start, end, config);
        this.tipLength = config.tipLength ?? 0.25;
        this.tipStart = this._buildTipAt(this.getStart(), this.getEnd());
        this.tipEnd = this._buildTipAt(this.getEnd(), this.getStart());
        this.add(this.tipStart, this.tipEnd);
    }
    // Build a filled triangular tip located AT `at`, pointing away from `from`.
    _buildTipAt(at, from) {
        const dir = V.normalize(V.sub(at, from));
        const back = V.scale(dir, -this.tipLength);
        const perp = [-dir[1], dir[0], 0];
        const base = V.add(at, back);
        const p1 = V.add(base, V.scale(perp, this.tipLength * 0.5));
        const p2 = V.sub(base, V.scale(perp, this.tipLength * 0.5));
        const tip = new VMobject({ fillOpacity: 1 });
        tip.setColor(this.strokeColor);
        tip.setPointsAsCorners([at, p1, p2, at]);
        tip.fillOpacity = 1;
        return tip;
    }
}
//# sourceMappingURL=vectors.js.map