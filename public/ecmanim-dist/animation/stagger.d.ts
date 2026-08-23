/** Index-safe (negative-safe modulo) cycling through a fixed list of values,
 *  mo.js's property-map ergonomic: `cycle(["red", "blue", "green"])`. */
export declare function cycle<T>(values: readonly T[]): (m: any, index: number, total: number) => T;
/** Linear distribution by index across `[from, to]`, anime.js's `modifier`
 *  ergonomic: `staggerRange(0, 1)` gives each of `total` items an even step. */
export declare function staggerRange(from: number, to: number): (m: any, index: number, total: number) => number;
export interface StaggerGridOptions {
    /** [rows, cols] grid shape the flat mobject list represents. */
    grid: [number, number];
    /** Distribution origin (default "start"). "random" is deterministic
     *  (seeded by index), not JS's Math.random -- see staggerGrid's doc. */
    from?: "start" | "center" | "end" | "edges" | "random" | number | [number, number];
    /** Restrict distance computation to one axis (default: both, Euclidean). */
    axis?: "x" | "y";
    /** Per-step delay unit, GSAP's `stagger.each` ergonomic (default 1). Each
     *  item's distance-from-origin is normalized to [0, 1] across the grid,
     *  then scaled by `each` to produce the returned delay. */
    each?: number;
}
/** GSAP-style grid-aware stagger delay: treats a flat mobject list as a
 *  `grid` [rows,cols] layout and returns each item's delay based on its
 *  distance from `from`'s origin cell -- "center"/"edges" ripple
 *  outward/inward spatially (true 2D proximity, not array-index order),
 *  matching GSAP's `stagger.grid`+`from` semantics. `from: "random"` is
 *  deterministic (mulberry32 seeded by index) so it stays cache-safe under
 *  scrubbing, same convention as expressions.ts's seeded noise. Directly
 *  usable like staggerRange (not a two-stage builder) -- feed straight into
 *  LaggedStartMap's (m,index,total)=>delay factory slot. */
export declare function staggerGrid(options: StaggerGridOptions): (m: any, index: number, total: number) => number;
//# sourceMappingURL=stagger.d.ts.map