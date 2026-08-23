export interface ChordGroup {
    /** Row index in the input matrix. */
    index: number;
    startAngle: number;
    endAngle: number;
    /** Row sum: total outgoing value of this group. */
    value: number;
}
export interface ChordSubgroup {
    /** Group this subgroup belongs to (the arc it sits on). */
    index: number;
    /** The opposite group's index: this subgroup spans matrix[index][subindex]. */
    subindex: number;
    startAngle: number;
    endAngle: number;
    /** matrix[index][subindex]. */
    value: number;
}
export interface Chord {
    source: ChordSubgroup;
    target: ChordSubgroup;
}
export interface ChordLayoutResult {
    groups: ChordGroup[];
    chords: Chord[];
}
export interface ChordOptions {
    /** Pad angle (radians) between adjacent groups. Default 0. */
    padAngle?: number;
    /** Comparator of group values, e.g. (a, b) => b - a for descending. */
    sortGroups?: (a: number, b: number) => number;
    /** Comparator of subgroup values within a group. */
    sortSubgroups?: (a: number, b: number) => number;
    /**
     * Comparator of chord combined values (source.value + target.value),
     * controlling z-order of the returned chords array.
     */
    sortChords?: (a: number, b: number) => number;
}
/**
 * Create a chord layout (d3.chord equivalent, undirected). Call the returned
 * function with a square matrix; matrix[i][j] is the flow from group i to
 * group j. Group i's arc spans its row sum; within the arc, one subgroup per
 * column j (including j === i). Chord {i, j} pairs subgroup matrix[i][j]
 * with matrix[j][i]; like d3, `source` is whichever end has the LARGER
 * value (ties keep i < j as source). Chords where both directions are zero
 * are omitted.
 */
export declare function chord(options?: ChordOptions): (matrix: number[][]) => ChordLayoutResult;
export type RibbonSegment = {
    /** Arc along the circle at `radius` from startAngle to endAngle. */
    type: "arc";
    startAngle: number;
    endAngle: number;
    radius: number;
    /** Convenience: y-up points of the arc's start and end. */
    from: [number, number];
    to: [number, number];
} | {
    /** Quadratic bezier from the previous segment's endpoint to `to`. */
    type: "quad";
    /** Control point: always the circle center [0, 0], like d3.ribbon. */
    control: [number, number];
    from: [number, number];
    to: [number, number];
};
export interface RibbonOptions {
    source: {
        startAngle: number;
        endAngle: number;
    };
    target: {
        startAngle: number;
        endAngle: number;
    };
    radius: number;
}
/**
 * Convert a d3 chord angle (radians, clockwise from 12 o'clock) to a point
 * in y-UP scene coordinates: [radius * sin(a), radius * cos(a)].
 * (For y-down SVG coordinates, negate the y component.)
 */
export declare function chordAngleToPoint(angle: number, radius: number): [number, number];
/**
 * Path control data for a chord ribbon, matching d3.ribbon's outline:
 *
 *   1. arc  along the SOURCE span (source.startAngle -> source.endAngle)
 *      at `radius`;
 *   2. quad from the source arc's end to the TARGET span's start point,
 *      control point at the circle center [0, 0];
 *   3. arc  along the TARGET span (target.startAngle -> target.endAngle);
 *   4. quad from the target arc's end back to the source arc's START point
 *      (closing the outline), control again at [0, 0].
 *
 * CONVENTIONS: the path begins at chordAngleToPoint(source.startAngle,
 * radius); each segment starts where the previous one ended (`from` ==
 * previous `to`); all points are y-up scene coordinates (see
 * chordAngleToPoint); arcs are centered on [0, 0] and traced in the
 * direction of increasing chord angle (clockwise on screen). Render arcs
 * with the existing arc primitive and quads via a quadratic (or an
 * equivalent cubic with c1 = from + 2/3*(control-from), c2 = to +
 * 2/3*(control-to)) bezier.
 *
 * Self-chords (source span == target span) still yield all four segments;
 * the middle quad degenerates to a point and may be skipped by renderers.
 */
export declare function ribbonPoints({ source, target, radius }: RibbonOptions): RibbonSegment[];
//# sourceMappingURL=chord.d.ts.map