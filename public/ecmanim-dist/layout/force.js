// Deterministic force-directed graph layout: a pure-math port of d3-force.
//
// This module is isomorphic (no renderer, mobject, or node:* imports) and,
// unlike d3-force, fully deterministic: every source of randomness is a
// seeded mulberry32 PRNG (see src/core/noise.ts), so two runs with the same
// inputs produce byte-identical positions.
//
// Alpha semantics match d3 exactly:
//   alpha = 1, alphaMin = 0.001, alphaTarget = 0,
//   alphaDecay = 1 - 0.001^(1/300), velocityDecay = 0.6.
// Each tick: alpha += (alphaTarget - alpha) * alphaDecay, forces apply
// velocity deltas, then positions integrate with velocity decay (fixed
// nodes via fx/fy pin position and zero velocity).
//
// Initial positions for nodes without x/y use d3's phyllotaxis spiral:
//   radius = 10 * sqrt(0.5 + i), angle = i * PI * (3 - sqrt(5))
// which matches d3's initializeNodes and is deterministic by construction.
//
// DOCUMENTED DIVERGENCES FROM d3-force:
// - forceManyBody is an exact O(n^2) pairwise computation. d3 uses a
//   Barnes-Hut quadtree approximation (theta = 0.81 default), so d3's
//   many-body results differ slightly from ours. Our scenes use n <= a few
//   hundred nodes, where exact O(n^2) is both fast enough and more accurate.
// - forceCollide is likewise exact O(n^2) per iteration (d3 uses a quadtree
//   for neighbor pruning; the resolution math per overlapping pair is
//   identical).
// - The "jiggle" applied to coincident nodes/links uses the simulation's
//   seeded PRNG, never Math.random (d3 uses lcg() seeded per-simulation in
//   v3, so the *structure* matches; the exact random stream differs).
// - `simulation.run()` performs a FIXED, deterministic number of ticks:
//   ceil(log(alphaMin) / log(1 - alphaDecay)) = 300 with the defaults --
//   the same count d3's documentation prescribes for static layouts.
import { mulberry32 } from "../core/noise.js";
function constant(x) {
    return () => x;
}
function accessor(v) {
    return typeof v === "function" ? v : constant(v);
}
/** d3's jiggle: a tiny random offset to separate exactly-coincident points. */
function jiggle(random) {
    return (random() - 0.5) * 1e-6;
}
// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
const INITIAL_RADIUS = 10;
const INITIAL_ANGLE = Math.PI * (3 - Math.sqrt(5));
export class ForceSimulation {
    _nodes;
    _forces = new Map();
    _random;
    alpha;
    alphaMin;
    alphaDecay;
    alphaTarget;
    velocityDecay;
    constructor(nodes = [], options = {}) {
        const { seed = 1, alpha = 1, alphaMin = 0.001, alphaDecay = 1 - Math.pow(alphaMin, 1 / 300), alphaTarget = 0, velocityDecay = 0.6, } = options;
        this.alpha = alpha;
        this.alphaMin = alphaMin;
        this.alphaDecay = alphaDecay;
        this.alphaTarget = alphaTarget;
        this.velocityDecay = velocityDecay;
        this._random = mulberry32(seed);
        this._nodes = nodes;
        this._initializeNodes();
    }
    /** d3's initializeNodes: index assignment + phyllotaxis spiral placement. */
    _initializeNodes() {
        const nodes = this._nodes;
        for (let i = 0; i < nodes.length; ++i) {
            const node = nodes[i];
            node.index = i;
            if (node.fx != null)
                node.x = node.fx;
            if (node.fy != null)
                node.y = node.fy;
            if (node.x == null || Number.isNaN(node.x) || node.y == null || Number.isNaN(node.y)) {
                const radius = INITIAL_RADIUS * Math.sqrt(0.5 + i);
                const angle = i * INITIAL_ANGLE;
                node.x = radius * Math.cos(angle);
                node.y = radius * Math.sin(angle);
            }
            if (node.vx == null || Number.isNaN(node.vx) || node.vy == null || Number.isNaN(node.vy)) {
                node.vx = 0;
                node.vy = 0;
            }
        }
    }
    _initializeForce(force) {
        force.initialize?.(this._nodes, this._random);
        return force;
    }
    nodes(nodes) {
        if (nodes === undefined)
            return this._nodes;
        this._nodes = nodes;
        this._initializeNodes();
        for (const force of this._forces.values())
            this._initializeForce(force);
        return this;
    }
    force(name, force) {
        if (force === undefined)
            return this._forces.get(name);
        if (force === null)
            this._forces.delete(name);
        else
            this._forces.set(name, this._initializeForce(force));
        return this;
    }
    /** Advance the simulation n ticks (default 1). Matches d3's tick. */
    tick(iterations = 1) {
        for (let k = 0; k < iterations; ++k) {
            this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
            for (const force of this._forces.values())
                force(this.alpha);
            for (const node of this._nodes) {
                if (node.fx == null)
                    node.x += node.vx *= this.velocityDecay;
                else {
                    node.x = node.fx;
                    node.vx = 0;
                }
                if (node.fy == null)
                    node.y += node.vy *= this.velocityDecay;
                else {
                    node.y = node.fy;
                    node.vy = 0;
                }
            }
        }
        return this;
    }
    /**
     * Run the simulation to completion: a FIXED, deterministic tick count of
     * ceil(log(alphaMin) / log(1 - alphaDecay)) -- 300 with the defaults.
     * (This is the static-layout loop d3's docs prescribe; using a fixed count
     * rather than `while (alpha >= alphaMin)` avoids any float-comparison
     * boundary sensitivity.)
     */
    run() {
        const n = Math.ceil(Math.log(this.alphaMin) / Math.log(1 - this.alphaDecay));
        return this.tick(n);
    }
    randomSource() {
        return this._random;
    }
}
/** Create a deterministic force simulation (d3.forceSimulation equivalent). */
export function forceSimulation(nodes = [], options = {}) {
    return new ForceSimulation(nodes, options);
}
/**
 * d3.forceLink equivalent. Each link acts as a spring pulling its endpoints
 * toward `distance` apart; the correction is biased toward the
 * lower-degree endpoint exactly like d3 (bias = degree(source) / (degree(source) + degree(target))).
 */
