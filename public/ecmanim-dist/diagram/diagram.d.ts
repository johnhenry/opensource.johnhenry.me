import { VGroup } from "../mobject/VMobject.ts";
export interface DiagramNode {
    id: string;
    label: string;
}
export interface DiagramEdge {
    from: string;
    to: string;
    label?: string;
}
export interface DiagramGraph {
    nodes: DiagramNode[];
    edges: DiagramEdge[];
}
/**
 * Parse a small diagram DSL. Supported per line:
 *   A                      a bare node
 *   A[Label text]          a node with a label
 *   A --> B                an edge
 *   A -- label --> B       a labeled edge
 * Node ids are auto-created on first use. Blank lines / `//` comments ignored.
 */
export declare function parseDiagram(dsl: string): DiagramGraph;
export interface LayoutOptions {
    /** Horizontal spacing between layers (default 3). */
    layerGap?: number;
    /** Vertical spacing between nodes in a layer (default 1.6). */
    nodeGap?: number;
    /** "layered" (default, left→right by depth) or "circular". */
    algorithm?: "layered" | "circular";
}
/** Deterministic layout → node id → [x, y, 0]. */
export declare function layoutDiagram(graph: DiagramGraph, opts?: LayoutOptions): Map<string, number[]>;
export interface BoardOptions extends LayoutOptions {
    nodeColor?: string;
    edgeColor?: string;
    textColor?: string;
    fontSize?: number;
}
/** Build a board: a VGroup of node + edge mobjects, each tagged with a `matchId`. */
export declare function buildBoard(graph: DiagramGraph, opts?: BoardOptions): VGroup;
/** Convenience: parse DSL and build a board in one call. */
export declare function diagram(dsl: string, opts?: BoardOptions): VGroup;
//# sourceMappingURL=diagram.d.ts.map