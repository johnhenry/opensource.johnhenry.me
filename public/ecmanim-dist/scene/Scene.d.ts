import type { Mobject } from "../mobject/Mobject.ts";
import type { Camera } from "../renderer/CanvasRenderer.ts";
import type { AutoMatchingConfig } from "../animation/auto_matching.ts";
import { PlayableKeyframeTrack } from "../reactive/keyframes.ts";
import type { Keyframe, KeyframeTrackOptions } from "../animation/keyframe_track.ts";
/** A frame callback invoked once per frame with the top-level mobjects. */
export type FrameHandler = (mobjects: Mobject[], frameCount: number, time: number) => void | Promise<void>;
/** A scheduled audio clip. */
export interface SceneSound {
    file: string;
    time: number;
    gain: number;
}
/** Section types, mirroring manim's `PresentationSectionType`. */
export declare const SectionType: {
    readonly NORMAL: "section.normal";
    readonly SKIP: "section.skip";
    readonly LOOP: "section.loop";
    readonly COMPLETE_LOOP: "section.complete_loop";
};
/**
 * A section boundary, recorded by `nextSection()`. `startFrame` is the frame
 * count at the moment the section began; the backend fills `endFrame` when the
 * next section starts (or at end of render).
 */
export interface SceneSection {
    name: string;
    type: string;
    skipAnimations: boolean;
    startFrame: number;
    endFrame: number;
    id: number;
    /** Presenter-mode speaker notes for this section, if given to nextSection(). */
    notes?: string;
}
/** A descriptor recorded for each play() call, used for content-addressed caching. */
export interface PlayRecord {
    index: number;
    kind: string;
    hash: string;
    startFrame: number;
    endFrame: number;
}
/** Configuration accepted by the Scene constructor. */
export interface SceneConfig {
    fps?: number;
    camera?: Camera | null;
    frameHandler?: FrameHandler;
    /** Schema-validated scene params (Remotion-style) — see scene_params.ts. */
    params?: Record<string, any>;
    /** Named time-event durations for waitUntil() (Motion Canvas's editor-
     *  draggable time events, expressed as config): `{ intro: 2.5 }` makes
     *  `waitUntil("intro")` hold 2.5s regardless of its inline fallback. */
    timeEvents?: Record<string, number>;
    [key: string]: any;
}
/** Handle to a background task started with Scene.spawn(). */
export interface TaskHandle {
    /** Stop the task where it is (its current animation is left mid-state). */
    cancel(): void;
    /** Emit frames (holding the scene) until the task runs to completion.
     *  Resolves immediately if the task is already done or canceled. */
    join(): Promise<void>;
    /** True once the task's generator is exhausted or cancel() was called. */
    readonly done: boolean;
}
export declare class Scene {
    mobjects: Mobject[];
    fps: number;
    camera: Camera | null;
    /** Schema-validated params this render was invoked with (default {}).
     *  Scene subclasses read them in construct() via `this.params`; bare
     *  construct functions receive them as a 2nd argument instead. */
    params: Record<string, any>;
    frameHandler: FrameHandler;
    time: number;
    frameCount: number;
    sounds: SceneSound[];
    /** waitUntil() duration overrides by event name (see SceneConfig.timeEvents). */
    timeEvents: Record<string, number>;
    /** Chronological record of waitUntil() events: name + the scene time at
     *  which each STARTED (tooling / assertions can read the timeline back). */
    timeEventRecords: Array<{
        name: string;
        time: number;
        duration: number;
    }>;
    private _tasks;
    /** Property-keyframe tracks created via track() (mirrors sounds/sections). */
    keyframeTracks: PlayableKeyframeTrack<any>[];
    sections: SceneSection[];
    private _sectionId;
    playCount: number;
    playRecords: PlayRecord[];
    /**
     * Optional hook invoked by a backend at the start of each play()/wait segment,
     * BEFORE any frames are emitted. It receives a descriptor and returns
     * per-segment directives:
     *   { skip: true }  — don't render this segment's frames (still advance time)
     * Used by node.ts for caching and from/upto animation ranges.
     */
    onSegment?: (rec: {
        index: number;
        kind: string;
        hash: string;
        startFrame: number;
    }) => {
        skip?: boolean;
    } | undefined;
    /**
     * Optional observability hook. When set, the Scene emits lightweight,
     * structured log events at interesting moments (play/wait start, section
     * boundaries). DEFAULT-OFF: if unset, `log()` is a no-op and there is no
     * behavior change. Useful for embedding the engine in a playground/UI or for
     * tracing what a construct() is doing without touching stdout.
     */
    onLog?: (level: string, msg: string, data?: any) => void;
    constructor(config?: SceneConfig);
    /**
     * Emit a structured log event through the optional `onLog` hook. A no-op when
     * `onLog` is unset (default), so this is safe to sprinkle through the engine
     * without any behavior or performance cost in the common case.
     */
    log(level: string, msg: string, data?: any): void;
    /**
     * Start a new section (manim's `self.next_section(...)`). Records the section
     * boundary at the current frame. The backend uses these boundaries to split
     * the rendered video into per-section files + a JSON index.
     */
    nextSection(name?: string, type?: string, skipAnimations?: boolean, notes?: string): this;
    /** Close out the final open section (called by the backend at end of render). */
    finalizeSections(): void;
    /**
     * Opt-in Reveal.js Auto-Animate-style section transition: snapshot the
     * scene's current mobjects, let `buildNext()` mutate `this.mobjects` into
     * the next section's state, then `play()` a `TransformMatchingAuto` between
     * the two snapshots instead of a hard cut.
     *
     * This can't hook inside a plain `nextSection()` call itself -- the "after"
     * state doesn't exist yet at that point; it's the author's own code
     * (running after `nextSection()` returns) that builds it. Strictly opt-in:
     * plain `nextSection()` never triggers whole-tree matching, since matching
     * unrelated same-shape elements by default would be surprising.
     */
    autoAnimateToNextSection(name: string, buildNext: () => void | Promise<void>, config?: AutoMatchingConfig & {
        type?: string;
        skipAnimations?: boolean;
    }): Promise<this>;
    /**
     * Compute a stable content hash for a set of animations for caching. Based on
     * class names, target mobject ids/point counts, runTime, and the current
     * scene mobject count (so an added mobject invalidates downstream segments).
     */
    hashAnimations(anims: any[], kind: string): string;
    private _sceneContentFingerprint;
    private _untouchedMobjectsFingerprint;
    private _mobjectFingerprint;
    addSound(file: string, { timeOffset, gain }?: {
        timeOffset?: number;
        gain?: number;
    }): this;
    /** Create a property-keyframe track (mirrors addSound()'s ergonomic).
     *  Bind it to a mobject property with bindTrack() (src/reactive/keyframes.ts). */
    track<T = number>(keyframes: Keyframe<T>[], options?: KeyframeTrackOptions<T>): PlayableKeyframeTrack<T>;
    add(...mobs: (Mobject | Mobject[])[]): this;
    /** Advance exactly ONE frame (Motion Canvas's bare `yield`): emits a
     *  frame and moves the clock by 1/fps. */
    nextFrame(): Promise<void>;
    /** Motion-Canvas-style logger handle (their `useLogger()`): levels route
     *  through the scene's onLog hook (no-op unless wired) AND the console
     *  for warn/error, so ports keep their shape. */
    get logger(): {
        debug: (m: any) => void;
        info: (m: any) => void;
        warn: (m: any) => void;
        error: (m: any) => void;
    };
    /** manim parity (add_foreground_mobject(s)): keep these drawn LAST, above
     *  everything later add()s introduce. */
    addForegroundMobject(...mobs: (Mobject | Mobject[])[]): this;
    /** Alias matching manim's plural spelling. */
    addForegroundMobjects(...mobs: (Mobject | Mobject[])[]): this;
    removeForegroundMobject(...mobs: (Mobject | Mobject[])[]): this;
    private _foreground;
    private _restackForeground;
    remove(...mobs: (Mobject | Mobject[])[]): this;
    bringToFront(mob: Mobject): this;
    clear(): this;
    construct(): Promise<void>;
    emitFrame(): Promise<void>;
    updateMobjects(dt: number): void;
    hasUpdaters(): boolean;
    play(...animations: any[]): Promise<this>;
    wait(duration?: number): Promise<this>;
    /**
     * Hold at a NAMED time event (Motion Canvas's `waitUntil`). The hold
     * duration is `timeEvents[name]` from SceneConfig when present, else
     * `fallbackDuration` — the config map is the editor-less equivalent of
     * MC's draggable events: retime a scene without touching construct().
     */
    waitUntil(name: string, fallbackDuration?: number): Promise<this>;
    /**
     * Start a BACKGROUND task (Motion Canvas's `spawn`): a generator yielding
     * animation steps that advance alongside the foreground play()/wait()
     * frames. Yield an Animation to run it, or a number to idle that many
     * seconds. The task only progresses while frames are being emitted (it is
     * ticked by the same clock as updaters), so it is fully deterministic.
     *
     * ```ts
     * const orbit = scene.spawn(function* () {
     *   while (true) yield new Rotate(dot, { angle: Math.PI, runTime: 2 });
     * });
     * await scene.play(...foreground...);
     * orbit.cancel();
     * ```
     */
    spawn(source: (() => Iterator<any> | Iterable<any>) | Iterator<any> | Iterable<any>): TaskHandle;
    /** Sugar over spawn(): run `factory()`'s animation forever (MC's infinite
     *  `loop`). Cancel the returned handle to stop it. */
    loopForever(factory: () => any): TaskHandle;
    private _tickTasks;
    pause(duration?: number): Promise<this>;
    render(): Promise<this>;
}
/** FNV-1a 32-bit hash, returned as an 8-char hex string. Deterministic + fast.
 *  Exported so callers outside Scene (e.g. node.ts's render-config cache-key
 *  fingerprint) can reuse the same algorithm instead of duplicating it. */
