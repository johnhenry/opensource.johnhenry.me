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
// ---------------------------------------------------------------------------
// Deterministic LCG (d3-hierarchy/src/lcg.js) — used by pack/enclose shuffles.
// ---------------------------------------------------------------------------
const lcgA = 1664525;
const lcgC = 1013904223;
const lcgM = 4294967296; // 2^32
function lcg() {
    let s = 1;
    return () => (s = (lcgA * s + lcgC) % lcgM) / lcgM;
}
function shuffle(array, random) {
    let m = array.length;
    let t;
    let i;
    while (m) {
        i = (random() * m--) | 0;
        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }
    return array;
}
/** Computes node.height = max distance to a leaf (d3 computeHeight). */
function computeHeight(node) {
    let height = 0;
    let n = node;
    do {
        n.height = height;
    } while ((n = n.parent) !== null && n.height < ++height);
}
/** d3's count() reducer: leaves count 1; internal nodes sum children. */
function countNode(node) {
    let sum = 0;
    const children = node.children;
    let i = children ? children.length : 0;
    if (!i)
        sum = 1;
    else
        while (--i >= 0)
            sum += children[i].value;
    node.value = sum;
}
export class HierarchyNode {
    data;
    depth;
    height;
    parent;
    children;
    /** Set by sum()/count(). */
    value;
    /** Set by stratify(). */
    id;
    /** Set by treemap()/partition(). */
    x0;
    y0;
    x1;
    y1;
    /** Set by pack() (x, y, r) and tree()/cluster() (x, y). */
    x;
    y;
    r;
    constructor(data) {
        this.data = data;
        this.depth = 0;
        this.height = 0;
        this.parent = null;
    }
    /**
     * Post-order aggregation. Matches d3 exactly: node.value = the node's OWN
     * value (+value(node.data) || 0, so NaN/negative-coercion follows d3) PLUS
     * the sum of its children's already-computed values.
     */
    sum(value) {
        return this.eachAfter((node) => {
            let sum = +value(node.data) || 0;
            const children = node.children;
            let i = children ? children.length : 0;
            while (--i >= 0)
                sum += children[i].value;
            node.value = sum;
        });
    }
    /** node.value = number of leaves under (and including) the node. */
    count() {
        return this.eachAfter(countNode);
    }
    /**
     * Breadth-first traversal (same order as the node iterator / descendants()).
     */
    each(callback, that) {
        let index = -1;
        for (const node of this) {
            callback.call(that, node, ++index, this);
        }
        return this;
    }
    /** Post-order traversal (children before parents). */
    eachAfter(callback, that) {
        const nodes = [this];
        const next = [];
        let node;
        let index = -1;
        while ((node = nodes.pop()) !== undefined) {
            next.push(node);
            const children = node.children;
            if (children)
                for (let i = 0, n = children.length; i < n; ++i)
                    nodes.push(children[i]);
        }
        while ((node = next.pop()) !== undefined) {
            callback.call(that, node, ++index, this);
        }
        return this;
    }
    /** Pre-order traversal (parents before children). */
    eachBefore(callback, that) {
        const nodes = [this];
        let node;
        let index = -1;
        while ((node = nodes.pop()) !== undefined) {
            callback.call(that, node, ++index, this);
            const children = node.children;
            if (children)
                for (let i = children.length - 1; i >= 0; --i)
                    nodes.push(children[i]);
        }
        return this;
    }
    /** First node (in breadth-first order) for which callback returns truthy. */
    find(callback, that) {
        let index = -1;
        for (const node of this) {
            if (callback.call(that, node, ++index, this))
                return node;
        }
        return undefined;
    }
    /**
     * Sorts children of every node (pre-order, MUTATES children arrays in
     * place, like d3). Call after sum() and before a layout.
     */
    sort(compare) {
        return this.eachBefore((node) => {
            if (node.children)
                node.children.sort(compare);
        });
    }
    /** Shortest path through the lowest common ancestor (d3 node.path). */
    path(end) {
        let start = this;
        const ancestor = leastCommonAncestor(start, end);
        const nodes = [start];
        while (start !== ancestor) {
            start = start.parent;
            nodes.push(start);
        }
        const k = nodes.length;
        let e = end;
        while (e !== ancestor) {
            nodes.splice(k, 0, e);
            e = e.parent;
        }
        return nodes;
    }
    /** This node, then each parent up to the root. */
    ancestors() {
        let node = this;
        const nodes = [node];
        while ((node = node.parent) !== null)
            nodes.push(node);
        return nodes;
    }
    /** All nodes in breadth-first order (self first). */
    descendants() {
        return Array.from(this);
    }
    /** All leaf nodes in pre-order. */
    leaves() {
        const leaves = [];
        this.eachBefore((node) => {
            if (!node.children)
                leaves.push(node);
        });
        return leaves;
    }
    /** {source: parent, target: child} for every descendant edge. */
    links() {
        const root = this;
        const links = [];
        root.each((node) => {
            if (node !== root)
                links.push({ source: node.parent, target: node });
        });
        return links;
    }
    /** Breadth-first iterator (d3 Node[Symbol.iterator]). */
    *[Symbol.iterator]() {
        let node = this;
        let current;
        let next = [node];
        do {
            current = next.reverse();
            next = [];
            while ((node = current.pop()) !== undefined) {
                yield node;
                const children = node.children;
                if (children)
                    for (let i = 0, n = children.length; i < n; ++i)
                        next.push(children[i]);
            }
        } while (next.length);
    }
}
function leastCommonAncestor(a, b) {
    if (a === b)
        return a;
    const aNodes = a.ancestors();
    const bNodes = b.ancestors();
    let c = null;
    let ai = aNodes.length - 1;
    let bi = bNodes.length - 1;
    let an = aNodes[ai];
    let bn = bNodes[bi];
    while (an === bn) {
        c = an;
        an = aNodes[--ai];
        bn = bNodes[--bi];
    }
    return c;
}
function objectChildren(d) {
    return d.children;
}
function mapChildren(d) {
    return Array.isArray(d) ? d[1] : null;
}
/**
 * Constructs a root HierarchyNode from hierarchical data. `children` returns
 * an iterable of children (default: d.children). Maps are treated as
 * [key, value] entries like d3 (children of a Map node are its entries).
 */
