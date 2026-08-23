/**
 * Hierarchy layouts — a faithful TypeScript port of d3-hierarchy.
 *
 * Pure math, isomorphic (no renderer/mobject imports, no `node:` imports).
 *
 * Provides:
 *   - hierarchy(data, children?)          — node model (sum/count/sort/traversal/links)
 *   - stratify({id, parentId} | {path})   — tabular input → node model
 *   - treemap()                            — squarify/binary/slice/dice/sliceDice tiling → {x0, y0, x1, y1}
 *   - partition()                          — icicle bands → {x0, y0, x1, y1} (map to polar for sunburst)
 *   - pack()                               — front-chain circle packing + Welzl enclose → {x, y, r}
 *   - tree()                               — Buchheim et al. linear-time tidy tree → {x, y}
 *   - cluster()                            — dendrogram, leaves at equal depth → {x, y}
 *
 * Coordinate conventions match d3 exactly so d3 ports translate 1:1:
 *   - treemap/partition: origin top-left of the [0,0,w,h] region; y grows down;
 *     partition assigns y bands by depth (root band at y0 = 0).
 *   - pack: root circle centered at (w/2, h/2).
 *   - tree/cluster with size([w,h]): x in [0,w] (breadth), y in [0,h] (depth;
 *     root at y = 0). With nodeSize([dx,dy]): root at (0,0), siblings dx apart.
 *   - pack() and pack/enclose randomization uses d3's own deterministic LCG,
 *     so results are reproducible and identical to d3's.
 *
 * Known (intentional) divergences from d3-hierarchy — noted inline too:
 *   - stratify(options?) accepts an options object ({id, parentId} or {path})
 *     in addition to d3's fluent .id()/.parentId()/.path() accessors (both work).
 *   - node.copy() is not provided (not needed by the campaign; everything else
 *     from the d3 node model is here, including node.path()).
 */
export interface HierarchyLink<T> {
    source: HierarchyNode<T>;
    target: HierarchyNode<T>;
}
export declare class HierarchyNode<T> {
    data: T;
    depth: number;
    height: number;
    parent: HierarchyNode<T> | null;
    children?: HierarchyNode<T>[];
    /** Set by sum()/count(). */
    value?: number;
    /** Set by stratify(). */
    id?: string;
    /** Set by treemap()/partition(). */
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
    /** Set by pack() (x, y, r) and tree()/cluster() (x, y). */
    x?: number;
    y?: number;
    r?: number;
    constructor(data: T);
    /**
     * Post-order aggregation. Matches d3 exactly: node.value = the node's OWN
     * value (+value(node.data) || 0, so NaN/negative-coercion follows d3) PLUS
     * the sum of its children's already-computed values.
     */
    sum(value: (d: T) => number): this;
    /** node.value = number of leaves under (and including) the node. */
    count(): this;
    /**
     * Breadth-first traversal (same order as the node iterator / descendants()).
     */
    each(callback: (node: HierarchyNode<T>, index: number, root: this) => void, that?: unknown): this;
    /** Post-order traversal (children before parents). */
    eachAfter(callback: (node: HierarchyNode<T>, index: number, root: this) => void, that?: unknown): this;
    /** Pre-order traversal (parents before children). */
    eachBefore(callback: (node: HierarchyNode<T>, index: number, root: this) => void, that?: unknown): this;
    /** First node (in breadth-first order) for which callback returns truthy. */
    find(callback: (node: HierarchyNode<T>, index: number, root: this) => unknown, that?: unknown): HierarchyNode<T> | undefined;
    /**
     * Sorts children of every node (pre-order, MUTATES children arrays in
     * place, like d3). Call after sum() and before a layout.
     */
    sort(compare: (a: HierarchyNode<T>, b: HierarchyNode<T>) => number): this;
    /** Shortest path through the lowest common ancestor (d3 node.path). */
    path(end: HierarchyNode<T>): HierarchyNode<T>[];
    /** This node, then each parent up to the root. */
    ancestors(): HierarchyNode<T>[];
    /** All nodes in breadth-first order (self first). */
    descendants(): HierarchyNode<T>[];
    /** All leaf nodes in pre-order. */
    leaves(): HierarchyNode<T>[];
    /** {source: parent, target: child} for every descendant edge. */
    links(): HierarchyLink<T>[];
    /** Breadth-first iterator (d3 Node[Symbol.iterator]). */
    [Symbol.iterator](): Generator<HierarchyNode<T>, void, undefined>;
}
/**
 * Constructs a root HierarchyNode from hierarchical data. `children` returns
 * an iterable of children (default: d.children). Maps are treated as
 * [key, value] entries like d3 (children of a Map node are its entries).
 */
