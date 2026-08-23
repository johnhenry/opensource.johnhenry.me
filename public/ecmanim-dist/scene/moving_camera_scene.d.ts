import { Scene } from "./Scene.ts";
import type { SceneConfig } from "./Scene.ts";
import { Rectangle } from "../mobject/geometry.ts";
import type { Mobject } from "../mobject/Mobject.ts";
import { Animation } from "../animation/Animation.ts";
import type { AnimationConfig } from "../animation/Animation.ts";
/**
 * A named camera viewpoint (center/width/height/zoom), recalled via
 * `goToCameraStop()`. `zoom` here is a scale factor applied to the frame's
 * OWN width/height (`frame.animate.scale(1/zoom)`) — a DIFFERENT concept
 * from the interactive camera's `camera.zoom` multiplier
 * (`src/studio/interactive.ts`), which instead scales the projection at
 * render time without touching the frame mobject's own geometry. Don't
 * conflate the two.
 */
export interface CameraStop {
    center?: number[];
    width?: number;
    height?: number;
    zoom?: number;
}
/**
 * A Rectangle sized to (a fraction of) the camera frame, invisible by default.
 * Handy for masking / marking a region of the screen. The `frame` is optional;
 * when omitted, it falls back to the default manim frame dimensions.
 */
export declare class ScreenRectangle extends Rectangle {
    constructor(config?: {
        aspectRatio?: number;
        height?: number;
        width?: number;
        strokeWidth?: number;
        fillOpacity?: number;
        [key: string]: any;
    });
}
/** A ScreenRectangle sized to the full default manim frame (14.222 x 8). */
export declare class FullScreenRectangle extends ScreenRectangle {
    constructor(config?: {
        [key: string]: any;
    });
}
interface FrameParams {
    center: number[];
    width: number;
    height: number;
    roll: number;
}
/**
 * Tween the camera frame PARAMETRICALLY (center/width/height/roll) instead
 * of point-lerping it: a straight lerp between two rotations collapses the
 * rect through its center midway (a 180-degree roll momentarily has
 * frameWidth 0 and the view degenerates). Each tick rebuilds the rect from
 * the interpolated params, so the viewport stays a proper rectangle all
 * the way through.
 */
export declare class CameraFrameTween extends Animation {
    private target;
    private from;
    /** "linear" (default) lerps params; "zoom" follows the van Wijk-Nuij
     *  optimal pan-and-zoom path (d3.interpolateZoom): the camera zooms OUT
     *  over long pans so perceived velocity stays constant — the difference
     *  is dramatic on deep dives like zoomable circle packing. */
    private path;
    private _zoom?;
    constructor(frame: Rectangle, target: Partial<FrameParams>, config?: AnimationConfig & {
        path?: "linear" | "zoom";
    });
    begin(): this;
    interpolateMobject(alpha: number): void;
}
/**
 * A scene whose camera has an animatable `frame` mobject. The frame is a
 * Rectangle matching the current viewport (frameWidth x frameHeight centered at
 * frameCenter). play()ing an animation on it moves its points; the renderer's
 * preRender() then syncs the viewport to those points each frame.
 */
export declare class MovingCameraScene extends Scene {
    constructor(config?: SceneConfig);
    setupFrame(): void;
    private _initialFrameState?;
    /**
     * Animate the camera to center on a mobject or point (Motion Canvas's
     * `camera().centerOn(node, dur)`). Pure frame movement -- zoom/rotation
     * are untouched.
     */
    centerOn(target: Mobject | number[], config?: AnimationConfig): Promise<this>;
    /**
     * Animate the camera roll by `angle` radians (Motion Canvas's
     * `camera().rotation(deg, dur)`, additive). Sugar over rotating the frame
     * mobject; preRender() picks the roll up from its corners.
     */
    rotateCamera(angle: number, config?: AnimationConfig): Promise<this>;
    /**
     * Animate the camera back to its initial viewport (Motion Canvas's
     * `camera().reset(dur)`): center, size, and zero roll as they were when
     * the frame was created.
     */
    resetCamera(config?: AnimationConfig): Promise<this>;
    /** The camera's frame mobject (creating it if the camera was set late). */
    getFrame(): Rectangle;
    private _cameraStops;
    /** Name a camera viewpoint, recallable later via `goToCameraStop(name)`. */
    defineCameraStop(name: string, stop: CameraStop): this;
    /**
     * Animate the camera frame to a previously-defined stop. Pure sugar over
     * `camera.frame.animate.moveTo()/setWidth()/setHeight()` -- applied as a
     * SINGLE ApplyMethod (not one animation per field) so multiple fields
     * changing at once compose correctly instead of racing to overwrite the
     * same frame mobject's points each tick.
     */
    goToCameraStop(name: string, config?: AnimationConfig): Promise<this>;
}
export {};
//# sourceMappingURL=moving_camera_scene.d.ts.map