export function hierarchy(data, children) {
    let accessor;
    let rootData = data;
    if (data instanceof Map) {
        // d3 wraps Map roots as a [key, value] entry; children default to entries.
        rootData = [undefined, data];
        accessor =
            children ?? mapChildren;
    }
    else {
        accessor = children ?? objectChildren;
    }
    const root = new HierarchyNode(rootData);
    const nodes = [root];
    let node;
    while ((node = nodes.pop()) !== undefined) {
        const childData = accessor(node.data);
        if (childData) {
            const childs = Array.from(childData);
            const n = childs.length;
            if (n) {
                const childNodes = new Array(n);
                node.children = childNodes;
                for (let i = n - 1; i >= 0; --i) {
                    const child = (childNodes[i] = new HierarchyNode(childs[i]));
                    nodes.push(child);
                    child.parent = node;
                    child.depth = node.depth + 1;
                }
            }
        }
    }
    return root.eachBefore(computeHeight);
}
function defaultId(d) {
    return d.id;
}
function defaultParentId(d) {
    return d.parentId;
}
// Path helpers (verbatim d3 semantics): slashes may be escaped with
// backslashes; trailing slash stripped; leading slash added.
function slash(path, i) {
    if (path[i] === "/") {
        let k = 0;
        while (i > 0 && path[--i] === "\\")
            ++k;
        if ((k & 1) === 0)
            return true;
    }
    return false;
}
function normalizePath(path) {
    let p = `${path}`;
    const i = p.length;
    if (slash(p, i - 1) && !slash(p, i - 2))
        p = p.slice(0, -1);
    return p[0] === "/" ? p : `/${p}`;
}
// "/foo/bar" → "/foo", "/foo" → "/", "/" → "" (root id must be truthy).
function parentofPath(path) {
    let i = path.length;
    if (i < 2)
        return "";
    while (--i > 1)
        if (slash(path, i))
            break;
    return path.slice(0, i);
}
/**
 * Builds a hierarchy from tabular data.
 *
 * DIVERGENCE (additive): accepts an options object — stratify({id, parentId})
 * or stratify({path}) — in addition to d3's fluent accessors, which are also
 * provided (.id(), .parentId(), .path()).
 */
export function stratify(options) {
    let id = defaultId;
    let parentId = defaultParentId;
    let path = null;
    if (options) {
        if (options.id)
            id = options.id;
        if (options.parentId)
            parentId = options.parentId;
        if (options.path)
            path = options.path;
    }
    // Sentinels (d3 uses object identity for both).
    const ambiguous = {};
    const imputed = {};
    function op(data) {
        const array = Array.from(data);
        let currentId = id;
        let currentParentId = parentId;
        const nodeByKey = new Map();
        let root;
        if (path != null) {
            const p = path;
            const I = array.map((d, i) => normalizePath(p(d, i, data)));
            const P = I.map(parentofPath);
            const S = new Set(I).add("");
            for (const pi of P) {
                if (!S.has(pi)) {
                    S.add(pi);
                    I.push(pi);
                    P.push(parentofPath(pi));
                    array.push(imputed);
                }
            }
            currentId = (_, i) => I[i];
            currentParentId = (_, i) => P[i];
        }
        let n = array.length;
        const nodes = new Array(n);
        const parentIds = new Array(n);
        for (let i = 0; i < n; ++i) {
            const d = array[i];
            const node = (nodes[i] = new HierarchyNode(d));
            let nodeId = currentId(d, i, data);
            if (nodeId != null && (nodeId = `${nodeId}`)) {
                const nodeKey = (node.id = nodeId);
                nodeByKey.set(nodeKey, nodeByKey.has(nodeKey) ? ambiguous : node);
            }
            let pid = currentParentId(d, i, data);
            if (pid != null && (pid = `${pid}`)) {
                parentIds[i] = pid;
            }
        }
        for (let i = 0; i < n; ++i) {
            const node = nodes[i];
            const nodeId = parentIds[i];
            if (nodeId) {
                const parent = nodeByKey.get(nodeId);
                if (!parent)
                    throw new Error("missing: " + nodeId);
                if (parent === ambiguous)
                    throw new Error("ambiguous: " + nodeId);
                const parentNode = parent;
                if (parentNode.children)
                    parentNode.children.push(node);
                else
                    parentNode.children = [node];
                node.parent = parentNode;
            }
            else {
                if (root)
                    throw new Error("multiple roots");
                root = node;
            }
        }
        if (!root)
            throw new Error("no root");
        // When imputing internal nodes, only introduce roots if needed.
        // Then replace the imputed marker data with null.
        if (path != null) {
            while (root.data === imputed && root.children.length === 1) {
                root = root.children[0];
                --n;
            }
            for (let i = nodes.length - 1; i >= 0; --i) {
                const node = nodes[i];
                if (node.data !== imputed)
                    break;
                node.data = null;
            }
        }
        const preroot = { depth: -1 };
        root.parent = preroot;
        root
            .eachBefore((node) => {
            node.depth = node.parent.depth + 1;
            --n;
        })
            .eachBefore(computeHeight);
        root.parent = null;
        if (n > 0)
            throw new Error("cycle");
        return root;
    }
    const operator = op;
    operator.id = function (x) {
        if (x === undefined)
            return id;
        if (typeof x !== "function")
            throw new Error("id is not a function");
        id = x;
        return operator;
    };
    operator.parentId = function (x) {
        if (x === undefined)
            return parentId;
        if (typeof x !== "function")
            throw new Error("parentId is not a function");
        parentId = x;
        return operator;
    };
    operator.path = function (x) {
        if (x === undefined)
            return path;
        if (x !== null && typeof x !== "function")
            throw new Error("path is not a function");
        path = x;
        return operator;
    };
    return operator;
}
/** Golden ratio — d3's default squarify target aspect ratio. */
export const phi = (1 + Math.sqrt(5)) / 2;
/** Horizontal subdivision: children side by side, x varies, full height. */
export const treemapDice = (parent, x0, y0, x1, y1) => {
    const nodes = parent.children;
    const n = nodes.length;
    const k = parent.value && (x1 - x0) / parent.value;
    let x = x0;
    for (let i = 0; i < n; ++i) {
        const node = nodes[i];
        node.y0 = y0;
        node.y1 = y1;
        node.x0 = x;
        node.x1 = x += node.value * k;
    }
};
/** Vertical subdivision: children stacked, y varies, full width. */
export const treemapSlice = (parent, x0, y0, x1, y1) => {
    const nodes = parent.children;
    const n = nodes.length;
    const k = parent.value && (y1 - y0) / parent.value;
    let y = y0;
    for (let i = 0; i < n; ++i) {
        const node = nodes[i];
        node.x0 = x0;
        node.x1 = x1;
        node.y0 = y;
        node.y1 = y += node.value * k;
    }
};
/** Alternates dice (even depth) and slice (odd depth), like d3. */
export const treemapSliceDice = (parent, x0, y0, x1, y1) => {
    ((parent.depth ?? 0) & 1 ? treemapSlice : treemapDice)(parent, x0, y0, x1, y1);
};
/**
 * d3's squarifyRatio: greedily fills rows along the shorter side, adding
 * nodes while the worst aspect ratio (relative to `ratio`) doesn't degrade.
 */
