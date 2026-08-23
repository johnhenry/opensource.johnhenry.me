export interface RenderGLOptions {
    sceneModule: string;
    sceneExport?: string;
    root?: string;
    cdpUrl?: string;
    output?: string;
    format?: string;
    fps?: number;
    quality?: string;
    pixelWidth?: number;
    pixelHeight?: number;
    background?: string;
    camera?: any;
    mode?: string;
    antialias?: boolean;
    postProcessing?: import("./renderer/three_post.ts").PostProcessingConfig;
    verbose?: boolean;
    timeoutMs?: number;
}
export interface RenderGLResult {
    output: string;
    format: string;
    bytes: number;
    renderer: "gl";
}
export declare function mimeFor(path: string): string;
export declare function resolveGLDims(opts: RenderGLOptions): {
    pixelWidth: number;
    pixelHeight: number;
    fps: number;
    cdpUrl: string;
    format: string;
    output: string;
    background: string;
};
export declare function transcodeArgs(tmpWebm: string, output: string, format: string): string[] | null;
export declare function buildGLHarness(opts: {
    sceneModuleUrl: string;
    sceneExport: string;
    browserThreeUrl: string;
    threeUrl?: string;
    recordOptions: any;
}): string;
export declare function renderGL(options: RenderGLOptions): Promise<RenderGLResult>;
//# sourceMappingURL=node-gl.d.ts.map