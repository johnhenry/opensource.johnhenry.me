import { ZBuffer } from "./zbuffer.ts";
import type { FrameEffect } from "../core/effects.ts";
import type { Ctx2D, ColorLike } from "../core/types.ts";
import type { Mobject } from "../mobject/Mobject.ts";
export interface CameraConfig {
    pixelWidth?: number;
    pixelHeight?: number;
    frameHeight?: number;
    frameWidth?: number;
    frameCenter?: number[];
    background?: ColorLike;
    zoom?: number;
    [key: string]: any;
}
export declare class Camera {
    pixelWidth: number;
    pixelHeight: number;
    frameHeight: number;
    frameWidth: number;
    frameCenter: number[];
    background: ColorLike;
    disableZBuffer?: boolean;
    flatShading?: boolean;
    focalDistance?: number;
    superSample?: number;
    frame?: any;
    zoom?: number;
    rotation?: number;
    frameEffects?: FrameEffect[];
    constructor(config?: CameraConfig);
    toPixel(p: number[]): [number, number];
    strokeScale(): number;
    preRender(): void;
}
export interface Camera {
    projectionDepth?(p: number[]): number;
}
export interface CanvasRendererOptions {
    /** Synchronous offscreen-canvas factory. Browsers don't need this
     *  (OffscreenCanvas / a detached <canvas> is used automatically); Node
     *  callers pass @napi-rs/canvas's createCanvas here -- it can only be
     *  reached via an async import, so the renderer can't fetch it itself.
     *  Enables the effects pipeline's offscreen compositing and makes
     *  cacheStatic() work under Node. */
    createCanvas?: (w: number, h: number) => any;
}
export declare class CanvasRenderer {
    ctx: Ctx2D;
    camera: Camera;
    _zb?: ZBuffer;
    private _staticCache;
    private _createCanvas?;
    private _sceneMobjects?;
    private _noiseTiles;
    constructor(ctx: Ctx2D, camera: Camera, opts?: CanvasRendererOptions);
    private _makeOffscreen;
    private _fullFramePool;
    private _poolW;
    private _poolH;
    private _borrowFullFrame;
    private _releaseFullFrame;
    clear(): void;
    renderScene(mobjects: any[]): void;
    private _compositeFrame;
    private _drawFrameOverlays;
    /** SceneRenderer-shaped alias for renderScene(), satisfying the shared
     *  interface in scene_renderer.ts. Purely delegating -- renderScene()
     *  remains the primary, unchanged public method. */
    renderFrame(mobjects: Mobject[]): void;
    renderScene3D(mobjects: any[]): void;
    _drawFixed(mob: any, fixedInFrame: boolean): void;
    _projectVertex(p: number[]): {
        x: number;
        y: number;
        z: number;
        r?: number;
        g?: number;
        b?: number;
    };
    _flatten(mob: any): number[][][];
    _rasterMobject(mob: any): void;
    renderMobjects(mobjects: any[]): void;
    drawCompositeGroup(group: any): void;
    drawZoomedDisplay(mob: any): void;
    private _fingerprintMobject;
    private _cameraFingerprint;
    private _pixelBBox;
    private _renderToOffscreen;
    private _drawCachedVMobject;
    private _buildEffectFilter;
    private _drawWithEffects;
    private _noiseTile;
    drawImage(mob: any): void;
    drawParticles(mob: any): void;
    drawText(mob: any): void;
    tracePath(mob: any, proportion?: number, startProportion?: number): void;
    _buildGradient(mob: any, alpha: number): CanvasGradient | null;
    drawVMobject(mob: any): void;
}
//# sourceMappingURL=CanvasRenderer.d.ts.map