function squarifyRatio(ratio, parent, x0, y0, x1, y1) {
    const rows = [];
    const nodes = parent.children;
    const n = nodes.length;
    let i0 = 0;
    let i1 = 0;
    let value = parent.value;
    while (i0 < n) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        // Find the next non-empty node.
        let sumValue;
        do
            sumValue = nodes[i1++].value;
        while (!sumValue && i1 < n);
        let minValue = sumValue;
        let maxValue = sumValue;
        const alpha = Math.max(dy / dx, dx / dy) / (value * ratio);
        let beta = sumValue * sumValue * alpha;
        let minRatio = Math.max(maxValue / beta, beta / minValue);
        // Keep adding nodes while the aspect ratio maintains or improves.
        for (; i1 < n; ++i1) {
            const nodeValue = nodes[i1].value;
            sumValue += nodeValue;
            if (nodeValue < minValue)
                minValue = nodeValue;
            if (nodeValue > maxValue)
                maxValue = nodeValue;
            beta = sumValue * sumValue * alpha;
            const newRatio = Math.max(maxValue / beta, beta / minValue);
            if (newRatio > minRatio) {
                sumValue -= nodeValue;
                break;
            }
            minRatio = newRatio;
        }
        // Position and record the row orientation.
        const row = { value: sumValue, dice: dx < dy, children: nodes.slice(i0, i1) };
        rows.push(row);
        if (row.dice) {
            treemapDice(row, x0, y0, x1, value ? (y0 += (dy * sumValue) / value) : y1);
        }
        else {
            treemapSlice(row, x0, y0, value ? (x0 += (dx * sumValue) / value) : x1, y1);
        }
        value -= sumValue;
        i0 = i1;
    }
    return rows;
}
function customSquarify(ratio) {
    const squarify = ((parent, x0, y0, x1, y1) => {
        squarifyRatio(ratio, parent, x0, y0, x1, y1);
    });
    squarify.ratio = (x) => customSquarify((x = +x) > 1 ? x : 1);
    return squarify;
}
/**
 * Squarified treemap tiling (Bruls et al.) minimizing worst aspect ratio;
 * rows run along the shorter side. Default target ratio: golden ratio (phi).
 */
