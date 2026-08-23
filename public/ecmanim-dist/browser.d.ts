export * from "./index.ts";
export { ManimPlayerElement, defineManimPlayer } from "./web-component.ts";
export { loadVideo, LiveVideoProvider, PreCapturedProvider, WebCodecsProvider, webCodecsAvailable } from "./video-browser.ts";
export type { LoadVideoBrowserOptions } from "./video-browser.ts";
export { savePlaybackPosition, restorePlaybackPosition, enablePageTransitionResume, } from "./page_transition.ts";
export type { PlaybackPosition, SavePositionOptions, PageTransitionOptions, PageTransitionHandle, } from "./page_transition.ts";
export interface BrowserOptions {
    canvas?: any;
    background?: string;
    loop?: boolean;
    quality?: string;
    pixelWidth?: number;
    pixelHeight?: number;
    fps?: number;
    camera?: any;
    mimeType?: string;
    bitrate?: number;
    [key: string]: any;
}
export declare function play(sceneOrConstruct: any, options?: BrowserOptions): Promise<{
    canvas: any;
}>;
export declare function loadSVG(url: string, config?: any): Promise<import("./index.ts").SVGMobject>;
export declare function loadImage(src: any): Promise<HTMLImageElement | ImageBitmap>;
export declare function record(sceneOrConstruct: any, options?: BrowserOptions): Promise<Blob>;
export declare function downloadWebM(sceneOrConstruct: any, filename?: string, options?: BrowserOptions): Promise<Blob>;
export declare function recordGif(sceneOrConstruct: any, options?: BrowserOptions): Promise<Blob>;
export declare function downloadGif(sceneOrConstruct: any, filename?: string, options?: BrowserOptions): Promise<Blob>;
export declare function recordMp4(sceneOrConstruct: any, options?: BrowserOptions): Promise<Blob>;
export declare function downloadMp4(sceneOrConstruct: any, filename?: string, options?: BrowserOptions): Promise<Blob>;
export interface RecordVideoOptions extends BrowserOptions {
    format?: "webm" | "gif" | "mp4";
}
export declare function recordVideo(sceneOrConstruct: any, options?: RecordVideoOptions): Promise<Blob>;
//# sourceMappingURL=browser.d.ts.map