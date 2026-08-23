// Labeled lines/arrows: a Line or Arrow carrying a label at a proportion along
// it, inside a small background frame. Mirrors ManimCommunity's
// manim/mobject/geometry/labeled.py (LabeledLine, LabeledArrow).
import { Line, Arrow } from "./geometry.js";
import { Text } from "./text/Text.js";
import { BackgroundRectangle } from "./shape_matchers.js";
import * as V from "../core/math/vector.js";
/** A Line with a framed text label placed at a proportion along its length. */
export class LabeledLine extends Line {
    label;
    frame;
    labelPosition;
    constructor(start = V.LEFT, end = V.RIGHT, config = {}) {
        super(start, end, config);
        this.labelPosition = config.labelPosition ?? 0.5;
        const text = config.label ?? "";
        this.label = new Text(text, { fontSize: config.fontSize ?? 0.4 });
        this.frame = new BackgroundRectangle(this.label, {
            buff: config.labelBuff ?? 0.05,
            color: config.frameFill ?? "#000000",
            fillOpacity: config.frameFillOpacity ?? 0.75,
        });
        this._placeLabel();
        this.add(this.frame, this.label);
    }
    _placeLabel() {
        const point = this.pointFromProportion(this.labelPosition);
        this.label.moveTo(point);
        this.frame.moveTo(point);
        return this;
    }
}
/** An Arrow with a framed text label placed at a proportion along its length. */
export class LabeledArrow extends Arrow {
    label;
    frame;
    labelPosition;
    constructor(start = V.LEFT, end = V.RIGHT, config = {}) {
        super(start, end, config);
        this.labelPosition = config.labelPosition ?? 0.5;
        const text = config.label ?? "";
        this.label = new Text(text, { fontSize: config.fontSize ?? 0.4 });
        this.frame = new BackgroundRectangle(this.label, {
            buff: config.labelBuff ?? 0.05,
            color: config.frameFill ?? "#000000",
            fillOpacity: config.frameFillOpacity ?? 0.75,
        });
        const point = this.pointFromProportion(this.labelPosition);
        this.label.moveTo(point);
        this.frame.moveTo(point);
        this.add(this.frame, this.label);
    }
}
//# sourceMappingURL=labeled.js.map