import type { PostProcessingConfig, PostModules } from "./three_post.ts";
import type { Mobject } from "../mobject/Mobject.ts";
export interface ThreeRendererOptions {
    camera?: any;
    background?: string;
    canvas?: any;
    antialias?: boolean;
    strokeMode?: "line" | "sdf";
    strokeWidth?: number;
    lit?: boolean;
    postProcessing?: PostProcessingConfig;
    [key: string]: any;
}
export declare class ThreeRenderer {
    THREE: any;
    camera: any;
    background: string;
    renderer: any;
    scene: any;
    group: any;
    threeCamera: any;
    strokeMode: "line" | "sdf";
    strokeWidth: number;
    lit: boolean;
    private _post;
    private _postConfig?;
    constructor(THREE: any, opts?: ThreeRendererOptions);
    _addLights(): void;
    is3D(): boolean;
    _makeCamera(): any;
    syncCamera(): void;
    render(mobjects: any[], dt?: number): void;
    /** SceneRenderer-shaped alias for render(), satisfying the shared interface
     *  in scene_renderer.ts. Purely delegating -- render() remains the
     *  primary, unchanged public method. */
    renderFrame(mobjects: Mobject[]): void;
    enablePostProcessing(config?: PostProcessingConfig, injectedModules?: PostModules): Promise<void>;
    disablePostProcessing(): void;
    _mesh(buf: any, transparent: boolean, alpha: number): any;
    _sdfStrokes(buf: any): any;
    _lines(buf: any): any;
    _textSprite(mob: any): any;
    /**
     * ONE atlas texture + ONE merged quad mesh for every raster Text mobject
     * (converts N draw calls into 1). Returns null if no atlas could be built
     * (e.g. headless with no `document`), so the caller falls back to
     * _textSprite()'s per-mobject path.
     */
    _batchedTextMesh(texts: any[]): any;
    _imageQuad(mob: any): any;
    _mesh3D(mob: any): any;
    _clearGroup(): void;
    setSize(pixelWidth: number, pixelHeight: number): void;
    dispose(): void;
}
//# sourceMappingURL=ThreeRenderer.d.ts.map