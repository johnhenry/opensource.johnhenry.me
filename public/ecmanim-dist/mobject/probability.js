// Probability / statistics mobjects: BarChart and SampleSpace.
// Ports of ManimCommunity manim/mobject/graphing/probability.py.
//
// BarChart extends Axes and draws one Rectangle bar per value, positioned on
// the axes. SampleSpace extends Rectangle and can be subdivided horizontally or
// vertically into proportioned sub-rectangles (a unit square of probability).
import { VGroup } from "./VMobject.js";
import * as V from "../core/math/vector.js";
import { Rectangle } from "./geometry.js";
import { Axes } from "./coordinate_systems.js";
import { Text } from "./text/Text.js";
import { Brace } from "./brace.js";
import { Color, BLUE, GREEN, RED, YELLOW, WHITE } from "../core/color.js";
const DEFAULT_BAR_COLORS = [BLUE, YELLOW, RED, GREEN];
export class BarChart extends Axes {
    values;
    barNames;
    barColors;
    barWidthRatio;
    barFillOpacity;
    barStrokeWidth;
    bars;
    constructor(values, config = {}) {
        const nBars = values.length;
        const barNames = config.barNames ?? [];
        // Default y range spans 0..max(values), with a sensible step.
        const maxVal = values.length ? Math.max(...values, 0) : 1;
        const yRange = config.yRange ?? [0, maxVal, Math.max(1, Math.ceil(maxVal / 5))];
        // The x-axis holds the bars: one unit per bar, indexed 0..nBars.
        const xRange = [0, nBars, 1];
        const xLength = config.xLength ?? Math.max(1, nBars);
        const yLength = config.yLength ?? 6;
        super({
            ...config,
            xRange,
            yRange,
            xLength,
            yLength,
        });
        this.values = [...values];
        this.barNames = barNames;
        this.barColors = config.barColors ?? DEFAULT_BAR_COLORS;
        this.barWidthRatio = config.barWidthRatio ?? 0.6;
        this.barFillOpacity = config.barFillOpacity ?? 0.7;
        this.barStrokeWidth = config.barStrokeWidth ?? 3;
        this._addBars(this.values);
    }
    // World width (per unit x) for one bar slot.
    _unitWidth() {
        return this.xAxis.unit;
    }
    _colorFor(index) {
        const colors = this.barColors;
        if (!colors.length)
            return WHITE;
        return colors[index % colors.length];
    }
    _addBars(values) {
        this.bars = new VGroup();
        const slot = this._unitWidth();
        const barWidth = slot * this.barWidthRatio;
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            // Base sits on y=0, top at y=value. Center x at the middle of slot i.
            const xCenter = i + 0.5;
            const base = this.coordsToPoint(xCenter, 0);
            const top = this.coordsToPoint(xCenter, value);
            const height = Math.abs(top[1] - base[1]);
            const color = this._colorFor(i);
            const bar = new Rectangle({
                width: barWidth,
                height: height <= 0 ? 1e-6 : height,
                fillColor: color,
                fillOpacity: this.barFillOpacity,
                strokeColor: color,
                strokeWidth: this.barStrokeWidth,
            });
            // Position: horizontally centered on the slot, resting on the axis.
            const cy = (base[1] + top[1]) / 2;
            bar.moveTo([base[0], cy, 0]);
            bar.barValue = value;
            this.bars.add(bar);
        }
        this.add(this.bars);
    }
    getBars() {
        return this.bars;
    }
    // Labels drawn under each bar (using barNames, if given).
    getBarLabels(config = {}) {
        const fontSize = config.fontSize ?? 0.3;
        const color = config.color ?? WHITE;
        const buff = config.buff ?? 0.25;
        const labels = new VGroup();
        for (let i = 0; i < this.bars.submobjects.length; i++) {
            const name = this.barNames[i] ?? String(i);
            const bar = this.bars.submobjects[i];
            const label = new Text(name, { fontSize, color });
            // Place below the bar's base (on the x-axis).
            const base = this.coordsToPoint(i + 0.5, 0);
            label.moveTo([base[0], base[1] - buff, 0]);
            labels.add(label);
        }
        return labels;
    }
    // Rebuild the bars in-place from a new set of values, preserving the axes.
    changeBarValues(values) {
        this.values = [...values];
        // Remove old bars from submobjects.
        const idx = this.submobjects.indexOf(this.bars);
        if (idx !== -1)
            this.submobjects.splice(idx, 1);
        this._addBars(this.values);
        return this;
    }
}
export class SampleSpace extends Rectangle {
    horizontalParts;
    verticalParts;
    title;
    labels;
    constructor(config = {}) {
        super({
            height: config.height ?? 3,
            width: config.width ?? 3,
            fillColor: config.fillColor ?? BLUE,
            fillOpacity: config.fillOpacity ?? 1,
            strokeWidth: config.strokeWidth ?? 0.5,
            strokeColor: config.strokeColor ?? WHITE,
        });
    }
    _defaultColors(n) {
        const stops = [GREEN, BLUE, YELLOW, RED];
        const out = [];
        for (let i = 0; i < n; i++) {
            const t = n <= 1 ? 0 : i / (n - 1);
            const scaled = t * (stops.length - 1);
            const lo = Math.floor(scaled);
            const hi = Math.min(stops.length - 1, lo + 1);
            out.push(Color.lerp(stops[lo], stops[hi], scaled - lo).toHex());
        }
        return out;
    }
    // Build proportioned sub-rectangles along a given axis. `vect` points along
    // the direction the parts stack (default DOWN for horizontal divisions,
    // meaning the parts stack vertically producing horizontal cut lines).
    _getSubdivision(pList, vect, colors) {
        const parts = new VGroup();
        const total = pList.reduce((a, b) => a + b, 0) || 1;
        const cols = colors ?? this._defaultColors(pList.length);
        const fullWidth = this.getWidth();
        const fullHeight = this.getHeight();
        // Determine which dimension is being split by the vect direction.
        const splitVertical = Math.abs(vect[1]) >= Math.abs(vect[0]);
        // Start at the appropriate corner (top for downward stacking, left for
        // rightward stacking).
        let cursor;
        if (splitVertical) {
            cursor = V.clone(this.getTop());
        }
        else {
            cursor = V.clone(this.getLeft());
        }
        const sign = splitVertical ? -1 : 1; // downward or rightward
        let offset = 0;
        for (let i = 0; i < pList.length; i++) {
            const frac = pList[i] / total;
            const color = cols[i % cols.length];
            let w, h;
            if (splitVertical) {
                w = fullWidth;
                h = fullHeight * frac;
            }
            else {
                w = fullWidth * frac;
                h = fullHeight;
            }
            const part = new Rectangle({
                width: w <= 0 ? 1e-6 : w,
                height: h <= 0 ? 1e-6 : h,
                fillColor: color,
                fillOpacity: this.fillOpacity,
                strokeColor: this.strokeColor.toHex(),
                strokeWidth: this.strokeWidth,
            });
            if (splitVertical) {
                const cy = cursor[1] + sign * (offset + h / 2);
                part.moveTo([this.getCenter()[0], cy, 0]);
                offset += h;
            }
            else {
                const cx = cursor[0] + sign * (offset + w / 2);
                part.moveTo([cx, this.getCenter()[1], 0]);
                offset += w;
            }
            parts.add(part);
        }
        return parts;
    }
    divideHorizontally(pList, config = {}) {
        // Horizontal division = horizontal cut lines = parts stacked vertically.
        const parts = this._getSubdivision(pList, config.vect ?? V.DOWN, config.colors);
        this.horizontalParts = parts;
        this.add(parts);
        return parts;
    }
    divideVertically(pList, config = {}) {
        // Vertical division = vertical cut lines = parts stacked horizontally.
        const parts = this._getSubdivision(pList, config.vect ?? V.RIGHT, config.colors);
        this.verticalParts = parts;
        this.add(parts);
        return parts;
    }
    // Braces spanning each subdivision along the given direction.
    getSubdivisionBraces(parts, direction = V.LEFT, config = {}) {
        const braces = new VGroup();
        for (const part of parts.submobjects) {
            const brace = new Brace(part, { direction, buff: config.buff ?? 0.1 });
            braces.add(brace);
        }
        return braces;
    }
    addTitle(title, scaleFactor = 1) {
        const t = new Text(title, { fontSize: 0.4 * scaleFactor });
        t.moveTo([this.getCenter()[0], this.getTop()[1] + 0.3, 0]);
        this.title = t;
        this.add(t);
        return t;
    }
    addLabel(label, position = V.LEFT, buff = 0.25) {
        const t = typeof label === "string" ? new Text(label, { fontSize: 0.35 }) : label;
        const anchor = this.getBoundaryPoint(position);
        t.moveTo(V.add(anchor, V.scale(V.normalize(position), buff)));
        if (!this.labels)
            this.labels = new VGroup();
        this.labels.add(t);
        this.add(t);
        return t;
    }
}
//# sourceMappingURL=probability.js.map