export declare function hierarchy<T>(data: T, children?: (d: T) => Iterable<T> | null | undefined): HierarchyNode<T>;
export interface StratifyOptions<T> {
    id?: (d: T, i: number, data: T[]) => string | number | null | undefined;
    parentId?: (d: T, i: number, data: T[]) => string | number | null | undefined;
    path?: (d: T, i: number, data: T[]) => string;
}
export interface StratifyOperator<T> {
    /** Imputed path nodes (see path()) carry data === null. */
    (data: Iterable<T>): HierarchyNode<T>;
    id(): (d: T, i: number, data: T[]) => string | number | null | undefined;
    id(fn: (d: T, i: number, data: T[]) => string | number | null | undefined): StratifyOperator<T>;
    parentId(): (d: T, i: number, data: T[]) => string | number | null | undefined;
    parentId(fn: (d: T, i: number, data: T[]) => string | number | null | undefined): StratifyOperator<T>;
    path(): ((d: T, i: number, data: T[]) => string) | null;
    path(fn: ((d: T, i: number, data: T[]) => string) | null): StratifyOperator<T>;
}
/**
 * Builds a hierarchy from tabular data.
 *
 * DIVERGENCE (additive): accepts an options object — stratify({id, parentId})
 * or stratify({path}) — in addition to d3's fluent accessors, which are also
 * provided (.id(), .parentId(), .path()).
 */
export declare function stratify<T>(options?: StratifyOptions<T>): StratifyOperator<T>;
/** Structural node shape that tiles operate on (HierarchyNode satisfies it). */
export interface TileRect {
    value?: number;
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
}
export interface TileNode {
    value?: number;
    depth?: number;
    children?: TileRect[];
}
export type TileFunction = (parent: TileNode, x0: number, y0: number, x1: number, y1: number) => void;
export interface SquarifyTileFunction extends TileFunction {
    /** Returns a new squarify tile with the specified desired aspect ratio (>= 1). */
    ratio(ratio: number): SquarifyTileFunction;
}
/** Golden ratio — d3's default squarify target aspect ratio. */
export declare const phi: number;
/** Horizontal subdivision: children side by side, x varies, full height. */
export declare const treemapDice: TileFunction;
/** Vertical subdivision: children stacked, y varies, full width. */
export declare const treemapSlice: TileFunction;
/** Alternates dice (even depth) and slice (odd depth), like d3. */
export declare const treemapSliceDice: TileFunction;
/**
 * Squarified treemap tiling (Bruls et al.) minimizing worst aspect ratio;
 * rows run along the shorter side. Default target ratio: golden ratio (phi).
 */
export declare const treemapSquarify: SquarifyTileFunction;
/** Recursive binary partition balancing value halves. */
export declare const treemapBinary: TileFunction;
export type NodeValueFunction<T> = (node: HierarchyNode<T>) => number;
export interface TreemapLayout<T> {
    /** Assigns x0/y0/x1/y1 on every node. Call sum() (and optionally sort()) first. */
    (root: HierarchyNode<T>): HierarchyNode<T>;
    tile(): TileFunction;
    tile(tile: TileFunction): TreemapLayout<T>;
    size(): [number, number];
    size(size: readonly [number, number]): TreemapLayout<T>;
    round(): boolean;
    round(round: boolean): TreemapLayout<T>;
    padding(): NodeValueFunction<T>;
    padding(padding: number | NodeValueFunction<T>): TreemapLayout<T>;
    paddingInner(): NodeValueFunction<T>;
    paddingInner(padding: number | NodeValueFunction<T>): TreemapLayout<T>;
    paddingOuter(): NodeValueFunction<T>;
    paddingOuter(padding: number | NodeValueFunction<T>): TreemapLayout<T>;
    paddingTop(): NodeValueFunction<T>;
    paddingTop(padding: number | NodeValueFunction<T>): TreemapLayout<T>;
    paddingRight(): NodeValueFunction<T>;
    paddingRight(padding: number | NodeValueFunction<T>): TreemapLayout<T>;
    paddingBottom(): NodeValueFunction<T>;
    paddingBottom(padding: number | NodeValueFunction<T>): TreemapLayout<T>;
    paddingLeft(): NodeValueFunction<T>;
    paddingLeft(padding: number | NodeValueFunction<T>): TreemapLayout<T>;
}
/**
 * Treemap layout. Defaults match d3: squarify tiling (golden ratio), size
 * [1, 1], zero padding, no rounding.
 */
