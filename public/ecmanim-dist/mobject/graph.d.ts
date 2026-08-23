import { VMobject } from "./VMobject.ts";
import { Mobject } from "./Mobject.ts";
export type VertexId = any;
export type EdgeTuple = [VertexId, VertexId];
export type LayoutName = "spring" | "circular" | "random" | "planar" | "shell";
export interface GraphConfig {
    /** Layout algorithm name, or an explicit { id: [x, y, z] } position dict. */
    layout?: LayoutName | Record<string, number[]>;
    /** Uniform scale applied to the computed layout. Default 2. */
    layout_scale?: number;
    /** Extra parameters forwarded to the layout function. */
    layout_config?: Record<string, any>;
    /** Constructor used for each vertex mobject. Default Dot. */
    vertex_type?: new (...args: any[]) => Mobject;
    /** Per-vertex or global config passed to the vertex constructor. */
    vertex_config?: Record<string, any>;
    /** Constructor used for each edge mobject. Default Line / Arrow. */
    edge_type?: new (...args: any[]) => any;
    /** Per-edge or global config passed to the edge constructor. */
    edge_config?: Record<string, any>;
    /** `true` for auto integer labels, or a { id: string|Mobject } dict. */
    labels?: boolean | Record<string, string | Mobject>;
}
export declare class GenericGraph extends VMobject {
    /** Map of String(id) -> vertex mobject. */
    vertices: Map<string, Mobject>;
    /** Map of "u,v" (String) -> edge mobject. */
    edges: Map<string, any>;
    _vertexIds: VertexId[];
    _edgeTuples: EdgeTuple[];
    _layout: Record<string, number[]>;
    _layoutScale: number;
    _config: GraphConfig;
    _directed: boolean;
    _labelsById: Map<string, Mobject>;
    constructor(vertices?: VertexId[], edges?: EdgeTuple[], config?: GraphConfig, directed?: boolean);
    static edgeKey(u: VertexId, v: VertexId): string;
    _position(id: VertexId): number[];
    _buildVertex(id: VertexId): Mobject;
    _makeEdge(u: VertexId, v: VertexId): any;
    _buildEdge(u: VertexId, v: VertexId): any;
    _vertexCenter(id: VertexId): number[];
    /** Reposition every edge so its endpoints follow the current vertex centers. */
    updateEdges(): this;
    _centerOfKey(key: string): number[];
    /** Add one or more vertices (with optional positions in layout_config.positions). */
    addVertices(...ids: VertexId[]): Mobject[];
    /** Remove vertices and any incident edges. */
    removeVertices(...ids: VertexId[]): this;
    /** Add one or more edges given as [u, v] pairs. */
    addEdges(...edges: EdgeTuple[]): any[];
    /** Remove one or more edges given as [u, v] pairs. */
    removeEdges(...edges: EdgeTuple[]): this;
    /** All vertex mobjects, in insertion order. */
    getVertexMobjects(): Mobject[];
    /** All edge mobjects, in insertion order. */
    getEdgeMobjects(): any[];
    /** The vertex mobject for a given id (manim's Graph.__getitem__). */
    getVertex(id: VertexId): Mobject | undefined;
    /** Convenience alias mirroring Python's `graph[id]`. */
    __getitem__(id: VertexId): Mobject | undefined;
    /** The edge mobject for a given [u, v] pair. */
    getEdge(u: VertexId, v: VertexId): any;
    /** Attach updateEdges as a per-frame updater so edges track moving vertices. */
    addEdgeUpdater(): this;
}
/** Undirected graph (edges are Lines by default). */
export declare class Graph extends GenericGraph {
    constructor(vertices?: VertexId[], edges?: EdgeTuple[], config?: GraphConfig);
}
/** Directed graph (edges are Arrows by default). */
export declare class DiGraph extends GenericGraph {
    constructor(vertices?: VertexId[], edges?: EdgeTuple[], config?: GraphConfig);
}
export default Graph;
//# sourceMappingURL=graph.d.ts.map