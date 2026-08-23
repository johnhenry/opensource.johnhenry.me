import { Scene } from "./Scene.ts";
import { Mobject } from "../mobject/Mobject.ts";
import type { TransitionConfig } from "../animation/transitions.ts";
/** Which edge the incoming content enters FROM (MC's `Direction`). A const
 *  object rather than a TS enum — Node's strip-only type erasure can't run
 *  enums (same convention as the rest of this codebase). */
export declare const Direction: {
    readonly Left: "left";
    readonly Right: "right";
    readonly Top: "top";
    readonly Bottom: "bottom";
};
export type Direction = (typeof Direction)[keyof typeof Direction];
/** Incoming content: mobject(s), or a callback that adds them to the scene
 *  (anything the callback adds is detected and treated as incoming). */
export type IncomingContent = Mobject | Mobject[] | (() => Mobject | Mobject[] | void | Promise<Mobject | Mobject[] | void>);
/**
 * Slide the current content out while the incoming content slides in from
 * `direction` (MC's `slideTransition`). Incoming mobjects should be placed
 * at their FINAL positions — the helper offsets them to the entry edge and
 * slides them home.
 *
 * ```ts
 * await slideTransition(scene, Direction.Left, () => scene.add(nextTitle));
 * ```
 */
export declare function slideTransition(scene: Scene, direction: (Direction | number[]) | undefined, incoming: IncomingContent, config?: TransitionConfig): Promise<void>;
/** Cross-fade the current content into the incoming content (MC's
 *  `fadeTransition`). */
export declare function fadeTransition(scene: Scene, incoming: IncomingContent, config?: TransitionConfig): Promise<void>;
/** The screen-space area a zoomInTransition grows out of. */
export interface ZoomArea {
    /** World-space center of the area. */
    center: number[];
    width: number;
    height: number;
}
/**
 * The incoming content starts collapsed into `area` (a world-space rect —
 * e.g. a thumbnail, a window, a highlighted region) and grows to its full
 * layout while the current content fades away (MC's `zoomInTransition`).
 */
export declare function zoomInTransition(scene: Scene, area: ZoomArea, incoming: IncomingContent, config?: TransitionConfig): Promise<void>;
/**
 * No-op marker for port fidelity: MC scenes call `finishScene()` to let the
 * next scene's transition overlap the current one's tail. In ecmanim's
 * single-scene model the transition helpers already own that overlap
 * (via TransitionConfig.overlap), so there is nothing to do — but ports can
 * keep the call so they read line-for-line like the original.
 */
export declare function finishScene(_scene?: Scene): void;
//# sourceMappingURL=scene_transitions.d.ts.map