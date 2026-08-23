import { Camera } from "../renderer/CanvasRenderer.ts";
import type { CameraConfig } from "../renderer/CanvasRenderer.ts";
export interface MappingCameraConfig extends CameraConfig {
    mappingFunc?: (p: number[]) => number[];
    allowedTransformClasses?: any[];
    minNumCurves?: number;
}
export declare class MappingCamera extends Camera {
    mappingFunc: (p: number[]) => number[];
    allowedTransformClasses: any[];
    minNumCurves: number;
    constructor(config?: MappingCameraConfig);
    toPixel(p: number[]): [number, number];
}
//# sourceMappingURL=mapping_camera.d.ts.map