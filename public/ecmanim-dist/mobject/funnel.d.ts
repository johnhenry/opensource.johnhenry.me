import { VGroup } from "./VMobject.ts";
import { Polygon } from "./geometry.ts";
import { Text } from "./text/Text.ts";
import type { ColorLike } from "../core/types.ts";
export interface FunnelStage {
    name: string;
    value: number;
}
export interface FunnelChartConfig {
    /** Total chart width in world units (default 4). */
    width?: number;
    /** Total chart height in world units (default 4). */
    height?: number;
    /** Stage ordering (default 'descending', matching ECharts' default). */
    sort?: "descending" | "ascending" | "none";
    /** Vertical gap between stages, world units (default 0.05). */
    gap?: number;
    /** Min stage width as a fraction of `width` (default 0 — ECharts' minSize: '0%'). */
    minSizeRatio?: number;
    /** Max stage width as a fraction of `width` (default 1 — ECharts' maxSize: '100%'). */
    maxSizeRatio?: number;
    /** Stage fill colors, cycled when there are more stages than colors. */
    colors?: ColorLike[];
    strokeColor?: ColorLike;
    strokeWidth?: number;
    fillOpacity?: number;
    /** Show a centered label inside each trapezoid (default true). */
    showLabels?: boolean;
    labelFontSize?: number;
    labelColor?: ColorLike;
}
/**
 * A funnel chart: one tapering trapezoid per stage, stacked top-to-bottom,
 * sorted by value (descending by default). `stages` (the Polygon trapezoids,
 * in SORTED/rendered order) and `labels` are addressable for per-stage
 * animation; `setStages()` rebuilds the geometry IN PLACE when the stage
 * count is unchanged — the Polygon mobjects keep their identity, so
 * updaters, Transforms, and references to `chart.stages[i]` stay valid.
 */
export declare class FunnelChart extends VGroup {
    stagesData: FunnelStage[];
    readonly stages: Polygon[];
    readonly labels: Text[];
    private readonly _config;
    private readonly _stagesGroup;
    private readonly _labelsGroup;
    constructor(stages: FunnelStage[], config?: FunnelChartConfig);
    private _sortStages;
    private _layout;
    private _colorFor;
    private _makeStage;
    private _labelText;
    private _buildLabels;
    private _build;
    /**
     * Rebuild the chart from a new set of stages, in place. With the same
     * stage COUNT, each existing Polygon's points/subpathStarts are rewritten
     * (identity preserved — Transform-friendly); a changed count replaces the
     * stage list. Labels are always regenerated.
     */
    setStages(stages: FunnelStage[]): this;
}
//# sourceMappingURL=funnel.d.ts.map