import { Mobject } from "../mobject/Mobject.ts";
import { Animation } from "./Animation.ts";
import { AnimationGroup } from "./composition.ts";
export interface DataJoinConfig<T> {
    /** Build a mobject for an ENTERING datum (placed at its final state). */
    make: (d: T, i: number) => Mobject;
    /** Reconcile an EXISTING mobject to its new datum: return an Animation
     *  (e.g. a tweenTo chain) to animate it, or mutate directly and return
     *  nothing. */
    update?: (mob: Mobject, d: T, i: number) => Animation | void;
    /** Position/style an entering mobject BEFORE its FadeIn (d3's
     *  enter-at-previous-neighbor trick). */
    enterFrom?: (mob: Mobject, d: T, i: number) => void;
    /** Animation to play on an EXITING mobject alongside its FadeOut (e.g.
     *  slide it to where it "would have gone"). */
    exitTo?: (mob: Mobject) => Animation | void;
    runTime?: number;
    lagRatio?: number;
}
export interface DataJoinResult<T> {
    /** Newly created mobjects, in data order. */
    enter: Mobject[];
    /** [mobject, datum] pairs that persisted. */
    update: Array<[Mobject, T]>;
    /** Mobjects whose key vanished (FadeOut+removed by the animation). */
    exit: Mobject[];
    /** The full post-join mobject set, in NEW data order — feed it to the
     *  next dataJoin call. */
    mobs: Mobject[];
    /** Play this: FadeIn(enter) + update animations + FadeOut(exit). */
    animation: AnimationGroup;
}
/**
 * Reconcile `oldMobs` (from a previous join, or []) against `newData`:
 *
 * ```ts
 * let join = dataJoin([], frame0, (d) => d.name, { make, update });
 * scene.add(...join.mobs);
 * for (const frame of frames) {
 *   join = dataJoin(join.mobs, frame, (d) => d.name, { make, update });
 *   await scene.play(join.animation);
 * }
 * ```
 *
 * Keys are stamped on the mobjects (`__joinKey`), so consecutive joins
 * track identity without external bookkeeping.
 */
export declare function dataJoin<T>(oldMobs: Mobject[], newData: T[], keyFn: (d: T, i: number) => string, config: DataJoinConfig<T>): DataJoinResult<T>;
/**
 * Interpolate between keyed snapshots (the bar-chart-race keyframe
 * expansion): given [tA, MapA] and [tB, MapB] of key -> value, produce `k`
 * intermediate Maps (inclusive of A, exclusive of B) whose values lerp and
 * whose key set is the union (missing = 0, matching d3's `(prev || d)`).
 */
export declare function interpolateFrames<K>(a: [number, Map<K, number>], b: [number, Map<K, number>], k: number): Array<[number, Map<K, number>]>;
/** Rank a keyed frame descending by value (ties broken by key order for
 *  determinism); returns [{key, value, rank}] limited to `n` ranks — ranks
 *  beyond n are clamped to n (d3's bar-chart-race convention, so exiting
 *  bars slide to just off the bottom). */
export declare function rankFrame<K>(frame: Map<K, number>, n?: number): Array<{
    key: K;
    value: number;
    rank: number;
}>;
//# sourceMappingURL=data_join.d.ts.map