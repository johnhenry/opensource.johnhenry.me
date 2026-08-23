/**
 * Hilbert curve of the given order as 4^order points in the unit square
 * [0, 1]², visiting order = curve order (index-to-position via the
 * classic bit-twiddled d2xy walk — no recursion, no L-system expansion).
 */
export declare function hilbertCurve(order: number): Array<[number, number]>;
/**
 * Generic L-system expansion + turtle interpretation: `rules` rewrite the
 * axiom `iterations` times; `F` draws forward, `+`/`-` turn by `angle`
 * radians, other symbols only rewrite. Returns the polyline the turtle
 * walks (unit steps from the origin heading +x).
 */
export declare function lsystem(axiom: string, rules: Record<string, string>, iterations: number, angle: number, drawSymbols?: string): Array<[number, number]>;
//# sourceMappingURL=hilbert.d.ts.map