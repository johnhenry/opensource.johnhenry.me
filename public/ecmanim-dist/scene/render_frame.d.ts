/**
 * One play()/wait() segment, mirroring Scene.PlayRecord. `startFrame`/`endFrame`
 * are absolute frame counts; the segment's frame span is `endFrame - startFrame`.
 */
export interface SegmentRecord {
    index: number;
    kind: string;
    hash: string;
    startFrame: number;
    endFrame: number;
}
/**
 * Run construct() purely to harvest the segment manifest. Every segment is
 * skipped (so no PNG is ever encoded) and the frameHandler is a no-op, but time
 * and frameCount still advance — so `scene.playRecords` comes out with correct,
 * deterministic frame ranges and content hashes. Cheap: no rendering happens.
 *
 * `makeScene` builds a fresh Scene (or Scene subclass instance / construct fn);
 * `sceneInput` is passed to a plain construct function form. `opts.camera` is
 * optional — most scenes don't touch the camera during construct(), but if the
 * scene needs one it may be supplied.
 */
export declare function discoverSegments(makeScene: () => any, sceneInput: any, opts: {
    fps: number;
    camera?: any;
    params?: Record<string, any>;
}): Promise<SegmentRecord[]>;
/**
 * Partition segment indices across `workers`, load-balanced by frame span
 * (endFrame - startFrame). Returns an array of length `workers`; each entry is
 * the list of segment INDICES assigned to that worker.
 *
 * Strategy: longest-processing-time-first (LPT) greedy bin packing — sort
 * segments by descending frame count, then assign each to the currently
 * least-loaded worker. This gives good balance even when segment lengths vary
 * widely. Every index appears exactly once across all buckets.
 */
export declare function partitionSegments(records: SegmentRecord[], workers: number): number[][];
//# sourceMappingURL=render_frame.d.ts.map