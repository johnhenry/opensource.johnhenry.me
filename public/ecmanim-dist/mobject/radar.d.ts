import { VGroup } from "./VMobject.ts";
import { Polygon } from "./geometry.ts";
import { Text } from "./text/Text.ts";
import type { ColorLike } from "../core/types.ts";
export interface RadarIndicator {
    name: string;
    max: number;
    min?: number;
}
export interface RadarSeriesInput {
    name?: string;
    values: number[];
}
export interface RadarChartConfig {
    indicators: RadarIndicator[];
    /** Outer radius in world units (default 2). */
    radius?: number;
    /** Angle of the FIRST axis (default TAU/4 — 12 o'clock). */
    startAngle?: number;
    /** Shape of the concentric grid rings (default 'polygon'). */
    shape?: "polygon" | "circle";
    /** Number of concentric grid rings (default 5). */
    rings?: number;
    /** Series fill/stroke colors, cycled when there are more series than colors. */
    colors?: ColorLike[];
    strokeWidth?: number;
    fillOpacity?: number;
    labelFontSize?: number;
    /** Indicator-name label color (default WHITE, matching Text's own default —
     *  set this explicitly on a light/white background scene or the labels
     *  render invisibly). */
    labelColor?: ColorLike;
    /** Show indicator name labels at spoke tips (default true). */
    showLabels?: boolean;
}
/**
 * A radar / spider chart: N indicator axes radiating from the center, one
 * filled `Polygon` per series. `grid` (spokes + concentric rings) and
 * `seriesPolygons` are addressable for per-element animation; `setValues()`
 * rebuilds series geometry IN PLACE — the polygon mobjects keep their
 * identity when the series count is unchanged, so updaters, Transforms, and
 * references to `chart.seriesPolygons[i]` stay valid.
 */
export declare class RadarChart extends VGroup {
    series: RadarSeriesInput[];
    readonly indicators: RadarIndicator[];
    readonly grid: VGroup;
    readonly seriesPolygons: Polygon[];
    readonly labels: Text[];
    private readonly _config;
    private readonly _labelsGroup;
    private readonly _seriesGroup;
    private readonly _axes;
    constructor(series: RadarSeriesInput[], config: RadarChartConfig);
    private _buildAxes;
    private _radius;
    /** World point on axis `i` at fraction `frac` (0 = center, 1 = radius). */
    private _axisPoint;
    private _valueFraction;
    private _buildGrid;
    private _buildLabels;
    private _seriesVertices;
    private _makeSeriesPolygon;
    private _buildSeries;
    /**
     * Update the chart to new series data, rebuilding series geometry in
     * place. With the same number of series, each existing polygon mobject's
     * points are rewritten (identity preserved — Transform-friendly); a
     * changed series count replaces the polygon list. Grid and labels are
     * unaffected (they depend only on `indicators`).
     */
    setValues(series: RadarSeriesInput[]): this;
}
//# sourceMappingURL=radar.d.ts.map