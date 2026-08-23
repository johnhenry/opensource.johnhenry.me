import { VMobject, VGroup } from "./VMobject.ts";
import { Text } from "./text/Text.ts";
import type { ColorLike } from "../core/types.ts";
export interface PieChartConfig {
    /** Outer radius in world units (default 2). */
    radius?: number;
    /** Slice fill colors, cycled when there are more slices than colors. */
    colors?: ColorLike[];
    /** Angle of the FIRST slice's leading edge (default TAU/4 — 12 o'clock). */
    startAngle?: number;
    /** Inner radius > 0 makes a donut (default 0). */
    innerRadius?: number;
    /** Gap between adjacent slices, in radians (default 0). */
    gapAngle?: number;
    /** ECharts `roseType`: 'radius' → equal angle per slice, radius linear in
     *  value; 'area' → equal angle per slice, radius ∝ sqrt(value) so slice
     *  AREA is linear in value. Omitted (default) → the classic pie: angle
     *  proportional to value, one shared radius. */
    roseType?: "radius" | "area";
    /** true → percentage labels; or explicit label strings (one per value). */
    labels?: boolean | string[];
    /** Custom label text from (value, index, fraction). Implies labels on. */
    labelFormat?: (value: number, index: number, fraction: number) => string;
    /** Label font size in world units (default 0.4). */
    labelFontSize?: number;
    labelColor?: ColorLike;
    strokeColor?: ColorLike;
    strokeWidth?: number;
    fillOpacity?: number;
}
/**
 * A pie / donut chart: one sector per value, angles proportional to the
 * values, laid out clockwise from `startAngle`. `slices` (and `labels`, when
 * enabled) are addressable for per-slice animation; `setValues()` rebuilds
 * the geometry IN PLACE — the slice mobjects keep their identity, so
 * updaters, Transforms, and references to `chart.slices[i]` stay valid.
 */
export declare class PieChart extends VGroup {
    values: number[];
    readonly slices: VMobject[];
    readonly labels: Text[];
    private readonly _config;
    private readonly _slicesGroup;
    private readonly _labelsGroup;
    constructor(values: number[], config?: PieChartConfig);
    private _sliceGeometry;
    private _makeSlice;
    private _labelText;
    private _labelRadius;
    private _buildLabels;
    private _build;
    /**
     * Update the chart to new values, rebuilding geometry in place. With the
     * same number of values, each existing slice mobject's points are rewritten
     * (identity preserved — Transform-friendly); a changed count replaces the
     * slice list. Labels are always regenerated.
     */
    setValues(values: number[]): this;
}
//# sourceMappingURL=charts.d.ts.map