export const treemapSquarify = customSquarify(phi);
/** Recursive binary partition balancing value halves. */
export const treemapBinary = (parent, x0, y0, x1, y1) => {
    const nodes = parent.children;
    const n = nodes.length;
    const sums = new Array(n + 1);
    let sum = (sums[0] = 0);
    for (let i = 0; i < n; ++i) {
        sums[i + 1] = sum += nodes[i].value;
    }
    function partition(i, j, value, x0, y0, x1, y1) {
        if (i >= j - 1) {
            const node = nodes[i];
            node.x0 = x0;
            node.y0 = y0;
            node.x1 = x1;
            node.y1 = y1;
            return;
        }
        const valueOffset = sums[i];
        const valueTarget = value / 2 + valueOffset;
        let k = i + 1;
        let hi = j - 1;
        while (k < hi) {
            const mid = (k + hi) >>> 1;
            if (sums[mid] < valueTarget)
                k = mid + 1;
            else
                hi = mid;
        }
        if (valueTarget - sums[k - 1] < sums[k] - valueTarget && i + 1 < k)
            --k;
        const valueLeft = sums[k] - valueOffset;
        const valueRight = value - valueLeft;
        if (x1 - x0 > y1 - y0) {
            const xk = value ? (x0 * valueRight + x1 * valueLeft) / value : x1;
            partition(i, k, valueLeft, x0, y0, xk, y1);
            partition(k, j, valueRight, xk, y0, x1, y1);
        }
        else {
            const yk = value ? (y0 * valueRight + y1 * valueLeft) / value : y1;
            partition(i, k, valueLeft, x0, y0, x1, yk);
            partition(k, j, valueRight, x0, yk, x1, y1);
        }
    }
    partition(0, n, parent.value, x0, y0, x1, y1);
};
// ---------------------------------------------------------------------------
// treemap() layout
// ---------------------------------------------------------------------------
function constantZero() {
    return 0;
}
function constant(x) {
    return () => x;
}
function roundNode(node) {
    node.x0 = Math.round(node.x0);
    node.y0 = Math.round(node.y0);
    node.x1 = Math.round(node.x1);
    node.y1 = Math.round(node.y1);
}
/**
 * Treemap layout. Defaults match d3: squarify tiling (golden ratio), size
 * [1, 1], zero padding, no rounding.
 */
export function treemap() {
    let tile = treemapSquarify;
    let round = false;
    let dx = 1;
    let dy = 1;
    let paddingStack = [0];
    let paddingInner = constantZero;
    let paddingTop = constantZero;
    let paddingRight = constantZero;
    let paddingBottom = constantZero;
    let paddingLeft = constantZero;
    function layout(root) {
        root.x0 = root.y0 = 0;
        root.x1 = dx;
        root.y1 = dy;
        root.eachBefore(positionNode);
        paddingStack = [0];
        if (round)
            root.eachBefore(roundNode);
        return root;
    }
    function positionNode(node) {
        let p = paddingStack[node.depth];
        let x0 = node.x0 + p;
        let y0 = node.y0 + p;
        let x1 = node.x1 - p;
        let y1 = node.y1 - p;
        if (x1 < x0)
            x0 = x1 = (x0 + x1) / 2;
        if (y1 < y0)
            y0 = y1 = (y0 + y1) / 2;
        node.x0 = x0;
        node.y0 = y0;
        node.x1 = x1;
        node.y1 = y1;
        if (node.children) {
            p = paddingStack[node.depth + 1] = paddingInner(node) / 2;
            x0 += paddingLeft(node) - p;
            y0 += paddingTop(node) - p;
            x1 -= paddingRight(node) - p;
            y1 -= paddingBottom(node) - p;
            if (x1 < x0)
                x0 = x1 = (x0 + x1) / 2;
            if (y1 < y0)
                y0 = y1 = (y0 + y1) / 2;
            tile(node, x0, y0, x1, y1);
        }
    }
    const self = layout;
    self.round = function (x) {
        if (x === undefined)
            return round;
        round = !!x;
        return self;
    };
    self.size = function (x) {
        if (x === undefined)
            return [dx, dy];
        dx = +x[0];
        dy = +x[1];
        return self;
    };
    self.tile = function (x) {
        if (x === undefined)
            return tile;
        if (typeof x !== "function")
            throw new Error("tile is not a function");
        tile = x;
        return self;
    };
    self.padding = function (x) {
        if (x === undefined)
            return self.paddingInner();
        return self.paddingInner(x).paddingOuter(x);
    };
    self.paddingInner = function (x) {
        if (x === undefined)
            return paddingInner;
        paddingInner = typeof x === "function" ? x : constant(+x);
        return self;
    };
    self.paddingOuter = function (x) {
        if (x === undefined)
            return self.paddingTop();
        return self.paddingTop(x).paddingRight(x).paddingBottom(x).paddingLeft(x);
    };
    self.paddingTop = function (x) {
        if (x === undefined)
            return paddingTop;
        paddingTop = typeof x === "function" ? x : constant(+x);
        return self;
    };
    self.paddingRight = function (x) {
        if (x === undefined)
            return paddingRight;
        paddingRight = typeof x === "function" ? x : constant(+x);
        return self;
    };
    self.paddingBottom = function (x) {
        if (x === undefined)
            return paddingBottom;
        paddingBottom = typeof x === "function" ? x : constant(+x);
        return self;
    };
    self.paddingLeft = function (x) {
        if (x === undefined)
            return paddingLeft;
        paddingLeft = typeof x === "function" ? x : constant(+x);
        return self;
    };
    return self;
}
/** Partition layout. Defaults match d3: size [1, 1], padding 0, round false. */
export function partition() {
    let dx = 1;
    let dy = 1;
    let padding = 0;
    let round = false;
    function layout(root) {
        const n = root.height + 1;
        root.x0 = root.y0 = padding;
        root.x1 = dx;
        root.y1 = dy / n;
        root.eachBefore(positionNode(dy, n));
        if (round)
            root.eachBefore(roundNode);
        return root;
    }
    function positionNode(dy, n) {
        return (node) => {
            if (node.children) {
                treemapDice(node, node.x0, (dy * (node.depth + 1)) / n, node.x1, (dy * (node.depth + 2)) / n);
            }
            let x0 = node.x0;
            let y0 = node.y0;
            let x1 = node.x1 - padding;
            let y1 = node.y1 - padding;
            if (x1 < x0)
                x0 = x1 = (x0 + x1) / 2;
            if (y1 < y0)
                y0 = y1 = (y0 + y1) / 2;
            node.x0 = x0;
            node.y0 = y0;
            node.x1 = x1;
            node.y1 = y1;
        };
    }
    const self = layout;
    self.round = function (x) {
        if (x === undefined)
            return round;
        round = !!x;
        return self;
    };
    self.size = function (x) {
        if (x === undefined)
            return [dx, dy];
        dx = +x[0];
        dy = +x[1];
        return self;
    };
    self.padding = function (x) {
        if (x === undefined)
            return padding;
        padding = +x;
        return self;
    };
    return self;
}
/**
 * Smallest circle enclosing the given circles (d3 packEnclose; Welzl's
 * algorithm with a deterministic LCG shuffle, identical results to d3).
 */
