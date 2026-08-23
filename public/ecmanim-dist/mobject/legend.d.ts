import { VMobject, VGroup } from "./VMobject.ts";
import { Rectangle } from "./geometry.ts";
import { Text } from "./text/Text.ts";
import type { ColorLike } from "../core/types.ts";
export interface LegendItem {
    label: string;
    color: ColorLike;
    /** Swatch shape (default 'rect'). */
    shape?: "rect" | "circle" | "line";
}
export interface LegendConfig {
    /** Stack items top-to-bottom ('vertical', default) or left-to-right. */
    orientation?: "horizontal" | "vertical";
    /** Spacing between item rows (vertical) or item pairs (horizontal). */
    itemSpacing?: number;
    swatchSize?: number;
    fontSize?: number;
    textColor?: ColorLike;
    /** Gap between a swatch and its label. */
    gap?: number;
}
/**
 * A categorical legend: one color swatch + one text label per item, stacked
 * vertically or flowed horizontally. `swatches`/`labels` are addressable for
 * per-item animation; `setItems()` rebuilds IN PLACE — with the same item
 * count, swatch mobjects keep their identity (geometry/color rewritten, same
 * convention as `PieChart.setValues`); labels are always regenerated (their
 * glyph geometry is a function of text content).
 */
export declare class Legend extends VGroup {
    items: LegendItem[];
    readonly swatches: VMobject[];
    readonly labels: Text[];
    private readonly _config;
    private readonly _swatchesGroup;
    private readonly _labelsGroup;
    constructor(items: LegendItem[], config?: LegendConfig);
    private _makeSwatch;
    private _makeLabel;
    /** Place `swatch` + `label` for row/column `i`, chaining off `prevLabel` in horizontal mode. */
    private _position;
    private _build;
    setItems(items: LegendItem[]): this;
}
export interface ColorBarConfig {
    /** Bar thickness (short axis), default 0.4. */
    width?: number;
    /** Bar extent along its long axis, default 3. */
    length?: number;
    orientation?: "horizontal" | "vertical";
    /** [min, max] value range the bar represents, default [0, 1]. */
    domain?: [number, number];
    /** t in [0,1] -> color. Default `interpolateViridis` (color_schemes.ts) — a
     *  perceptually-uniform sequential ramp, the conventional default for a
     *  value->color legend when no scheme is specified (matplotlib/d3 both
     *  default sequential colormaps to viridis for the same reason). */
    interpolator?: (t: number) => ColorLike;
    tickCount?: number;
    tickFontSize?: number;
    tickFormat?: (value: number) => string;
    textColor?: ColorLike;
    /** Optional title, placed above the bar. */
    label?: string;
    labelFontSize?: number;
}
/**
 * A gradient swatch bar with numeric tick labels — the widget behind
 * ECharts' `visualMap` (see examples/echarts-parity/ref/04-scatter-visualmap.js)
 * and any other value->color legend.
 *
 * The gradient fill reuses the multi-stop `gradientColors`/`sheenDirection`
 * mechanism VMobject already exposes generically (the same fields
 * `Axes.getArea()` sets on its Polygon for a gradient-colored area — see
 * coordinate_systems.ts) rather than approximating the ramp with N adjacent
 * solid rectangles: both CanvasRenderer._buildGradient and the SVG renderer
 * read `gradientColors` as an arbitrary-length stop list (not limited to 2
 * colors), so a plain `Rectangle` with 32 sampled stops renders a smooth
 * `ctx.createLinearGradient` ramp for free.
 */
export declare class ColorBar extends VGroup {
    domain: [number, number];
    readonly bar: Rectangle;
    readonly ticks: Text[];
    label?: Text;
    private readonly _config;
    private readonly _ticksGroup;
    constructor(config?: ColorBarConfig);
    private get _orientation();
    private _makeBar;
    private _tickFrac;
    private _tickPoint;
    private _buildTicks;
    private _positionLabel;
    /**
     * Update the value range. Tick *positions* are a function of orientation
     * geometry only (fixed fractions along the bar), so only the tick label
     * *text* changes; the gradient itself is domain-independent (the
     * interpolator takes a normalized t, not a raw value) so it's left as-is.
     * Ticks are regenerated wholesale (same rationale as Legend's labels).
     */
    setDomain(domain: [number, number]): this;
}
//# sourceMappingURL=legend.d.ts.map