// Diagram-as-code with animated board transitions. A tiny Mermaid/D2-ish DSL is
// parsed to a graph, laid out (a built-in deterministic layered layout; elkjs is
// an optional future backend), and built into a board (a VGroup of node + edge
// mobjects, each tagged with a stable `matchId`). Two boards then animate between
// each other via TransformMatchingAuto — nodes/edges are matched by id and the
// deltas are tweened. Isomorphic; labels use RasterText (no font needed).
import { VGroup } from "../mobject/VMobject.js";
import { RoundedRectangle } from "../mobject/polygram.js";
import { Arrow } from "../mobject/geometry.js";
import { RasterText } from "../mobject/text/Text.js";
import { Color } from "../core/color.js";
/**
 * Parse a small diagram DSL. Supported per line:
 *   A                      a bare node
 *   A[Label text]          a node with a label
 *   A --> B                an edge
 *   A -- label --> B       a labeled edge
 * Node ids are auto-created on first use. Blank lines / `//` comments ignored.
 */
export function parseDiagram(dsl) {
    const nodes = new Map();
    const edges = [];
    const ensure = (id) => {
        const key = id.trim();
        if (!nodes.has(key))
            nodes.set(key, { id: key, label: key });
        return key;
    };
    const declare = (token) => {
        // "A[Label]" or "A"
        const m = /^([^[\]]+?)(?:\[([^\]]*)\])?$/.exec(token.trim());
        if (!m)
            return ensure(token);
        const id = m[1].trim();
        ensure(id);
        if (m[2] != null)
            nodes.get(id).label = m[2];
        return id;
    };
    for (const raw of dsl.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("//") || line.startsWith("#"))
            continue;
        const edge = /^(.+?)\s*--(?:\s*(.+?)\s*--)?>\s*(.+)$/.exec(line);
        if (edge) {
            const from = declare(edge[1]);
            const to = declare(edge[3]);
            edges.push({ from, to, label: edge[2]?.trim() || undefined });
        }
        else {
            declare(line);
        }
    }
    return { nodes: Array.from(nodes.values()), edges };
}
/** Deterministic layout → node id → [x, y, 0]. */
export function layoutDiagram(graph, opts = {}) {
    const layerGap = opts.layerGap ?? 3;
    const nodeGap = opts.nodeGap ?? 1.6;
    const pos = new Map();
    if (opts.algorithm === "circular") {
        const n = graph.nodes.length || 1;
        const rad = Math.max(1.5, (n * nodeGap) / (2 * Math.PI));
        graph.nodes.forEach((node, i) => {
            const a = (2 * Math.PI * i) / n;
            pos.set(node.id, [rad * Math.cos(a), rad * Math.sin(a), 0]);
        });
        return pos;
    }
    // Layered: BFS depth from roots (nodes with no incoming edge).
    const incoming = new Map();
    for (const node of graph.nodes)
        incoming.set(node.id, 0);
    for (const e of graph.edges)
        incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    const adj = new Map();
    for (const e of graph.edges) {
        if (!adj.has(e.from))
            adj.set(e.from, []);
        adj.get(e.from).push(e.to);
    }
    const depth = new Map();
    const queue = graph.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
    for (const id of queue)
        depth.set(id, 0);
    // Fallback: if there are no roots (a cycle), seed with the first node.
    if (!queue.length && graph.nodes.length) {
        queue.push(graph.nodes[0].id);
        depth.set(graph.nodes[0].id, 0);
    }
    while (queue.length) {
        const id = queue.shift();
        const d = depth.get(id) ?? 0;
        for (const next of adj.get(id) ?? []) {
            if (!depth.has(next) || (depth.get(next) < d + 1)) {
                depth.set(next, d + 1);
                queue.push(next);
            }
        }
    }
    // Any node never reached (disconnected) → depth 0.
    for (const node of graph.nodes)
        if (!depth.has(node.id))
            depth.set(node.id, 0);
    // Group by depth and spread vertically (centered).
    const byDepth = new Map();
    for (const node of graph.nodes) {
        const d = depth.get(node.id);
        if (!byDepth.has(d))
            byDepth.set(d, []);
        byDepth.get(d).push(node.id);
    }
    const maxDepth = Math.max(0, ...byDepth.keys());
    // Crossing reduction: barycenter sweeps. Order each layer by the mean index
    // of its neighbors in the adjacent layer (downward then upward), which
    // reduces — does not minimize — edge crossings. Deterministic: ties keep the
    // current (stable) order.
    const preds = new Map();
    for (const e of graph.edges) {
        if (!preds.has(e.to))
            preds.set(e.to, []);
        preds.get(e.to).push(e.from);
    }
    const orderLayer = (ids, neighborOf, indexIn) => {
        const bary = new Map();
        ids.forEach((id, i) => {
            const ns = neighborOf(id).map((n) => indexIn.get(n)).filter((v) => v != null);
            bary.set(id, ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : i);
        });
        ids.sort((a, b) => bary.get(a) - bary.get(b));
    };
    const indexMap = (ids) => new Map(ids.map((id, i) => [id, i]));
    for (let sweep = 0; sweep < 2; sweep++) {
        for (let d = 1; d <= maxDepth; d++) { // downward: order by predecessors
            const prev = byDepth.get(d - 1), cur = byDepth.get(d);
            if (prev && cur)
                orderLayer(cur, (id) => preds.get(id) ?? [], indexMap(prev));
        }
        for (let d = maxDepth - 1; d >= 0; d--) { // upward: order by successors
            const next = byDepth.get(d + 1), cur = byDepth.get(d);
            if (next && cur)
                orderLayer(cur, (id) => adj.get(id) ?? [], indexMap(next));
        }
    }
    for (const [d, ids] of byDepth) {
        const count = ids.length;
        ids.forEach((id, i) => {
            const x = (d - maxDepth / 2) * layerGap;
            const y = (i - (count - 1) / 2) * nodeGap;
            pos.set(id, [x, y, 0]);
        });
    }
    return pos;
}
/** Build a board: a VGroup of node + edge mobjects, each tagged with a `matchId`. */
export function buildBoard(graph, opts = {}) {
    const pos = layoutDiagram(graph, opts);
    const board = new VGroup();
    const nodeColor = opts.nodeColor ?? "#58C4DD";
    const edgeColor = opts.edgeColor ?? "#B0B0B0";
    const textColor = opts.textColor ?? "#FFFFFF";
    const fontSize = opts.fontSize ?? 0.32;
    const nodeMobs = new Map();
    for (const node of graph.nodes) {
        const p = pos.get(node.id) ?? [0, 0, 0];
        const box = new RoundedRectangle({ width: 1.8, height: 0.9, cornerRadius: 0.15, color: nodeColor });
        box.setStyle?.({ fillColor: Color.parse(nodeColor), fillOpacity: 0.18, strokeColor: Color.parse(nodeColor), strokeWidth: 3 });
        const label = new RasterText(node.label, { fontSize, color: textColor });
        const group = new VGroup();
        group.add(box);
        group.add(label);
        group.moveTo(p);
        group.matchId = "node:" + node.id;
        board.add(group);
        nodeMobs.set(node.id, group);
    }
    for (const e of graph.edges) {
        let a = pos.get(e.from) ?? [0, 0, 0];
        let b = pos.get(e.to) ?? [0, 0, 0];
        // Trim endpoints to the node boxes' boundaries so arrowheads land on the
        // box edge instead of piercing to its center.
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const dir = [dx / len, dy / len, 0];
        const fromMob = nodeMobs.get(e.from), toMob = nodeMobs.get(e.to);
        try {
            if (fromMob)
                a = fromMob.getBoundaryPoint(dir);
        }
        catch { /* keep center */ }
        try {
            if (toMob)
                b = toMob.getBoundaryPoint([-dir[0], -dir[1], 0]);
        }
        catch { /* keep center */ }
        const arrow = new Arrow(a, b, { color: edgeColor });
        arrow.matchId = `edge:${e.from}->${e.to}`;
        board.add(arrow);
    }
    return board;
}
/** Convenience: parse DSL and build a board in one call. */
export function diagram(dsl, opts = {}) {
    return buildBoard(parseDiagram(dsl), opts);
}
//# sourceMappingURL=diagram.js.map