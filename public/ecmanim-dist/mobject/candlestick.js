// Candlestick chart mobject: a category-x / price-y coordinate system with
// one OHLC candle (Rectangle body + Line wick) per data point, plus optional
// moving-average overlay lines.
//
// Follows probability.ts's BarChart precedent: an Axes SUBCLASS (not an
// axis-free VGroup like PieChart/RadarChart/GaugeChart/FunnelChart) because a
// candlestick chart genuinely needs a coordinate system to plot against --
// each candle's body top/bottom and wick low/high are prices on a numeric
// y-axis, positioned above a category (date) slot on the x-axis, exactly like
// BarChart's `coordsToPoint`-driven `Rectangle` bars. Bodies additionally get
// a thin `Line` wick spanning low->high, centered under the body.
//
// setPoints() mirrors PieChart.setValues()'s identity-preserving rebuild:
// when the candle COUNT is unchanged, existing Rectangle/Line mobjects are
// mutated in place (geometry + color rewritten) so updaters/Transforms/refs
// to `chart.candles[i]` / `chart.wicks[i]` stay valid; otherwise the lists
// are replaced wholesale.
import { VGroup } from "./VMobject.js";
import { Rectangle, Line } from "./geometry.js";
import { Axes } from "./coordinate_systems.js";
// Defaults match examples/echarts-parity/ref/08-candlestick.js's itemStyle
// (Chinese-market convention: red = rising/bullish, green = falling/bearish).
const DEFAULT_UP_COLOR = "#ec0000";
const DEFAULT_DOWN_COLOR = "#00da3c";
export class Candlestick extends Axes {
    // Note: named `data`, not `points` -- `Mobject.points: number[][]` is a
    // reserved base-class field (the raw bezier anchor/handle geometry), so an
    // OHLC-point array can't reuse that name.
    data;
    upColor;
    downColor;
    wickColor;
    bodyWidth;
    strokeWidth;
    wickStrokeWidth;
    candles = [];
    wicks = [];
    _candlesGroup = new VGroup();
    _wicksGroup = new VGroup();
    constructor(points, config = {}) {
        const n = points.length;
        const xRange = config.xRange ?? [0, Math.max(1, n), 1];
        const xLength = config.xLength ?? Math.max(1, n);
        const yLength = config.yLength ?? 6;
        const lows = points.map((p) => p.low);
        const highs = points.map((p) => p.high);
        const minY = points.length ? Math.min(...lows) : 0;
        const maxY = points.length ? Math.max(...highs) : 1;
        const span = maxY - minY;
        const pad = span > 0 ? span * 0.05 : 1;
        const yRange = config.yRange ?? [minY - pad, maxY + pad, Math.max(1e-9, (span + 2 * pad) / 5)];
        super({
            ...config,
            xRange,
            yRange,
            xLength,
            yLength,
        });
        this.data = points.map((p) => ({ ...p }));
        this.upColor = config.upColor ?? DEFAULT_UP_COLOR;
        this.downColor = config.downColor ?? DEFAULT_DOWN_COLOR;
        this.wickColor = config.wickColor;
        this.bodyWidth = config.bodyWidth ?? 0.6;
        this.strokeWidth = config.strokeWidth ?? 1;
        this.wickStrokeWidth = config.wickStrokeWidth ?? 2;
        this.add(this._candlesGroup, this._wicksGroup);
        this._build(this.data);
    }
    // World width (per unit x) for one category slot -- mirrors BarChart's
    // `_unitWidth`.
    _unitWidth() {
        return this.xAxis.unit;
    }
    _colorFor(p) {
        return p.close >= p.open ? this.upColor : this.downColor;
    }
    _build(points) {
        const slot = this._unitWidth();
        const width = slot * this.bodyWidth;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const xCenter = i + 0.5;
            const color = this._colorFor(p);
            const bodyTopVal = Math.max(p.open, p.close);
            const bodyBotVal = Math.min(p.open, p.close);
            const top = this.coordsToPoint(xCenter, bodyTopVal);
            const bottom = this.coordsToPoint(xCenter, bodyBotVal);
            const height = Math.abs(top[1] - bottom[1]);
            const body = new Rectangle({
                width,
                height: height <= 0 ? 1e-6 : height,
                point: [top[0], (top[1] + bottom[1]) / 2, 0],
                fillColor: color,
                fillOpacity: 1,
                strokeColor: color,
                strokeWidth: this.strokeWidth,
            });
            body.candleData = p;
            this.candles.push(body);
            this._candlesGroup.add(body);
            const lowPt = this.coordsToPoint(xCenter, p.low);
            const highPt = this.coordsToPoint(xCenter, p.high);
            const wick = new Line(lowPt, highPt, {
                strokeColor: this.wickColor ?? color,
                strokeWidth: this.wickStrokeWidth,
            });
            wick.candleData = p;
            this.wicks.push(wick);
            this._wicksGroup.add(wick);
        }
    }
    // Rebuild candles+wicks in place when point count is unchanged (identity
    // preserving, mirrors PieChart.setValues); otherwise replace the lists.
    setPoints(points) {
        const sameCount = points.length === this.data.length;
        this.data = points.map((p) => ({ ...p }));
        if (!sameCount) {
            this._candlesGroup.submobjects.length = 0;
            this._wicksGroup.submobjects.length = 0;
            this.candles.length = 0;
            this.wicks.length = 0;
            this._build(this.data);
            return this;
        }
        const slot = this._unitWidth();
        const width = slot * this.bodyWidth;
        for (let i = 0; i < this.data.length; i++) {
            const p = this.data[i];
            const xCenter = i + 0.5;
            const color = this._colorFor(p);
            const bodyTopVal = Math.max(p.open, p.close);
            const bodyBotVal = Math.min(p.open, p.close);
            const top = this.coordsToPoint(xCenter, bodyTopVal);
            const bottom = this.coordsToPoint(xCenter, bodyBotVal);
            const height = Math.abs(top[1] - bottom[1]);
            const fresh = new Rectangle({
                width,
                height: height <= 0 ? 1e-6 : height,
                point: [top[0], (top[1] + bottom[1]) / 2, 0],
            });
            const body = this.candles[i];
            body.points = fresh.points;
            body.subpathStarts = fresh.subpathStarts;
            body._straightPath = fresh._straightPath;
            body.setFill(color, 1);
            body.setStroke(color, this.strokeWidth);
            body.candleData = p;
            const lowPt = this.coordsToPoint(xCenter, p.low);
            const highPt = this.coordsToPoint(xCenter, p.high);
            const wick = this.wicks[i];
            wick.putStartAndEndOn(lowPt, highPt);
            wick.setStroke(this.wickColor ?? color, this.wickStrokeWidth);
            wick.candleData = p;
        }
        return this;
    }
    // Overlay a pre-computed moving-average series (the mobject itself stays
    // statistics-agnostic: callers compute MA5/MA10/... and pass the values
    // in). Plots via `plotLineGraph` with `addVertexDots: false`, then --
    // since `plotLineGraph` has no built-in `smooth` option in this codebase
    // yet -- falls back to `VMobject.setPointsSmoothly` directly when
    // `config.smooth` is requested. Adds the resulting line group to the chart
    // and returns it.
    addMovingAverageLine(values, config = {}) {
        const color = config.color ?? "#FFA500";
        const xValues = [];
        const yValues = [];
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            if (v == null || typeof v !== "number" || Number.isNaN(v))
                continue;
            xValues.push(i + 0.5);
            yValues.push(v);
        }
        const group = this.plotLineGraph(xValues, yValues, { addVertexDots: false, lineColor: color });
        if (config.smooth && xValues.length > 0) {
            const line = group.submobjects[0];
            const anchors = xValues.map((x, i) => this.coordsToPoint(x, yValues[i]));
            line.setPointsSmoothly(anchors);
        }
        this.add(group);
        return group;
    }
}
//# sourceMappingURL=candlestick.js.map