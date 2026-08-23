import { ThreeRenderer } from "./renderer/ThreeRenderer.ts";
export * from "./index.ts";
export { ThreeRenderer };
export interface ThreeOptions {
    canvas?: any;
    background?: string;
    loop?: boolean;
    quality?: string;
    pixelWidth?: number;
    pixelHeight?: number;
    fps?: number;
    camera?: any;
    mode?: string;
    antialias?: boolean;
    bitrate?: number;
    three?: any;
    postProcessing?: import("./renderer/three_post.ts").PostProcessingConfig;
    [key: string]: any;
}
export declare function play(sceneOrConstruct: any, options?: ThreeOptions): Promise<{
    canvas: any;
    renderer: ThreeRenderer;
}>;
export declare function record(sceneOrConstruct: any, options?: ThreeOptions): Promise<Blob>;
//# sourceMappingURL=browser-three.d.ts.map