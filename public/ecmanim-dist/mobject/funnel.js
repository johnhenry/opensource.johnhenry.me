// FunnelChart: a stack of tapering trapezoid stages, ECharts-funnel parity
// mobject (see examples/echarts-parity/ref/07-funnel.js). Not an Axes-based
// chart like BarChart (probability.ts) — like PieChart (charts.ts) it lays
// out its own local coordinate space (origin at the chart's center) and is a
// plain VGroup.
//
// Each stage is a 4-vertex Polygon (geometry.ts) whose top edge width comes
// from THIS stage's value and whose bottom edge width comes from the NEXT
// stage's value (or its own, for the last stage) — the classic funnel taper.
// Stage widths map from value -> half-width via scaleLinear (core/scales.ts),
// same idea as d3/ECharts' minSize/maxSize percentage mapping.
import { VGroup } from "./VMobject.js";
import { Polygon } from "./geometry.js";
import { Text } from "./text/Text.js";
import { scaleLinear } from "../core/scales.js";
import { BLUE, YELLOW, RED, GREEN, PURPLE, ORANGE, TEAL, PINK, WHITE } from "../core/color.js";
const DEFAULT_STAGE_COLORS = [BLUE, YELLOW, RED, GREEN, PURPLE, ORANGE, TEAL, PINK];
/**
 * A funnel chart: one tapering trapezoid per stage, stacked top-to-bottom,
 * sorted by value (descending by default). `stages` (the Polygon trapezoids,
 * in SORTED/rendered order) and `labels` are addressable for per-stage
 * animation; `setStages()` rebuilds the geometry IN PLACE when the stage
 * count is unchanged — the Polygon mobjects keep their identity, so
 * updaters, Transforms, and references to `chart.stages[i]` stay valid.
 */
export class FunnelChart extends VGroup {
    stagesData;
    stages = [];
    labels = [];
    _config;
    _stagesGroup = new VGroup();
    _labelsGroup = new VGroup();
    constructor(stages, config = {}) {
        super();
        this.stagesData = [...stages];
        this._config = config;
        this.add(this._stagesGroup, this._labelsGroup);
        this._build();
    }
    // Stable sort (copies input, never mutates it) per `config.sort`.
    _sortStages(stages) {
        const { sort = "descending" } = this._config;
        if (sort === "none")
            return [...stages];
        const indexed = stages.map((s, i) => ({ s, i }));
        if (sort === "descending") {
            indexed.sort((a, b) => b.s.value - a.s.value || a.i - b.i);
        }
        else {
            indexed.sort((a, b) => a.s.value - b.s.value || a.i - b.i);
        }
        return indexed.map((x) => x.s);
    }
    _layout(sorted) {
        const { width = 4, height = 4, gap = 0.05, minSizeRatio = 0, maxSizeRatio = 1, } = this._config;
        const n = sorted.length;
        if (n === 0)
            return [];
        const maxValue = Math.max(...sorted.map((s) => s.value), 0);
        const scale = scaleLinear([0, maxValue || 1], [(width * minSizeRatio) / 2, (width * maxSizeRatio) / 2]);
        const halfWidths = sorted.map((s) => scale(s.value));
        const rowHeight = (height - gap * Math.max(0, n - 1)) / n;
        const out = [];
        let topY = height / 2;
        for (let i = 0; i < n; i++) {
            const bottomY = topY - rowHeight;
            const topHalfWidth = halfWidths[i];
            const bottomHalfWidth = i < n - 1 ? halfWidths[i + 1] : halfWidths[i];
            out.push({
                corners: [
                    [-topHalfWidth, topY, 0],
                    [topHalfWidth, topY, 0],
                    [bottomHalfWidth, bottomY, 0],
                    [-bottomHalfWidth, bottomY, 0],
                ],
                topHalfWidth,
                bottomHalfWidth,
                centerY: (topY + bottomY) / 2,
            });
            topY = bottomY - gap;
        }
        return out;
    }
    _colorFor(index) {
        const colors = this._config.colors ?? DEFAULT_STAGE_COLORS;
        if (!colors.length)
            return WHITE;
        return colors[index % colors.length];
    }
    _makeStage(layout, i) {
        const { strokeColor, strokeWidth = 1, fillOpacity = 1 } = this._config;
        const color = this._colorFor(i);
        return new Polygon(layout.corners, {
            fillColor: color,
            fillOpacity,
            strokeColor: strokeColor ?? WHITE,
            strokeWidth,
        });
    }
    // Label text for a stage. Default: the stage name only (matching ECharts'
    // default inside label). Callers wanting "name: value" can build their own
    // labels off `stagesData`/`stages` instead.
    _labelText(stage) {
        return stage.name;
    }
    _buildLabels(sorted, layouts) {
        const { showLabels = true, labelFontSize = 0.3, labelColor } = this._config;
        this._labelsGroup.submobjects.length = 0;
        this.labels.length = 0;
        if (!showLabels)
            return;
        sorted.forEach((stage, i) => {
            const layout = layouts[i];
            const label = new Text(this._labelText(stage), {
                fontSize: labelFontSize,
                ...(labelColor !== undefined ? { color: labelColor } : {}),
            });
            label.moveTo([0, layout.centerY, 0]);
            this.labels.push(label);
        });
        this._labelsGroup.add(...this.labels);
    }
    _build() {
        const sorted = this._sortStages(this.stagesData);
        this.stagesData = sorted;
        const layouts = this._layout(sorted);
        layouts.forEach((layout, i) => {
            this.stages.push(this._makeStage(layout, i));
        });
        this._stagesGroup.add(...this.stages);
        this._buildLabels(sorted, layouts);
    }
    /**
     * Rebuild the chart from a new set of stages, in place. With the same
     * stage COUNT, each existing Polygon's points/subpathStarts are rewritten
     * (identity preserved — Transform-friendly); a changed count replaces the
     * stage list. Labels are always regenerated.
     */
    setStages(stages) {
        const sorted = this._sortStages(stages);
        this.stagesData = sorted;
        const layouts = this._layout(sorted);
        if (layouts.length === this.stages.length) {
            layouts.forEach((layout, i) => {
                this.stages[i].setPointsAsCorners([...layout.corners, layout.corners[0]]);
                this.stages[i].vertices = layout.corners;
            });
        }
        else {
            this._stagesGroup.submobjects.length = 0;
            this.stages.length = 0;
            layouts.forEach((layout, i) => this.stages.push(this._makeStage(layout, i)));
            this._stagesGroup.add(...this.stages);
        }
        this._buildLabels(sorted, layouts);
        return this;
    }
}
//# sourceMappingURL=funnel.js.map