export function forceLink(links = [], options = {}) {
    const { id = (d) => d.index, distance = 30, iterations = 1, } = options;
    let nodes = [];
    let random = mulberry32(1);
    let count = [];
    let bias = [];
    let strengths = [];
    let distances = [];
    const defaultStrength = (link) => {
        const s = link.source;
        const t = link.target;
        return 1 / Math.min(count[s.index], count[t.index]);
    };
    const strengthFn = options.strength === undefined ? defaultStrength : accessor(options.strength);
    const distanceFn = accessor(distance);
    const force = ((alpha) => {
        const n = links.length;
        for (let k = 0; k < iterations; ++k) {
            for (let i = 0; i < n; ++i) {
                const link = links[i];
                const source = link.source;
                const target = link.target;
                let x = target.x + target.vx - source.x - source.vx || jiggle(random);
                let y = target.y + target.vy - source.y - source.vy || jiggle(random);
                let l = Math.sqrt(x * x + y * y);
                l = ((l - distances[i]) / l) * alpha * strengths[i];
                x *= l;
                y *= l;
                let b = bias[i];
                target.vx -= x * b;
                target.vy -= y * b;
                b = 1 - b;
                source.vx += x * b;
                source.vy += y * b;
            }
        }
    });
    force.initialize = (simNodes, simRandom) => {
        nodes = simNodes;
        random = simRandom;
        const n = nodes.length;
        const m = links.length;
        const nodeById = new Map(nodes.map((d, i) => [id(d, i, nodes), d]));
        count = new Array(n).fill(0);
        for (let i = 0; i < m; ++i) {
            const link = links[i];
            link.index = i;
            if (typeof link.source !== "object" || link.source === null) {
                const found = nodeById.get(link.source);
                if (!found)
                    throw new Error(`node not found: ${String(link.source)}`);
                link.source = found;
            }
            if (typeof link.target !== "object" || link.target === null) {
                const found = nodeById.get(link.target);
                if (!found)
                    throw new Error(`node not found: ${String(link.target)}`);
                link.target = found;
            }
            count[link.source.index]++;
            count[link.target.index]++;
        }
        bias = new Array(m);
        strengths = new Array(m);
        distances = new Array(m);
        for (let i = 0; i < m; ++i) {
            const link = links[i];
            const si = link.source.index;
            const ti = link.target.index;
            bias[i] = count[si] / (count[si] + count[ti]);
            strengths[i] = strengthFn(link, i, links);
            distances[i] = distanceFn(link, i, links);
        }
    };
    force.links = () => links;
    return force;
}
/**
 * d3.forceManyBody equivalent -- EXACT O(n^2) pairwise, with NO Barnes-Hut
 * quadtree approximation. Results therefore differ slightly from d3's
 * theta-approximated forces; the per-pair math (inverse-square with
 * distanceMin2/distanceMax2 clamps and seeded jiggle for coincident nodes)
 * is identical. Fine for n up to a few hundred nodes.
 */
