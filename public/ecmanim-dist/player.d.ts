import { Camera } from "./renderer/CanvasRenderer.ts";
import { Scene } from "./scene/Scene.ts";
/** A single recorded frame. Exactly one of these payload fields is populated. */
export interface RecordedFrame {
    /** Browser fast-path: a decoded bitmap ready to drawImage(). */
    bitmap?: any;
    /** Fallback: raw pixel data (browser ImageData, or a Node substitute). */
    imageData?: any;
    /** Node fallback: the raw RGBA buffer + dims when no ImageData exists. */
    buffer?: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
}
export interface PlayerOptions {
    /** Display canvas the Player draws recorded frames onto (browser). Optional. */
    canvas?: any;
    /** Camera config (merged into the recording Camera). */
    camera?: any;
    /** Background color for the recording. */
    background?: string;
    /** Quality preset name: low | medium | high | fourk. */
    quality?: string;
    pixelWidth?: number;
    pixelHeight?: number;
    fps?: number;
}
export declare class Player {
    /** All recorded frames, in order. Index === frame number. */
    frames: RecordedFrame[];
    fps: number;
    /** Display canvas + 2D ctx (browser). Undefined when running headless. */
    canvas: any;
    ctx: any;
    pixelWidth: number;
    pixelHeight: number;
    background: string;
    cameraConfig: any;
    /** The Scene instance from the most recent record() — exposes onLog, sections, etc. */
    scene?: Scene;
    /** UI hook: called with (frameIndex, timeSeconds) whenever a frame is displayed. */
    onFrame?: (frameIndex: number, time: number) => void;
    private _playing;
    private _rafId;
    private _current;
    private _playStartWall;
    private _playStartFrame;
    private _camera;
    private _liveRenderer;
    private _lastMobjects;
    constructor(opts?: PlayerOptions);
    get frameCount(): number;
    /** Total clip duration in seconds. */
    get duration(): number;
    /** The currently displayed frame index. */
    get currentFrame(): number;
    /** The recording Camera, for a Studio interactive-camera controller to mutate. */
    get camera(): Camera | null;
    /** Wall-clock time of the currently displayed frame. */
    get currentTime(): number;
    /**
     * Run a Scene (or a bare construct function) and record EVERY emitted frame
     * into `this.frames`. Decoupled from real time — as fast as the machine can
     * compute. After this resolves, seek()/play() give random-access playback.
     *
     * `opts.props` supports parameter-only re-render (e.g. a Studio props
     * panel calling `player.record(scene, { props })` again after an edit,
     * instead of re-`import()`ing the module): threaded into the Scene's own
     * constructor config (`config.props`) or passed as a bare construct
     * function's 2nd argument. This still re-runs `construct()` and
     * re-records every frame — it does not itself avoid that cost (see the
     * render-caching item for that).
     */
    record(sceneOrConstruct: any, opts?: {
        props?: any;
    }): Promise<void>;
    /** Draw a stored frame to the display canvas and fire onFrame. */
    seek(frameIndex: number): void;
    /** Seek to a time in seconds. */
    seekTime(seconds: number): void;
    /**
     * Seek to a fractional position in [0, 1] across the full recorded clip
     * (0 = first frame, 1 = last frame), clamped. Convenience for driving
     * playback from an external 0..1 progress value instead of a frame index
     * or a time — e.g. `bindPlayerToScroll()` below, which maps scroll
     * progress straight onto this.
     */
    seekFraction(progress: number): void;
    /**
     * Re-render the LAST recorded frame's live mobjects straight to the display
     * canvas, reflecting the current state of `this.camera` (e.g. after a
     * Studio interactive-camera pan/zoom/orbit). Unlike seek()/drawFrameTo(),
     * this does not read from `frames[]` — it re-runs `renderScene()` against
     * the live mobject list, so camera changes are visible immediately without
     * a re-record. No-op headless (no display canvas) or before any frame has
     * been recorded.
     */
    rerenderCurrentFrame(): void;
    /**
     * Draw a specific recorded frame to an arbitrary ctx/size -- "nearly free"
     * since every frame is already a rasterized bitmap. `seek()` uses this
     * internally (drawing to the display canvas at full size); it's also the
     * primitive behind presenter-mode "next section" thumbnails (drawing an
     * upcoming section's first frame to a small preview canvas).
     */
    drawFrameTo(ctx: any, frameIndex: number, opts?: {
        width?: number;
        height?: number;
        x?: number;
        y?: number;
    }): void;
    /** Real-time playback of the recorded frames via requestAnimationFrame. */
    play(): void;
    /** Stop real-time playback (holds the current frame). */
    pause(): void;
    /** Whether real-time playback is currently running. */
    get playing(): boolean;
    /** Playback speed multiplier (1 = normal; supports fast/slow). */
    playbackRate: number;
    /** Audio volume in [0,1] (stored; the <manim-player> reads it). */
    volume: number;
    /** When true, playback pauses (or loops) at each section boundary. */
    presenterMode: boolean;
    setPlaybackRate(rate: number): void;
    setVolume(v: number): void;
    /** The recorded scene's sections (empty if none). */
    sections(): any[];
    /** The section containing a frame index, if any. */
    sectionContaining(frame: number): any | undefined;
    /** Seek to the start of a section (by name or index). */
    seekToSection(nameOrIndex: string | number): void;
    /** Jump to the next / previous section boundary (presenter navigation). */
    nextSection(): void;
    prevSection(): void;
    /** The recorded scene's play()/wait() segments (empty if none). */
    steps(): any[];
    /** The step containing a frame index, if any. */
    stepContaining(frame: number): any | undefined;
    /** Seek to the start of a step (by 0-based index). */
    seekToStep(index: number): void;
    /** Jump to the next / previous step boundary. */
    nextStep(): void;
    prevStep(): void;
}
/**
 * Inputs to the pure scroll-progress formula: a trigger element's geometry
 * (already resolved to plain numbers) plus the current scroll position.
 * `elementTop` must be the element's top offset within the whole scrollable
 * DOCUMENT (not viewport-relative) — i.e. `el.getBoundingClientRect().top +
 * window.scrollY` at the time of measurement.
 */
