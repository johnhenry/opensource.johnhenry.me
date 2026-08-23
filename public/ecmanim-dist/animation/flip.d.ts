import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import type { Mobject } from "../mobject/Mobject.ts";
/** A captured bounding/geometric snapshot of one mobject, taken BEFORE an
 *  instant layout change. Index-aligned with the `targets` array passed to
 *  flipGetState()/flipFrom(). No rotation field: Mobject has no angle/rotation
 *  getter (rotate() only applies directly to points), so there's nothing to
 *  capture -- omitted rather than faked. */
export interface FlipState {
    center: number[];
    width: number;
    height: number;
    /** Deep-cloned raw geometry ([x,y,z] per point) at capture time. */
    points: number[][];
}
/** Capture the CURRENT bounding/geometric state of each mobject (position,
 *  size, raw points). Call this BEFORE an instant layout change. */
export declare function flipGetState(targets: Mobject[]): FlipState[];
export interface FlipFromConfig extends AnimationConfig {
    /** Passed through to the per-target animations and (when >1 target) to the
     *  wrapping AnimationGroup, mirroring TransformMatchingShapes's config reuse. */
    lagRatio?: number;
}
/** Animate FROM a previously-captured state TO each target's CURRENT state.
 *  Call flipGetState() before changing layout, make the instant change, THEN
 *  call flipFrom() -- the targets are already in their "Last" position; this
 *  plays the visual transition so it reads as smooth movement from where they
 *  WERE to where they NOW are. Returns a single Animation (an AnimationGroup
 *  when there's more than one target) suitable for `scene.play(...)`. */
export declare function flipFrom(state: FlipState[], targets: Mobject[], config?: FlipFromConfig): Animation;
//# sourceMappingURL=flip.d.ts.map