export function forceManyBody(options = {}) {
    const { strength = -30, distanceMin2 = 1, distanceMax2 = Infinity } = options;
    const strengthFn = accessor(strength);
    let nodes = [];
    let random = mulberry32(1);
    let strengths = [];
    const force = ((alpha) => {
        const n = nodes.length;
        for (let i = 0; i < n; ++i) {
            const node = nodes[i];
            for (let j = 0; j < n; ++j) {
                if (j === i)
                    continue;
                const other = nodes[j];
                let x = other.x - node.x;
                let y = other.y - node.y;
                let l = x * x + y * y;
                if (l >= distanceMax2)
                    continue;
                if (x === 0) {
                    x = jiggle(random);
                    l += x * x;
                }
                if (y === 0) {
                    y = jiggle(random);
                    l += y * y;
                }
                if (l < distanceMin2)
                    l = Math.sqrt(distanceMin2 * l);
                const w = (strengths[j] * alpha) / l;
                node.vx += x * w;
                node.vy += y * w;
            }
        }
    });
    force.initialize = (simNodes, simRandom) => {
        nodes = simNodes;
        random = simRandom;
        strengths = nodes.map((d, i) => strengthFn(d, i, nodes));
    };
    return force;
}
// ---------------------------------------------------------------------------
// forceCenter
// ---------------------------------------------------------------------------
/**
 * d3.forceCenter equivalent: translates all nodes so their mean position
 * approaches [x, y]. Like d3, this adjusts positions directly (not
 * velocities) and ignores alpha.
 */
export function forceCenter([x, y] = [0, 0], strength = 1) {
    let nodes = [];
    const force = ((_alpha) => {
        const n = nodes.length;
        if (n === 0)
            return;
        let sx = 0;
        let sy = 0;
        for (const node of nodes) {
            sx += node.x;
            sy += node.y;
        }
        sx = (sx / n - x) * strength;
        sy = (sy / n - y) * strength;
        for (const node of nodes) {
            node.x -= sx;
            node.y -= sy;
        }
    });
    force.initialize = (simNodes) => {
        nodes = simNodes;
    };
    return force;
}
/**
 * d3.forceCollide equivalent: prevents circles of the given radius from
 * overlapping. Exact O(n^2) pairwise per iteration (d3 prunes candidate
 * pairs with a quadtree; the per-pair resolution math is identical).
 * Anticipates positions one tick ahead (x + vx) like d3.
 */
export function forceCollide(radius = 1, options = {}) {
    const { strength = 1, iterations = 1 } = options;
    const radiusFn = accessor(radius);
    let nodes = [];
    let random = mulberry32(1);
    let radii = [];
    const force = ((_alpha) => {
        const n = nodes.length;
        for (let k = 0; k < iterations; ++k) {
            for (let i = 0; i < n; ++i) {
                const node = nodes[i];
                const ri = radii[i];
                const ri2 = ri * ri;
                const xi = node.x + node.vx;
                const yi = node.y + node.vy;
                for (let j = i + 1; j < n; ++j) {
                    const other = nodes[j];
                    const rj = radii[j];
                    let r = ri + rj;
                    let x = xi - other.x - other.vx;
                    let y = yi - other.y - other.vy;
                    let l = x * x + y * y;
                    if (l < r * r) {
                        if (x === 0) {
                            x = jiggle(random);
                            l += x * x;
                        }
                        if (y === 0) {
                            y = jiggle(random);
                            l += y * y;
                        }
                        l = Math.sqrt(l);
                        l = ((r - l) / l) * strength;
                        x *= l;
                        y *= l;
                        const rj2 = rj * rj;
                        r = rj2 / (ri2 + rj2);
                        node.vx += x * r;
                        node.vy += y * r;
                        r = 1 - r;
                        other.vx -= x * r;
                        other.vy -= y * r;
                    }
                }
            }
        }
    });
    force.initialize = (simNodes, simRandom) => {
        nodes = simNodes;
        random = simRandom;
        radii = nodes.map((d, i) => radiusFn(d, i, nodes));
    };
    return force;
}
// ---------------------------------------------------------------------------
// forceX / forceY
// ---------------------------------------------------------------------------
/** d3.forceX equivalent: pulls nodes toward the given x. Default strength 0.1. */
export function forceX(x = 0, strength = 0.1) {
    const xFn = accessor(x);
    const strengthFn = accessor(strength);
    let nodes = [];
    let xs = [];
    let strengths = [];
    const force = ((alpha) => {
        for (let i = 0; i < nodes.length; ++i) {
            const node = nodes[i];
            node.vx += (xs[i] - node.x) * strengths[i] * alpha;
        }
    });
    force.initialize = (simNodes) => {
        nodes = simNodes;
        xs = nodes.map((d, i) => xFn(d, i, nodes));
        strengths = nodes.map((d, i) => strengthFn(d, i, nodes));
    };
    return force;
}
/** d3.forceY equivalent: pulls nodes toward the given y. Default strength 0.1. */
export function forceY(y = 0, strength = 0.1) {
    const yFn = accessor(y);
    const strengthFn = accessor(strength);
    let nodes = [];
    let ys = [];
    let strengths = [];
    const force = ((alpha) => {
        for (let i = 0; i < nodes.length; ++i) {
            const node = nodes[i];
            node.vy += (ys[i] - node.y) * strengths[i] * alpha;
        }
    });
    force.initialize = (simNodes) => {
        nodes = simNodes;
        ys = nodes.map((d, i) => yFn(d, i, nodes));
        strengths = nodes.map((d, i) => strengthFn(d, i, nodes));
    };
    return force;
}
//# sourceMappingURL=force.js.map