export interface ScrollProgressInput {
    elementTop: number;
    elementHeight: number;
    viewportHeight: number;
    scrollY: number;
    start?: string | number;
    end?: string | number;
}
/**
 * Pure math core of scroll binding: map a scroll position + trigger geometry
 * to a clamped 0..1 progress value. No DOM access whatsoever — fully
 * Node-testable in isolation from the DOM-event-wiring in bindScroll() below.
 * See the format notes above for the `start`/`end` mini-DSL.
 */
export declare function computeScrollProgress(input: ScrollProgressInput): number;
export interface ScrollBindingOptions {
    /** The element whose scroll-position-within-viewport drives playback
     *  (typically a tall "scroll spacer" wrapping/preceding the pinned/scrubbed
     *  content — matches ScrollTrigger's `trigger` element). */
    trigger: any;
    /** Range start; see the mini-DSL notes above. Default: "top top". */
    start?: string | number;
    /** Range end; see the mini-DSL notes above. Default: "bottom top". */
    end?: string | number;
    /** Called with scroll progress 0..1 (already clamped) whenever it changes,
     *  rAF-throttled (never synchronously on every scroll event). */
    onProgress: (progress: number) => void;
    /** Pin the trigger element in the viewport (position: fixed) while progress
     *  is strictly within (0, 1), matching ScrollTrigger's pin:true (pattern
     *  08). Unpinned (normal flow) at progress 0 or 1. Default: false — 07/09
     *  don't pin. No spacer element is inserted (deliberately, to keep this
     *  small): once pinned, the trigger leaves normal flow, which will shift
     *  layout below it, exactly like ScrollTrigger without `pinSpacing`. */
    pin?: boolean;
}
export interface ScrollBinding {
    /** Tear down all listeners (scroll/resize) and undo any pin styling. */
    destroy(): void;
    /** Force a re-measure of the trigger's geometry + recompute (e.g. after an
     *  external layout change), same as what a `resize` event triggers. */
    refresh(): void;
}
/**
 * Bind an element's scroll-position-within-viewport to a progress callback —
 * a small subset of GSAP ScrollTrigger's scrub/pin core (just the
 * scroll-to-progress mapping + optional pin, not its full feature surface).
 *
 * Browser-only: throws a clear error (never a silent no-op) if `window`/
 * `document` aren't present, mirroring this file's `hasDocument`-style
 * capability-probe convention (see the top of player.ts). Note this check is
 * intentionally evaluated fresh on every call rather than reusing the
 * module-level `hasDocument` const — that const is captured once at import
 * time, whereas bindScroll() may run in a test harness that installs a fake
 * `window`/`document` on `globalThis` AFTER this module has already loaded;
 * a live check is required for that to work. Behavior in real Node/browser
 * processes is identical either way (neither appears/disappears mid-process).
 *
 * Geometry (element position, height, viewport height) is measured ONCE up
 * front and cached — matching real ScrollTrigger, which measures at
 * setup/refresh time rather than re-measuring on every scroll — so `scroll`
 * events only read `window.scrollY` and recompute the pure progress formula;
 * call `refresh()` (or fire `resize`) after any layout change.
 */
export declare function bindScroll(options: ScrollBindingOptions): ScrollBinding;
/**
 * Convenience: bind a scroll range directly to a Player's playback position
 * — drives `player.seekFraction()` (frame index) from scroll progress
 * instead of real-time playback via `play()`. This is pattern 07's exact
 * need (a timeline scrubbed by scroll, in both directions) and composes
 * directly with `pin: true` for pattern 08 (pin the trigger while the SAME
 * progress drives the Player).
 *
 * Pattern 09 (parallax layers) needs no new primitive beyond bindScroll()
 * itself: call bindScroll() once per layer (or share one binding's
 * onProgress across N layers, which is cheaper — one listener instead of N)
 * and apply `translateY(progress * range * speed)` per layer with a
 * different `speed` multiplier each.
 */
export declare function bindPlayerToScroll(player: Player, options: Omit<ScrollBindingOptions, "onProgress">): ScrollBinding;
//# sourceMappingURL=player.d.ts.map