export declare function fnv1a(str: string): string;
/**
 * Fingerprint the render-time config that affects final pixel output but is
 * invisible to hashAnimations() above (which only looks at animation/mobject
 * content): resolution, background, fps, transparency, and (for a 3D camera)
 * orientation/zoom/rasterizer settings AT render() CALL TIME.
 *
 * Confirmed bug this fixes: node.ts/node-parallel.ts's partial-segment cache
 * used to key solely off hashAnimations()'s content hash, so re-rendering the
 * identical scene code with a different background/resolution/3D camera
 * setting (or this session's new camera.superSample anti-aliasing option)
 * silently reused a stale cached segment from a run with different config --
 * e.g. asking for a blue background produced red output, because a cached
 * red segment matched the (config-blind) content hash. Salting every partial
 * filename with this fingerprint's return value fixes that.
 *
 * Deliberately shared between node.ts and node-parallel.ts (rather than each
 * computing its own) so both cache paths stay byte-compatible, matching the
 * existing "single source of truth" convention for their partial files
 * (see node-parallel.ts's own header comment).
 *
 * Does NOT cover camera state that changes mid-scene (ambient rotation,
 * moveCamera) -- that would require per-segment camera fingerprinting inside
 * hashAnimations() itself, a separate, harder problem left alone here.
 */
export declare function computeRenderConfigHash(config: {
    pixelWidth: number;
    pixelHeight: number;
    background: string;
    fps: number;
    transparent?: boolean;
    camera?: any;
}): string;
/**
 * Fingerprint a render's scene params for the partial-segment cache key.
 * Params change what construct() builds, but hashAnimations() can miss that
 * (e.g. a param used only in a raster label) — and two personalized renders
 * writing to the same output directory MUST NOT collide on cached partials.
 * Shared by node.ts and node-parallel.ts the same way computeRenderConfigHash
 * is, so parallel and sequential partials stay interchangeable.
 */
export declare function computeParamsHash(params: Record<string, any>): string;
//# sourceMappingURL=Scene.d.ts.map