export function packEnclose(circles) {
    return packEncloseRandom(Array.from(circles), lcg());
}
function packEncloseRandom(circles, random) {
    let i = 0;
    const shuffled = shuffle(Array.from(circles), random);
    const n = shuffled.length;
    let B = [];
    let e;
    while (i < n) {
        const p = shuffled[i];
        if (e && enclosesWeak(e, p))
            ++i;
        else {
            e = encloseBasis((B = extendBasis(B, p)));
            i = 0;
        }
    }
    return e;
}
function extendBasis(B, p) {
    if (enclosesWeakAll(p, B))
        return [p];
    // If we get here then B must have at least one element.
    for (let i = 0; i < B.length; ++i) {
        if (enclosesNot(p, B[i]) && enclosesWeakAll(encloseBasis2(B[i], p), B)) {
            return [B[i], p];
        }
    }
    // If we get here then B must have at least two elements.
    for (let i = 0; i < B.length - 1; ++i) {
        for (let j = i + 1; j < B.length; ++j) {
            if (enclosesNot(encloseBasis2(B[i], B[j]), p) &&
                enclosesNot(encloseBasis2(B[i], p), B[j]) &&
                enclosesNot(encloseBasis2(B[j], p), B[i]) &&
                enclosesWeakAll(encloseBasis3(B[i], B[j], p), B)) {
                return [B[i], B[j], p];
            }
        }
    }
    // If we get here then something is very wrong.
    throw new Error("unexpected enclose basis state");
}
function enclosesNot(a, b) {
    const dr = a.r - b.r;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dr < 0 || dr * dr < dx * dx + dy * dy;
}
function enclosesWeak(a, b) {
    const dr = a.r - b.r + Math.max(a.r, b.r, 1) * 1e-9;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dr > 0 && dr * dr > dx * dx + dy * dy;
}
function enclosesWeakAll(a, B) {
    for (let i = 0; i < B.length; ++i) {
        if (!enclosesWeak(a, B[i]))
            return false;
    }
    return true;
}
function encloseBasis(B) {
    switch (B.length) {
        case 1:
            return encloseBasis1(B[0]);
        case 2:
            return encloseBasis2(B[0], B[1]);
        default:
            return encloseBasis3(B[0], B[1], B[2]);
    }
}
function encloseBasis1(a) {
    return { x: a.x, y: a.y, r: a.r };
}
function encloseBasis2(a, b) {
    const x1 = a.x, y1 = a.y, r1 = a.r;
    const x2 = b.x, y2 = b.y, r2 = b.r;
    const x21 = x2 - x1, y21 = y2 - y1, r21 = r2 - r1;
    const l = Math.sqrt(x21 * x21 + y21 * y21);
    return {
        x: (x1 + x2 + (x21 / l) * r21) / 2,
        y: (y1 + y2 + (y21 / l) * r21) / 2,
        r: (l + r1 + r2) / 2,
    };
}
function encloseBasis3(a, b, c) {
    const x1 = a.x, y1 = a.y, r1 = a.r;
    const x2 = b.x, y2 = b.y, r2 = b.r;
    const x3 = c.x, y3 = c.y, r3 = c.r;
    const a2 = x1 - x2, a3 = x1 - x3, b2 = y1 - y2, b3 = y1 - y3, c2 = r2 - r1, c3 = r3 - r1;
    const d1 = x1 * x1 + y1 * y1 - r1 * r1;
    const d2 = d1 - x2 * x2 - y2 * y2 + r2 * r2;
    const d3 = d1 - x3 * x3 - y3 * y3 + r3 * r3;
    const ab = a3 * b2 - a2 * b3;
    const xa = (b2 * d3 - b3 * d2) / (ab * 2) - x1;
    const xb = (b3 * c2 - b2 * c3) / ab;
    const ya = (a3 * d2 - a2 * d3) / (ab * 2) - y1;
    const yb = (a2 * c3 - a3 * c2) / ab;
    const A = xb * xb + yb * yb - 1;
    const B = 2 * (r1 + xa * xb + ya * yb);
    const C = xa * xa + ya * ya - r1 * r1;
    const r = -(Math.abs(A) > 1e-6 ? (B + Math.sqrt(B * B - 4 * A * C)) / (2 * A) : C / B);
    return {
        x: x1 + xa + xb * r,
        y: y1 + ya + yb * r,
        r,
    };
}
// ---------------------------------------------------------------------------
// packSiblings — front-chain circle packing (Wang et al.)
// ---------------------------------------------------------------------------
/** Positions circle c tangent to a and b (d3 place()). */
function place(b, a, c) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d2 = dx * dx + dy * dy;
    if (d2) {
        let a2 = a.r + c.r;
        a2 *= a2;
        let b2 = b.r + c.r;
        b2 *= b2;
        if (a2 > b2) {
            const x = (d2 + b2 - a2) / (2 * d2);
            const y = Math.sqrt(Math.max(0, b2 / d2 - x * x));
            c.x = b.x - x * dx - y * dy;
            c.y = b.y - x * dy + y * dx;
        }
        else {
            const x = (d2 + a2 - b2) / (2 * d2);
            const y = Math.sqrt(Math.max(0, a2 / d2 - x * x));
            c.x = a.x + x * dx - y * dy;
            c.y = a.y + x * dy + y * dx;
        }
    }
    else {
        c.x = a.x + c.r;
        c.y = a.y;
    }
}
function intersects(a, b) {
    const dr = a.r + b.r - 1e-6;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dr > 0 && dr * dr > dx * dx + dy * dy;
}
/** Doubly-linked front-chain node (renamed from d3's internal `Node`). */
class ChainLink {
    _;
    next = null;
    previous = null;
    constructor(circle) {
        this._ = circle;
    }
}
function score(node) {
    const a = node._;
    const b = node.next._;
    const ab = a.r + b.r;
    const dx = (a.x * b.r + b.x * a.r) / ab;
    const dy = (a.y * b.r + b.y * a.r) / ab;
    return dx * dx + dy * dy;
}
function packSiblingsRandom(circles, random) {
    const n = circles.length;
    if (!n)
        return 0;
    let a, b, c;
    // Place the first circle.
    a = circles[0];
    a.x = 0;
    a.y = 0;
    if (!(n > 1))
        return a.r;
    // Place the second circle.
    b = circles[1];
    a.x = -b.r;
    b.x = a.r;
    b.y = 0;
    if (!(n > 2))
        return a.r + b.r;
    // Place the third circle.
    place(b, a, (c = circles[2]));
    // Initialize the front-chain using the first three circles a, b and c.
    let na = new ChainLink(a);
    let nb = new ChainLink(b);
    let nc = new ChainLink(c);
    na.next = nc.previous = nb;
    nb.next = na.previous = nc;
    nc.next = nb.previous = na;
    // Attempt to place each remaining circle…
    pack: for (let i = 3; i < n; ++i) {
        place(na._, nb._, (c = circles[i]));
        nc = new ChainLink(c);
        // Find the closest intersecting circle on the front-chain, if any.
        // "Closeness" is determined by linear distance along the front-chain.
        // "Ahead" or "behind" is likewise determined by linear distance.
        let j = nb.next;
        let k = na.previous;
        let sj = nb._.r;
        let sk = na._.r;
        do {
            if (sj <= sk) {
                if (intersects(j._, nc._)) {
                    nb = j;
                    na.next = nb;
                    nb.previous = na;
                    --i;
                    continue pack;
                }
                sj += j._.r;
                j = j.next;
            }
            else {
                if (intersects(k._, nc._)) {
                    na = k;
                    na.next = nb;
                    nb.previous = na;
                    --i;
                    continue pack;
                }
                sk += k._.r;
                k = k.previous;
            }
        } while (j !== k.next);
        // Success! Insert the new circle c between a and b.
        nc.previous = na;
        nc.next = nb;
        na.next = nb.previous = nc;
        // Compute the new closest circle pair to the centroid.
        nb = nc;
        let aa = score(na);
        let cursor = nc;
        while ((cursor = cursor.next) !== nb) {
            const ca = score(cursor);
            if (ca < aa) {
                na = cursor;
                aa = ca;
            }
        }
        nb = na.next;
    }
    // Compute the enclosing circle of the front chain.
    const chain = [nb._];
    let cursor = nb;
    while ((cursor = cursor.next) !== nb)
        chain.push(cursor._);
    const e = packEncloseRandom(chain, random);
    // Translate the circles to put the enclosing circle around the origin.
    for (let i = 0; i < n; ++i) {
        const circle = circles[i];
        circle.x -= e.x;
        circle.y -= e.y;
    }
    return e.r;
}
/**
 * Packs the given circles (each with a radius r) tightly, assigning x and y;
 * the enclosing circle is centered near the origin. Mutates and returns the
 * input array. Deterministic (d3's LCG), identical output to d3.
 */
