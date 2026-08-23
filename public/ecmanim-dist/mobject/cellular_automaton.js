// Campaign 8 (p5.js generative subset) Phase 2 gap-fill: a deterministic
// cellular-automaton mobject covering both references in
// examples/p5-parity/ref/ -- 06-game-of-life.js (2D Conway's Game of Life on
// a toroidal grid) and 07-ten-print-maze.js (a 1D elementary/Wolfram CA,
// this corpus's documented substitute for a "ten print maze" example). This
// mobject targets 06's 2D grid cleanly (rows x cols, wrap toggle, pluggable
// neighbor-counting rule) while staying general enough to model 1D CA too --
// pass rows: 1 and a custom 3-neighbor rule function to reproduce 07's
// Wolfram automaton (see rule docs below).
//
// DETERMINISM CONTRACT (why this file exists in Campaign 8's Phase 2 policy):
// renders are a pure function of scene time, so any randomness anywhere in a
// mobject's definition must be seeded and replayable. Game of Life's
// EVOLUTION is already fully deterministic given an initial grid (no
// randomness in the rules themselves) -- the only nondeterminism risk is the
// common "randomly seed the initial board" demo pattern. This class always
// seeds via mulberry32(seed) (src/core/noise.ts), never Math.random(), so:
//   same seed -> same initial grid -> same sequence of grids after N calls
//   to step(), in any process, on any run.
// step() itself takes no random input and is a pure function of the current
// grid, so this holds independent of how many times / in what order step()
// is called relative to other rendering work.
//
// RENDERING TECHNIQUE (the roadmap explicitly asks for "raster-tier like
// particles" -- see src/mobject/particles.ts for that mobject's actual
// technique before assuming this one copies it verbatim):
// ParticleSystem's raster tier works by setting `_isParticles = true` and
// having CanvasRenderer dispatch to a dedicated `drawParticles()` method that
// rasterizes particles directly with fillRect/arc -- bypassing the VMobject
// bezier-path pipeline entirely. That requires renderer-side plumbing
// (CanvasRenderer.ts changes) which is out of scope here (this gap-fill only
// touches this file, src/index.ts, and its test).
//
// Given that constraint, and that this campaign's own reference grid is only
// ~36x20 = 720 cells (20px cells on a 720x400 canvas), building 720
// *separate* Rectangle Mobjects (each walking the full Mobject/VMobject
// machinery, each a node the renderer's tree-walk and z-sort visit
// individually) was judged wasteful for something that is fundamentally one
// piece of raster-like content. Instead: alive cells (and, if `deadColor` is
// configured, dead cells) are drawn as disjoint rectangle *subpaths* packed
// into a SINGLE VMobject per color (VMobject already supports multiple
// subpaths via startNewPath/subpathStarts -- see Polygon/Rectangle for the
// single-subpath case, and CanvasRenderer.drawVMobject's `ctx.fill("evenodd")`
// for why disjoint same-winding subpaths in one path fill correctly with no
// extra renderer work). The result: one (or two) fill() calls per generation
// for the whole grid, no matter how many cells are alive -- the same
// "one draw call for many logical cells" outcome as the particle raster
// tier, achieved by reusing the existing VMobject subpath machinery instead
// of adding a new renderer code path. If a caller needs genuinely huge grids
// (tens of thousands of cells) where even this becomes a bottleneck, a true
// ImageData/pixel-buffer mobject (mirroring ParticleSystem's renderer-level
// raster tier) would be the next step -- out of scope for this gap-fill.
import { VGroup, VMobject } from "./VMobject.js";
import { mulberry32 } from "../core/noise.js";
import { Color } from "../core/color.js";
/** Conway's classic B3/S23 rule. */
function conwayRule(neighbors, alive) {
    return alive ? neighbors === 2 || neighbors === 3 : neighbors === 3;
}
function resolveRule(rule) {
    return typeof rule === "function" ? rule : conwayRule;
}
/**
 * A deterministic cellular automaton (Conway's Game of Life by default, or
 * any custom neighbor-counting rule) rendered as up to two raster-like
 * VMobjects (alive / optionally dead), one subpath per live cell -- see the
 * file header for the full rendering-technique rationale.
 *
 * `grid[row][col]` is the authoritative cell-alive state: `true` = alive.
 * It's a stable array reference for the object's lifetime (step() mutates
 * cell values in place rather than reassigning the array), so tests/callers
 * may freely read or hand-set `grid[r][c]` between construction and step()
 * calls -- exactly how the blinker/still-life correctness tests bypass
 * random init to plant a known pattern.
 */