export declare function treemap<T = unknown>(): TreemapLayout<T>;
export interface PartitionLayout<T> {
    /**
     * Assigns x0/y0/x1/y1; y bands correspond to depth (root band at the top,
     * y0 = padding, band height = h / (root.height + 1)). Call sum() first.
     */
    (root: HierarchyNode<T>): HierarchyNode<T>;
    size(): [number, number];
    size(size: readonly [number, number]): PartitionLayout<T>;
    round(): boolean;
    round(round: boolean): PartitionLayout<T>;
    padding(): number;
    padding(padding: number): PartitionLayout<T>;
}
/** Partition layout. Defaults match d3: size [1, 1], padding 0, round false. */
export declare function partition<T = unknown>(): PartitionLayout<T>;
export interface PackCircle {
    x: number;
    y: number;
    r: number;
}
/**
 * Smallest circle enclosing the given circles (d3 packEnclose; Welzl's
 * algorithm with a deterministic LCG shuffle, identical results to d3).
 */
export declare function packEnclose(circles: Iterable<PackCircle>): PackCircle | undefined;
/**
 * Packs the given circles (each with a radius r) tightly, assigning x and y;
 * the enclosing circle is centered near the origin. Mutates and returns the
 * input array. Deterministic (d3's LCG), identical output to d3.
 */
export declare function packSiblings<C extends {
    r: number;
    x?: number;
    y?: number;
}>(circles: C[]): C[];
export interface PackLayout<T> {
    /** Assigns x, y, r on every node. Call sum() (and optionally sort()) first. */
    (root: HierarchyNode<T>): HierarchyNode<T>;
    radius(): NodeValueFunction<T> | null;
    radius(radius: NodeValueFunction<T> | null): PackLayout<T>;
    size(): [number, number];
    size(size: readonly [number, number]): PackLayout<T>;
    padding(): NodeValueFunction<T>;
    padding(padding: number | NodeValueFunction<T>): PackLayout<T>;
}
/**
 * Circle-packing layout. Defaults match d3: radius null (sqrt of value,
 * rescaled to fit), size [1, 1], padding 0. Root circle is centered at
 * (w/2, h/2).
 */
export declare function pack<T = unknown>(): PackLayout<T>;
export type SeparationFunction<T> = (a: HierarchyNode<T>, b: HierarchyNode<T>) => number;
export interface TreeLayout<T> {
    /** Assigns x, y on every node. Does not require sum(). */
    (root: HierarchyNode<T>): HierarchyNode<T>;
    separation(): SeparationFunction<T>;
    separation(separation: SeparationFunction<T>): TreeLayout<T>;
    /** Returns the size if sized, or null if nodeSize is in effect (d3 semantics). */
    size(): [number, number] | null;
    size(size: readonly [number, number]): TreeLayout<T>;
    /** Returns the node size if set, or null if size is in effect (d3 semantics). */
    nodeSize(): [number, number] | null;
    nodeSize(size: readonly [number, number]): TreeLayout<T>;
}
/**
 * Tidy tree layout (Buchheim/Reingold–Tilford). Defaults match d3: size
 * [1, 1], separation (a, b) => a.parent === b.parent ? 1 : 2.
 *
 * With size([w, h]): x spans [0, w] (breadth), y = depth mapped to [0, h].
 * With nodeSize([dx, dy]): root at (0, 0), y = depth * dy.
 * For radial trees use size([2 * Math.PI, radius]) and map (x, y) to polar.
 */
export declare function tree<T = unknown>(): TreeLayout<T>;
export interface ClusterLayout<T> {
    /** Assigns x, y on every node; all leaves end up at y = h (or depth 0 row under nodeSize). */
    (root: HierarchyNode<T>): HierarchyNode<T>;
    separation(): SeparationFunction<T>;
    separation(separation: SeparationFunction<T>): ClusterLayout<T>;
    size(): [number, number] | null;
    size(size: readonly [number, number]): ClusterLayout<T>;
    nodeSize(): [number, number] | null;
    nodeSize(size: readonly [number, number]): ClusterLayout<T>;
}
/**
 * Dendrogram layout: like tree(), but all leaves are placed at the same
 * depth (y = h with size([w, h]); root at y = 0). Defaults match d3.
 */
export declare function cluster<T = unknown>(): ClusterLayout<T>;
//# sourceMappingURL=hierarchy.d.ts.map