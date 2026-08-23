import { MovingCameraScene } from "./moving_camera_scene.ts";
import type { SceneConfig } from "./Scene.ts";
import { Mobject } from "../mobject/Mobject.ts";
import { Rectangle } from "../mobject/geometry.ts";
export interface ZoomedSceneConfig extends SceneConfig {
    zoomFactor?: number;
    zoomedDisplayHeight?: number;
    zoomedDisplayWidth?: number;
    zoomedDisplayCenter?: number[] | null;
    zoomedDisplayCorner?: number[];
    zoomedDisplayCornerBuff?: number;
    /** manim's zoomed_camera_config: defaultFrameStrokeWidth/Color style the
     *  SOURCE frame rectangle. */
    zoomedCameraConfig?: {
        defaultFrameStrokeWidth?: number;
        defaultFrameStrokeColor?: any;
        background?: any;
        [key: string]: any;
    };
    /** manim's zoomed_camera_frame_starting_position. */
    zoomedCameraFrameStartingPosition?: number[];
    imageFrameStroke?: number;
    [key: string]: any;
}
/** The magnified-view mobject: a positioned rect the renderer fills by
 *  re-rendering the source frame's region. Its one child is the border. */
export declare class ZoomedDisplay extends Mobject {
    _isZoomedDisplay: boolean;
    _sourceFrame: Rectangle;
    displayFrame: Rectangle;
    constructor(width: number, height: number, sourceFrame: Rectangle, strokeWidth: number);
}
export declare class ZoomedScene extends MovingCameraScene {
    zoomFactor: number;
    zoomedDisplayHeight: number;
    zoomedDisplayWidth: number;
    zoomedDisplayCenter: number[] | null;
    zoomedDisplayCorner: number[];
    zoomedDisplayCornerBuff: number;
    imageFrameStroke: number;
    zoomedCameraConfig: NonNullable<ZoomedSceneConfig["zoomedCameraConfig"]>;
    /** manim shape: `this.zoomedCamera.frame` is the SOURCE region rectangle. */
    zoomedCamera: {
        frame: Rectangle;
    };
    zoomedDisplay: ZoomedDisplay;
    activated: boolean;
    constructor(config?: ZoomedSceneConfig);
    setupZoom(config?: ZoomedSceneConfig): void;
    /** The linear magnification the display applies to the framed region. */
    getZoomFactor(): number;
    /** manim parity: the frame starts full-screen and shrinks onto its region. */
    getZoomInAnimation(config?: {
        [key: string]: any;
    }): any;
    /** manim parity: the display "pops out" of the frame to its screen spot. */
    getZoomedDisplayPopOutAnimation(config?: {
        [key: string]: any;
    }): any;
    /** Add the frame + display (optionally with manim's two-step entrance). */
    activateZooming(animate?: boolean): Promise<this>;
}
//# sourceMappingURL=zoomed_scene.d.ts.map