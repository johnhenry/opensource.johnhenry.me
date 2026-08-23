import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import type { Mobject } from "../mobject/Mobject.ts";
import type { Vec3, ColorLike } from "../core/types.ts";
interface ExtraConfig extends AnimationConfig {
    pointColor?: ColorLike | null;
    angle?: number;
    axis?: Vec3 | number[];
    radians?: number;
    aboutPoint?: Vec3 | number[] | null;
    scaleFactor?: number;
    color?: ColorLike;
    numLines?: number;
    lineLength?: number;
    flashRadius?: number;
    scaleValue?: number;
    rotationAngle?: number;
    nWiggles?: number;
    buff?: number;
    fadeOut?: boolean;
    startRadius?: number;
    fillOpacity?: number;
    strokeWidth?: number;
    /** MoveAlongPath: rotate the mobject to track the path's tangent direction
     *  as it travels (GSAP MotionPathPlugin's `autoRotate`, default false). */
    autoRotate?: boolean;
    /** MoveAlongPath: constant offset (radians) added to the auto-rotation
     *  angle, for a mobject whose "forward" isn't +X (default 0). */
    autoRotateOffset?: number;
    /** Force the highlight geometry to render fixed-in-frame / fixed-
     *  orientation under a 3D camera (see the `_fixedInFrame`/
     *  `_fixedOrientation` doc note above each class below). Defaults to
     *  whatever the target mobject already carries when one is available
     *  (Circumscribe always has one; Flash/FocusOn only when called with a
     *  mobject rather than a raw point) -- set explicitly to override, or to
     *  supply the flag when only a raw point is available. */
    fixedInFrame?: boolean;
    fixedOrientation?: boolean;
    /** A 3D camera (e.g. `this.camera` inside a ThreeDScene's construct()) to
     *  billboard the highlight against, for a target that's a genuine 3D
     *  world-space point (not fixed-in-frame/fixed-orientation) -- see the
     *  "camera-facing billboarding" note above (issue #29). Ignored when the
     *  target is fixed-in-frame/fixed-orientation, since those already render
     *  correctly without it. Recomputed every frame, so an orbiting camera
     *  (beginAmbientCameraRotation/moveCamera) is tracked correctly. */
    camera?: any;
}
export declare class GrowFromPoint extends Animation {
    point: any;
    pointColor: any;
    finalPoints: number[][][];
    targetOpacities: Array<{
        fill: number;
        stroke: number;
        op: number;
    }>;
    constructor(mobject: Mobject, point: any, config?: ExtraConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class GrowFromCenter extends GrowFromPoint {
    constructor(mobject: any, config?: ExtraConfig);
}
export declare class GrowFromEdge extends GrowFromPoint {
    constructor(mobject: any, edge: any, config?: ExtraConfig);
}
export declare class SpinInFromNothing extends GrowFromCenter {
    spinAngle: number;
    spinAxis: any;
    constructor(mobject: any, config?: ExtraConfig);
    interpolateMobject(alpha: number): void;
}
export declare class ShrinkToCenter extends Animation {
    point: any;
    startPoints: number[][][];
    startOpacities: Array<{
        fill: number;
        stroke: number;
        op: number;
    }>;
    constructor(mobject: any, config?: ExtraConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class Rotating extends Animation {
    radians: number;
    axis: any;
    aboutPoint: any;
    startPoints: number[][][];
    pivot: any;
    constructor(mobject: any, config?: ExtraConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
}
export declare class Rotate extends Animation {
    angle: number;
    axis: any;
    aboutPoint: any;
    startPoints: number[][][];
    pivot: any;
    constructor(mobject: any, angle: number, config?: ExtraConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
}
export declare class MoveAlongPath extends Animation {
    path: any;
    autoRotate: boolean;
    autoRotateOffset: number;
    private _lastAngle;
    constructor(mobject: any, path: any, config?: ExtraConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
}
export declare class Indicate extends Animation {
    scaleFactor: number;
    flashColor: any;
    startPoints: number[][][];
    center: any;
    startColors: Array<{
        color: any;
        strokeColor: any;
        fillColor: any;
    }>;
    constructor(mobject: any, config?: ExtraConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class Flash extends Animation {
    point: any;
    lines: any;
    startOpacities: Array<{
        fill: number;
        stroke: number;
        op: number;
    }>;
    _billboard: boolean;
    _billboardCamera: any;
    _billboardCenter: number[];
    _billboardFlashRadius: number;
    _billboardLineLength: number;
    _billboardNumLines: number;
    constructor(point: any, config?: ExtraConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class Wiggle extends Animation {
    scaleValue: number;
    rotationAngle: number;
    nWiggles: number;
    axis: any;
    startPoints: number[][][];
    center: any;
    constructor(mobject: any, config?: ExtraConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class Circumscribe extends Animation {
    rect: any;
    fadeOut: boolean;
    startOpacities: Array<{
        fill: number;
        stroke: number;
        op: number;
    }>;
    _billboard: boolean;
    _billboardCamera: any;
    _billboardCenter: number[];
    _billboardLocalPoints: number[][] | null;
    constructor(mobject: any, config?: ExtraConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
export declare class FocusOn extends Animation {
    point: any;
    circle: any;
    startRadius: number;
    startPoints: number[][][];
    startOpacities: Array<{
        fill: number;
        stroke: number;
        op: number;
    }>;
    _billboard: boolean;
    _billboardCamera: any;
    _billboardLocalPoints: number[][] | null;
    constructor(point: any, config?: ExtraConfig);
    static _geometry(): {
        Circle: typeof _Circle;
    };
    setup(): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
import { Circle as _Circle } from "../mobject/geometry.ts";
export {};
//# sourceMappingURL=extra.d.ts.map