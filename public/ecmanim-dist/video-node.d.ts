import { VideoMobject } from "./mobject/video_mobject.ts";
import type { VideoFrameProvider, VideoMobjectConfig } from "./mobject/video_mobject.ts";
/**
 * A VideoFrameProvider backed by a directory of PNG frames that were already
 * extracted at `fps`. init() pre-loads every frame into memory as an
 * @napi-rs/canvas Image; frameAt() is then a synchronous index lookup.
 */
export declare class FrameCacheProvider implements VideoFrameProvider {
    readonly fps: number;
    readonly width: number;
    readonly height: number;
    readonly duration: number;
    private files;
    private frames;
    constructor(opts: {
        dir?: string;
        files?: string[];
        fps: number;
        width: number;
        height: number;
        duration?: number;
    });
    /** Decode every PNG frame into an Image and hold it in memory. */
    init(): Promise<this>;
    /** Synchronous frame lookup: nearest frame index for the given source time. */
    frameAt(timeSeconds: number): any;
    /** Release the decoded frames so they can be garbage-collected. */
    dispose(): void;
    /** Number of decoded frames held in memory. */
    get frameCount(): number;
}
/** Options for loadVideo(): VideoMobject config plus Node decode/audio knobs. */
export type LoadVideoOptions = VideoMobjectConfig & {
    /** Target decode fps (defaults to the source fps, capped). */
    fps?: number;
    /** Downscale to [w,h] or a target width (height auto). Bounds memory. */
    scale?: [number, number] | number;
    /** Base cache directory (default: <os.tmpdir()>/ecmanim-video). */
    cacheDir?: string;
    /** Scene to schedule audio into (required for audio muxing). */
    scene?: any;
    /** Extract the clip's audio and add it to scene.sounds. */
    audio?: boolean;
    /** Offset (seconds) at which the audio should play (default scene.time). */
    audioOffset?: number;
    /** Audio gain multiplier (default 1). */
    gain?: number;
    /** Log ffmpeg/ffprobe output. */
    verbose?: boolean;
    /**
     * Treat a string `src` as a URL to a IIIF Presentation 3.0 Manifest: fetch it,
     * resolve the video body URL + chapters, then ingest that. A manifest OBJECT
     * (already parsed) is auto-detected regardless of this flag.
     */
    iiif?: boolean;
};
/**
 * Decode a video file into a VideoMobject.
 *
 * Probes the clip, extracts frames to a content-hash-keyed cache directory
 * (skipping ffmpeg when the cache is warm), pre-loads them into memory, and
 * returns a VideoMobject wired to that provider. Optionally extracts the clip's
 * audio and schedules it on `options.scene` for the node.ts muxer.
 */
export declare function loadVideo(path: string | any, options?: LoadVideoOptions): Promise<VideoMobject>;
//# sourceMappingURL=video-node.d.ts.map