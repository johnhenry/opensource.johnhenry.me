import { Camera } from "../renderer/CanvasRenderer.ts";
import type { CameraConfig } from "../renderer/CanvasRenderer.ts";
export interface MultiCameraConfig extends CameraConfig {
    imageMobjectsFromCameras?: Array<{
        imageMobject: any;
        camera: Camera;
    }>;
    allowCameraRotation?: boolean;
}
export declare class MultiCamera extends Camera {
    imageMobjects: Array<{
        imageMobject: any;
        camera: Camera;
    }>;
    allowCameraRotation: boolean;
    constructor(config?: MultiCameraConfig);
    /** Register an image mobject fed by a sub-camera, fitting it immediately. */
    addImageMobjectFromCamera(imageMobject: any, camera: Camera): this;
    updateSubCameraToFitInFrame(imageMobject: any, camera: Camera): void;
    /** Re-fit every registered sub-camera (call after a display moves/resizes). */
    updateSubCamerasToFitInFrame(): this;
    preRender(): void;
}
//# sourceMappingURL=multi_camera.d.ts.map