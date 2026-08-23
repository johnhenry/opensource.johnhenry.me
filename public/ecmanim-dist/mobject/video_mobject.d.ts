import { ImageMobject } from "./image_mobject.ts";
import type { ImageMobjectConfig } from "./image_mobject.ts";
import type { Chapter } from "../metadata.ts";
/** A backend-agnostic source of decoded video frames. */
export interface VideoFrameProvider {
    /** Clip duration in seconds. */
    readonly duration: number;
    /** Intrinsic frame width in pixels. */
    readonly width: number;
    /** Intrinsic frame height in pixels. */
    readonly height: number;
    /** The fps the provider's frames are indexed at (usually the scene fps). */
    readonly fps: number;
    /**
     * Return a drawable bitmap (an @napi-rs/canvas Image in Node; an ImageBitmap /
     * HTMLCanvasElement / HTMLVideoElement in the browser) for the given SOURCE
     * time in seconds. Implementations clamp `timeSeconds` to [0, duration].
     * Must be synchronous; may return null if no frame is available yet.
     */
    frameAt(timeSeconds: number): any;
    /** Release any held resources (decoded frames, video element, …). */
    dispose?(): void;
}
export interface VideoMobjectConfig extends ImageMobjectConfig {
    /** Source in-point in seconds (default 0). */
    start?: number;
    /** Source out-point in seconds (default = provider.duration). */
    end?: number;
    /** Playback speed multiplier (default 1). */
    playbackRate?: number;
    /** Loop the [start, end) span instead of holding the last frame (default false). */
    loop?: boolean;
    /** Start paused (no auto-advance) until play() is called (default false). */
    paused?: boolean;
    /** Chapters/segments (seconds) — e.g. populated from an ingested IIIF manifest. */
    chapters?: Chapter[];
}
export declare class VideoMobject extends ImageMobject {
    _isVideo: boolean;
    provider: VideoFrameProvider;
    start: number;
    end: number;
    playbackRate: number;
    loop: boolean;
    paused: boolean;
    /** Chapters/segments (seconds), if known (e.g. from an ingested IIIF manifest). */
    chapters: Chapter[];
    _elapsed: number;
    constructor(provider: VideoFrameProvider, config?: VideoMobjectConfig);
    /** Advance playback by `dt` scene seconds and swap to the matching frame. */
    advance(dt: number): this;
    /** The source time (seconds) currently shown, honoring start/end/loop. */
    sourceTime(): number;
    /** Jump to `sceneSeconds` of playback (0 = the in-point) and show that frame. */
    seekTo(sceneSeconds: number): this;
    play(): this;
    pause(): this;
    /** Jump playback to `t` seconds into the clip (clip-relative, before
     *  start/end trimming is applied) and show that frame immediately. */
    seek(t: number): this;
    /** Total playing duration of the selected span at the current rate (seconds). */
    get playDuration(): number;
    dispose(): void;
    copy(): this;
}
//# sourceMappingURL=video_mobject.d.ts.map