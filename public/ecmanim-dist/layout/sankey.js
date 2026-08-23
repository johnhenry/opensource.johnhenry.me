// Sankey diagram layout: a pure-math port of d3-sankey.
//
// Isomorphic (no renderer, mobject, or node:* imports) and deterministic:
// there is no randomness anywhere; all sorts are stable (JS Array#sort is
// stable) with explicit index tie-breaks, so the same input always produces
// the same layout.
//
// Algorithm (matching d3-sankey):
//   1. computeNodeLinks   -- resolve link endpoints, build per-node link lists
//   2. computeNodeValues  -- node.value = max(sum in, sum out) (or fixedValue)
//   3. computeNodeDepths  -- breadth-first layering left-to-right (node.depth)
//   4. computeNodeHeights -- breadth-first layering right-to-left (node.height)
//   5. computeNodeBreadths-- assign columns per the align strategy, then run
//      `iterations` rounds of relaxation, alternating right-to-left and
//      left-to-right weighted-median passes with collision resolution
//      (nodePadding) after each pass
//   6. computeLinkBreadths-- stack link offsets (link.y0 / y1 / width)
//
// Nodes and links are mutated in place (like d3-sankey) and the same graph
// object is returned.
// ---------------------------------------------------------------------------
// Align strategies (d3-sankey's sankeyJustify / Left / Right / Center)
// ---------------------------------------------------------------------------
function alignJustify(node, n) {
    return node.sourceLinks.length ? node.depth : n - 1;
}
function alignLeft(node) {
    return node.depth;
}
function alignRight(node, n) {
    return n - 1 - node.height;
}
function alignCenter(node) {
    return node.targetLinks.length
        ? node.depth
        : node.sourceLinks.length
            ? Math.min(...node.sourceLinks.map((l) => l.target.depth)) - 1
            : 0;
}
const ALIGNS = {
    justify: alignJustify,
    left: alignLeft,
    right: alignRight,
    center: alignCenter,
};
// ---------------------------------------------------------------------------
// Comparators (stable, with index tie-breaks)
// ---------------------------------------------------------------------------
function ascendingBreadth(a, b) {
    return a.y0 - b.y0 || a.index - b.index;
}
function ascendingSourceBreadth(a, b) {
    return (a.source.y0 - b.source.y0 ||
        a.index - b.index);
}
function ascendingTargetBreadth(a, b) {
    return (a.target.y0 - b.target.y0 ||
        a.index - b.index);
}
// ---------------------------------------------------------------------------
// sankey
// ---------------------------------------------------------------------------
/**
 * Create a sankey layout function. Call the returned function with
 * `{nodes, links}`; it assigns node {x0, x1, y0, y1, value, depth, height,
 * layer} and link {y0, y1, width} in place and returns the graph.
 */
