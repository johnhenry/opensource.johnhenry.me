import { loadVectorFont, loadVectorFontSync, resolveFontPath } from "./renderer/fonts-node.ts";
export * from "./index.ts";
export { loadVectorFont, loadVectorFontSync, resolveFontPath };
export { MathTexDvisvgm, mathTexDvisvgm, mathTexDvisvgmOrFallback, texToSVGViaDvisvgm, detectDvisvgmToolchain } from "./mobject/mathtex_dvisvgm.ts";
export { config, resolveConfig, loadConfigFile, QUALITY_PRESETS } from "./_config.ts";
export { renderParallel, renderSegmentRange } from "./node-parallel.ts";
export { discoverSegments, partitionSegments } from "./scene/render_frame.ts";
export type { SegmentRecord } from "./scene/render_frame.ts";
export { renderGL } from "./node-gl.ts";
export type { RenderGLOptions } from "./node-gl.ts";
export { probeCDP, connectCDP } from "./renderer/cdp.ts";
export { loadVideo } from "./video-node.ts";
export type { LoadVideoOptions } from "./video-node.ts";
export { probeVideo, extractFrames } from "./renderer/ffmpeg.ts";
export type { ProbeResult } from "./renderer/ffmpeg.ts";
export { applyWatermark } from "./core/watermark.ts";
export type { WatermarkConfig, WatermarkPosition } from "./core/watermark.ts";
export { voiceover, parseBookmarks, VoiceoverTracker } from "./voiceover/voiceover.ts";
export type { VoiceoverOptions, Bookmark } from "./voiceover/voiceover.ts";
export { registerTTSProvider, getTTSProvider, listTTSProviders, resolveTTSProvider, audioDurationSeconds, silentProvider, systemProvider, openaiProvider, elevenLabsProvider, } from "./voiceover/providers.ts";
export type { TTSProvider, TTSResult, TTSSynthesizeOptions, WordBoundary } from "./voiceover/providers.ts";
export interface RenderOptions {
    output?: string;
    quality?: string;
    background?: string;
    format?: string;
    fps?: number;
    pixelWidth?: number;
    pixelHeight?: number;
    resolution?: [number, number];
    camera?: any;
    verbose?: boolean;
    vectorFont?: string;
    fonts?: Array<{
        path: string;
        name: string;
    }>;
    saveLastFrame?: boolean;
    transparent?: boolean;
    fromAnimationNumber?: number | null;
    uptoAnimationNumber?: number | null;
    disableCaching?: boolean;
    saveSections?: boolean;
    params?: Record<string, any>;
    /** Coarse render progress: fires at each play()/wait segment boundary.
     *  segmentsTotal is -1 on this sequential path (segments are discovered
     *  during construct); renderParallel reports a real total. */
    onProgress?: (p: {
        segmentsDone: number;
        segmentsTotal: number;
    }) => void;
    style?: string;
    aspectRatio?: string;
    stillFrame?: number;
    watermark?: import("./core/watermark.ts").WatermarkConfig;
    [key: string]: any;
}
export declare function renderStill(sceneOrConstruct: any, options?: RenderOptions & {
    frame?: number;
    time?: number;
}): Promise<{
    output: string;
    frame: number;
    fps: any;
    pixelWidth: any;
    pixelHeight: any;
    sounds: number;
    still: boolean;
    frames?: undefined;
    sections?: undefined;
    lastFrame?: undefined;
    reusedPartials?: undefined;
    cached?: undefined;
} | {
    output: string;
    frames: number;
    fps: any;
    pixelWidth: any;
    pixelHeight: any;
    sounds: number;
    sections: import("./scene/Scene.ts").SceneSection[];
    lastFrame: boolean;
    frame?: undefined;
    still?: undefined;
    reusedPartials?: undefined;
    cached?: undefined;
} | {
    output: string;
    frames: number;
    fps: any;
    pixelWidth: any;
    pixelHeight: any;
    sounds: number;
    sections: import("./scene/Scene.ts").SceneSection[];
    frame?: undefined;
    still?: undefined;
    lastFrame?: undefined;
    reusedPartials?: undefined;
    cached?: undefined;
} | {
    output: string;
    frames: number;
    fps: any;
    pixelWidth: any;
    pixelHeight: any;
    sounds: number;
    sections: import("./scene/Scene.ts").SceneSection[];
    reusedPartials: number;
    cached: boolean;
    frame?: undefined;
    still?: undefined;
    lastFrame?: undefined;
}>;
export declare function render(sceneOrConstruct: any, options?: RenderOptions): Promise<{
    output: string;
    frame: number;
    fps: any;
    pixelWidth: any;
    pixelHeight: any;
    sounds: number;
    still: boolean;
    frames?: undefined;
    sections?: undefined;
    lastFrame?: undefined;
    reusedPartials?: undefined;
    cached?: undefined;
} | {
    output: string;
    frames: number;
    fps: any;
    pixelWidth: any;
    pixelHeight: any;
    sounds: number;
    sections: import("./scene/Scene.ts").SceneSection[];
    lastFrame: boolean;
    frame?: undefined;
    still?: undefined;
    reusedPartials?: undefined;
    cached?: undefined;
} | {
    output: string;
    frames: number;
    fps: any;
    pixelWidth: any;
    pixelHeight: any;
    sounds: number;
    sections: import("./scene/Scene.ts").SceneSection[];
    frame?: undefined;
    still?: undefined;
    lastFrame?: undefined;
    reusedPartials?: undefined;
    cached?: undefined;
} | {
    output: string;
    frames: number;
    fps: any;
    pixelWidth: any;
    pixelHeight: any;
    sounds: number;
    sections: import("./scene/Scene.ts").SceneSection[];
    reusedPartials: number;
    cached: boolean;
    frame?: undefined;
    still?: undefined;
    lastFrame?: undefined;
}>;
/** Delete the partial-movie-file cache directory next to an output path. */
export declare function flushCache(outputOrDir: string): void;
export declare function loadImage(src: any): Promise<any>;
export declare function imageMobject(src: any, config?: any): Promise<import("./index.ts").ImageMobject>;
export declare function imageFromArray(array: any): Promise<any>;
export declare function loadSVG(path: string, config?: any): Promise<import("./index.ts").SVGMobject>;
export declare function loadPlugins(config?: string | {
    plugins?: any[];
}): Promise<import("./index.ts").Registry>;
//# sourceMappingURL=node.d.ts.map