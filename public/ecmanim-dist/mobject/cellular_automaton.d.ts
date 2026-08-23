import { VGroup } from "./VMobject.ts";
import type { MobjectConfig } from "./Mobject.ts";
import type { ColorLike } from "../core/types.ts";
/**
 * A cell's next-state rule: given its live-neighbor count and current
 * alive/dead state, return whether it is alive next generation. `'conway'`
 * selects Conway's classic B3/S23 rule (a dead cell with exactly 3 live
 * neighbors is born; a live cell with 2 or 3 live neighbors survives; all
 * other live cells die of under/overpopulation).
 */
export type CellularAutomatonRule = "conway" | ((neighbors: number, alive: boolean) => boolean);
export interface CellularAutomatonConfig extends MobjectConfig {
    cols: number;
    rows: number;
    /** Seed for the mulberry32 stream used ONLY for the random initial grid
     *  (ignored when `initialGrid` is supplied). Default 0. */
    seed?: number;
    /** Fraction of cells alive in the random initial grid. Default 0.3. */
    initialDensity?: number;
    /** Next-state rule. Default `'conway'`. */
    rule?: CellularAutomatonRule;
    /** Toroidal (wraparound) edges, matching the 06-game-of-life.js reference.
     *  Default true. When false, off-grid neighbors simply don't count. */
    wrap?: boolean;
    /** World units per cell (both width and height). Default 1. */
    cellSize?: number;
    /** Fill color for alive cells. Default white. */
    aliveColor?: ColorLike;
    /** Fill color for dead cells. When omitted (the default), dead cells are
     *  simply not drawn (transparent) -- cheaper, and the usual look for a
     *  GoL demo composited over a scene background. Set this to reproduce the
     *  06-game-of-life.js reference's opaque white/black board. */
    deadColor?: ColorLike;
    /** Bypass random seeding entirely and start from this exact grid
     *  (indexed [row][col]). Must match `rows`/`cols`. Intended for tests and
     *  hand-authored starting patterns (blinkers, gliders, still lifes, ...). */
    initialGrid?: boolean[][];
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
export declare class CellularAutomaton extends VGroup {
    readonly cols: number;
    readonly rows: number;
    readonly cellSize: number;
    readonly wrap: boolean;
    readonly grid: boolean[][];
    private readonly _rule;
    private readonly _aliveColor;
    private readonly _deadColor?;
    private readonly _aliveMesh;
    private readonly _deadMesh?;
    constructor(config: CellularAutomatonConfig);
    /**
     * Advance exactly one generation using `rule` (Conway B3/S23 by default).
     * Pure function of the CURRENT grid: every cell's next state is computed
     * from a full pass over the old grid before any cell is mutated, so there
     * is no order-dependence within a step. No randomness is consulted here --
     * see the file header's determinism contract.
     */
    step(): this;
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
    private _countNeighbors;
    private _rebuildMesh;
    private _packMesh;
    copy(): this;
}
//# sourceMappingURL=cellular_automaton.d.ts.map