export function packSiblings(circles) {
    packSiblingsRandom(circles, lcg());
    return circles;
}
function defaultPackRadius(d) {
    return Math.sqrt(d.value);
}
/**
 * Circle-packing layout. Defaults match d3: radius null (sqrt of value,
 * rescaled to fit), size [1, 1], padding 0. Root circle is centered at
 * (w/2, h/2).
 */
export function pack() {
    let radius = null;
    let dx = 1;
    let dy = 1;
    let padding = constantZero;
    function layout(root) {
        const random = lcg();
        root.x = dx / 2;
        root.y = dy / 2;
        if (radius) {
            root
                .eachBefore(radiusLeaf(radius))
                .eachAfter(packChildrenRandom(padding, 0.5, random))
                .eachBefore(translateChild(1));
        }
        else {
            root
                .eachBefore(radiusLeaf(defaultPackRadius))
                .eachAfter(packChildrenRandom(constantZero, 1, random))
                .eachAfter(packChildrenRandom(padding, root.r / Math.min(dx, dy), random))
                .eachBefore(translateChild(Math.min(dx, dy) / (2 * root.r)));
        }
        return root;
    }
    function radiusLeaf(radius) {
        return (node) => {
            if (!node.children) {
                node.r = Math.max(0, +radius(node) || 0);
            }
        };
    }
    function packChildrenRandom(padding, k, random) {
        return (node) => {
            const children = node.children;
            if (children) {
                const n = children.length;
                const r = padding(node) * k || 0;
                if (r)
                    for (let i = 0; i < n; ++i)
                        children[i].r += r;
                const e = packSiblingsRandom(children, random);
                if (r)
                    for (let i = 0; i < n; ++i)
                        children[i].r -= r;
                node.r = e + r;
            }
        };
    }
    function translateChild(k) {
        return (node) => {
            const parent = node.parent;
            node.r *= k;
            if (parent) {
                node.x = parent.x + k * node.x;
                node.y = parent.y + k * node.y;
            }
        };
    }
    const self = layout;
    self.radius = function (x) {
        if (x === undefined)
            return radius;
        if (x !== null && typeof x !== "function")
            throw new Error("radius is not a function");
        radius = x;
        return self;
    };
    self.size = function (x) {
        if (x === undefined)
            return [dx, dy];
        dx = +x[0];
        dy = +x[1];
        return self;
    };
    self.padding = function (x) {
        if (x === undefined)
            return padding;
        padding = typeof x === "function" ? x : constant(+x);
        return self;
    };
    return self;
}
function defaultSeparation(a, b) {
    return a.parent === b.parent ? 1 : 2;
}
/** Working wrapper node for the Buchheim walks (d3 TreeNode). */
class TreeWrap {
    _;
    parent = null;
    children = null;
    A = null; // default ancestor
    a; // ancestor
    z = 0; // prelim
    m = 0; // mod
    c = 0; // change
    s = 0; // shift
    t = null; // thread
    i; // sibling index
    constructor(node, i) {
        this._ = node;
        this.a = this;
        this.i = i;
    }
}
function treeWrapEachBefore(root, callback) {
    const nodes = [root];
    let node;
    while ((node = nodes.pop()) !== undefined) {
        callback(node);
        const children = node.children;
        if (children)
            for (let i = children.length - 1; i >= 0; --i)
                nodes.push(children[i]);
    }
}
function treeWrapEachAfter(root, callback) {
    const nodes = [root];
    const next = [];
    let node;
    while ((node = nodes.pop()) !== undefined) {
        next.push(node);
        const children = node.children;
        if (children)
            for (let i = 0, n = children.length; i < n; ++i)
                nodes.push(children[i]);
    }
    while ((node = next.pop()) !== undefined)
        callback(node);
}
function treeRoot(root) {
    const tree = new TreeWrap(root, 0);
    const nodes = [tree];
    let node;
    while ((node = nodes.pop()) !== undefined) {
        const children = node._.children;
        if (children) {
            const n = children.length;
            node.children = new Array(n);
            for (let i = n - 1; i >= 0; --i) {
                const child = (node.children[i] = new TreeWrap(children[i], i));
                nodes.push(child);
                child.parent = node;
            }
        }
    }
    (tree.parent = new TreeWrap(null, 0)).children = [tree];
    return tree;
}
// Left/right contour successors (child or thread).
function nextLeft(v) {
    const children = v.children;
    return children ? children[0] : v.t;
}
function nextRight(v) {
    const children = v.children;
    return children ? children[children.length - 1] : v.t;
}
// Shifts the current subtree rooted at w+ (see Buchheim et al.).
function moveSubtree(wm, wp, shift) {
    const change = shift / (wp.i - wm.i);
    wp.c -= change;
    wp.s += shift;
    wm.c += change;
    wp.z += shift;
    wp.m += shift;
}
// Applies aggregated shifts to the smaller subtrees between w- and w+.
function executeShifts(v) {
    let shift = 0;
    let change = 0;
    const children = v.children;
    let i = children.length;
    while (--i >= 0) {
        const w = children[i];
        w.z += shift;
        w.m += shift;
        shift += w.s + (change += w.c);
    }
}
// If vi-'s ancestor is a sibling of v, returns vi-'s ancestor; otherwise the
// specified default ancestor.
function nextAncestor(vim, v, ancestor) {
    return vim.a.parent === v.parent ? vim.a : ancestor;
}
/**
 * Tidy tree layout (Buchheim/Reingold–Tilford). Defaults match d3: size
 * [1, 1], separation (a, b) => a.parent === b.parent ? 1 : 2.
 *
 * With size([w, h]): x spans [0, w] (breadth), y = depth mapped to [0, h].
 * With nodeSize([dx, dy]): root at (0, 0), y = depth * dy.
 * For radial trees use size([2 * Math.PI, radius]) and map (x, y) to polar.
 */
