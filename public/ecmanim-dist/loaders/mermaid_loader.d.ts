import { SVGMobject } from "../mobject/svg_mobject.ts";
import type { SVGMobjectConfig } from "../mobject/svg_mobject.ts";
import { VGroup } from "../mobject/VMobject.ts";
export declare function inlineSvgStyles(svgEl: any): void;
export declare function normalizeStrokeWidths(svgEl: any): void;
export declare function cropSvgToViewBox(svgEl: any): void;
/** Options for headless mermaid rendering. */
export interface MermaidRenderConfig {
    /** mermaid theme name ("default", "dark", "forest", "neutral", "base"). */
    theme?: string;
    /** Extra options merged into mermaid.initialize(). Note htmlLabels is
     *  forced OFF: the headless pipeline measures/loads svg-text labels only. */
    mermaidConfig?: Record<string, unknown>;
}
/** Render mermaid source to a raw SVG string, fully headless (no browser).
 *  Requires the optional 'mermaid' and 'jsdom' packages. */
export declare function renderMermaidSvg(source: string, config?: MermaidRenderConfig): Promise<string>;
/** Normalized diagram type names. */
export type MermaidDiagramType = "flowchart" | "sequence" | "state" | "class" | "er" | "pie" | "gantt" | "git" | "journey" | "timeline" | "mindmap" | "quadrant" | "unknown";
/** Extra options for loadMermaid / DiagramMobject. */
export interface MermaidLoadConfig extends SVGMobjectConfig, MermaidRenderConfig {
}
/** A rendered mermaid diagram as an SVGMobject, with mermaid-aware friendly
 *  ids layered over the raw SVG element ids. */
export declare class DiagramMobject extends SVGMobject {
    /** Normalized diagram type ("flowchart", "sequence", "state", ...). */
    readonly diagramType: MermaidDiagramType;
    /** friendly id → raw SVG ids (render-instance prefixes intact). */
    readonly friendlyIds: Map<string, string[]>;
    private readonly _nodeIds;
    private readonly _edgeIds;
    private readonly _labels;
    constructor(svgString: string, config?: SVGMobjectConfig, options?: {
        renderId?: string;
        sourceKeyword?: string;
    });
    /** Every extracted text label (marked `__isDiagramLabel`), as a VGroup of
     *  the SAME Text instances living in this diagram's tree — so scenes can
     *  restyle them or exclude them from geometry-only effects. */
    labels(): VGroup;
    /** Friendly node ids for this diagram (see the per-type conventions). */
    nodeIds(): string[];
    /** Friendly edge ids for this diagram (empty for types without edge ids). */
    edgeIds(): string[];
    hasId(id: string): boolean;
    /** Look up by raw SVG id OR friendly mermaid id ("A", "Alice", "L_A_B_0"). */
    byId(id: string): VGroup;
}
/** Render mermaid source headlessly and load it as a DiagramMobject. */
export declare function loadMermaid(source: string, config?: MermaidLoadConfig): Promise<DiagramMobject>;
export default loadMermaid;
//# sourceMappingURL=mermaid_loader.d.ts.map