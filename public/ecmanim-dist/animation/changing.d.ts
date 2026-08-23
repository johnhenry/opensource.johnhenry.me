import { VMobject, VGroup } from "../mobject/VMobject.ts";
import { Color } from "../core/color.ts";
import type { Mobject } from "../mobject/Mobject.ts";
import type { ColorLike } from "../core/types.ts";
/** Config for AnimatedBoundary. */
export interface AnimatedBoundaryConfig {
    colors?: ColorLike[];
    maxTipLengthToLengthRatio?: number;
    cycleRate?: number;
    strokeWidth?: number;
}
/**
 * AnimatedBoundary: a VGroup of two moving partial copies of `vmobject`'s
 * outline that cycle through `colors`, giving the impression of an animated
 * boundary being drawn continuously. An updater advances the boundary each
 * frame based on accumulated time and `cycleRate`.
 */
export declare class AnimatedBoundary extends VGroup {
    vmobject: any;
    colors: Color[];
    maxTipLengthToLengthRatio: number;
    cycleRate: number;
    boundaryStrokeWidth: number;
    totalTime: number;
    boundaryCopies: VMobject[];
    constructor(vmobject: Mobject, config?: AnimatedBoundaryConfig);
    private updateBoundary;
}
export type TracedPointFunc = () => number[];
/** Config for TracedPath. */
export interface TracedPathConfig {
    strokeWidth?: number;
    strokeColor?: ColorLike;
    dissipatingTime?: number | null;
}
/**
 * TracedPath: a VMobject that appends `tracedPointFunc()` each frame, tracing
 * the path of a moving point. When `dissipatingTime` is set, points older than
 * that many seconds are dropped, so the trail fades from the tail.
 */
export declare class TracedPath extends VMobject {
    tracedPointFunc: TracedPointFunc;
    dissipatingTime: number | null;
    traceTime: number;
    private _times;
    constructor(tracedPointFunc: TracedPointFunc, config?: TracedPathConfig);
    private updatePath;
}
//# sourceMappingURL=changing.d.ts.map