export function tree() {
    let separation = defaultSeparation;
    let dx = 1;
    let dy = 1;
    let nodeSize = false;
    function layout(root) {
        const t = treeRoot(root);
        // Compute the layout using Buchheim et al.'s algorithm.
        treeWrapEachAfter(t, firstWalk);
        t.parent.m = -t.z;
        treeWrapEachBefore(t, secondWalk);
        // If a fixed node size is specified, scale x and y.
        if (nodeSize) {
            root.eachBefore(sizeNode);
        }
        else {
            // If a fixed tree size is specified, scale x and y based on the extent.
            // Compute the left-most, right-most, and depth-most nodes for extents.
            let left = root;
            let right = root;
            let bottom = root;
            root.eachBefore((node) => {
                if (node.x < left.x)
                    left = node;
                if (node.x > right.x)
                    right = node;
                if (node.depth > bottom.depth)
                    bottom = node;
            });
            const s = left === right ? 1 : separation(left, right) / 2;
            const tx = s - left.x;
            const kx = dx / (right.x + s + tx);
            const ky = dy / (bottom.depth || 1);
            root.eachBefore((node) => {
                node.x = (node.x + tx) * kx;
                node.y = node.depth * ky;
            });
        }
        return root;
    }
    // Computes a preliminary x-coordinate for v (first walk of Buchheim et al.).
    function firstWalk(v) {
        const children = v.children;
        const siblings = v.parent.children;
        const w = v.i ? siblings[v.i - 1] : null;
        if (children) {
            executeShifts(v);
            const midpoint = (children[0].z + children[children.length - 1].z) / 2;
            if (w) {
                v.z = w.z + separation(v._, w._);
                v.m = v.z - midpoint;
            }
            else {
                v.z = midpoint;
            }
        }
        else if (w) {
            v.z = w.z + separation(v._, w._);
        }
        v.parent.A = apportion(v, w, v.parent.A || siblings[0]);
    }
    // Computes all real x-coordinates by summing up the modifiers recursively.
    function secondWalk(v) {
        v._.x = v.z + v.parent.m;
        v.m += v.parent.m;
    }
    // The core of the algorithm: combines a new subtree with the previous
    // subtrees, using threads to traverse the inside/outside contours up to
    // the highest common level.
    function apportion(v, w, ancestor) {
        if (w) {
            let vip = v;
            let vop = v;
            let vim = w;
            let vom = vip.parent.children[0];
            let sip = vip.m;
            let sop = vop.m;
            let sim = vim.m;
            let som = vom.m;
            for (;;) {
                vim = nextRight(vim);
                vip = nextLeft(vip);
                if (!(vim && vip))
                    break;
                vom = nextLeft(vom);
                vop = nextRight(vop);
                vop.a = v;
                const shift = vim.z + sim - vip.z - sip + separation(vim._, vip._);
                if (shift > 0) {
                    moveSubtree(nextAncestor(vim, v, ancestor), v, shift);
                    sip += shift;
                    sop += shift;
                }
                sim += vim.m;
                sip += vip.m;
                som += vom.m;
                sop += vop.m;
            }
            if (vim && !nextRight(vop)) {
                vop.t = vim;
                vop.m += sim - sop;
            }
            if (vip && !nextLeft(vom)) {
                vom.t = vip;
                vom.m += sip - som;
                ancestor = v;
            }
        }
        return ancestor;
    }
    function sizeNode(node) {
        node.x *= dx;
        node.y = node.depth * dy;
    }
    const self = layout;
    self.separation = function (x) {
        if (x === undefined)
            return separation;
        separation = x;
        return self;
    };
    self.size = function (x) {
        if (x === undefined)
            return (nodeSize ? null : [dx, dy]);
        nodeSize = false;
        dx = +x[0];
        dy = +x[1];
        return self;
    };
    self.nodeSize = function (x) {
        if (x === undefined)
            return (nodeSize ? [dx, dy] : null);
        nodeSize = true;
        dx = +x[0];
        dy = +x[1];
        return self;
    };
    return self;
}
function meanX(children) {
    let x = 0;
    for (const c of children)
        x += c.x;
    return x / children.length;
}
function maxY(children) {
    let y = 0;
    for (const c of children)
        y = Math.max(y, c.y);
    return 1 + y;
}
function leafLeft(node) {
    let children;
    while ((children = node.children))
        node = children[0];
    return node;
}
function leafRight(node) {
    let children;
    while ((children = node.children))
        node = children[children.length - 1];
    return node;
}
/**
 * Dendrogram layout: like tree(), but all leaves are placed at the same
 * depth (y = h with size([w, h]); root at y = 0). Defaults match d3.
 */
