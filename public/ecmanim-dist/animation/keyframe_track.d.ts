import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import type { RateFunc } from "../core/types.ts";
export interface Keyframe<T> {
    t: number;
    value: T;
    /** Eases the transition ARRIVING at this keyframe (from the previous one).
     *  The first keyframe's own `ease` is unused (nothing transitions into it). */
    ease?: RateFunc | string;
}
export interface KeyframeTrackOptions<T> {
    /** Overrides the inferred duration (default: the last keyframe's `t`). */
    duration?: number;
    /** Custom interpolation, e.g. `Color.lerp` for a color-typed track. Default
     *  dispatch: number/number[] via `V.lerp`, anything else throws naming this
     *  option as the escape hatch. */
    interpolate?: (a: T, b: T, alpha: number) => T;
}
export declare class KeyframeTrack<T = number> {
    keyframes: Keyframe<T>[];
    private _duration?;
    private _interpolate;
    constructor(keyframes: Keyframe<T>[], options?: KeyframeTrackOptions<T>);
    addKeyframe(kf: Keyframe<T>): this;
    /** Removes the keyframe at `index` in the current (sorted) order. */
    removeKeyframe(index: number): this;
    get duration(): number;
    valueAt(t: number): T;
}
/**
 * scene.play()-driven consumption: `apply(mobject, value)` is called every
 * interpolate() with the track's value at that time. Same "preset suggests a
 * duration, explicit config wins" precedence as transitions.ts's
 * springTiming(): `config.runTime` (if given) always wins over the track's
 * own duration.
 *
 * `mobject` may be null (see `animateSignal()` below) -- begin() skips the
 * usual startState snapshot in that case, since nothing here reads it.
 */
export declare class PlayKeyframeTrack extends Animation {
    track: KeyframeTrack<any>;
    apply: (mobject: any, value: any) => void;
    constructor(mobject: any, track: KeyframeTrack<any>, apply: (mobject: any, value: any) => void, config?: AnimationConfig);
    begin(): this;
    interpolateMobject(alpha: number): void;
}
/**
 * Convenience wrapper pointing PlayKeyframeTrack's `apply` at a signal's
 * setter, giving "a signal driven by a keyframe timeline" for free -- this
 * also satisfies the separate "wire signals into tweening" idea with no
 * additional mechanism.
 */
export declare function animateSignal(signal: {
    set: (v: any) => void;
}, track: KeyframeTrack<any>, config?: AnimationConfig): PlayKeyframeTrack;
//# sourceMappingURL=keyframe_track.d.ts.map