export class CellularAutomaton extends VGroup {
    cols;
    rows;
    cellSize;
    wrap;
    grid;
    _rule;
    _aliveColor;
    _deadColor;
    _aliveMesh;
    _deadMesh;
    constructor(config) {
        super();
        this.cols = config.cols;
        this.rows = config.rows;
        this.cellSize = config.cellSize ?? 1;
        this.wrap = config.wrap ?? true;
        this._rule = resolveRule(config.rule);
        this._aliveColor = Color.parse(config.aliveColor ?? "#FFFFFF");
        this._deadColor = config.deadColor != null ? Color.parse(config.deadColor) : undefined;
        if (config.initialGrid) {
            const g = config.initialGrid;
            if (g.length !== this.rows || g.some((row) => row.length !== this.cols)) {
                throw new Error(`CellularAutomaton: initialGrid dimensions (${g.length}x${g[0]?.length ?? 0}) ` +
                    `must match rows/cols (${this.rows}x${this.cols})`);
            }
            this.grid = g.map((row) => row.slice());
        }
        else {
            const rand = mulberry32(config.seed ?? 0);
            const density = config.initialDensity ?? 0.3;
            this.grid = [];
            for (let r = 0; r < this.rows; r++) {
                const row = new Array(this.cols);
                for (let c = 0; c < this.cols; c++)
                    row[c] = rand() < density;
                this.grid.push(row);
            }
        }
        // Dead mesh drawn first (if present) so alive cells layer visually on
        // top, though the two never actually overlap.
        if (this._deadColor) {
            this._deadMesh = new VMobject({ fillColor: this._deadColor, fillOpacity: 1, strokeWidth: 0 });
            this.add(this._deadMesh);
        }
        this._aliveMesh = new VMobject({ fillColor: this._aliveColor, fillOpacity: 1, strokeWidth: 0 });
        this.add(this._aliveMesh);
        this._rebuildMesh();
    }
    /**
     * Advance exactly one generation using `rule` (Conway B3/S23 by default).
     * Pure function of the CURRENT grid: every cell's next state is computed
     * from a full pass over the old grid before any cell is mutated, so there
     * is no order-dependence within a step. No randomness is consulted here --
     * see the file header's determinism contract.
     */
    step() {
        const { rows, cols, grid, _rule } = this;
        const next = new Array(rows);
        for (let r = 0; r < rows; r++) {
            const row = new Array(cols);
            for (let c = 0; c < cols; c++)
                row[c] = _rule(this._countNeighbors(r, c), grid[r][c]);
            next[r] = row;
        }
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++)
                grid[r][c] = next[r][c];
        }
        this._rebuildMesh();
        return this;
    }
    /** Count of the (up to) 8 Moore-neighborhood live neighbors of (row, col),
     *  wrapping toroidally when `wrap` is true (matching 06-game-of-life.js),
     *  or simply not counting off-grid neighbors when false.
     *
     *  A degenerate axis (rows===1, the documented "1D elementary CA via a
     *  custom rule" use case in this class's config docs) must SKIP the dr
     *  offsets that don't exist rather than wrap them onto the same row --
     *  wrapping dr through rows===1 collapses all three dr values to rr=row,
     *  so the naive toroidal formula would visit each physical neighbor
     *  multiple times (the left/right cells 3x each, the center cell 2x)
     *  instead of the true {left, right} pair a 1D rule expects. Same
     *  reasoning applies to a degenerate cols===1 axis. */
    _countNeighbors(row, col) {
        const { rows, cols, grid, wrap } = this;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
            if (rows === 1 && dr !== 0)
                continue;
            for (let dc = -1; dc <= 1; dc++) {
                if (cols === 1 && dc !== 0)
                    continue;
                if (dr === 0 && dc === 0)
                    continue;
                let rr = row + dr;
                let cc = col + dc;
                if (wrap) {
                    rr = (rr + rows) % rows;
                    cc = (cc + cols) % cols;
                }
                else if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) {
                    continue;
                }
                if (grid[rr][cc])
                    count++;
            }
        }
        return count;
    }
    // Rebuild the alive/dead meshes' subpaths from the current grid. Cell
    // (row, col) occupies a cellSize x cellSize square in world space; the
    // whole grid is centered on the origin, row 0 at the top (world +Y up).
    _rebuildMesh() {
        this._packMesh(this._aliveMesh, (r, c) => this.grid[r][c]);
        if (this._deadMesh)
            this._packMesh(this._deadMesh, (r, c) => !this.grid[r][c]);
    }
    _packMesh(mesh, alive) {
        mesh.points = [];
        mesh.subpathStarts = [];
        const s = this.cellSize;
        const halfW = (this.cols * s) / 2;
        const halfH = (this.rows * s) / 2;
        for (let r = 0; r < this.rows; r++) {
            const yTop = halfH - r * s;
            const yBot = yTop - s;
            for (let c = 0; c < this.cols; c++) {
                if (!alive(r, c))
                    continue;
                const xLeft = c * s - halfW;
                const xRight = xLeft + s;
                mesh.startNewPath([xLeft, yTop, 0]);
                mesh.addLineTo([xRight, yTop, 0]);
                mesh.addLineTo([xRight, yBot, 0]);
                mesh.addLineTo([xLeft, yBot, 0]);
                mesh.close();
            }
        }
    }
    // Object.assign (via Mobject.copy()) aliases private mesh references and
    // the grid array -- repoint them at the copy's own cloned submobjects/grid
    // so mutating a copy (e.g. calling .step()) can't retroactively affect the
    // original, mirroring ParticleSystem.copy()'s fix for its bursts array.
    copy() {
        const c = super.copy();
        c.grid = this.grid.map((row) => row.slice());
        const aliveIdx = this.submobjects.indexOf(this._aliveMesh);
        c._aliveMesh = c.submobjects[aliveIdx];
        if (this._deadMesh) {
            const deadIdx = this.submobjects.indexOf(this._deadMesh);
            c._deadMesh = c.submobjects[deadIdx];
        }
        return c;
    }
}
//# sourceMappingURL=cellular_automaton.js.map