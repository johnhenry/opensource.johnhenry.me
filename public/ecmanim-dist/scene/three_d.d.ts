import { Camera } from "../renderer/CanvasRenderer.ts";
import type { CameraConfig } from "../renderer/CanvasRenderer.ts";
import { Scene } from "./Scene.ts";
import type { SceneConfig } from "./Scene.ts";
import { VGroup } from "../mobject/VMobject.ts";
import { NumberLine } from "../mobject/coordinate_systems.ts";
import type { NumberLineConfig } from "../mobject/coordinate_systems.ts";
import type { RateFunc } from "../core/types.ts";
export interface ThreeDCameraConfig extends CameraConfig {
    phi?: number;
    theta?: number;
    gamma?: number;
    focalDistance?: number;
    zoom?: number;
    lightSource?: number[];
}
/** Orientation options accepted by setOrientation / moveCamera. */
export interface CameraOrientation {
    phi?: number;
    theta?: number;
    gamma?: number;
    zoom?: number;
    focalDistance?: number;
    frameCenter?: number[];
}
export declare class ThreeDCamera extends Camera {
    phi: number;
    theta: number;
    gamma: number;
    focalDistance: number;
    zoom: number;
    lightSource: number[];
    constructor(config?: ThreeDCameraConfig);
    toCameraSpace(p: number[]): number[];
    projectionDepth(p: number[]): number;
    toPixel(p: number[]): [number, number];
    getLightDirection(): number[];
    setOrientation({ phi, theta, gamma, zoom, focalDistance, frameCenter }?: CameraOrientation): this;
}
export interface MoveCameraConfig {
    runTime?: number;
    rateFunc?: RateFunc;
    /** Animations to run concurrently while the camera moves. */
    addedAnims?: any[];
}
export declare class ThreeDScene extends Scene {
    camera: ThreeDCamera;
    _ambientOn: boolean;
    _ambientRate: number;
    _ambientField: string;
    _depthSort: boolean;
    _illusionOn: boolean;
    _illusionRate: number;
    _illusionTime: number;
    _illusionOriginPhi: number;
    _illusionOriginTheta: number;
    constructor(config?: SceneConfig);
    setCameraOrientation(opts?: CameraOrientation): this;
    /** Manim's default "nicely angled" 3D view (phi ~ 75deg, theta ~ -45deg). */
    setToDefaultAngledCameraOrientation(opts?: CameraOrientation): this;
    moveCamera({ phi, theta, gamma, zoom, focalDistance, frameCenter }?: CameraOrientation, { runTime, rateFunc, addedAnims }?: MoveCameraConfig): Promise<this>;
    beginAmbientCameraRotation({ rate, about }?: {
        rate?: number;
        about?: string;
    }): this;
    stopAmbientCameraRotation(): this;
    begin3dillusionCameraRotation({ rate, originPhi, originTheta }?: {
        rate?: number;
        originPhi?: number;
        originTheta?: number;
    }): this;
    stop3dillusionCameraRotation(): this;
    updateMobjects(dt: number): void;
    addFixedInFrameMobjects(...mobs: any[]): this;
    removeFixedInFrameMobjects(...mobs: any[]): this;
    addFixedOrientationMobjects(...mobs: any[]): this;
    removeFixedOrientationMobjects(...mobs: any[]): this;
    moveLight(pos: number[]): this;
    /** manim parity: `self.renderer.camera.light_source.move_to(p)` — a
     *  mobject-shaped proxy over setCameraLight, so ports keep their shape:
     *  `scene.lightSource.moveTo([0, 0, -3])`. */
    get lightSource(): {
        moveTo: (pos: number[]) => void;
        getCenter: () => number[];
    };
    setCameraLight(pos: number[]): this;
    enableDepthSorting(on?: boolean): this;
    emitFrame(): Promise<void>;
}
export interface ThreeDAxesConfig {
    xRange?: number[];
    yRange?: number[];
    zRange?: number[];
    xLength?: number;
    yLength?: number;
    zLength?: number;
    axisColors?: string[];
    axisConfig?: NumberLineConfig;
    [key: string]: any;
}
export declare class ThreeDAxes extends VGroup {
    xRange: number[];
    yRange: number[];
    zRange: number[];
    xLength: number;
    yLength: number;
    zLength: number;
    xAxis: NumberLine;
    yAxis: NumberLine;
    zAxis: NumberLine;
    _xUnit: number;
    _yUnit: number;
    _zUnit: number;
    constructor(config?: ThreeDAxesConfig);
    _xRef(): number;
    _yRef(): number;
    _zRef(): number;
    _axisPointRaw(axis: NumberLine, v: number, dir: number[]): number[];
    coordsToPoint(x: number, y?: number, z?: number): number[];
    c2p(x: number, y?: number, z?: number): number[];
    pointToCoords(p: number[]): number[];
    p2c(p: number[]): number[];
    getAxis(index: number): NumberLine;
    getXAxis(): NumberLine;
    getYAxis(): NumberLine;
    getZAxis(): NumberLine;
    getOrigin(): number[];
    getAxisLabels(xLabel?: any, yLabel?: any, zLabel?: any): VGroup;
}
//# sourceMappingURL=three_d.d.ts.map