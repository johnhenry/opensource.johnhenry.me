/** Node model, mutated in place by the simulation (d3-compatible). */
export interface SimulationNode {
    /** Zero-based index, assigned by the simulation. */
    index?: number;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    /** Fixed position: when set, x is pinned to fx and vx zeroed each tick. */
    fx?: number | null;
    fy?: number | null;
    [key: string]: unknown;
}
/** Link model for forceLink. source/target may be ids or node objects. */
export interface SimulationLink {
    source: unknown;
    target: unknown;
    index?: number;
    [key: string]: unknown;
}
/** A force: called each tick with alpha; optionally (re)initialized. */
export interface Force {
    (alpha: number): void;
    initialize?: (nodes: SimulationNode[], random: () => number) => void;
}
type NumberAccessor<T> = number | ((d: T, i: number, data: T[]) => number);
export interface ForceSimulationOptions {
    /** PRNG seed for all internal jiggle. Same seed => byte-identical runs. */
    seed?: number;
    alpha?: number;
    alphaMin?: number;
    alphaDecay?: number;
    alphaTarget?: number;
    velocityDecay?: number;
}
export declare class ForceSimulation {
    private _nodes;
    private _forces;
    private _random;
    alpha: number;
    alphaMin: number;
    alphaDecay: number;
    alphaTarget: number;
    velocityDecay: number;
    constructor(nodes?: SimulationNode[], options?: ForceSimulationOptions);
    /** d3's initializeNodes: index assignment + phyllotaxis spiral placement. */
    private _initializeNodes;
    private _initializeForce;
    nodes(): SimulationNode[];
    nodes(nodes: SimulationNode[]): this;
    /** Get, set (chainable), or remove (pass null) a named force. */
    force(name: string): Force | undefined;
    force(name: string, force: Force | null): this;
    /** Advance the simulation n ticks (default 1). Matches d3's tick. */
    tick(iterations?: number): this;
    /**
     * Run the simulation to completion: a FIXED, deterministic tick count of
     * ceil(log(alphaMin) / log(1 - alphaDecay)) -- 300 with the defaults.
     * (This is the static-layout loop d3's docs prescribe; using a fixed count
     * rather than `while (alpha >= alphaMin)` avoids any float-comparison
     * boundary sensitivity.)
     */
    run(): this;
    randomSource(): () => number;
}
/** Create a deterministic force simulation (d3.forceSimulation equivalent). */
export declare function forceSimulation(nodes?: SimulationNode[], options?: ForceSimulationOptions): ForceSimulation;
export interface ForceLinkOptions {
    /** Node id accessor used to resolve link endpoints. Default: d => d.index. */
    id?: (node: SimulationNode, i: number, nodes: SimulationNode[]) => unknown;
    /** Desired link distance. Default 30. */
    distance?: NumberAccessor<SimulationLink>;
    /**
     * Link strength. d3 default: 1 / min(count(link.source), count(link.target))
     * where count is the node's degree.
     */
    strength?: NumberAccessor<SimulationLink>;
    /** Constraint-relaxation iterations per tick. Default 1. */
    iterations?: number;
}
export interface ForceLink extends Force {
    links(): SimulationLink[];
}
/**
 * d3.forceLink equivalent. Each link acts as a spring pulling its endpoints
 * toward `distance` apart; the correction is biased toward the
 * lower-degree endpoint exactly like d3 (bias = degree(source) / (degree(source) + degree(target))).
 */
export declare function forceLink(links?: SimulationLink[], options?: ForceLinkOptions): ForceLink;
export interface ForceManyBodyOptions {
    /** Charge strength (negative repels). Default -30 like d3. */
    strength?: NumberAccessor<SimulationNode>;
    /** Squared minimum distance clamp. Default 1. */
    distanceMin2?: number;
    /** Squared maximum distance cutoff. Default Infinity. */
    distanceMax2?: number;
}
/**
 * d3.forceManyBody equivalent -- EXACT O(n^2) pairwise, with NO Barnes-Hut
 * quadtree approximation. Results therefore differ slightly from d3's
 * theta-approximated forces; the per-pair math (inverse-square with
 * distanceMin2/distanceMax2 clamps and seeded jiggle for coincident nodes)
 * is identical. Fine for n up to a few hundred nodes.
 */
export declare function forceManyBody(options?: ForceManyBodyOptions): Force;
/**
 * d3.forceCenter equivalent: translates all nodes so their mean position
 * approaches [x, y]. Like d3, this adjusts positions directly (not
 * velocities) and ignores alpha.
 */
export declare function forceCenter([x, y]?: [number, number], strength?: number): Force;
export interface ForceCollideOptions {
    /** Overlap-correction strength in [0, 1]. Default 1. */
    strength?: number;
    /** Relaxation iterations per tick. Default 1. */
    iterations?: number;
}
/**
 * d3.forceCollide equivalent: prevents circles of the given radius from
 * overlapping. Exact O(n^2) pairwise per iteration (d3 prunes candidate
 * pairs with a quadtree; the per-pair resolution math is identical).
 * Anticipates positions one tick ahead (x + vx) like d3.
 */
export declare function forceCollide(radius?: NumberAccessor<SimulationNode>, options?: ForceCollideOptions): Force;
/** d3.forceX equivalent: pulls nodes toward the given x. Default strength 0.1. */
export declare function forceX(x?: NumberAccessor<SimulationNode>, strength?: NumberAccessor<SimulationNode>): Force;
/** d3.forceY equivalent: pulls nodes toward the given y. Default strength 0.1. */
export declare function forceY(y?: NumberAccessor<SimulationNode>, strength?: NumberAccessor<SimulationNode>): Force;
export {};
//# sourceMappingURL=force.d.ts.map