export function cluster() {
    let separation = defaultSeparation;
    let dx = 1;
    let dy = 1;
    let nodeSize = false;
    function layout(root) {
        let previousNode;
        let x = 0;
        // First walk, computing the initial x & y values.
        root.eachAfter((node) => {
            const children = node.children;
            if (children) {
                node.x = meanX(children);
                node.y = maxY(children);
            }
            else {
                node.x = previousNode ? (x += separation(node, previousNode)) : 0;
                node.y = 0;
                previousNode = node;
            }
        });
        const left = leafLeft(root);
        const right = leafRight(root);
        const x0 = left.x - separation(left, right) / 2;
        const x1 = right.x + separation(right, left) / 2;
        // Second walk, normalizing x & y to the desired size.
        return root.eachAfter(nodeSize
            ? (node) => {
                node.x = (node.x - root.x) * dx;
                node.y = (root.y - node.y) * dy;
            }
            : (node) => {
                node.x = ((node.x - x0) / (x1 - x0)) * dx;
                node.y = (1 - (root.y ? node.y / root.y : 1)) * dy;
            });
    }
    const self = layout;
    self.separation = function (x) {
        if (x === undefined)
            return separation;
        separation = x;
        return self;
    };
    self.size = function (x) {
        if (x === undefined)
            return (nodeSize ? null : [dx, dy]);
        nodeSize = false;
        dx = +x[0];
        dy = +x[1];
        return self;
    };
    self.nodeSize = function (x) {
        if (x === undefined)
            return (nodeSize ? [dx, dy] : null);
        nodeSize = true;
        dx = +x[0];
        dy = +x[1];
        return self;
    };
    return self;
}
//# sourceMappingURL=hierarchy.js.map