export function sankey(options = {}) {
    const { nodeId = (d) => d.index, nodeAlign = "justify", nodeWidth = 24, nodePadding = 8, extent = [[0, 0], [1, 1]], nodeSort, linkSort, iterations = 6, } = options;
    const align = typeof nodeAlign === "function" ? nodeAlign : ALIGNS[nodeAlign];
    if (!align)
        throw new Error(`unknown nodeAlign: ${String(nodeAlign)}`);
    const [[x0, y0], [x1, y1]] = extent;
    const dx = nodeWidth;
    // Effective vertical padding: shrunk if a column has too many nodes to fit.
    let py = nodePadding;
    function layout(graph) {
        computeNodeLinks(graph);
        computeNodeValues(graph);
        computeNodeDepths(graph);
        computeNodeHeights(graph);
        computeNodeBreadths(graph);
        computeLinkBreadths(graph);
        return graph;
    }
    function computeNodeLinks({ nodes, links }) {
        for (let i = 0; i < nodes.length; ++i) {
            const node = nodes[i];
            node.index = i;
            node.sourceLinks = [];
            node.targetLinks = [];
        }
        const nodeById = new Map(nodes.map((d, i) => [nodeId(d, i, nodes), d]));
        for (let i = 0; i < links.length; ++i) {
            const link = links[i];
            link.index = i;
            let { source, target } = link;
            if (typeof source !== "object" || source === null) {
                const found = nodeById.get(source);
                if (!found)
                    throw new Error(`missing node: ${String(source)}`);
                source = link.source = found;
            }
            if (typeof target !== "object" || target === null) {
                const found = nodeById.get(target);
                if (!found)
                    throw new Error(`missing node: ${String(target)}`);
                target = link.target = found;
            }
            source.sourceLinks.push(link);
            target.targetLinks.push(link);
        }
        if (linkSort) {
            for (const { sourceLinks, targetLinks } of nodes) {
                sourceLinks.sort(linkSort);
                targetLinks.sort(linkSort);
            }
        }
    }
    function computeNodeValues({ nodes }) {
        for (const node of nodes) {
            node.value =
                node.fixedValue !== undefined
                    ? node.fixedValue
                    : Math.max(node.sourceLinks.reduce((s, l) => s + l.value, 0), node.targetLinks.reduce((s, l) => s + l.value, 0));
        }
    }
    function computeNodeDepths({ nodes }) {
        const n = nodes.length;
        let current = new Set(nodes);
        let next = new Set();
        let x = 0;
        while (current.size) {
            for (const node of current) {
                node.depth = x;
                for (const { target } of node.sourceLinks)
                    next.add(target);
            }
            if (++x > n)
                throw new Error("circular link");
            current = next;
            next = new Set();
        }
    }
    function computeNodeHeights({ nodes }) {
        const n = nodes.length;
        let current = new Set(nodes);
        let next = new Set();
        let x = 0;
        while (current.size) {
            for (const node of current) {
                node.height = x;
                for (const { source } of node.targetLinks)
                    next.add(source);
            }
            if (++x > n)
                throw new Error("circular link");
            current = next;
            next = new Set();
        }
    }
    function computeNodeLayers({ nodes }) {
        const x = Math.max(...nodes.map((d) => d.depth)) + 1;
        const kx = (x1 - x0 - dx) / (x - 1);
        const columns = new Array(x);
        for (const node of nodes) {
            const i = Math.max(0, Math.min(x - 1, Math.floor(align(node, x))));
            node.layer = i;
            node.x0 = x0 + i * kx;
            node.x1 = node.x0 + dx;
            if (columns[i])
                columns[i].push(node);
            else
                columns[i] = [node];
        }
        if (nodeSort) {
            for (const column of columns) {
                column.sort((a, b) => nodeSort(a, b) || a.index - b.index);
            }
        }
        return columns;
    }
    function initializeNodeBreadths(columns) {
        const ky = Math.min(...columns.map((c) => (y1 - y0 - (c.length - 1) * py) /
            c.reduce((s, d) => s + d.value, 0)));
        for (const nodes of columns) {
            let y = y0;
            for (const node of nodes) {
                node.y0 = y;
                node.y1 = y + node.value * ky;
                y = node.y1 + py;
                for (const link of node.sourceLinks)
                    link.width = link.value * ky;
            }
            y = (y1 - y + py) / (nodes.length + 1);
            for (let i = 0; i < nodes.length; ++i) {
                const node = nodes[i];
                node.y0 += y * (i + 1);
                node.y1 += y * (i + 1);
            }
            reorderLinks(nodes);
        }
    }
    function computeNodeBreadths(graph) {
        const columns = computeNodeLayers(graph);
        const maxColumn = Math.max(...columns.map((c) => c.length));
        py = Math.min(nodePadding, (y1 - y0) / (maxColumn - 1));
        initializeNodeBreadths(columns);
        for (let i = 0; i < iterations; ++i) {
            const alpha = Math.pow(0.99, i);
            const beta = Math.max(1 - alpha, (i + 1) / iterations);
            relaxRightToLeft(columns, alpha, beta);
            relaxLeftToRight(columns, alpha, beta);
        }
    }
    /** Reposition each node downstream per its incoming links' positions. */
    function relaxLeftToRight(columns, alpha, beta) {
        for (let i = 1, n = columns.length; i < n; ++i) {
            const column = columns[i];
            for (const target of column) {
                let y = 0;
                let w = 0;
                for (const link of target.targetLinks) {
                    const source = link.source;
                    const v = link.value * (target.layer - source.layer);
                    y += targetTop(source, target) * v;
                    w += v;
                }
                if (!(w > 0))
                    continue;
                const dy = (y / w - target.y0) * alpha;
                target.y0 += dy;
                target.y1 += dy;
                reorderNodeLinks(target);
            }
            if (nodeSort === undefined)
                column.sort(ascendingBreadth);
            resolveCollisions(column, beta);
        }
    }
    /** Reposition each node upstream per its outgoing links' positions. */
    function relaxRightToLeft(columns, alpha, beta) {
        for (let n = columns.length, i = n - 2; i >= 0; --i) {
            const column = columns[i];
            for (const source of column) {
                let y = 0;
                let w = 0;
                for (const link of source.sourceLinks) {
                    const target = link.target;
                    const v = link.value * (target.layer - source.layer);
                    y += sourceTop(source, target) * v;
                    w += v;
                }
                if (!(w > 0))
                    continue;
                const dy = (y / w - source.y0) * alpha;
                source.y0 += dy;
                source.y1 += dy;
                reorderNodeLinks(source);
            }
            if (nodeSort === undefined)
                column.sort(ascendingBreadth);
            resolveCollisions(column, beta);
        }
    }
    function resolveCollisions(nodes, alpha) {
        const i = nodes.length >> 1;
        const subject = nodes[i];
        resolveCollisionsBottomToTop(nodes, subject.y0 - py, i - 1, alpha);
        resolveCollisionsTopToBottom(nodes, subject.y1 + py, i + 1, alpha);
        resolveCollisionsBottomToTop(nodes, y1, nodes.length - 1, alpha);
        resolveCollisionsTopToBottom(nodes, y0, 0, alpha);
    }
    /** Push any overlapping nodes down. */
    function resolveCollisionsTopToBottom(nodes, y, i, alpha) {
        for (; i < nodes.length; ++i) {
            const node = nodes[i];
            const dy = (y - node.y0) * alpha;
            if (dy > 1e-6) {
                node.y0 += dy;
                node.y1 += dy;
            }
            y = node.y1 + py;
        }
    }
    /** Push any overlapping nodes up. */
    function resolveCollisionsBottomToTop(nodes, y, i, alpha) {
        for (; i >= 0; --i) {
            const node = nodes[i];
            const dy = (node.y1 - y) * alpha;
            if (dy > 1e-6) {
                node.y0 -= dy;
                node.y1 -= dy;
            }
            y = node.y0 - py;
        }
    }
    function reorderNodeLinks(node) {
        if (linkSort !== undefined)
            return;
        for (const link of node.targetLinks) {
            link.source.sourceLinks.sort(ascendingTargetBreadth);
        }
        for (const link of node.sourceLinks) {
            link.target.targetLinks.sort(ascendingSourceBreadth);
        }
    }
    function reorderLinks(nodes) {
        if (linkSort !== undefined)
            return;
        for (const { sourceLinks, targetLinks } of nodes) {
            sourceLinks.sort(ascendingTargetBreadth);
            targetLinks.sort(ascendingSourceBreadth);
        }
    }
    /**
     * Y position that link (source -> target) would have if links were sorted
     * by target breadth, used to compute the weighted median in relaxation.
     */
    function targetTop(source, target) {
        let y = source.y0 - ((source.sourceLinks.length - 1) * py) / 2;
        for (const { target: node, width } of source.sourceLinks) {
            if (node === target)
                break;
            y += width + py;
        }
        for (const { source: node, width } of target.targetLinks) {
            if (node === source)
                break;
            y += width;
        }
        return y;
    }
    function sourceTop(source, target) {
        let y = target.y0 - ((target.targetLinks.length - 1) * py) / 2;
        for (const { source: node, width } of target.targetLinks) {
            if (node === source)
                break;
            y += width + py;
        }
        for (const { target: node, width } of source.sourceLinks) {
            if (node === target)
                break;
            y += width;
        }
        return y;
    }
    function computeLinkBreadths({ nodes }) {
        for (const node of nodes) {
            let ly0 = node.y0;
            let ly1 = ly0;
            for (const link of node.sourceLinks) {
                link.y0 = ly0 + link.width / 2;
                ly0 += link.width;
            }
            for (const link of node.targetLinks) {
                link.y1 = ly1 + link.width / 2;
                ly1 += link.width;
            }
        }
    }
    return layout;
}
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
export function sankeyLinkHorizontalPoints(link, samples) {
    const source = link.source;
    const target = link.target;
    const px0 = source.x1;
    const py0 = link.y0;
    const px1 = target.x0;
    const py1 = link.y1;
    const mx = (px0 + px1) / 2;
    const controls = [
        [px0, py0],
        [mx, py0],
        [mx, py1],
        [px1, py1],
    ];
    if (samples === undefined)
        return controls;
    if (!(samples >= 2))
        throw new Error("samples must be >= 2");
    const out = [];
    for (let i = 0; i < samples; ++i) {
        const t = i / (samples - 1);
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const c = 3 * u * t * t;
        const d = t * t * t;
        out.push([
            a * controls[0][0] + b * controls[1][0] + c * controls[2][0] + d * controls[3][0],
            a * controls[0][1] + b * controls[1][1] + c * controls[2][1] + d * controls[3][1],
        ]);
    }
    return out;
}
//# sourceMappingURL=sankey.js.map