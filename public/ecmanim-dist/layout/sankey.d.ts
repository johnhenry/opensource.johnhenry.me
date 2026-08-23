export interface SankeyNode {
    index?: number;
    /** Optional override for the computed node value. */
    fixedValue?: number;
    sourceLinks?: SankeyLink[];
    targetLinks?: SankeyLink[];
    value?: number;
    /** Shortest path length from a source (left BFS layer). */
    depth?: number;
    /** Shortest path length to a sink (right BFS layer). */
    height?: number;
    /** Final column index after applying the align strategy. */
    layer?: number;
    x0?: number;
    x1?: number;
    y0?: number;
    y1?: number;
    [key: string]: unknown;
}
export interface SankeyLink {
    /** Node id (resolved via nodeId) or node object. */
    source: unknown;
    target: unknown;
    value: number;
    index?: number;
    y0?: number;
    y1?: number;
    width?: number;
    [key: string]: unknown;
}
export interface SankeyGraph {
    nodes: SankeyNode[];
    links: SankeyLink[];
}
export type SankeyAlign = "justify" | "left" | "right" | "center";
export interface SankeyOptions {
    /** Node id accessor for resolving link endpoints. Default: d => d.index. */
    nodeId?: (node: SankeyNode, i: number, nodes: SankeyNode[]) => unknown;
    /** Horizontal alignment strategy. Default "justify". */
    nodeAlign?: SankeyAlign | ((node: SankeyNode, n: number) => number);
    /** Node rectangle width (x1 - x0). Default 24. */
    nodeWidth?: number;
    /** Minimum vertical gap between nodes in a column. Default 8. */
    nodePadding?: number;
    /** Layout extent [[x0, y0], [x1, y1]]. Default [[0, 0], [1, 1]]. */
    extent?: [[number, number], [number, number]];
    /** Optional comparator for nodes within a column (disables breadth sort). */
    nodeSort?: (a: SankeyNode, b: SankeyNode) => number;
    /** Optional comparator for links (disables breadth link reordering). */
    linkSort?: (a: SankeyLink, b: SankeyLink) => number;
    /** Relaxation iterations. Default 6. */
    iterations?: number;
}
/**
 * Create a sankey layout function. Call the returned function with
 * `{nodes, links}`; it assigns node {x0, x1, y0, y1, value, depth, height,
 * layer} and link {y0, y1, width} in place and returns the graph.
 */
export declare function sankey(options?: SankeyOptions): (graph: SankeyGraph) => SankeyGraph;
export type Point2 = [number, number];
/**
 * The cubic bezier of d3's sankeyLinkHorizontal for a laid-out link:
 * starts at [source.x1, link.y0], ends at [target.x0, link.y1], with
 * horizontal tangents -- both control points sit at the horizontal midpoint
 * (curveBumpX): c1 = [mx, y0], c2 = [mx, y1].
 *
 * With no `samples`, returns the 4 control points
 * [[x0, y0], [c1x, c1y], [c2x, c2y], [x1, y1]] ready for
 * VMobject.addCubicBezier. With `samples` (>= 2), returns that many points
 * evaluated along the cubic instead (a polyline approximation).
 *
 * Note: the returned centerline should be stroked with width `link.width`
 * to render the ribbon, exactly like d3's stroked-path convention.
 */
export declare function sankeyLinkHorizontalPoints(link: SankeyLink, samples?: number): Point2[];
//# sourceMappingURL=sankey.d.ts.map