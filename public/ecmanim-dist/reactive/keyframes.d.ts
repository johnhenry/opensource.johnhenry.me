import { KeyframeTrack } from "../animation/keyframe_track.ts";
import type { Mobject, Updater } from "../mobject/Mobject.ts";
export declare class PlayableKeyframeTrack<T = number> extends KeyframeTrack<T> {
    time: number;
    /** Advance by `dt` seconds and return the value at the new time. */
    tick(dt: number): T;
    /** Jump directly to an absolute time (a Studio scrub) and return its value. */
    seek(t: number): T;
}
/**
 * Bind a track's value onto `mobject[prop]` every update(dt) tick, via the
 * mobject's own updater list (the same mechanism addUpdater()/alwaysRedraw()
 * already use). Returns the Updater so the caller can removeUpdater() it.
 */
export declare function bindTrack(mobject: Mobject, prop: string, track: PlayableKeyframeTrack<any>): Updater;
//# sourceMappingURL=keyframes.d.ts.map