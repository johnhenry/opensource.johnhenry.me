// Graph-theory mobjects: a port of ManimCommunity manim/mobject/graph.py.
//
// A Graph is a VMobject holding a set of vertex mobjects (one per hashable id)
// and a set of edge mobjects (one per [u, v] pair) connecting vertex centers.
// Vertex ids may be any hashable value; internally we key maps on String(id).
// DiGraph is the directed variant whose edges are Arrows.
import { VMobject } from "./VMobject.js";
import { Dot, Line, Arrow } from "./geometry.js";
import { Text } from "./text/Text.js";
import { Mobject } from "./Mobject.js";
import * as V from "../core/math/vector.js";
import { mulberry32 } from "../core/noise.js";
/** Default PRNG seed for layouts; override via layout_config.seed. */
const DEFAULT_LAYOUT_SEED = 0x5eed;
// ---------------------------------------------------------------------------
// Layout functions. Each returns a { id: [x, y, z] } dict at unit-ish scale;
// the caller scales by layout_scale afterwards.
// ---------------------------------------------------------------------------
function circularLayout(vertices) {
    const n = vertices.length;
    const out = {};
    if (n === 0)
        return out;
    const [verts] = V.regularVertices(n, 1, Math.PI / 2);
    for (let i = 0; i < n; i++)
        out[String(vertices[i])] = verts[i];
    return out;
}
function randomLayout(vertices, config = {}) {
    // Seeded (mulberry32) so the layout is deterministic; pass
    // layout_config.seed to vary it.
    const rand = mulberry32(config.seed ?? DEFAULT_LAYOUT_SEED);
    const out = {};
    for (const v of vertices) {
        out[String(v)] = [rand() * 2 - 1, rand() * 2 - 1, 0];
    }
    return out;
}
// A small Fruchterman-Reingold force-directed layout. Enough iterations to
// spread vertices out; deterministic seeding via the circular layout so the
// result is stable and never degenerate.
function springLayout(vertices, edges, config = {}) {
    const n = vertices.length;
    if (n === 0)
        return {};
    if (n === 1)
        return { [String(vertices[0])]: [0, 0, 0] };
    const iterations = config.iterations ?? 50;
    const k = config.k ?? 1 / Math.sqrt(n); // ideal edge length
    // Seeded (mulberry32) jitter for coincident vertices keeps the whole
    // layout deterministic; pass config.seed (layout_config.seed) to vary it.
    const rand = mulberry32(config.seed ?? DEFAULT_LAYOUT_SEED);
    const keys = vertices.map((v) => String(v));
    // Seed from the circular layout for determinism.
    const pos = {};
    const seed = circularLayout(vertices);
    for (const key of keys)
        pos[key] = [seed[key][0], seed[key][1], 0];
    let temp = 0.1;
    const cool = temp / (iterations + 1);
    for (let it = 0; it < iterations; it++) {
        const disp = {};
        for (const key of keys)
            disp[key] = [0, 0, 0];
        // Repulsive forces between every pair.
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const a = keys[i], b = keys[j];
                let delta = V.sub(pos[a], pos[b]);
                let dist = V.length(delta);
                if (dist < 1e-6) {
                    delta = [rand() * 1e-3, rand() * 1e-3, 0];
                    dist = V.length(delta) || 1e-6;
                }
                const rep = (k * k) / dist;
                const push = V.scale(V.normalize(delta), rep);
                disp[a] = V.add(disp[a], push);
                disp[b] = V.sub(disp[b], push);
            }
        }
        // Attractive forces along edges.
        for (const [u, v] of edges) {
            const a = String(u), b = String(v);
            if (!(a in pos) || !(b in pos))
                continue;
            const delta = V.sub(pos[a], pos[b]);
            const dist = V.length(delta) || 1e-6;
            const attr = (dist * dist) / k;
            const pull = V.scale(V.normalize(delta), attr);
            disp[a] = V.sub(disp[a], pull);
            disp[b] = V.add(disp[b], pull);
        }
        // Limit displacement by the temperature and apply.
        for (const key of keys) {
            const d = disp[key];
            const dist = V.length(d) || 1e-6;
            const limited = Math.min(dist, temp);
            pos[key] = V.add(pos[key], V.scale(V.normalize(d), limited));
        }
        temp -= cool;
    }
    // Normalize into the unit box so layout_scale behaves predictably.
    let maxR = 0;
    const center = V.centerOfMass(keys.map((key) => pos[key]));
    for (const key of keys) {
        pos[key] = V.sub(pos[key], center);
        maxR = Math.max(maxR, V.length(pos[key]));
    }
    if (maxR > 1e-6) {
        for (const key of keys)
            pos[key] = V.scale(pos[key], 1 / maxR);
    }
    return pos;
}
function computeLayout(vertices, edges, layout, layoutConfig) {
    // Explicit position dict.
    if (layout && typeof layout === "object") {
        const out = {};
        for (const v of vertices) {
            const p = layout[String(v)];
            out[String(v)] = p ? [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0] : [0, 0, 0];
        }
        return out;
    }
    switch (layout) {
        case "circular":
        case "shell":
            return circularLayout(vertices);
        case "random":
            return randomLayout(vertices, layoutConfig);
        case "spring":
        case "planar":
        default:
            return springLayout(vertices, edges, layoutConfig);
    }
}
// ---------------------------------------------------------------------------
// GenericGraph base class
// ---------------------------------------------------------------------------
export class GenericGraph extends VMobject {
    /** Map of String(id) -> vertex mobject. */
    vertices;
    /** Map of "u,v" (String) -> edge mobject. */
    edges;
    _vertexIds;
    _edgeTuples;
    _layout;
    _layoutScale;
    _config;
    _directed;
    _labelsById;
    constructor(vertices = [], edges = [], config = {}, directed = false) {
        super();
        this.vertices = new Map();
        this.edges = new Map();
        this._labelsById = new Map();
        this._vertexIds = [...vertices];
        this._edgeTuples = edges.map((e) => [e[0], e[1]]);
        this._config = config;
        this._directed = directed;
        this._layoutScale = config.layout_scale ?? 2;
        const layout = config.layout ?? "spring";
        this._layout = computeLayout(this._vertexIds, this._edgeTuples, layout, config.layout_config ?? {});
        for (const key of Object.keys(this._layout)) {
            this._layout[key] = V.scale(this._layout[key], this._layoutScale);
        }
        // Build vertices first (edges need their centers), then edges.
        for (const id of this._vertexIds)
            this._buildVertex(id);
        for (const e of this._edgeTuples)
            this._buildEdge(e[0], e[1]);
    }
    // -- helpers -------------------------------------------------------------
    static edgeKey(u, v) {
        return `${String(u)},${String(v)}`;
    }
    _position(id) {
        const p = this._layout[String(id)];
        return p ? [p[0], p[1], p[2]] : [0, 0, 0];
    }
    _buildVertex(id) {
        const key = String(id);
        const VertexType = this._config.vertex_type ?? Dot;
        const cfg = this._config.vertex_config ?? {};
        const perVertex = cfg[key] ?? cfg;
        const mob = new VertexType({ ...perVertex });
        mob.moveTo(this._position(id));
        this.vertices.set(key, mob);
        this.add(mob);
        // Labels.
        const labels = this._config.labels;
        if (labels) {
            let labelMob;
            if (labels === true) {
                labelMob = new Text(String(id), { fontSize: 0.3, color: "#000000" });
            }
            else {
                const entry = labels[key];
                if (entry instanceof Mobject)
                    labelMob = entry;
                else if (entry != null)
                    labelMob = new Text(String(entry), { fontSize: 0.3, color: "#000000" });
            }
            if (labelMob) {
                labelMob.moveTo(this._position(id));
                this._labelsById.set(key, labelMob);
                mob.add(labelMob);
            }
        }
        return mob;
    }
    _makeEdge(u, v) {
        const start = this._vertexCenter(u);
        const end = this._vertexCenter(v);
        const EdgeType = this._config.edge_type ?? (this._directed ? Arrow : Line);
        const cfg = this._config.edge_config ?? {};
        const key = GenericGraph.edgeKey(u, v);
        const perEdge = cfg[key] ?? cfg;
        return new EdgeType(start, end, { ...perEdge });
    }
    _buildEdge(u, v) {
        const key = GenericGraph.edgeKey(u, v);
        const edge = this._makeEdge(u, v);
        edge._graphEndpoints = [String(u), String(v)];
        this.edges.set(key, edge);
        this.add(edge);
        return edge;
    }
    _vertexCenter(id) {
        const mob = this.vertices.get(String(id));
        return mob ? mob.getCenter() : this._position(id);
    }
    // -- public API ----------------------------------------------------------
    /** Reposition every edge so its endpoints follow the current vertex centers. */
    updateEdges() {
        for (const edge of this.edges.values()) {
            const [uk, vk] = edge._graphEndpoints;
            const start = this._centerOfKey(uk);
            const end = this._centerOfKey(vk);
            if (typeof edge.putStartAndEndOn === "function") {
                edge.putStartAndEndOn(start, end);
                // Arrows rebuild their tip when repositioned.
                if (this._directed && typeof edge.buildTip === "function") {
                    edge.remove(...edge.submobjects.filter((s) => s === edge.tip));
                    edge.buildTip();
                }
            }
        }
        return this;
    }
    _centerOfKey(key) {
        const mob = this.vertices.get(key);
        return mob ? mob.getCenter() : (this._layout[key] ?? [0, 0, 0]);
    }
    /** Add one or more vertices (with optional positions in layout_config.positions). */
    addVertices(...ids) {
        const added = [];
        for (const id of ids) {
            const key = String(id);
            if (this.vertices.has(key))
                continue;
            if (!(key in this._layout))
                this._layout[key] = [0, 0, 0];
            this._vertexIds.push(id);
            added.push(this._buildVertex(id));
        }
        return added;
    }
    /** Remove vertices and any incident edges. */
    removeVertices(...ids) {
        for (const id of ids) {
            const key = String(id);
            const mob = this.vertices.get(key);
            if (mob)
                this.remove(mob);
            this.vertices.delete(key);
            this._vertexIds = this._vertexIds.filter((v) => String(v) !== key);
            // Drop incident edges.
            for (const [ek, edge] of [...this.edges]) {
                const [uk, vk] = edge._graphEndpoints;
                if (uk === key || vk === key) {
                    this.remove(edge);
                    this.edges.delete(ek);
                }
            }
            this._edgeTuples = this._edgeTuples.filter((e) => String(e[0]) !== key && String(e[1]) !== key);
        }
        return this;
    }
    /** Add one or more edges given as [u, v] pairs. */
    addEdges(...edges) {
        const added = [];
        for (const [u, v] of edges) {
            const key = GenericGraph.edgeKey(u, v);
            if (this.edges.has(key))
                continue;
            // Ensure endpoints exist.
            if (!this.vertices.has(String(u)))
                this.addVertices(u);
            if (!this.vertices.has(String(v)))
                this.addVertices(v);
            this._edgeTuples.push([u, v]);
            added.push(this._buildEdge(u, v));
        }
        return added;
    }
    /** Remove one or more edges given as [u, v] pairs. */
    removeEdges(...edges) {
        for (const [u, v] of edges) {
            const key = GenericGraph.edgeKey(u, v);
            const edge = this.edges.get(key);
            if (edge)
                this.remove(edge);
            this.edges.delete(key);
            this._edgeTuples = this._edgeTuples.filter((e) => GenericGraph.edgeKey(e[0], e[1]) !== key);
        }
        return this;
    }
    /** All vertex mobjects, in insertion order. */
    getVertexMobjects() {
        return [...this.vertices.values()];
    }
    /** All edge mobjects, in insertion order. */
    getEdgeMobjects() {
        return [...this.edges.values()];
    }
    /** The vertex mobject for a given id (manim's Graph.__getitem__). */
    getVertex(id) {
        return this.vertices.get(String(id));
    }
    /** Convenience alias mirroring Python's `graph[id]`. */
    __getitem__(id) {
        return this.getVertex(id);
    }
    /** The edge mobject for a given [u, v] pair. */
    getEdge(u, v) {
        return this.edges.get(GenericGraph.edgeKey(u, v));
    }
    /** Attach updateEdges as a per-frame updater so edges track moving vertices. */
    addEdgeUpdater() {
        this.addUpdater(() => {
            this.updateEdges();
        });
        return this;
    }
}
// ---------------------------------------------------------------------------
// Public classes
// ---------------------------------------------------------------------------
/** Undirected graph (edges are Lines by default). */
export class Graph extends GenericGraph {
    constructor(vertices = [], edges = [], config = {}) {
        super(vertices, edges, config, false);
    }
}
/** Directed graph (edges are Arrows by default). */
export class DiGraph extends GenericGraph {
    constructor(vertices = [], edges = [], config = {}) {
        super(vertices, edges, config, true);
    }
}
export default Graph;
//# sourceMappingURL=graph.js.map