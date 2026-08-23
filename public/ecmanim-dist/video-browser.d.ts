import { VideoMobject } from "./mobject/video_mobject.ts";
import type { VideoFrameProvider, VideoMobjectConfig } from "./mobject/video_mobject.ts";
export declare class LiveVideoProvider implements VideoFrameProvider {
    readonly fps: number;
    private video;
    constructor(video: any, fps?: number);
    get duration(): number;
    get width(): number;
    get height(): number;
    frameAt(timeSeconds: number): any;
    dispose(): void;
}
export declare class PreCapturedProvider implements VideoFrameProvider {
    readonly fps: number;
    private _duration;
    private _width;
    private _height;
    private frames;
    private video;
    constructor(opts?: {
        video?: any;
        fps?: number;
        frames?: any[];
        duration?: number;
        width?: number;
        height?: number;
    });
    get duration(): number;
    get width(): number;
    get height(): number;
    /** Number of captured frames (test/introspection helper). */
    get frameCount(): number;
    init(): Promise<this>;
    frameAt(timeSeconds: number): any;
    dispose(): void;
}
export declare class WebCodecsProvider implements VideoFrameProvider {
    readonly fps: number;
    private _duration;
    private _width;
    private _height;
    private frames;
    constructor(opts?: {
        fps?: number;
        frames?: any[];
        duration?: number;
        width?: number;
        height?: number;
    });
    static create(url: string, fps: number): Promise<WebCodecsProvider>;
    get duration(): number;
    get width(): number;
    get height(): number;
    /** Number of resampled frames (test/introspection helper). */
    get frameCount(): number;
    frameAt(timeSeconds: number): any;
    dispose(): void;
}
/** True when the WebCodecs decode API is present (false in Node / older browsers). */
export declare function webCodecsAvailable(): boolean;
export interface LoadVideoBrowserOptions extends VideoMobjectConfig {
    /** Capture / index framerate (default 30). */
    fps?: number;
    /**
     * Provider selection (default "auto"):
     *   - "auto":       WebCodecs single-pass decode for an mp4/mov URL when the
     *                   browser supports it, else falls back to "precapture".
     *   - "webcodecs":  force the WebCodecs path (throws if unsupported).
     *   - "precapture": frame-accurate seek-and-capture (dependency-free).
     *   - "live":       low-latency real-time <video> (not frame-accurate).
     */
    mode?: "auto" | "webcodecs" | "precapture" | "live";
    /** crossOrigin attribute for the created <video> (default "anonymous"). */
    crossOrigin?: string;
    /**
     * Treat a string `src` as a URL to a IIIF Presentation 3.0 Manifest: fetch it,
     * resolve the video body URL + chapters, then decode that. A manifest OBJECT
     * (already parsed) is auto-detected regardless of this flag.
     */
    iiif?: boolean;
}
export declare function loadVideo(src: string | any, options?: LoadVideoBrowserOptions): Promise<VideoMobject>;
//# sourceMappingURL=video-browser.d.ts.map