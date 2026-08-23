import { VMobject, VGroup } from "./VMobject.ts";
import { Text } from "./text/Text.ts";
import type { ColorLike } from "../core/types.ts";
/** A color band from the previous band's `to` (or `min`, for the first
 *  band) up to this band's `to`. Mirrors ECharts' `axisLine.lineStyle.color`
 *  list-of-[fraction,color] convention, simplified to a cumulative value. */
export interface GaugeBand {
    to: number;
    color: ColorLike;
}
export interface GaugeChartConfig {
    /** Value at the start of the dial (default 0). */
    min?: number;
    /** Value at the end of the dial (default 100). */
    max?: number;
    /** Sweep start angle in radians (default 225°, ECharts' default). */
    startAngle?: number;
    /** Sweep end angle in radians (default -45° — a 270° total clockwise
     *  sweep from `startAngle`, ECharts' default). */
    endAngle?: number;
    /** Outer radius of the dial, in world units (default 2). */
    radius?: number;
    /** Color bands along the dial. Defaults to a 3-band ECharts-style ramp
     *  spanning [min, max] (20% / 60% / 20% of the range). */
    bands?: GaugeBand[];
    /** Radial thickness of the band track (default radius*0.15). A track
     *  width >= radius fills all the way to the center (drawn as `Sector`s
     *  instead of `AnnularSector`s). */
    trackWidth?: number;
    needleColor?: ColorLike;
    /** Needle base width as a fraction of the radius (default 0.04). */
    needleWidthRatio?: number;
    /** Number of evenly-spaced tick labels from min to max (default 5). */
    tickCount?: number;
    tickFontSize?: number;
    /** Tick label color (default WHITE, matching Text's own default — set this
     *  explicitly on a light/white background scene or the ticks render
     *  invisibly, same footgun as any bare `Text` mobject in this codebase). */
    tickColor?: ColorLike;
    /** Show the big value label at the center-bottom of the dial (default true). */
    showValueLabel?: boolean;
    valueFormat?: (value: number) => string;
    valueFontSize?: number;
    /** Value label color (default WHITE — see `tickColor`'s note). */
    valueColor?: ColorLike;
}
/**
 * A gauge/dial chart: a colored band track sweeping `startAngle` ->
 * `endAngle`, tick labels around the outside, a needle pointing at the
 * current value, and (by default) a big center value label. `needle` keeps
 * its mobject identity across `setValue()` (rotated in place, cheap enough
 * to call every frame from a `ValueTracker` updater); `bandSectors` and
 * `tickLabels` are addressable per-segment like PieChart's `slices`/`labels`.
 */
export declare class GaugeChart extends VGroup {
    value: number;
    readonly needle: VMobject;
    readonly bandSectors: VMobject[];
    readonly tickLabels: Text[];
    readonly valueLabel: Text | null;
    private readonly _config;
    private _currentAngle;
    private readonly _trackGroup;
    private readonly _tickGroup;
    constructor(value: number, config?: GaugeChartConfig);
    /** Map a value in [min, max] to its dial angle (radians), clamping first. */
    angleForValue(value: number): number;
    /** The needle's current dial angle (radians), for tests/introspection. */
    get needleAngle(): number;
    private _buildTrack;
    private _buildTicks;
    private _buildNeedle;
    private _buildValueLabel;
    /**
     * Update the gauge to a new value, rebuilding the needle rotation and
     * value label IN PLACE. The needle mobject is rotated (not rebuilt), and
     * the value label is regenerated then merged in via `become()` (the same
     * identity-preserving primitive `alwaysRedraw()` uses) — both mobjects
     * keep their identity, so this is cheap enough to call every frame from a
     * ValueTracker updater.
     */
    setValue(value: number): this;
}
//# sourceMappingURL=gauge.d.ts.map